"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import type { SessionSummary } from "@/lib/types";

const STORAGE_KEY = "last-notify";

export type Notify = {
  blocked: boolean;
  enabled: boolean;
  supported: boolean;
  toggle: () => void;
};

function supported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

function stored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function remember(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Private mode and the like. The preference just will not survive a reload.
  }
  for (const listener of listeners) listener();
}

// Permission and the stored preference live outside React, and the server knows
// neither, so they are read through a store rather than hydrated into state.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readSupported() {
  return supported();
}

function readPermission(): NotificationPermission {
  return supported() ? Notification.permission : "default";
}

function readEnabled() {
  return supported() && stored();
}

const serverFalse = () => false;
const serverDefault = (): NotificationPermission => "default";

async function show(session: SessionSummary) {
  const options: NotificationOptions = {
    body: session.title || "A session needs your answer.",
    data: { sessionId: session.sessionId },
    icon: "/icon.svg",
    tag: `last-${session.sessionId}`,
  };

  // Mobile browsers only support showNotification() from a registration;
  // the Notification constructor throws there.
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) {
    await registration.showNotification("Claude needs your input", options);
    return;
  }
  new Notification("Claude needs your input", options);
}

/**
 * Fires a notification whenever a session starts waiting on the user. Only
 * transitions notify, and only while a tab is open — there is no background
 * push, so a closed browser stays quiet.
 */
export function useNotify(
  sessions: SessionSummary[],
  activeSessionId: string | null,
  onOpen: (sessionId: string) => void,
): Notify {
  const ready = useSyncExternalStore(subscribe, readSupported, serverFalse);
  const permission = useSyncExternalStore(subscribe, readPermission, serverDefault);
  const on = useSyncExternalStore(subscribe, readEnabled, serverFalse);

  const seen = useRef<Set<string> | null>(null);
  const openRef = useRef(onOpen);
  const activeRef = useRef(activeSessionId);

  useEffect(() => {
    openRef.current = onOpen;
    activeRef.current = activeSessionId;
  }, [activeSessionId, onOpen]);

  useEffect(() => {
    if (!ready || !on || permission !== "granted") return;
    let cancelled = false;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration fails on an untrusted certificate, which is worth knowing
      // about but not worth breaking the app over.
    });

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { sessionId?: string; type?: string } | null;
      if (cancelled || data?.type !== "open-session" || !data.sessionId) return;
      openRef.current(data.sessionId);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [on, permission, ready]);

  useEffect(() => {
    if (!ready || !on || permission !== "granted") {
      seen.current = null;
      return;
    }

    const waiting = new Set(
      sessions.filter((session) => session.waiting).map((session) => session.sessionId),
    );

    // The first pass only records what is already waiting, so enabling
    // notifications does not immediately fire one per open question.
    const before = seen.current;
    seen.current = waiting;
    if (!before) return;

    for (const session of sessions) {
      if (!session.waiting || before.has(session.sessionId)) continue;
      // The session you are already looking at speaks for itself.
      const looking =
        session.sessionId === activeRef.current && document.visibilityState === "visible";
      if (looking) continue;
      void show(session);
    }
  }, [on, permission, ready, sessions]);

  const toggle = useCallback(() => {
    if (!supported()) return;
    if (on) {
      remember(false);
      return;
    }
    if (Notification.permission === "granted") {
      remember(true);
      return;
    }
    // Must stay inside the click: iOS only grants from a user gesture.
    void Notification.requestPermission().then((result) => {
      remember(result === "granted");
    });
  }, [on]);

  return {
    blocked: permission === "denied",
    enabled: on && permission === "granted",
    supported: ready,
    toggle,
  };
}
