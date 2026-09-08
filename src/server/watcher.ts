import "server-only";

import { watch, type FSWatcher } from "node:fs";
import path from "node:path";

import { projectsRoot } from "./transcript";

export type WatchListener = (sessionId: string) => void;

type WatcherState = {
  handle: FSWatcher | null;
  healthy: boolean;
  listeners: Set<WatchListener>;
  retry: ReturnType<typeof setTimeout> | null;
};

declare global {
  var __lastWatcher__: WatcherState | undefined;
}

const state: WatcherState =
  globalThis.__lastWatcher__ ??
  (globalThis.__lastWatcher__ = {
    handle: null,
    healthy: false,
    listeners: new Set(),
    retry: null,
  });

const REARM_MS = 5_000;

const TRANSCRIPT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

function sessionIdFor(relative: string | null): string | null {
  if (!relative) return null;
  const parts = relative.split(path.sep);
  if (parts.length !== 2) return null;
  if (!TRANSCRIPT.test(parts[1])) return null;
  return parts[1].slice(0, -6);
}

function start() {
  if (state.handle) return;
  try {
    state.handle = watch(projectsRoot(), { persistent: false, recursive: true }, (_event, name) => {
      const sessionId = sessionIdFor(typeof name === "string" ? name : null);
      if (!sessionId) return;
      for (const listener of state.listeners) {
        try {
          listener(sessionId);
        } catch {
          continue;
        }
      }
    });
    state.handle.on("error", () => {
      drop();
      rearm();
    });
    state.healthy = true;
  } catch {
    drop();
    rearm();
  }
}

function drop() {
  try {
    state.handle?.close();
  } catch {
    state.handle = null;
  }
  state.handle = null;
  state.healthy = false;
}

function rearm() {
  if (state.retry || state.listeners.size === 0) return;
  state.retry = setTimeout(() => {
    state.retry = null;
    if (state.listeners.size > 0) start();
  }, REARM_MS);
  state.retry.unref?.();
}

function stop() {
  if (state.retry) clearTimeout(state.retry);
  state.retry = null;
  drop();
}

export function watcherHealthy() {
  return state.healthy;
}

export function subscribeToTranscripts(listener: WatchListener) {
  state.listeners.add(listener);
  start();
  return () => {
    state.listeners.delete(listener);
    if (state.listeners.size === 0) stop();
  };
}
