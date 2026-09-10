"use client";

import type {
  ChatRequestBody,
  EffortLevel,
  LiveFrame,
  PermissionAsk,
  PermissionMode,
  ResultStats,
  SessionDetail,
  SessionPulse,
  ThreadItem,
  Turn,
} from "@/lib/types";
import { DEFAULT_MODEL } from "@/lib/types";

import { setLocalRun } from "./activity";
import { interruptSession, sendPermission, streamChat } from "./api";
import { applyOps } from "./live";
import {
  applyFrame,
  commitCurrent,
  createRun,
  isThinking,
  localId,
  type RunPhase,
  type RunState,
  userTurn,
} from "./thread";

export type SendOptions = {
  effort: EffortLevel | null;
  mode: PermissionMode;
  model: string;
};

export type QueuedMessage = SendOptions & { id: string; text: string };

export type ChatActivity = {
  effort: EffortLevel | null;
  lastRecordAt: number;
  outputTokens: number;
  source: "local" | "terminal";
  startedAt: number;
  thinking: boolean;
  thinkingTokens: number;
};

export type ChatView = {
  activity: ChatActivity | null;
  asks: PermissionAsk[];
  canRetry: boolean;
  error: string | null;
  items: ThreadItem[];
  live: Turn | null;
  phase: RunPhase;
  stats: ResultStats | null;
  status: string | null;
  truncated: boolean;
};

type PendingSend = { anchor: number; options: SendOptions; prompt: string };

export type Entry = {
  controller: AbortController | null;
  cwd: string;
  detail: SessionDetail | null;
  epoch: number;
  history: ThreadItem[];
  key: string;
  listeners: Set<() => void>;
  loadError: string | null;
  loadedKey: string | null;
  loading: boolean;
  localRunEndedAt: number;
  onCreated: ((sessionId: string) => void) | null;
  pulse: SessionPulse | null;
  queue: QueuedMessage[];
  raf: number | null;
  retry: PendingSend | null;
  revision: number;
  run: RunState | null;
  sessionId: string | null;
  stopped: boolean;
  tail: ThreadItem[];
  tailProbe: string | null;
  tailProbeFrom: number;
  touched: number;
  truncated: boolean;
  version: number;
  view: ChatView;
};

const EMPTY_VIEW: ChatView = {
  activity: null,
  asks: [],
  canRetry: false,
  error: null,
  items: [],
  live: null,
  phase: "idle",
  stats: null,
  status: null,
  truncated: false,
};

const MAX_ENTRIES = 12;
const PROBE_DEPTH = 24;

type Store = { alias: Map<string, string>; drafts: number; entries: Map<string, Entry> };

declare global {
  var __lastRunStore__: Store | undefined;
}

const store: Store =
  globalThis.__lastRunStore__ ??
  (globalThis.__lastRunStore__ = { alias: new Map(), drafts: 0, entries: new Map() });

export function nextDraftId(): string {
  store.drafts += 1;
  return `draft-${store.drafts}`;
}

const interrupted = new WeakSet<RunState>();

function interruptRun(entry: Entry, run: RunState) {
  const id = entry.sessionId;
  if (!id || !run.streamId) return false;
  if (!interrupted.has(run)) {
    interrupted.add(run);
    void interruptSession(id, run.streamId).catch(() => undefined);
  }
  return true;
}

function isBusy(entry: Entry) {
  return entry.run?.phase === "connecting" || entry.run?.phase === "running";
}

function sweep() {
  if (store.entries.size <= MAX_ENTRIES) return;
  const idle = [...store.entries.values()]
    .filter((entry) => entry.listeners.size === 0 && !isBusy(entry))
    .sort((a, b) => a.touched - b.touched);
  for (const entry of idle) {
    if (store.entries.size <= MAX_ENTRIES) break;
    store.entries.delete(entry.key);
    for (const [id, key] of store.alias) if (key === entry.key) store.alias.delete(id);
  }
}

function create(key: string, cwd: string, sessionId: string | null): Entry {
  return {
    controller: null,
    cwd,
    detail: null,
    epoch: 0,
    history: [],
    key,
    listeners: new Set(),
    loadError: null,
    loadedKey: null,
    loading: Boolean(sessionId),
    localRunEndedAt: 0,
    onCreated: null,
    pulse: null,
    queue: [],
    raf: null,
    retry: null,
    revision: 0,
    run: null,
    sessionId,
    stopped: false,
    tail: [],
    tailProbe: null,
    tailProbeFrom: 0,
    touched: Date.now(),
    truncated: false,
    version: 0,
    view: EMPTY_VIEW,
  };
}

export function acquire(key: string, cwd: string, sessionId: string | null): Entry {
  if (typeof window === "undefined") return create(key, cwd, sessionId);

  const direct = store.entries.get(key);
  if (direct) {
    direct.touched = Date.now();
    return direct;
  }
  const aliased = store.alias.get(key);
  const shared = aliased ? store.entries.get(aliased) : undefined;
  if (shared) {
    shared.touched = Date.now();
    return shared;
  }
  return create(key, cwd, sessionId);
}

