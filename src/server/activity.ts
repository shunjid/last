import "server-only";

import { open, stat } from "node:fs/promises";

import type { SessionSummary } from "@/lib/types";

import { registries } from "./registries";
import { waitingSessions } from "./run-watch";
import { findTranscriptFile } from "./transcript";

const WINDOW_MS = 30 * 60 * 1_000;
const TAIL_BYTES = 96 * 1_024;
const MAX_CACHE = 400;
const MAX_PROBE_WORKERS = 16;
const MAX_PROBES_PER_REFRESH = 120;

const SETTLED = new Set([
  "end_turn",
  "max_tokens",
  "model_context_window_exceeded",
  "refusal",
  "stop_sequence",
]);

// Tools the CLI always stops and asks the user about, so an unanswered call to
// one of them means that session is waiting on a human.
const ASK_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);

type Scan = { running: boolean; waiting: boolean };

const IDLE: Scan = { running: false, waiting: false };

type Probe = { key: string; scan: Scan };

type Stamp = { key: string; at: number | null };

type Store = {
  paths: Map<string, string>;
  probes: Map<string, Probe>;
  stamps: Map<string, Stamp>;
};

declare global {
  var __lastActivity__: Store | undefined;
}

const store: Store =
  globalThis.__lastActivity__ ??
  (globalThis.__lastActivity__ = { paths: new Map(), probes: new Map(), stamps: new Map() });

store.stamps ??= new Map();

async function locate(sessionId: string): Promise<string | null> {
  const known = store.paths.get(sessionId);
  if (known) return known;
  const found = await findTranscriptFile(sessionId);
  if (!found) return null;
  if (store.paths.size > MAX_CACHE) store.paths.clear();
  store.paths.set(sessionId, found);
  return found;
}

async function tail(file: string, size: number): Promise<string[]> {
  const start = Math.max(0, size - TAIL_BYTES);
  const length = size - start;
  if (length <= 0) return [];

  const buffer = Buffer.allocUnsafe(length);
  const handle = await open(file, "r");
  let read = 0;
  try {
    ({ bytesRead: read } = await handle.read(buffer, 0, length, start));
  } finally {
    await handle.close();
  }

  const text = buffer.subarray(0, read).toString("utf8");
  const body = start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  return body.split("\n").filter((line) => line.length > 0);
}

const INTERRUPT = "[Request interrupted by user";

type Tail = {
  interruptedMessageId?: string;
  isSidechain?: boolean;
  message?: { content?: unknown; stop_reason?: string | null };
  promptSource?: string | null;
  queueTranscriptOnly?: boolean;
  subtype?: string;
  type?: string;
};

function interrupted(record: Tail): boolean {
  if (record.interruptedMessageId) return true;
  const content = record.message?.content;
  if (typeof content === "string") return content.startsWith(INTERRUPT);
  if (!Array.isArray(content)) return false;
  for (const block of content as Array<{ text?: unknown; type?: unknown }>) {
    if (block?.type !== "text") continue;
    if (typeof block.text === "string" && block.text.startsWith(INTERRUPT)) return true;
  }
  return false;
}

type ContentBlock = { id?: unknown; name?: unknown; tool_use_id?: unknown; type?: unknown };

function blocksOf(record: Tail): ContentBlock[] {
  const content = record.message?.content;
  return Array.isArray(content) ? (content as ContentBlock[]) : [];
}

function asksInput(record: Tail, answered: Set<string>): boolean {
  for (const block of blocksOf(record)) {
    if (block.type !== "tool_use") continue;
    if (typeof block.name !== "string" || !ASK_TOOLS.has(block.name)) continue;
    if (typeof block.id === "string" && !answered.has(block.id)) return true;
  }
  return false;
}

