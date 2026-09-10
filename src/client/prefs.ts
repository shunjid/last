"use client";

import { useCallback, useSyncExternalStore } from "react";

import { DEFAULT_MODEL } from "@/lib/types";

export const MODEL_KEY = "last:model";
export const EFFORT_KEY = "last:effort";
export const AUTO_EFFORT = "auto";

const listeners = new Set<() => void>();
const cache = new Map<string, string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(key: string, fallback: string): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let value = fallback;
  try {
    value = localStorage.getItem(key) ?? fallback;
  } catch {
    value = fallback;
  }
  cache.set(key, value);
  return value;
}

function write(key: string, value: string) {
  if (cache.get(key) === value) return;
  cache.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {}
  for (const listener of listeners) listener();
}

function usePref(key: string, fallback: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback((next: string) => write(key, next), [key]);
  return [value, set] as const;
}

export function useModelPref() {
  return usePref(MODEL_KEY, DEFAULT_MODEL);
}

export function useEffortPref() {
  return usePref(EFFORT_KEY, AUTO_EFFORT);
}
