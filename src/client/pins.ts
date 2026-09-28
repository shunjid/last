"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "last:pins";
const EMPTY: string[] = [];

const listeners = new Set<() => void>();
let cache: { raw: string | null; pins: string[] } | null = null;

function parse(raw: string | null): string[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return EMPTY;
  }
}

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (cache?.raw === raw) return cache.pins;
  cache = { raw, pins: parse(raw) };
  return cache.pins;
}

function write(pins: string[]) {
  const raw = JSON.stringify(pins);
  cache = { raw, pins };
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {}
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== KEY) return;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function usePins() {
  const pins = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((sessionId: string) => {
    const current = read();
    write(
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [sessionId, ...current],
    );
  }, []);
  return { pins, toggle };
}
