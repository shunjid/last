import "server-only";

import { open, stat } from "node:fs/promises";
import os from "node:os";
import { StringDecoder } from "node:string_decoder";

import type { LiveFrame, SessionSummary, ThreadOp } from "@/lib/types";

import { fetchSessions, groupProjects } from "./sessions";
import { feedLine, findTranscriptFile, ThreadBuilder } from "./transcript";
import { subscribeToTranscripts } from "./watcher";

const CHUNK_BYTES = 4 * 1024 * 1024;
const DEBOUNCE_MS = 30;
const POLL_MS = 2_000;
const IDLE_TTL_MS = 90_000;
const MAX_WARM_THREADS = 3;
const MAX_LIVE_THREADS = 24;
const MAX_LIVE_SINKS = 64;
const MAX_BACKFILL_BYTES = 16 * 1024 * 1024;
const MAX_CARRY_BYTES = 8 * 1024 * 1024;
const RING_BATCHES = 200;
const RING_BYTES = 512_000;

const LIST_DEBOUNCE_MS = 2_000;
const LIST_POLL_MS = 10_000;

export type LiveSink = { (payload: string): void; close?: () => void };

type Batch = { bytes: number; revision: number; text: string };

type FileIdentity = { birthtimeMs: number; dev: number; ino: number; mtimeMs: number };

export type LiveThread = {
  builder: ThreadBuilder;
  carry: string;
  decoder: StringDecoder;
  file: string | null;
  floor: number;
  identity: FileIdentity | null;
  offset: number;
  poll: ReturnType<typeof setInterval> | null;
  pulseText: string | null;
  pumping: boolean;
  recording: boolean;
  repeat: boolean;
  revision: number;
  ring: Batch[];
  ringBytes: number;
  sessionId: string;
  sinks: Set<LiveSink>;
  skipPartial: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  touched: number;
  unwatch: (() => void) | null;
};

type ListChannel = {
  fingerprint: string;
  payload: string | null;
  poll: ReturnType<typeof setInterval> | null;
  running: boolean;
  sinks: Set<LiveSink>;
  timer: ReturnType<typeof setTimeout> | null;
  unwatch: (() => void) | null;
};

type Hub = {
  list: ListChannel;
  seq: number;
  threads: Map<string, LiveThread>;
  pending: Map<string, Promise<LiveThread>>;
};

declare global {
  var __lastLiveHub__: Hub | undefined;
}

const hub: Hub =
  globalThis.__lastLiveHub__ ??
  (globalThis.__lastLiveHub__ = {
    list: {
      fingerprint: "",
      payload: null,
      poll: null,
      running: false,
      sinks: new Set(),
      timer: null,
      unwatch: null,
    },
    pending: new Map(),
    seq: 0,
    threads: new Map(),
  });

export function encodeFrame(frame: LiveFrame) {
  return JSON.stringify(frame);
}

function scrub(error: unknown) {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const home = os.homedir();
  return home ? text.split(home).join("~") : text;
}

function push(thread: LiveThread, text: string) {
  for (const sink of thread.sinks) {
    try {
      sink(text);
    } catch {
      continue;
    }
  }
}

function pushPulse(thread: LiveThread) {
  const pulse = thread.builder.pulse.snapshot(Date.now());
  const text = encodeFrame({ pulse, sessionId: thread.sessionId, t: "pulse" });
  if (text === thread.pulseText) return;
  thread.pulseText = text;
  push(thread, text);
}

function emit(thread: LiveThread, ops: ThreadOp[]) {
  hub.seq += 1;
  thread.revision = hub.seq;
  const text = encodeFrame({
    effort: thread.builder.lastEffort,
    model: thread.builder.lastModel,
    ops,
    revision: thread.revision,
    t: "ops",
    totalTurns: thread.builder.totalTurns,
    truncated: thread.builder.truncated,
  });

  thread.ring.push({ bytes: text.length, revision: thread.revision, text });
  thread.ringBytes += text.length;
  while (thread.ring.length > RING_BATCHES || thread.ringBytes > RING_BYTES) {
    const dropped = thread.ring.shift();
    if (!dropped) break;
    thread.ringBytes -= dropped.bytes;
    thread.floor = dropped.revision;
  }

  push(thread, text);
}

