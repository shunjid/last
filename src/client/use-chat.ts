"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { LiveFrame, PermissionAsk } from "@/lib/types";

import { getSessionDetail } from "./api";
import {
  acquire,
  applyLive,
  decide as decideOn,
  enqueue as enqueueOn,
  failedDetail,
  finishLoad,
  loadedDetail,
  nextDraftId,
  retry as retryOn,
  send as sendOn,
  setOnCreated,
  stop as stopOn,
  subscribe as subscribeTo,
  unqueue as unqueueOn,
} from "./runs";
import type { SendOptions } from "./runs";

export type { ChatActivity, ChatView, QueuedMessage, SendOptions } from "./runs";

export { nextDraftId };

const RECONNECT_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;
const RELOAD_MS = 1_000;
const RELOAD_MAX_MS = 10_000;

export type ChatTarget = { cwd: string; draftId: string; sessionId: string | null };

export function useChat(target: ChatTarget, onSessionCreated: (sessionId: string) => void) {
  const entryKey = target.sessionId ?? target.draftId;
  const entry = useMemo(
    () => acquire(entryKey, target.cwd, target.sessionId),
    [entryKey, target.cwd, target.sessionId],
  );

  useSyncExternalStore(
    useCallback((listener: () => void) => subscribeTo(entry, listener), [entry]),
    () => entry.version,
    () => 0,
  );

  const { detail, epoch, loadError, loadedKey, loading, queue, view } = entry;
  const liveSessionId = entry.sessionId;
  const busy = view.phase === "connecting" || view.phase === "running";
  const terminalBusy = view.activity?.source === "terminal";

  useEffect(() => {
    setOnCreated(entry, onSessionCreated);
  }, [entry, onSessionCreated]);

  useEffect(() => {
    if (!liveSessionId || busy) return;
    const key = `${liveSessionId}:${epoch}`;
    if (loadedKey === key) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wait = RELOAD_MS;
    let done = false;

    function load() {
      if (done || controller.signal.aborted || !liveSessionId) return;
      getSessionDetail(liveSessionId, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          done = true;
          loadedDetail(entry, key, next);
          finishLoad(entry);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          failedDetail(
            entry,
            error instanceof Error ? error.message : "Could not load this session.",
          );
          finishLoad(entry);
          const delay = wait;
          wait = Math.min(wait * 2, RELOAD_MAX_MS);
          timer = setTimeout(() => {
            timer = null;
            load();
          }, delay);
        });
    }

    load();

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [busy, entry, epoch, liveSessionId, loadedKey]);

  useEffect(() => {
    if (busy || !liveSessionId) return;
    if (loadedKey !== `${liveSessionId}:${epoch}`) return;

    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoff = RECONNECT_MS;
    let stopped = false;

    function onFrame(event: MessageEvent<string>) {
      let frame: LiveFrame;
      try {
        frame = JSON.parse(event.data) as LiveFrame;
      } catch {
        return;
      }
      applyLive(entry, frame);
    }

    function open() {
      if (stopped || !liveSessionId) return;

      const params = new URLSearchParams({
        rev: String(entry.revision),
        session: liveSessionId,
      });
      const current = new EventSource(`/api/live?${params.toString()}`);
      source = current;

      current.onopen = () => {
        backoff = RECONNECT_MS;
      };

      current.onerror = () => {
        current.close();
        if (source === current) source = null;
        if (stopped || timer) return;
        timer = setTimeout(() => {
          timer = null;
          open();
        }, backoff);
        backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      };

      current.onmessage = onFrame;
    }

    open();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      source?.close();
    };
  }, [busy, entry, epoch, liveSessionId, loadedKey]);

  const send = useCallback(
    (prompt: string, options: SendOptions) => sendOn(entry, prompt, options),
    [entry],
  );

  const enqueue = useCallback(
    (prompt: string, options: SendOptions) => enqueueOn(entry, prompt, options),
    [entry],
  );

  const unqueue = useCallback((id: string) => unqueueOn(entry, id), [entry]);

  const retry = useCallback(() => retryOn(entry), [entry]);

  const stop = useCallback(() => stopOn(entry), [entry]);

  const decide = useCallback(
    (ask: PermissionAsk, decision: "allow" | "deny", scope: "once" | "session") =>
      decideOn(entry, ask, decision, scope),
    [entry],
  );

  return {
    busy,
    decide,
    detail,
    enqueue,
    loadError,
    loading,
    queue,
    retry,
    send,
    stop,
    terminalBusy,
    unqueue,
    view,
  };
}
