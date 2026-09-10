"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { IconFolderOpen, IconMessages, IconPlus, IconSearch } from "@/components/icons";
import { relativeStamp } from "@/lib/format";
import type { ProjectSummary, SessionSummary } from "@/lib/types";

import styles from "./command-palette.module.css";

const MAX_PROJECTS = 8;
const MAX_SESSIONS = 60;

type Entry =
  | { kind: "new"; label: string; sub: string }
  | { kind: "project"; label: string; project: ProjectSummary; sub: string }
  | { kind: "session"; label: string; session: SessionSummary; sub: string };

function entryKey(entry: Entry) {
  if (entry.kind === "new") return "new";
  if (entry.kind === "project") return `project:${entry.project.cwd}`;
  return entry.session.sessionId;
}

export function CommandPalette({
  onClose,
  onNewChat,
  onNewChatIn,
  onSelect,
  projects,
  sessions,
}: {
  onClose: () => void;
  onNewChat: () => void;
  onNewChatIn: (project: ProjectSummary) => void;
  onSelect: (session: SessionSummary) => void;
  projects: ProjectSummary[];
  sessions: SessionSummary[];
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const needle = query.trim().toLowerCase();

    const folders = needle
      ? projects
          .filter(
            (project) =>
              project.label.toLowerCase().includes(needle) ||
              project.cwd.toLowerCase().includes(needle),
          )
          .slice(0, MAX_PROJECTS)
          .map<Entry>((project) => ({
            kind: "project",
            label: `New chat in ${project.label}`,
            project,
            sub: project.cwd,
          }))
      : [];

    const matches = sessions
      .filter(
        (session) =>
          !needle ||
          session.title.toLowerCase().includes(needle) ||
          session.project.toLowerCase().includes(needle),
      )
      .slice(0, MAX_SESSIONS)
      .map<Entry>((session) => ({
        kind: "session",
        label: session.title,
        session,
        sub: session.project,
      }));

    return [
      { kind: "new", label: "Start a new chat", sub: "In the project you are viewing" },
      ...folders,
      ...matches,
    ];
  }, [projects, query, sessions]);

  const index = Math.min(cursor, entries.length - 1);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index, entries]);

  useEffect(() => {
    const opener = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = [...panel.querySelectorAll<HTMLElement>("input, button")];
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function choose(entry: Entry) {
    onClose();
    if (entry.kind === "new") onNewChat();
    else if (entry.kind === "project") onNewChatIn(entry.project);
    else onSelect(entry.session);
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-label="Jump to a session"
        aria-modal="true"
        className={styles.panel}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            trapTab(event);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setCursor((index + 1) % entries.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setCursor((index - 1 + entries.length) % entries.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const entry = entries[index];
            if (entry) choose(entry);
          }
        }}
        ref={panelRef}
        role="dialog"
      >
        <div className={styles.search}>
          <IconSearch />
          <input
            aria-label="Search sessions and folders"
            className={styles.input}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            placeholder="Search sessions, or a folder to start in…"
            ref={inputRef}
            value={query}
          />
        </div>

        <div className={styles.results} ref={listRef}>
          {entries.length === 1 && query.trim() && (
            <p className={styles.empty}>No session or folder matches “{query.trim()}”.</p>
          )}

          {entries.map((entry, position) => (
            <button
              className={`${styles.option} ${position === index ? styles.selected : ""}`}
              data-index={position}
              key={entryKey(entry)}
              onClick={() => choose(entry)}
              onMouseMove={() => setCursor(position)}
              type="button"
            >
              <span className={styles.glyph}>
                {entry.kind === "new" ? (
                  <IconPlus />
                ) : entry.kind === "project" ? (
                  <IconFolderOpen />
                ) : (
                  <IconMessages />
                )}
              </span>
              <span className={styles.text}>
                <span className={styles.label}>{entry.label}</span>
                <span className={styles.sub}>{entry.sub}</span>
              </span>
              {entry.kind === "session" && (
                <span className={styles.stamp}>{relativeStamp(entry.session.lastModified)}</span>
              )}
            </button>
          ))}
        </div>

        <div className={styles.foot}>
          <span>
            <kbd className={styles.key}>↑</kbd> <kbd className={styles.key}>↓</kbd> move
          </span>
          <span>
            <kbd className={styles.key}>↵</kbd> open
          </span>
          <span>
            <kbd className={styles.key}>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