async function fileFacts(file: string) {
  try {
    const info = await stat(file);
    if (!info.isFile()) return null;
    return {
      identity: {
        birthtimeMs: info.birthtimeMs,
        dev: info.dev,
        ino: info.ino,
        mtimeMs: info.mtimeMs,
      },
      size: info.size,
    };
  } catch {
    return null;
  }
}

function replaced(seen: FileIdentity, next: FileIdentity) {
  return (
    seen.dev !== next.dev ||
    seen.ino !== next.ino ||
    seen.birthtimeMs !== next.birthtimeMs ||
    next.mtimeMs < seen.mtimeMs
  );
}

async function pumpOnce(thread: LiveThread): Promise<"more" | "idle" | "reset"> {
  if (!thread.file) {
    thread.file = await findTranscriptFile(thread.sessionId);
    if (!thread.file) return "idle";
  }

  const facts = await fileFacts(thread.file);
  if (facts === null) return "idle";
  const { identity, size } = facts;
  if (thread.identity && replaced(thread.identity, identity)) return "reset";
  thread.identity = identity;
  if (size < thread.offset) return "reset";
  if (size === thread.offset) return "idle";

  if (!thread.recording && thread.offset === 0 && size > MAX_BACKFILL_BYTES) {
    thread.offset = size - MAX_BACKFILL_BYTES;
    thread.skipPartial = true;
    thread.builder.markTruncated();
  }

  const length = Math.min(size - thread.offset, CHUNK_BYTES);
  const buffer = Buffer.allocUnsafe(length);
  const handle = await open(thread.file, "r");
  let read = 0;
  try {
    ({ bytesRead: read } = await handle.read(buffer, 0, length, thread.offset));
  } finally {
    await handle.close();
  }
  if (read === 0) return "idle";
  thread.offset += read;

  let text = thread.carry + thread.decoder.write(buffer.subarray(0, read));
  if (thread.skipPartial) {
    const head = text.indexOf("\n");
    if (head === -1) {
      thread.carry = "";
      return thread.offset < size ? "more" : "idle";
    }
    thread.skipPartial = false;
    text = text.slice(head + 1);
  }

  const cut = text.lastIndexOf("\n");
  if (cut === -1) {
    if (text.length >= MAX_CARRY_BYTES) {
      thread.carry = "";
      thread.skipPartial = true;
      thread.builder.markTruncated();
      push(thread, encodeFrame({ reason: "transcript line too long", t: "resync" }));
      return thread.offset < size ? "more" : "idle";
    }
    thread.carry = text;
    return thread.offset < size ? "more" : "idle";
  }

  thread.carry = text.slice(cut + 1);
  const body = text.slice(0, cut);

  if (thread.recording) thread.builder.ops = [];
  const wasEffort = thread.builder.lastEffort;
  const wasModel = thread.builder.lastModel;
  for (const line of body.split("\n")) feedLine(thread.builder, line);
  const ops = thread.builder.ops;
  thread.builder.ops = null;
  const shifted = thread.builder.lastEffort !== wasEffort || thread.builder.lastModel !== wasModel;
  if (ops && (ops.length > 0 || shifted)) emit(thread, ops);
  if (thread.recording) pushPulse(thread);

  return thread.offset < size ? "more" : "idle";
}

function stopThread(thread: LiveThread) {
  thread.unwatch?.();
  thread.unwatch = null;
  if (thread.timer) clearTimeout(thread.timer);
  if (thread.poll) clearInterval(thread.poll);
  thread.timer = null;
  thread.poll = null;
}

function resetThread(thread: LiveThread, reason = "transcript rewritten") {
  hub.threads.delete(thread.sessionId);
  stopThread(thread);
  push(thread, encodeFrame({ reason, t: "resync" }));
  thread.sinks.clear();
}

