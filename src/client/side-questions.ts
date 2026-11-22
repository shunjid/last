"use client";

import { useCallback, useSyncExternalStore } from "react";

import { askSideQuestion } from "./api";
import { localId } from "./thread";

export type SideQuestion = {
  id: string;
  question: string;
  status: "asking" | "answered" | "failed";
  text: string;
};

const EMPTY: SideQuestion[] = [];
const threads = new Map<string, SideQuestion[]>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function settle(sessionId: string, id: string, patch: Pick<SideQuestion, "status" | "text">) {
  const list = threads.get(sessionId);
  if (!list) return;
  threads.set(
    sessionId,
    list.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  );
  emit();
}

export function askSide(sessionId: string, question: string) {
  const list = threads.get(sessionId) ?? EMPTY;
  const history = list
    .filter((item) => item.status === "answered")
    .map((item) => ({ question: item.question, response: item.text }));
  const id = localId("side");
  threads.set(sessionId, [...list, { id, question, status: "asking", text: "" }]);
  emit();
  askSideQuestion({ history, question, sessionId })
    .then(({ response }) => settle(sessionId, id, { status: "answered", text: response }))
    .catch((error: unknown) =>
      settle(sessionId, id, {
        status: "failed",
        text: error instanceof Error ? error.message : "Claude couldn't answer that.",
      }),
    );
}

export function useSideQuestions(sessionId: string | null): SideQuestion[] {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => (sessionId ? (threads.get(sessionId) ?? EMPTY) : EMPTY),
    () => EMPTY,
  );
}
