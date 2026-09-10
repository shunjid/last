"use client";

import { homeRelative } from "@/lib/format";

import styles from "./empty-state.module.css";
import { IconSparkles } from "./icons";

const PROMPTS = [
  "Summarise what changed in this repo today.",
  "Explain how the auth flow works here.",
  "Find the slowest test in this project.",
  "Write a short README for this folder.",
];

export function EmptyState({
  cwd,
  home,
  onPick,
}: {
  cwd: string | null;
  home: string;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className={styles.root}>
      <span className={styles.mark}>
        <IconSparkles />
      </span>

      <div>
        <p className={styles.title}>Start a new chat</p>
        <p className={styles.lede}>
          This runs the same Claude Code that runs in your terminal, in the folder below. Anything
          you send here shows up in your normal session history.
        </p>
      </div>

      <p className={styles.path}>{homeRelative(cwd, home)}</p>

      <div className={styles.grid}>
        {PROMPTS.map((prompt) => (
          <button className={styles.card} key={prompt} onClick={() => onPick(prompt)} type="button">
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
