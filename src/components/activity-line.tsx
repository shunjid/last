"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import type { ChatActivity } from "@/client/use-chat";
import { tokens } from "@/lib/format";

import styles from "./activity-line.module.css";

const GLYPHS = ["·", "✢", "✳", "∗", "✻", "✽"];

const VERBS = [
  "Cooking",
  "Simmering",
  "Noodling",
  "Pondering",
  "Percolating",
  "Tinkering",
  "Wrangling",
  "Puzzling",
  "Brewing",
  "Whirring",
  "Musing",
  "Scheming",
  "Spelunking",
  "Untangling",
  "Marinating",
  "Crunching",
  "Juggling",
  "Conjuring",
];

const FAST_MS = 130;
const SLOW_MS = 1_000;
const VERB_MS = 5_000;
const STALE_MS = 15 * 60 * 1_000;

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

export function ActivityLine({
  activity,
  connecting,
  onStop,
  status,
}: {
  activity: ChatActivity;
  connecting: boolean;
  onStop?: () => void;
  status: string | null;
}) {
  const reduced = useReducedMotion();
  const startedAt = activity.startedAt;
  const [pulse, setPulse] = useState({ frame: 0, now: startedAt });

  useEffect(() => {
    const timer = setInterval(
      () => setPulse((prev) => ({ frame: prev.frame + 1, now: Date.now() })),
      reduced ? SLOW_MS : FAST_MS,
    );
    return () => clearInterval(timer);
  }, [reduced]);

  const terminal = activity.source === "terminal";
  if (terminal && pulse.now - activity.lastRecordAt > STALE_MS) return null;

  const elapsed = Math.max(0, pulse.now - startedAt);
  const glyph = reduced ? GLYPHS[2] : GLYPHS[pulse.frame % GLYPHS.length];

  const seed = Math.floor(startedAt / 1000);
  const verb = VERBS[(seed + Math.floor(elapsed / VERB_MS)) % VERBS.length];
  const label = connecting ? "Connecting" : status === "compacting" ? "Compacting context" : verb;

  const parts: string[] = [clock(elapsed)];
  if (activity.outputTokens > 0) parts.push(`↓ ${tokens(activity.outputTokens)} tokens`);
  else if (activity.thinkingTokens > 0)
    parts.push(`↓ ${tokens(activity.thinkingTokens)} thinking tokens`);
  if (activity.thinking) {
    parts.push(activity.effort ? `thinking with ${activity.effort} effort` : "thinking");
  }
  if (terminal) parts.push("in terminal");

  return (
    <div aria-live="polite" className={styles.line} role="status">
      <span aria-hidden className={styles.glyph}>
        {glyph}
      </span>
      <span className={styles.label}>{label}…</span>
      <span className={styles.meta}>({parts.join(" · ")})</span>
      {onStop ? (
        <button className={styles.stop} onClick={onStop} type="button">
          esc to stop
        </button>
      ) : (
        <span className={styles.owner}>running in your terminal</span>
      )}
    </div>
  );
}
