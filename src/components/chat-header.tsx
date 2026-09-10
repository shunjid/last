"use client";

import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useEffect, useRef, useState } from "react";

import { homeRelative, truncateMiddle } from "@/lib/format";

import styles from "./chat-header.module.css";
import { IconCheck, IconCodeBranch, IconCopy, IconFolder, IconSearch, IconSidebar } from "./icons";
import { ThemeToggle } from "./theme-toggle";

export function ChatHeader({
  branch,
  busy,
  cwd,
  home,
  onOpenPalette,
  onToggleSidebar,
  sessionId,
  sidebarHidden,
  title,
}: {
  branch: string | null;
  busy: boolean;
  cwd: string | null;
  home: string;
  onOpenPalette: () => void;
  onToggleSidebar: () => void;
  sessionId: string | null;
  sidebarHidden: boolean;
  title: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copyId() {
    if (!sessionId) return;
    try {
      await navigator.clipboard.writeText(sessionId);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <header className={styles.root}>
      {sidebarHidden && (
        <Tooltip title="Show the sidebar (⌘B)">
          <IconButton aria-label="Show the sidebar" onClick={onToggleSidebar}>
            <IconSidebar />
          </IconButton>
        </Tooltip>
      )}

      <div className={styles.identity}>
        <span className={styles.title}>{title}</span>
        <span className={styles.chips}>
          <span className={`${styles.chip} ${styles.pathChip}`} title={cwd ?? undefined}>
            <IconFolder />
            {truncateMiddle(homeRelative(cwd, home), 46)}
          </span>
          {branch && (
            <span className={`${styles.chip} ${styles.branchChip}`}>
              <IconCodeBranch />
              {truncateMiddle(branch, 28)}
            </span>
          )}
          {sessionId && (
            <Tooltip title="Copy the session id, then run claude --resume in your terminal">
              <button
                aria-label={copied ? "Session id copied" : "Copy the session id"}
                className={`${styles.chip} ${styles.idChip} ${copied ? styles.copied : ""}`}
                onClick={() => void copyId()}
                type="button"
              >
                {copied ? <IconCheck /> : <IconCopy />}
                {sessionId.slice(0, 8)}
              </button>
            </Tooltip>
          )}
          {busy && (
            <span className={styles.live}>
              <span className={styles.pulse} />
              live
            </span>
          )}
        </span>
        <span className={styles.status} role="status">
          {copied ? "Session id copied to the clipboard" : ""}
        </span>
      </div>

      <div className={styles.actions}>
        <button className={styles.palette} onClick={onOpenPalette} type="button">
          <IconSearch />
          <span className={styles.paletteLabel}>Jump to a session</span>
          <kbd className={styles.key}>⌘K</kbd>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
