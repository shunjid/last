"use client";

import { useEffect, useRef } from "react";

import type { LiveFrame, ProjectSummary, SessionSummary } from "@/lib/types";

const RECONNECT_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

export type SessionListPush = { projects: ProjectSummary[]; sessions: SessionSummary[] };

export function useSessionList(onPush: (payload: SessionListPush) => void) {
  const pushRef = useRef(onPush);

  useEffect(() => {
    pushRef.current = onPush;
  }, [onPush]);

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let backoff = RECONNECT_MS;
    let stopped = false;

    function open() {
      if (stopped) return;
      const current = new EventSource("/api/live?list=1");
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

      current.onmessage = (event: MessageEvent<string>) => {
        let frame: LiveFrame;
        try {
          frame = JSON.parse(event.data) as LiveFrame;
        } catch {
          return;
        }
        if (frame.t !== "sessions") return;
        pushRef.current({ projects: frame.projects, sessions: frame.sessions });
      };
    }

    open();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      source?.close();
    };
  }, []);
}
