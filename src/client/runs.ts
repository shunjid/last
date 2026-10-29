"use client";

import type {
  ChatRequestBody,
  EffortLevel,
  LiveFrame,
  PermissionAsk,
  PermissionMode,
  PromptImage,
  QuestionAsk,
  ResultStats,
  ServerRun,
  SessionDetail,
  SessionPulse,
  ThreadItem,
  Turn,
} from "@/lib/types";
import { DEFAULT_MODEL } from "@/lib/types";

import { setLocalRun } from "./activity";
import {
  interruptSession,
  sendNowToSession,
  sendPermission,
  sendQuestionAnswer,
  streamChat,
  updateRunOptions,
} from "./api";
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

export type QueuedMessage = SendOptions & { id: string; images: PromptImage[]; text: string };

export type ChatActivity = {
  effort: EffortLevel | null;
  lastRecordAt: number;
  outputTokens: number;
  source: "local" | "server" | "terminal";
  startedAt: number;
  thinking: boolean;
  thinkingTokens: number;
};

export type ChatView = {
  activity: ChatActivity | null;
  asks: PermissionAsk[];
  canRetry: boolean;
  contextStats: ResultStats | null;
  error: string | null;
  items: ThreadItem[];
  live: Turn | null;
  mode: PermissionMode | null;
  phase: RunPhase;
  questionAsks: QuestionAsk[];
  stats: ResultStats | null;
  status: string | null;
  truncated: boolean;
};

type PendingSend = { anchor: number; images: PromptImage[]; options: SendOptions; prompt: string };

export type Entry = {
  controller: AbortController | null;
  cwd: string;
  detail: SessionDetail | null;
  epoch: number;
  history: ThreadItem[];
  key: string;
  lastStats: ResultStats | null;
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
  sendingNow: QueuedMessage | null;
  serverRun: ServerRun | null;
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
  contextStats: null,
  error: null,
  items: [],
  live: null,
  mode: null,
  phase: "idle",
  questionAsks: [],
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
  if (!run.streamId) return false;
  if (!interrupted.has(run)) {
    interrupted.add(run);
    void interruptSession(entry.sessionId, run.streamId).catch(() => undefined);
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
    lastStats: null,
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
    sendingNow: null,
    serverRun: null,
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
  const remote = entry.serverRun;
  if (remote) {
    return {
      effort: pulse?.effort ?? null,
      lastRecordAt: pulse?.lastRecordAt ?? 0,
      outputTokens: pulse?.outputTokens ?? 0,
      source: "server",
      startedAt: pulse?.startedAt ?? remote.startedAt,
      thinking: pulse?.thinking ?? false,
      thinkingTokens: 0,
    };
  }
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
  const remote = isBusy(entry) ? null : entry.serverRun;
  const base = [...entry.history, ...entry.tail];
  entry.view = {
    activity: pickActivity(entry),
    asks: remote ? remote.asks : (run?.asks ?? []),
    canRetry: run?.phase === "error" && entry.retry !== null,
    contextStats: entry.lastStats,
    error: run?.error ?? null,
    items: run ? [...base, ...run.produced] : base,
    live: run?.current ?? null,
    mode: remote ? remote.mode : isBusy(entry) ? (run?.mode ?? null) : null,
    phase: run?.phase ?? "idle",
    questionAsks: remote ? remote.questionAsks : (run?.questionAsks ?? []),
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
      if (text ? block.kind === "text" && block.text.trim() === text : block.kind === "image") {
        return true;
      }
    }
  }
  return false;
}

