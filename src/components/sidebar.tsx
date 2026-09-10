"use client";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { useLocalRuns } from "@/client/activity";
import { homeRelative, relativeStamp, truncateMiddle } from "@/lib/format";
import type { SessionSummary } from "@/lib/types";

import {
  IconCodeBranch,
  IconPlus,
  IconSearch,
  IconSidebar,
  IconSparkles,
  IconXmark,
} from "./icons";
import styles from "./sidebar.module.css";

const NEW_CHAT_SX = {
  bgcolor: "secondary.container",
  color: "secondary.onContainer",
  minHeight: 40,
  px: 2.5,
  "&:hover": {
    bgcolor: "secondary.container",
    backgroundImage:
      "linear-gradient(var(--last-state-on-container), var(--last-state-on-container))",
  },
};

type Group = { cwd: string; label: string; sessions: SessionSummary[] };

function groupSessions(sessions: SessionSummary[]): Group[] {
  const groups = new Map<string, Group>();
  for (const session of sessions) {
    const cwd = session.cwd ?? session.project;
    let group = groups.get(cwd);
    if (!group) {
      group = { cwd, label: session.project, sessions: [] };
      groups.set(cwd, group);
    }
    group.sessions.push(session);
  }
  return [...groups.values()];
}

export function Sidebar({
  activeSessionId,
  home,
  loadError,
  onNewChat,
  onSelect,
  onToggle,
  sessions,
}: {
  activeSessionId: string | null;
  home: string;
  loadError: string | null;
  onNewChat: () => void;
  onSelect: (session: SessionSummary) => void;
  onToggle: () => void;
  sessions: SessionSummary[];
}) {
  const [query, setQuery] = useState("");
  const localRuns = useLocalRuns();

  const isRunning = useCallback(
    (session: SessionSummary) => session.running || localRuns.has(session.sessionId),
    [localRuns],
  );

  const runningCount = useMemo(
    () => sessions.filter((session) => isRunning(session)).length,
    [isRunning, sessions],
  );

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? sessions.filter(
          (session) =>
            session.title.toLowerCase().includes(needle) ||
            session.project.toLowerCase().includes(needle),
        )
      : sessions;
    return groupSessions(matched);
  }, [query, sessions]);

  return (
    <aside className={styles.root}>
      <div className={styles.top}>
        <div className={styles.brand}>
          <Tooltip title="Back to the home page">
            <Link className={styles.home} href="/">
              <span className={styles.mark}>
                <IconSparkles />
              </span>
              <span className={styles.wordmark}>LAST</span>
            </Link>
          </Tooltip>
          <span className={styles.spacer} />
          <Tooltip title="Hide the sidebar (⌘B)">
            <IconButton aria-label="Hide the sidebar" onClick={onToggle}>
              <IconSidebar />
            </IconButton>
          </Tooltip>
        </div>

        <Button onClick={onNewChat} startIcon={<IconPlus />} sx={NEW_CHAT_SX} variant="contained">
          New chat
        </Button>

        <TextField
          id="sidebar-search"
          name="search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sessions"
          size="small"
          slotProps={{
            htmlInput: { "aria-label": "Search sessions" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <IconSearch />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton aria-label="Clear search" onClick={() => setQuery("")}>
                    <IconXmark />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
          value={query}
        />
      </div>

      {loadError && <p className={styles.alert}>{loadError}</p>}

      <div className={styles.list}>
        {groups.length === 0 ? (
          <p className={styles.empty}>
            {sessions.length === 0
              ? "No Claude Code sessions found yet. Run claude in a terminal, then reload."
              : "Nothing matches that search."}
          </p>
        ) : (
          groups.map((group) => (
            <div className={styles.group} key={group.cwd}>
              <div className={styles.groupHead}>
                <span className={styles.groupName} title={homeRelative(group.cwd, home)}>
                  {group.label}
                </span>
                <span className={styles.groupCount}>{group.sessions.length}</span>
              </div>

              {group.sessions.map((session) => (
                <button
                  className={`${styles.item} ${
                    session.sessionId === activeSessionId ? styles.active : ""
                  }`}
                  key={session.sessionId}
                  onClick={() => onSelect(session)}
                  type="button"
                >
                  <span className={styles.itemTitle}>
                    {isRunning(session) && (
                      <>
                        <span aria-hidden className={styles.dot} />
                        <span className={styles.quiet}>Running. </span>
                      </>
                    )}
                    {session.title}
                  </span>
                  <span className={styles.itemMeta}>
                    <span className={isRunning(session) ? styles.runNow : undefined}>
                      {isRunning(session) ? "working now" : relativeStamp(session.lastModified)}
                    </span>
                    {session.gitBranch && (
                      <span className={styles.branch}>
                        <IconCodeBranch />
                        {truncateMiddle(session.gitBranch, 22)}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      <div className={styles.foot}>
        <span>
          {sessions.length} session{sessions.length === 1 ? "" : "s"} on this machine
        </span>
        {runningCount > 0 && <span className={styles.footRun}>{runningCount} running</span>}
      </div>
    </aside>
  );
}