function closeSink(sink: LiveSink, reason: string) {
  try {
    sink(encodeFrame({ reason, t: "resync" }));
    sink.close?.();
  } catch {
    return;
  }
}

function evictThread(thread: LiveThread, reason: string) {
  hub.threads.delete(thread.sessionId);
  stopThread(thread);
  const sinks = [...thread.sinks];
  thread.sinks.clear();
  for (const sink of sinks) closeSink(sink, reason);
}

async function drain(thread: LiveThread) {
  if (thread.pumping) {
    thread.repeat = true;
    return;
  }
  thread.pumping = true;
  try {
    do {
      thread.repeat = false;
      let status = await pumpOnce(thread);
      while (status === "more") status = await pumpOnce(thread);
      if (status === "reset") {
        resetThread(thread);
        return;
      }
    } while (thread.repeat);
  } catch (error) {
    console.error("[last:live]", thread.sessionId, scrub(error));
  } finally {
    thread.pumping = false;
  }
}

function schedule(thread: LiveThread) {
  if (thread.timer) return;
  thread.timer = setTimeout(() => {
    thread.timer = null;
    void drain(thread);
  }, DEBOUNCE_MS);
  thread.timer.unref?.();
}

function createThread(sessionId: string): LiveThread {
  return {
    builder: new ThreadBuilder(),
    carry: "",
    decoder: new StringDecoder("utf8"),
    file: null,
    floor: hub.seq,
    identity: null,
    offset: 0,
    poll: null,
    pulseText: null,
    pumping: false,
    recording: false,
    repeat: false,
    revision: hub.seq,
    ring: [],
    ringBytes: 0,
    sessionId,
    sinks: new Set(),
    skipPartial: false,
    timer: null,
    touched: Date.now(),
    unwatch: null,
  };
}

function sinkCount() {
  let total = hub.list.sinks.size;
  for (const thread of hub.threads.values()) total += thread.sinks.size;
  return total;
}

function threadCount() {
  let total = hub.threads.size;
  for (const sessionId of hub.pending.keys()) if (!hub.threads.has(sessionId)) total += 1;
  return total;
}

function sweep() {
  const now = Date.now();
  const idle = [...hub.threads.values()].filter((thread) => thread.sinks.size === 0);
  for (const thread of idle) {
    if (now - thread.touched > IDLE_TTL_MS) hub.threads.delete(thread.sessionId);
  }
  if (hub.threads.size > MAX_WARM_THREADS) {
    const evictable = [...hub.threads.values()]
      .filter((thread) => thread.sinks.size === 0)
      .sort((a, b) => a.touched - b.touched);
    for (const thread of evictable) {
      if (hub.threads.size <= MAX_WARM_THREADS) break;
      hub.threads.delete(thread.sessionId);
    }
  }
  if (hub.threads.size <= MAX_LIVE_THREADS) return;
  const active = [...hub.threads.values()].sort((a, b) => a.touched - b.touched);
  for (const thread of active) {
    if (hub.threads.size <= MAX_LIVE_THREADS) break;
    evictThread(thread, "too many live threads");
  }
}

async function build(sessionId: string): Promise<LiveThread> {
  const thread = createThread(sessionId);
  thread.pumping = true;
  try {
    let status = await pumpOnce(thread);
    while (status === "more") status = await pumpOnce(thread);
  } catch (error) {
    console.error("[last:live]", sessionId, scrub(error));
  } finally {
    thread.pumping = false;
    thread.recording = true;
  }
  sweep();
  hub.threads.set(sessionId, thread);
  return thread;
}

export async function acquireThread(sessionId: string): Promise<LiveThread> {
  const warm = hub.threads.get(sessionId);
  if (warm) {
    warm.touched = Date.now();
    return warm;
  }
  const inflight = hub.pending.get(sessionId);
  if (inflight) return inflight;

  const promise = build(sessionId).finally(() => hub.pending.delete(sessionId));
  hub.pending.set(sessionId, promise);
  return promise;
}

