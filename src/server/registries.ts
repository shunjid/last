import "server-only";

import type { PermissionResult, Query } from "@anthropic-ai/claude-agent-sdk";

export type PendingPermission = {
  requestId: string;
  streamId: string;
  toolName: string;
  resolve: (result: PermissionResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type StreamState = {
  cwd: string;
  streamId: string;
  pending: Map<string, PendingPermission>;
  allowedTools: Set<string>;
  liveSessionId: string | null;
};

type Registries = {
  streams: Map<string, StreamState>;
  queries: Map<string, Query>;
  locks: Map<string, Promise<unknown>>;
};

declare global {
  var __lastRegistries__: Registries | undefined;
}

export const registries: Registries =
  globalThis.__lastRegistries__ ??
  (globalThis.__lastRegistries__ = {
    locks: new Map(),
    queries: new Map(),
    streams: new Map(),
  });

export function withSessionLock<T>(sessionId: string, run: () => Promise<T>): Promise<T> {
  const previous = registries.locks.get(sessionId) ?? Promise.resolve();
  const next = previous.then(run, run);
  const guard = next.then(
    () => undefined,
    () => undefined,
  );
  registries.locks.set(sessionId, guard);
  guard.then(() => {
    if (registries.locks.get(sessionId) === guard) registries.locks.delete(sessionId);
  });
  return next;
}

export function registerQuery(sessionId: string, runner: Query) {
  registries.queries.set(sessionId, runner);
}

export function unregisterQuery(sessionId: string, runner?: Query) {
  const current = registries.queries.get(sessionId);
  if (!runner || current === runner) registries.queries.delete(sessionId);
}

export function findQuery(sessionId: string) {
  return registries.queries.get(sessionId);
}
