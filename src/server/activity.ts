import "server-only";

import { open, stat } from "node:fs/promises";

import type { SessionSummary } from "@/lib/types";

import { registries } from "./registries";
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

type Probe = { key: string; running: boolean };

type Store = { paths: Map<string, string>; probes: Map<string, Probe> };

declare global {
  var __lastActivity__: Store | undefined;
}

const store: Store =
  globalThis.__lastActivity__ ??
  (globalThis.__lastActivity__ = { paths: new Map(), probes: new Map() });

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

function midTurn(lines: string[]): boolean {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let record: Tail;
    try {
      record = JSON.parse(lines[index]) as Tail;
    } catch {
      continue;
    }
    if (record.isSidechain) continue;
    if (record.type === "system") {
      if (record.subtype === "turn_duration") return false;
      continue;
    }
    if (record.type === "user") {
      if (interrupted(record)) return false;
      if (record.promptSource == null) continue;
      return true;
    }
    if (record.type !== "assistant") continue;
    const reason = record.message?.stop_reason;
    return !(typeof reason === "string" && SETTLED.has(reason));
  }
  return false;
}

async function probe(sessionId: string): Promise<boolean> {
  const file = await locate(sessionId);
  if (!file) return false;

  let size = 0;
  let stamp = 0;
  try {
    const info = await stat(file);
    size = info.size;
    stamp = info.mtimeMs;
  } catch {
    store.paths.delete(sessionId);
    return false;
  }

  const key = `${stamp}:${size}`;
  const hit = store.probes.get(sessionId);
  if (hit?.key === key) return hit.running;

  const running = midTurn(await tail(file, size));
  if (store.probes.size > MAX_CACHE) store.probes.clear();
  store.probes.set(sessionId, { key, running });
  return running;
}

export async function markRunning(sessions: SessionSummary[]): Promise<void> {
  const cutoff = Date.now() - WINDOW_MS;
  const pending: SessionSummary[] = [];

  for (const session of sessions) {
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
        session.running = await probe(session.sessionId);
      } catch {
        continue;
      }
    }
  };

  const workers = Math.min(MAX_PROBE_WORKERS, targets.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}