export function snapshotThread(thread: LiveThread) {
  const view = thread.builder.window();
  return {
    effort: thread.builder.lastEffort,
    items: view.items,
    model: thread.builder.lastModel,
    pulse: thread.builder.pulse.snapshot(Date.now()),
    revision: thread.revision,
    totalTurns: view.totalTurns,
    truncated: view.truncated,
  };
}

function refuse(sink: LiveSink) {
  try {
    sink(encodeFrame({ reason: "server at capacity", t: "resync" }));
  } catch {
    return () => undefined;
  }
  return () => undefined;
}

export async function attachThread(sessionId: string, sink: LiveSink, fromRevision: number) {
  sweep();
  if (sinkCount() >= MAX_LIVE_SINKS) return refuse(sink);
  const known = hub.threads.has(sessionId) || hub.pending.has(sessionId);
  if (!known && threadCount() >= MAX_LIVE_THREADS) return refuse(sink);

  const thread = await acquireThread(sessionId);
  thread.touched = Date.now();
  thread.sinks.add(sink);

  if (!thread.unwatch) {
    thread.unwatch = subscribeToTranscripts((changed) => {
      if (changed === sessionId) schedule(thread);
    });
  }
  if (!thread.poll) {
    thread.poll = setInterval(() => {
      sweep();
      schedule(thread);
    }, POLL_MS);
    thread.poll.unref?.();
  }

  if (fromRevision > thread.revision || fromRevision < thread.floor) {
    sink(encodeFrame({ reason: "missed updates", t: "resync" }));
  } else {
    for (const batch of thread.ring) if (batch.revision > fromRevision) sink(batch.text);
    sink(encodeFrame({ revision: thread.revision, t: "ready" }));
    sink(
      encodeFrame({
        pulse: thread.builder.pulse.snapshot(Date.now()),
        sessionId,
        t: "pulse",
      }),
    );
  }

  return () => {
    thread.sinks.delete(sink);
    thread.touched = Date.now();
    if (thread.sinks.size > 0) return;
    stopThread(thread);
  };
}

function listFingerprint(sessions: SessionSummary[]) {
  return sessions
    .map((session) =>
      [
        session.sessionId,
        session.title,
        session.gitBranch ?? "",
        session.cwd ?? "",
        session.running ? "run" : "idle",
        Math.floor(session.lastModified / 30_000),
      ].join(""),
    )
    .join("");
}

async function refreshList(force: boolean) {
  const channel = hub.list;
  if (channel.running || channel.sinks.size === 0) return;
  channel.running = true;
  try {
    const sessions = await fetchSessions();
    const fingerprint = listFingerprint(sessions);
    if (!force && fingerprint === channel.fingerprint) return;
    channel.fingerprint = fingerprint;
    const text = encodeFrame({ projects: groupProjects(sessions), sessions, t: "sessions" });
    channel.payload = text;
    for (const sink of channel.sinks) {
      try {
        sink(text);
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.error("[last:live-list]", scrub(error));
  } finally {
    channel.running = false;
  }
}

function scheduleList() {
  const channel = hub.list;
  if (channel.timer) return;
  channel.timer = setTimeout(() => {
    channel.timer = null;
    void refreshList(false);
  }, LIST_DEBOUNCE_MS);
  channel.timer.unref?.();
}

export function attachList(sink: LiveSink) {
  const channel = hub.list;
  if (sinkCount() >= MAX_LIVE_SINKS) return refuse(sink);
  channel.sinks.add(sink);

  if (!channel.unwatch) channel.unwatch = subscribeToTranscripts(scheduleList);
  if (!channel.poll) {
    channel.poll = setInterval(() => {
      sweep();
      void refreshList(false);
    }, LIST_POLL_MS);
    channel.poll.unref?.();
  }

  if (channel.payload) sink(channel.payload);
  void refreshList(!channel.payload);

  return () => {
    channel.sinks.delete(sink);
    if (channel.sinks.size > 0) return;
    channel.unwatch?.();
    channel.unwatch = null;
    if (channel.timer) clearTimeout(channel.timer);
    if (channel.poll) clearInterval(channel.poll);
    channel.timer = null;
    channel.poll = null;
  };
}