export function subscribe(entry: Entry, listener: () => void) {
  if (typeof window !== "undefined" && !store.entries.has(entry.key)) {
    store.entries.set(entry.key, entry);
  }
  entry.listeners.add(listener);
  sweep();
  return () => {
    entry.listeners.delete(listener);
    entry.touched = Date.now();
  };
}

function bump(entry: Entry) {
  entry.version += 1;
  for (const listener of entry.listeners) listener();
}

function pickActivity(entry: Entry): ChatActivity | null {
  const run = entry.run;
  if (run && (run.phase === "connecting" || run.phase === "running")) {
    return {
      effort: run.effort,
      lastRecordAt: 0,
      outputTokens: run.outputTokens,
      source: "local",
      startedAt: run.startedAt,
      thinking: isThinking(run),
      thinkingTokens: run.thinkingTokens,
    };
  }
  const pulse = entry.pulse;
  if (!pulse) return null;
  if (pulse.startedAt <= entry.localRunEndedAt) return null;
  return {
    effort: pulse.effort,
    lastRecordAt: pulse.lastRecordAt,
    outputTokens: pulse.outputTokens,
    source: "terminal",
    startedAt: pulse.startedAt,
    thinking: pulse.thinking,
    thinkingTokens: 0,
  };
}

function snapshot(entry: Entry) {
  const run = entry.run;
  const base = [...entry.history, ...entry.tail];
  entry.view = {
    activity: pickActivity(entry),
    asks: run?.asks ?? [],
    canRetry: run?.phase === "error" && entry.retry !== null,
    error: run?.error ?? null,
    items: run ? [...base, ...run.produced] : base,
    live: run?.current ?? null,
    phase: run?.phase ?? "idle",
    stats: run?.stats ?? null,
    status: run?.status ?? null,
    truncated: entry.truncated,
  };
  bump(entry);
}

function flush(entry: Entry) {
  if (entry.raf !== null) return;
  entry.raf = requestAnimationFrame(() => {
    entry.raf = null;
    snapshot(entry);
  });
}

function flushNow(entry: Entry) {
  if (entry.raf !== null) {
    cancelAnimationFrame(entry.raf);
    entry.raf = null;
  }
  snapshot(entry);
}

function hasUserText(items: ThreadItem[], text: string, from: number) {
  const stop = Math.max(from, items.length - PROBE_DEPTH);
  for (let index = items.length - 1; index >= stop; index -= 1) {
    const item = items[index];
    if (item.type !== "turn" || item.turn.role !== "user") continue;
    for (const block of item.turn.blocks) {
      if (block.kind === "text" && block.text.trim() === text) return true;
    }
  }
  return false;
}

function absorbHistory(entry: Entry, next: ThreadItem[]) {
  entry.history = next;
  const probe = entry.tailProbe;
  if (probe && hasUserText(next, probe, entry.tailProbeFrom)) {
    entry.tailProbe = null;
    entry.tailProbeFrom = 0;
    entry.tail = [];
  }
}

export function setOnCreated(entry: Entry, handler: (sessionId: string) => void) {
  entry.onCreated = handler;
}

export function loadedDetail(entry: Entry, key: string, detail: SessionDetail) {
  entry.history = detail.items;
  entry.tail = [];
  entry.tailProbe = null;
  entry.tailProbeFrom = 0;
  entry.truncated = detail.truncated;
  entry.revision = detail.revision;
  entry.detail = detail;
  entry.pulse = detail.pulse;
  entry.loadError = null;
  entry.loadedKey = key;
}

export function failedDetail(entry: Entry, message: string) {
  entry.loadError = message;
}

export function finishLoad(entry: Entry) {
  entry.loading = false;
  snapshot(entry);
}

function resync(entry: Entry) {
  entry.epoch += 1;
  bump(entry);
}

export function applyLive(entry: Entry, frame: LiveFrame) {
  if (frame.t === "resync") {
    resync(entry);
    return;
  }
  if (frame.t === "pulse") {
    const had = entry.pulse !== null;
    entry.pulse = frame.pulse;
    flushNow(entry);
    if (had && frame.pulse === null) drainQueue(entry);
    return;
  }
  if (frame.t !== "ops") return;

  const next = applyOps(entry.history, frame.ops);
  if (!next) {
    resync(entry);
    return;
  }

  absorbHistory(entry, next);
  entry.truncated = frame.truncated;
  entry.revision = frame.revision;

  const detail = entry.detail;
  const stale =
    detail &&
    (detail.totalTurns !== frame.totalTurns ||
      detail.effort !== frame.effort ||
      detail.model !== frame.model);
  if (detail && stale) {
    entry.detail = {
      ...detail,
      effort: frame.effort,
      model: frame.model,
      totalTurns: frame.totalTurns,
    };
  }

  flush(entry);
}

function setQueue(entry: Entry, next: QueuedMessage[]) {
  entry.queue = next;
  snapshot(entry);
}

