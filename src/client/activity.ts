"use client";

import { useSyncExternalStore } from "react";

const EMPTY: ReadonlySet<string> = new Set();

const listeners = new Set<() => void>();

let running: ReadonlySet<string> = EMPTY;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setLocalRun(sessionId: string | null, active: boolean) {
  if (!sessionId) return;
  if (running.has(sessionId) === active) return;
  const next = new Set(running);
  if (active) next.add(sessionId);
  else next.delete(sessionId);
  running = next.size === 0 ? EMPTY : next;
  for (const listener of listeners) listener();
}

export function useLocalRuns(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => running,
    () => EMPTY,
  );
}
