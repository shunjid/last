"use client";

import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useEffect, type RefObject } from "react";

import styles from "./find-bar.module.css";
import { IconArrowDown, IconArrowUp, IconSearch, IconXmark } from "./icons";

export function FindBar({
  count,
  inputRef,
  onClose,
  onNewer,
  onOlder,
  onQueryChange,
  query,
  rank,
  searched,
  truncated,
}: {
  count: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onNewer: () => void;
  onOlder: () => void;
  onQueryChange: (query: string) => void;
  query: string;
  rank: number;
  searched: boolean;
  truncated: boolean;
}) {
  useEffect(() => {
    const opener = document.activeElement;
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [inputRef]);

  const label = !searched
    ? ""
    : count === 0
      ? "No results"
      : rank > 0
        ? `${rank} of ${count}`
        : `${count} match${count === 1 ? "" : "es"}`;

  return (
    <div className={styles.root} role="search">
      <div className={styles.row}>
        <IconSearch className={styles.glyph} />
        <input
          aria-label="Search this session"
          className={styles.input}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (event.shiftKey) onNewer();
              else onOlder();
            }
          }}
          placeholder="Search this session…"
          ref={inputRef}
          spellCheck={false}
          value={query}
        />
        <span className={styles.count} role="status">
          {label}
        </span>
        <Tooltip title="Older match (↵)">
          <IconButton
            aria-label="Older match"
            className={styles.button}
            onClick={onOlder}
            size="small"
          >
            <IconArrowUp />
          </IconButton>
        </Tooltip>
        <Tooltip title="Newer match (⇧↵)">
          <IconButton
            aria-label="Newer match"
            className={styles.button}
            onClick={onNewer}
            size="small"
          >
            <IconArrowDown />
          </IconButton>
        </Tooltip>
        <Tooltip title="Close (Esc)">
          <IconButton
            aria-label="Close search"
            className={styles.button}
            onClick={onClose}
            size="small"
          >
            <IconXmark />
          </IconButton>
        </Tooltip>
      </div>
      {truncated && (
        <p className={styles.note}>Only the loaded part of this session is searched.</p>
      )}
    </div>
  );
}