function absorbHistory(entry: Entry, next: ThreadItem[]) {
  entry.history = next;
  const probe = entry.tailProbe;
  if (probe !== null && hasUserText(next, probe, entry.tailProbeFrom)) {
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
  if (frame.t === "run") {
    const had = entry.serverRun !== null;
    entry.serverRun = frame.run;
    flushNow(entry);
    if (had && frame.run === null) drainQueue(entry);
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

export function enqueue(
  entry: Entry,
  prompt: string,
  options: SendOptions,
  images: PromptImage[] = [],
) {
  const text = prompt.trim();
  if (!text && images.length === 0) return null;
  const item = { ...options, id: localId("queued"), images, text };
  setQueue(entry, [...entry.queue, item]);
  return item.id;
}

export function unqueue(entry: Entry, id: string) {
  setQueue(
    entry,
    entry.queue.filter((item) => item.id !== id),
  );
}

function requeueSendingNow(entry: Entry) {
  const item = entry.sendingNow;
  entry.sendingNow = null;
  if (item && !entry.stopped) setQueue(entry, [item, ...entry.queue]);
  else snapshot(entry);
}

export async function sendNow(entry: Entry, id: string) {
  const run = entry.run;
  const item = entry.queue.find((queued) => queued.id === id);
  if (!item || !run?.streamId || run.phase !== "running" || entry.sendingNow) return;
  entry.sendingNow = item;
  setQueue(
    entry,
    entry.queue.filter((queued) => queued.id !== id),
  );
  try {
    await sendNowToSession({
      prompt: item.text,
      ...(item.images.length > 0 ? { images: item.images } : {}),
      streamId: run.streamId,
      ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
    });
  } catch {
    if (entry.sendingNow !== item) return;
    requeueSendingNow(entry);
    drainQueue(entry);
  }
}

export async function sendPromptNow(
  entry: Entry,
  prompt: string,
  options: SendOptions,
  images: PromptImage[] = [],
) {
  const id = enqueue(entry, prompt, options, images);
  if (id) await sendNow(entry, id);
}

function drainQueue(entry: Entry) {
  if (isBusy(entry) || entry.stopped || entry.serverRun) return;
  const next = entry.queue[0];
  if (!next) return;
  setQueue(entry, entry.queue.slice(1));
  void send(
    entry,
    next.text,
    { effort: next.effort, mode: next.mode, model: next.model },
    next.images,
  );
}

export async function send(
  entry: Entry,
  prompt: string,
  options: SendOptions,
  images: PromptImage[] = [],
) {
  const text = prompt.trim();
  if (!text && images.length === 0) return;
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
  const mediaTypes = images.map((image) => image.mediaType);
  entry.tail = [...entry.tail, { turn: userTurn(text, mediaTypes), type: "turn" }];

  const run = createRun();
  run.effort = options.effort;
  run.mode = options.mode;
  entry.run = run;
  entry.serverRun = null;
  entry.stopped = false;
  flushNow(entry);

  const controller = new AbortController();
  entry.controller = controller;
  const resumeId = entry.sessionId;
  let drain = true;
  let detached = false;
  let marked = resumeId;
  setLocalRun(marked, true);

  try {
    const body: ChatRequestBody = {
      permissionMode: options.mode,
      prompt: text,
      ...(images.length > 0 ? { images } : {}),
      ...(options.model && options.model !== DEFAULT_MODEL ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort } : {}),
      ...(resumeId ? { sessionId: resumeId } : { cwd: entry.cwd }),
    };
    let ended = false;
    for await (const frame of streamChat(body, controller.signal)) {
      applyFrame(run, frame);
      if (frame.t === "done") ended = true;
      if (frame.t === "prompt") entry.sendingNow = null;
      if (frame.t === "unsent") requeueSendingNow(entry);
      if (frame.t === "result") entry.lastStats = frame.stats;
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
    if (!ended && !entry.stopped && run.streamId) {
      drain = false;
      detached = true;
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
    } else if (run.streamId) {
      commitCurrent(run);
      run.phase = "done";
      detached = true;
    } else {
      run.error = error instanceof Error ? error.message : "The connection dropped.";
      run.phase = "error";
      entry.retry = { anchor, images, options, prompt: text };
    }
  } finally {
    if (detached) entry.sendingNow = null;
    setLocalRun(marked, false);
    if (!detached) entry.localRunEndedAt = Date.now();
    run.asks = [];
    run.questionAsks = [];
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
      void send(
        entry,
        next.text,
        { effort: next.effort, mode: next.mode, model: next.model },
        next.images,
      );
    }
  }
}

export async function retune(entry: Entry, patch: Partial<SendOptions>): Promise<string | null> {
  if (entry.queue.length > 0)
    setQueue(
      entry,
      entry.queue.map((item) => ({ ...item, ...patch })),
    );
  const run = isBusy(entry) ? entry.run : null;
  const remote = run ? null : entry.serverRun;
  const streamId = run ? run.streamId : remote?.streamId;
  if (!streamId) return null;

  try {
    await updateRunOptions({
      streamId,
      ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
      ...(patch.mode ? { permissionMode: patch.mode } : {}),
      ...(patch.model ? { model: patch.model } : {}),
      ...(patch.effort !== undefined ? { effort: patch.effort } : {}),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The turn did not take the change.";
    const label = "This turn kept its old settings";
    if (run && entry.run === run) {
      applyFrame(run, { detail: reason, level: "warning", message: label, t: "notice" });
    } else {
      entry.tail = [
        ...entry.tail,
        {
          divider: { detail: reason, id: localId("div"), label, tone: "warning" },
          type: "divider",
        },
      ];
    }
    flushNow(entry);
    return reason;
  }

  if (run && entry.run === run) {
    if (patch.mode) run.mode = patch.mode;
    if (patch.effort !== undefined) run.effort = patch.effort;
    flushNow(entry);
  }
  return null;
}

export function retry(entry: Entry) {
  const pending = entry.retry;
  if (!pending) return;
  entry.retry = null;
  entry.tailProbe = null;
  entry.tailProbeFrom = 0;
  entry.tail = entry.tail.slice(0, pending.anchor);
  void send(entry, pending.prompt, pending.options, pending.images);
}

export function stop(entry: Entry) {
  const remote = isBusy(entry) ? null : entry.serverRun;
  entry.stopped = true;
  entry.sendingNow = null;
  entry.controller?.abort();
  setQueue(entry, []);
  const run = entry.run;
  if (remote) void interruptSession(entry.sessionId, remote.streamId).catch(() => undefined);
  else if (run) interruptRun(entry, run);
}

async function decideRemote(
  entry: Entry,
  remote: ServerRun,
  requestId: string,
  post: (streamId: string) => Promise<unknown>,
) {
  entry.serverRun = {
    ...remote,
    asks: remote.asks.filter((item) => item.requestId !== requestId),
    questionAsks: remote.questionAsks.filter((item) => item.requestId !== requestId),
  };
  flushNow(entry);
  await post(remote.streamId).catch(() => undefined);
}

export async function decide(
  entry: Entry,
  ask: PermissionAsk,
  decision: "allow" | "deny",
  scope: "once" | "session",
) {
  const remote = isBusy(entry) ? null : entry.serverRun;
  if (remote) {
    await decideRemote(entry, remote, ask.requestId, (streamId) =>
      sendPermission({ decision, requestId: ask.requestId, scope, streamId }),
    );
    return;
  }
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

export async function decideQuestion(
  entry: Entry,
  ask: QuestionAsk,
  outcome: { answers: Record<string, string> } | { cancelled: true },
) {
  const remote = isBusy(entry) ? null : entry.serverRun;
  if (remote) {
    await decideRemote(entry, remote, ask.requestId, (streamId) =>
      sendQuestionAnswer(
        "cancelled" in outcome
          ? { decision: "cancel", requestId: ask.requestId, streamId }
          : { answers: outcome.answers, decision: "answer", requestId: ask.requestId, streamId },
      ),
    );
    return;
  }
  const run = entry.run;
  if (!run) return;
  if (!run.streamId) {
    run.error = "That answer could not be sent. The run is no longer connected.";
    flushNow(entry);
    return;
  }

  const index = run.questionAsks.findIndex((item) => item.requestId === ask.requestId);
  if (index === -1) return;
  run.questionAsks = run.questionAsks.filter((item) => item.requestId !== ask.requestId);
  flushNow(entry);

  try {
    await sendQuestionAnswer(
      "cancelled" in outcome
        ? { decision: "cancel", requestId: ask.requestId, streamId: run.streamId }
        : {
            answers: outcome.answers,
            decision: "answer",
            requestId: ask.requestId,
            streamId: run.streamId,
          },
    );
  } catch (error) {
    if (entry.run !== run) return;
    const asks = [...run.questionAsks];
    asks.splice(Math.min(index, asks.length), 0, ask);
    run.questionAsks = asks;
    run.error = error instanceof Error ? error.message : "That answer could not be sent.";
    flushNow(entry);
  }
}