// Walks the tail backwards to the start of the current turn. `answered` collects
// tool_use ids that already have a result, since those records are passed before
// the assistant record that opened the call.
function scanTail(lines: string[]): Scan {
  const answered = new Set<string>();

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let record: Tail;
    try {
      record = JSON.parse(lines[index]) as Tail;
    } catch {
      continue;
    }
    if (record.isSidechain) continue;

    for (const block of blocksOf(record)) {
      if (block.type === "tool_result" && typeof block.tool_use_id === "string")
        answered.add(block.tool_use_id);
    }

    if (record.type === "system") {
      if (record.subtype === "turn_duration") return IDLE;
      continue;
    }
    if (record.type === "user") {
      if (interrupted(record)) return IDLE;
      if (record.promptSource == null || record.queueTranscriptOnly) continue;
      return { running: true, waiting: false };
    }
    if (record.type !== "assistant") continue;

    const reason = record.message?.stop_reason;
    const running = !(typeof reason === "string" && SETTLED.has(reason));
    return { running, waiting: running && asksInput(record, answered) };
  }

  return IDLE;
}

async function probe(sessionId: string): Promise<Scan> {
  const file = await locate(sessionId);
  if (!file) return IDLE;

  let size = 0;
  let stamp = 0;
  try {
    const info = await stat(file);
    size = info.size;
    stamp = info.mtimeMs;
  } catch {
    store.paths.delete(sessionId);
    return IDLE;
  }

  const key = `${stamp}:${size}`;
  const hit = store.probes.get(sessionId);
  if (hit?.key === key) return hit.scan;

  const scan = scanTail(await tail(file, size));
  if (store.probes.size > MAX_CACHE) store.probes.clear();
  store.probes.set(sessionId, { key, scan });
  return scan;
}

function latestStamp(lines: string[]): number | null {
  let latest: number | null = null;
  for (const line of lines) {
    let record: { timestamp?: unknown };
    try {
      record = JSON.parse(line) as { timestamp?: unknown };
    } catch {
      continue;
    }
    if (typeof record.timestamp !== "string") continue;
    const at = Date.parse(record.timestamp);
    if (!Number.isFinite(at)) continue;
    if (latest === null || at > latest) latest = at;
  }
  return latest;
}

export async function activityAt(sessionId: string): Promise<number | null> {
  const file = await locate(sessionId);
  if (!file) return null;

  let size = 0;
  let mtime = 0;
  try {
    const info = await stat(file);
    size = info.size;
    mtime = info.mtimeMs;
  } catch {
    store.paths.delete(sessionId);
    return null;
  }

  const key = `${mtime}:${size}`;
  const hit = store.stamps.get(sessionId);
  if (hit?.key === key) return hit.at;

  const found = latestStamp(await tail(file, size));
  const at = found === null ? null : Math.min(found, mtime);
  if (store.stamps.size > MAX_CACHE) store.stamps.clear();
  store.stamps.set(sessionId, { at, key });
  return at;
}

export async function markActivity(sessions: SessionSummary[]): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < sessions.length) {
      const session = sessions[cursor];
      cursor += 1;
      try {
        const at = await activityAt(session.sessionId);
        if (at !== null) session.lastModified = at;
      } catch {
        continue;
      }
    }
  };

  const workers = Math.min(MAX_PROBE_WORKERS, sessions.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

export async function markRunning(sessions: SessionSummary[]): Promise<void> {
  const cutoff = Date.now() - WINDOW_MS;
  const pending: SessionSummary[] = [];
  const waiting = waitingSessions();

  for (const session of sessions) {
    if (waiting.has(session.sessionId)) session.waiting = true;
    if (registries.queries.has(session.sessionId)) {
      session.running = true;
      continue;
    }
    if (session.lastModified < cutoff) continue;
    pending.push(session);
  }

  pending.sort((a, b) => b.lastModified - a.lastModified);
  const targets = pending.slice(0, MAX_PROBES_PER_REFRESH);

  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const session = targets[cursor];
      cursor += 1;
      try {
        const scan = await probe(session.sessionId);
        session.running = scan.running;
        if (scan.waiting) session.waiting = true;
      } catch {
        continue;
      }
    }
  };

  const workers = Math.min(MAX_PROBE_WORKERS, targets.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}
