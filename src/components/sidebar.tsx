"use client";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { useLocalRuns } from "@/client/activity";
import { usePins } from "@/client/pins";
import { homeRelative, relativeStamp, truncateMiddle } from "@/lib/format";
import type { SessionSummary } from "@/lib/types";

import {
  IconChevronRight,
  IconCodeBranch,
  IconOpenInFull,
  IconPlus,
  IconSearch,
  IconSidebar,
  IconSparkles,
  IconTriangleExclamation,
} from "./icons";
import styles from "./sidebar.module.css";

const NEW_CHAT_SX = {
  bgcolor: "secondary.container",
  color: "secondary.onContainer",
  minHeight: 40,
  px: 2.5,
  "@media (pointer: coarse)": {
    minHeight: 44,
  },
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
  onBrowseGroup,
  onJump,
  onNewChat,
  onSelect,
  onToggle,
  sessions,
}: {
  activeSessionId: string | null;
  home: string;
  loadError: string | null;
  onBrowseGroup: (group: { cwd: string; label: string }) => void;
  onJump: () => void;
  onNewChat: () => void;
  onSelect: (session: SessionSummary) => void;
  onToggle: () => void;
  sessions: SessionSummary[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const localRuns = useLocalRuns();
  const { pins } = usePins();

  const isRunning = useCallback(
    (session: SessionSummary) => session.running || localRuns.has(session.sessionId),
    [localRuns],
  );

  const waitingCount = useMemo(
    () => sessions.filter((session) => session.waiting).length,
    [sessions],
  );

  const runningCount = useMemo(
    () => sessions.filter((session) => isRunning(session) && !session.waiting).length,
    [isRunning, sessions],
  );

  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  const toggleGroup = useCallback((cwd: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(cwd)) {
        next.delete(cwd);
      } else {
        next.add(cwd);
      }
      return next;
    });
  }, []);

  const pinned = useMemo(() => {
    const byId = new Map(sessions.map((session) => [session.sessionId, session]));
    return pins.flatMap((id) => byId.get(id) ?? []);
  }, [pins, sessions]);

  const recent = useMemo(
    () =>
      sessions
        .filter((session) => !pins.includes(session.sessionId))
        .sort((a, b) => b.lastModified - a.lastModified)
        .slice(0, 5),
    [pins, sessions],
  );

  const pinnedVisible = pinned.length > 0;
  const recentVisible = recent.length > 0;

  const anyExpanded = groups.some((group) => expanded.has(group.cwd));

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const renderItem = (session: SessionSummary, showRepo = false) => (
    <button
      className={`${styles.item} ${session.sessionId === activeSessionId ? styles.active : ""}`}
      key={session.sessionId}
      onClick={() => onSelect(session)}
      type="button"
    >
      <span className={styles.itemTitle}>
        {session.waiting ? (
          <>
            <span aria-hidden className={styles.ask}>
              <IconTriangleExclamation />
            </span>
            <span className={styles.quiet}>Needs your answer. </span>
          </>
        ) : (
          isRunning(session) && (
            <>
              <span aria-hidden className={styles.dot} />
              <span className={styles.quiet}>Running. </span>
            </>
          )
        )}
        {session.title}
      </span>
      <span className={styles.itemMeta}>
        {session.waiting ? (
          <span className={styles.askNow}>needs your answer</span>
        ) : (
          <span className={isRunning(session) ? styles.runNow : undefined}>
            {isRunning(session) ? "working now" : relativeStamp(session.lastModified)}
          </span>
        )}
        {session.gitBranch && (
          <span className={styles.branch}>
            <IconCodeBranch />
            {showRepo && session.cwd && `${truncateMiddle(session.project, 18)} · `}
            {truncateMiddle(session.gitBranch, 22)}
          </span>
        )}
      </span>
    </button>
  );

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
            <IconButton aria-label="Hide the sidebar" className={styles.tap} onClick={onToggle}>
              <IconSidebar />
            </IconButton>
          </Tooltip>
        </div>

        <Button onClick={onNewChat} startIcon={<IconPlus />} sx={NEW_CHAT_SX} variant="contained">
          New chat
        </Button>

        <button className={styles.jump} onClick={onJump} type="button">
          <IconSearch />
          <span className={styles.jumpLabel}>Jump to a session</span>
          <kbd className={styles.key}>⌘K</kbd>
        </button>
      </div>

      {loadError && <p className={styles.alert}>{loadError}</p>}

      <div className={styles.list}>
        {pinnedVisible && (
          <div className={styles.section}>
            <div className={styles.projectsHead}>
              <span className={styles.projectsLabel}>Pinned</span>
            </div>
            {pinned.map((session) => renderItem(session))}
          </div>
        )}

        {recentVisible && (
          <div className={styles.section}>
            <div className={styles.projectsHead}>
              <span className={styles.projectsLabel}>Recent</span>
            </div>
            {recent.map((session) => renderItem(session, true))}
          </div>
        )}

        {groups.length > 0 && (
          <div className={styles.projectsHead}>
            <span className={styles.projectsLabel}>Projects</span>
            {anyExpanded && (
              <button className={styles.collapseAll} onClick={collapseAll} type="button">
                Collapse all
              </button>
            )}
          </div>
        )}

        {groups.length === 0 ? (
          <p className={styles.empty}>
            No Claude Code sessions found yet. Run claude in a terminal, then reload.
          </p>
        ) : (
          groups.map((group) => {
            const open = expanded.has(group.cwd);
            return (
              <div className={styles.group} key={group.cwd}>
                <div className={`${styles.groupHead} ${open ? styles.open : ""}`}>
                  <button
                    aria-expanded={open}
                    className={styles.groupToggle}
                    onClick={() => toggleGroup(group.cwd)}
                    type="button"
                  >
                    <span aria-hidden className={styles.groupChevron}>
                      <IconChevronRight />
                    </span>
                    <span className={styles.groupName} title={homeRelative(group.cwd, home)}>
                      {group.label}
                    </span>
                    <span className={styles.groupCount}>
                      {group.sessions.some((session) => session.waiting) && (
                        <span className={styles.groupAsk}>
                          <IconTriangleExclamation />
                          <span className={styles.quiet}>A session here needs your answer. </span>
                        </span>
                      )}
                      {group.sessions.length}
                    </span>
                  </button>
                  <button
                    aria-label={`Browse ${group.label} sessions`}
                    className={styles.groupBrowse}
                    onClick={() => onBrowseGroup({ cwd: group.cwd, label: group.label })}
                    type="button"
                  >
                    <IconOpenInFull />
                  </button>
                </div>

                {open && group.sessions.map((session) => renderItem(session))}
              </div>
            );
          })
        )}
      </div>

      <div className={styles.foot}>
        <span>
          {sessions.length} session{sessions.length === 1 ? "" : "s"} on this machine
        </span>
        {waitingCount + runningCount > 0 && (
          <span className={styles.footRun}>
            {waitingCount > 0 && <span className={styles.footAsk}>{waitingCount} waiting</span>}
            {waitingCount > 0 && runningCount > 0 && " · "}
            {runningCount > 0 && `${runningCount} running`}
          </span>
        )}
      </div>
    </aside>
  );
}
