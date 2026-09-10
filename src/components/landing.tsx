"use client";

import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { FolderChoice } from "@/lib/types";

import { FolderPicker } from "./folder-picker";
import { IconArrowRight, IconPlus, IconSparkles } from "./icons";
import styles from "./landing.module.css";
import { ThemeToggle } from "./theme-toggle";

const POINTS = [
  "Every chat you have ever run with the claude command, in one list.",
  "Reply to any of them here. The same Claude Code answers, in the same folder.",
  "Your reply is saved to the session file, so claude --resume picks it up next time.",
];

export function Landing({
  folders,
  home,
  loadError,
  sessionCount,
}: {
  folders: FolderChoice[];
  home: string;
  loadError: string | null;
  sessionCount: number;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

  function startChat(cwd: string) {
    setPickerOpen(false);
    router.push(`/sessions?cwd=${encodeURIComponent(cwd)}&new=1`);
  }

  return (
    <main className={styles.root}>
      <div className={styles.corner}>
        <ThemeToggle />
      </div>

      <div className={styles.card}>
        <span className={styles.mark}>
          <IconSparkles />
        </span>

        <h1 className={styles.wordmark}>LAST</h1>
        <p className={styles.tagline}>Your Claude Code sessions, in a browser tab.</p>

        <ul className={styles.points}>
          {POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        {loadError && <p className={styles.alert}>{loadError}</p>}

        <div className={styles.actions}>
          <Button
            color="primary"
            onClick={() => setPickerOpen(true)}
            size="medium"
            startIcon={<IconPlus />}
            variant="contained"
          >
            New chat
          </Button>

          <Button
            color="inherit"
            endIcon={<IconArrowRight />}
            onClick={() => router.push("/sessions")}
            size="medium"
            variant="outlined"
          >
            Browse sessions
          </Button>
        </div>

        <p className={styles.count}>
          {sessionCount === 0
            ? "No sessions on this machine yet."
            : `${sessionCount} session${sessionCount > 1 ? "s" : ""} on this machine.`}
        </p>
      </div>

      <p className={styles.footer}>
        Runs only on 127.0.0.1. It has no sign in, and it can run commands as you.
      </p>

      <FolderPicker
        folders={folders}
        home={home}
        onClose={() => setPickerOpen(false)}
        onPick={startChat}
        open={pickerOpen}
      />
    </main>
  );
}
