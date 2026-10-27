import "server-only";

import type { PermissionAsk, QuestionAsk, ServerRun } from "@/lib/types";

import { registries } from "./registries";

type Watchers = Map<string, Set<() => void>>;

declare global {
  var __lastRunWatchers__: Watchers | undefined;
}

const watchers: Watchers =
  globalThis.__lastRunWatchers__ ?? (globalThis.__lastRunWatchers__ = new Map());

export function serverRun(sessionId: string): ServerRun | null {
  for (const state of registries.streams.values()) {
    if (state.liveSessionId !== sessionId) continue;
    const asks: PermissionAsk[] = [];
    const questionAsks: QuestionAsk[] = [];
    for (const entry of state.pending.values()) {
      if (entry.frame.t === "permission") asks.push(entry.frame.ask);
      else questionAsks.push(entry.frame.ask);
    }
    return { asks, questionAsks, startedAt: state.startedAt, streamId: state.streamId };
  }
  return null;
}

export function watchRun(sessionId: string, listener: () => void) {
  let set = watchers.get(sessionId);
  if (!set) {
    set = new Set();
    watchers.set(sessionId, set);
  }
  set.add(listener);
  return () => {
    const current = watchers.get(sessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) watchers.delete(sessionId);
  };
}

export function announceRun(sessionId: string | null) {
  if (!sessionId) return;
  const set = watchers.get(sessionId);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener();
    } catch {
      continue;
    }
  }
}