export function enqueue(entry: Entry, prompt: string, options: SendOptions) {
  const text = prompt.trim();
  if (!text) return;
  setQueue(entry, [...entry.queue, { ...options, id: localId("queued"), text }]);
}

export function unqueue(entry: Entry, id: string) {
  setQueue(
    entry,
    entry.queue.filter((item) => item.id !== id),
  );
}

function drainQueue(entry: Entry) {
  if (isBusy(entry) || entry.stopped) return;
  const next = entry.queue[0];
  if (!next) return;
  setQueue(entry, entry.queue.slice(1));
  void send(entry, next.text, { effort: next.effort, mode: next.mode, model: next.model });
}

export async function send(entry: Entry, prompt: string, options: SendOptions) {
  const text = prompt.trim();
  if (!text) return;
  const active = entry.run;
  if (active && (active.phase === "connecting" || active.phase === "running")) return;

  if (active && active.produced.length > 0) {
    entry.tail = [...entry.tail, ...active.produced];
    active.produced = [];
  }

  const anchor = entry.tail.length;
  entry.retry = null;
  entry.tailProbe = text;
  entry.tailProbeFrom = entry.history.length;
  entry.tail = [...entry.tail, { turn: userTurn(text), type: "turn" }];

  const run = createRun();
  run.effort = options.effort;
  entry.run = run;
  entry.stopped = false;
  flushNow(entry);

  const controller = new AbortController();
  entry.controller = controller;
  const resumeId = entry.sessionId;
  let drain = true;
  let marked = resumeId;
  setLocalRun(marked, true);

  try {
    const body: ChatRequestBody = {
      permissionMode: options.mode,
      prompt: text,
      ...(options.model && options.model !== DEFAULT_MODEL ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort } : {}),
      ...(resumeId ? { sessionId: resumeId } : { cwd: entry.cwd }),
    };
    for await (const frame of streamChat(body, controller.signal)) {
      applyFrame(run, frame);
      if (frame.t === "init" && !entry.sessionId && frame.sessionId) {
        entry.sessionId = frame.sessionId;
        store.alias.set(frame.sessionId, entry.key);
        marked = frame.sessionId;
        setLocalRun(marked, true);
        entry.onCreated?.(frame.sessionId);
      }
      if (entry.stopped && interruptRun(entry, run)) break;
      if (frame.t === "delta" || frame.t === "usage" || frame.t === "thinking_tokens") flush(entry);
      else flushNow(entry);
    }
    if (run.phase !== "error") {
      commitCurrent(run);
      run.phase = "done";
    }
  } catch (error) {
    drain = false;
    if (controller.signal.aborted) {
      commitCurrent(run);
      run.phase = "done";
    } else {
      run.error = error instanceof Error ? error.message : "The connection dropped.";
      run.phase = "error";
      entry.retry = { anchor, options, prompt: text };
    }
  } finally {
    setLocalRun(marked, false);
    entry.localRunEndedAt = Date.now();
    run.asks = [];
    run.status = null;
    if (run.produced.length > 0) {
      entry.tail = [...entry.tail, ...run.produced];
      run.produced = [];
    }
    if (entry.controller === controller) entry.controller = null;
    flushNow(entry);

    const keepGoing = drain && !entry.stopped && run.phase !== "error";
    const next = keepGoing ? entry.queue[0] : undefined;
    if (next) {
      setQueue(entry, entry.queue.slice(1));
      void send(entry, next.text, { effort: next.effort, mode: next.mode, model: next.model });
    }
  }
}

export function retry(entry: Entry) {
  const pending = entry.retry;
  if (!pending) return;
  entry.retry = null;
  entry.tailProbe = null;
  entry.tailProbeFrom = 0;
  entry.tail = entry.tail.slice(0, pending.anchor);
  void send(entry, pending.prompt, pending.options);
}

export function stop(entry: Entry) {
  entry.stopped = true;
  entry.controller?.abort();
  setQueue(entry, []);
  const run = entry.run;
  if (run) interruptRun(entry, run);
}

export async function decide(
  entry: Entry,
  ask: PermissionAsk,
  decision: "allow" | "deny",
  scope: "once" | "session",
) {
  const run = entry.run;
  if (!run) return;
  if (!run.streamId) {
    run.error = "That decision could not be sent. The run is no longer connected.";
    flushNow(entry);
    return;
  }

  const index = run.asks.findIndex((item) => item.requestId === ask.requestId);
  if (index === -1) return;
  run.asks = run.asks.filter((item) => item.requestId !== ask.requestId);
  flushNow(entry);

  try {
    await sendPermission({
      decision,
      requestId: ask.requestId,
      scope,
      streamId: run.streamId,
    });
  } catch (error) {
    if (entry.run !== run) return;
    const asks = [...run.asks];
    asks.splice(Math.min(index, asks.length), 0, ask);
    run.asks = asks;
    run.error = error instanceof Error ? error.message : "That decision could not be sent.";
    flushNow(entry);
  }
}
