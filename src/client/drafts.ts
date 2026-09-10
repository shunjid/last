"use client";

const KEY = "last:drafts";
const LIMIT = 40;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

type Draft = { at: number; text: string };
type Drafts = Record<string, Draft>;

function toDraft(value: unknown): Draft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as { at?: unknown; text?: unknown };
  if (typeof raw.at !== "number" || typeof raw.text !== "string") return null;
  return { at: raw.at, text: raw.text };
}

function readAll(): Drafts {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const cutoff = Date.now() - MAX_AGE_MS;
    const drafts: Drafts = {};
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      const draft = toDraft(value);
      if (draft && draft.at > cutoff) drafts[scope] = draft;
    }
    return drafts;
  } catch {
    return {};
  }
}

export function readDraft(scope: string): string {
  if (typeof window === "undefined") return "";
  return readAll()[scope]?.text ?? "";
}

export function writeDraft(scope: string, text: string) {
  if (typeof window === "undefined") return;
  const drafts = readAll();
  if (drafts[scope]?.text === text) return;
  delete drafts[scope];
  if (text) drafts[scope] = { at: Date.now(), text };

  const keys = Object.keys(drafts);
  for (const key of keys.slice(0, Math.max(0, keys.length - LIMIT))) delete drafts[key];

  try {
    window.localStorage.setItem(KEY, JSON.stringify(drafts));
  } catch {
    return;
  }
}
