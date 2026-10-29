"use client";

import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListSubheader from "@mui/material/ListSubheader";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Popover from "@mui/material/Popover";
import Tooltip from "@mui/material/Tooltip";
import { useColorScheme } from "@mui/material/styles";
import { useEffect, useRef, useState } from "react";

import { useBackClose } from "@/client/back";
import { usePins } from "@/client/pins";
import { PHONE_QUERY, useMediaQuery } from "@/client/use-media-query";
import { basename, homeRelative, tokens, truncateMiddle } from "@/lib/format";
import type { ResultStats } from "@/lib/types";

import styles from "./chat-header.module.css";
import {
  IconCards,
  IconCheck,
  IconCodeBranch,
  IconCopy,
  IconFolder,
  IconMessages,
  IconMore,
  IconPin,
  IconPinOutlined,
  IconSearch,
  IconSidebar,
} from "./icons";
import { THEME_OPTIONS, ThemeToggle } from "./theme-toggle";

const WARN_AT = 80;
const DANGER_AT = 95;

function ContextMeter({ stats }: { stats: ResultStats | null }) {
  if (!stats?.contextWindow) return null;
  const used = (stats.inputTokens ?? 0) + (stats.outputTokens ?? 0) + (stats.cacheReadTokens ?? 0);
  const pct = Math.min(100, Math.round((used / stats.contextWindow) * 100));
  const level = pct >= DANGER_AT ? styles.contextDanger : pct >= WARN_AT ? styles.contextWarn : "";

  return (
    <Tooltip title={`${tokens(used)} of ${tokens(stats.contextWindow)} tokens in context`}>
      <span className={`${styles.chip} ${styles.contextMeter}`} tabIndex={0}>
        <span className={styles.contextTrack}>
          <span
            className={`${styles.contextFill} ${level}`}
            style={{ width: `${Math.max(pct, 3)}%` }}
          />
        </span>
        {pct}%
      </span>
    </Tooltip>
  );
}

export function ChatHeader({
  attention,
  branch,
  busy,
  cardsView = false,
  contextStats,
  cwd,
  home,
  onOpenFind,
  onOpenPalette,
  onToggleCards,
  onToggleSidebar,
  sessionId,
  sidebarHidden,
  title,
}: {
  attention: boolean;
  branch: string | null;
  busy: boolean;
  cardsView?: boolean;
  contextStats: ResultStats | null;
  cwd: string | null;
  home: string;
  onOpenFind?: () => void;
  onOpenPalette: () => void;
  onToggleCards?: () => void;
  onToggleSidebar: () => void;
  sessionId: string | null;
  sidebarHidden: boolean;
  title: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pins, toggle: togglePin } = usePins();
  const pinned = sessionId !== null && pins.includes(sessionId);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const menuOpen = menuAnchor !== null;
  const phone = useMediaQuery(PHONE_QUERY);
  const identityRef = useRef<HTMLDivElement>(null);
  const [detailsAnchor, setDetailsAnchor] = useState<HTMLElement | null>(null);
  const detailsOpen = phone && detailsAnchor !== null;
  const { mode, setMode } = useColorScheme();
  const currentMode = mode ?? "system";
  useBackClose(menuOpen, () => setMenuAnchor(null));
  useBackClose(detailsOpen, () => setDetailsAnchor(null));

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
    <header className={`${styles.root} ${sidebarHidden ? styles.edge : ""}`}>
      <Tooltip
        title={
          attention ? "Show the sidebar (⌘B). A session needs your answer" : "Show the sidebar (⌘B)"
        }
      >
        <IconButton
          aria-label={
            attention ? "Show the sidebar. A session needs your answer" : "Show the sidebar"
          }
          className={`${styles.tap} ${sidebarHidden ? "" : styles.drawerOnly}`}
          onClick={onToggleSidebar}
        >
          <IconSidebar />
          {attention && <span aria-hidden className={styles.attention} />}
        </IconButton>
      </Tooltip>

      <div className={styles.identity} ref={identityRef}>
        {phone ? (
          <button
            aria-controls={detailsOpen ? "chat-header-details" : undefined}
            aria-expanded={detailsOpen}
            aria-haspopup="dialog"
            className={`${styles.title} ${styles.titleButton}`}
            onClick={() => setDetailsAnchor(identityRef.current)}
            type="button"
          >
            {title}
          </button>
        ) : (
          <span className={styles.title}>{title}</span>
        )}
        <span className={styles.chips}>
          <span className={`${styles.chip} ${styles.pathChip}`} title={cwd ?? undefined}>
            <IconFolder />
            <span className={`${styles.chipLabel} ${styles.fullPath}`}>
              {truncateMiddle(homeRelative(cwd, home), 46)}
            </span>
            <span className={`${styles.chipLabel} ${styles.repoName}`}>
              {cwd ? basename(cwd) : "unknown"}
            </span>
          </span>
          {branch && (
            <span className={`${styles.chip} ${styles.branchChip}`}>
              <IconCodeBranch />
              <span className={styles.chipLabel}>{truncateMiddle(branch, 28)}</span>
            </span>
          )}
          <ContextMeter stats={contextStats} />
          {sessionId && (
            <Tooltip title="Copy the session id, then run claude --resume in your terminal">
              <button
                aria-label={copied ? "Session id copied" : "Copy the session id"}
                className={`${styles.chip} ${styles.idChip} ${styles.fineOnly} ${copied ? styles.copied : ""}`}
                onClick={() => void copyId()}
                type="button"
              >
                {copied ? <IconCheck /> : <IconCopy />}
                {sessionId.slice(0, 8)}
              </button>
            </Tooltip>
          )}
          {sessionId && (
            <Tooltip title={pinned ? "Unpin this session" : "Pin this session to the sidebar"}>
              <button
                aria-label={pinned ? "Unpin this session" : "Pin this session"}
                aria-pressed={pinned}
                className={`${styles.chip} ${styles.idChip} ${styles.pinChip} ${styles.fineOnly} ${pinned ? styles.pinned : ""}`}
                onClick={() => togglePin(sessionId)}
                type="button"
              >
                {pinned ? <IconPin /> : <IconPinOutlined />}
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
        {onToggleCards && (
          <Tooltip title={cardsView ? "Back to the full thread" : "Show replies as cards"}>
            <button
              aria-label="Cards view"
              aria-pressed={cardsView}
              className={`${styles.palette} ${styles.find} ${cardsView ? styles.viewOn : ""}`}
              onClick={onToggleCards}
              type="button"
            >
              <IconCards />
            </button>
          </Tooltip>
        )}
        {onOpenFind && (
          <button
            aria-label="Search this session"
            className={`${styles.palette} ${styles.find}`}
            onClick={onOpenFind}
            type="button"
          >
            <IconSearch />
            <span className={styles.paletteLabel}>Search this session</span>
            <kbd className={styles.key}>⌘F</kbd>
          </button>
        )}
        <button
          aria-label="Jump to a session"
          className={`${styles.palette} ${styles.wideOnly}`}
          onClick={onOpenPalette}
          type="button"
        >
          <IconMessages />
          <span className={styles.paletteLabel}>Jump to a session</span>
          <kbd className={styles.key}>⌘K</kbd>
        </button>
        <ThemeToggle className={styles.fineOnly} />
        <Tooltip title="More actions">
          <IconButton
            aria-controls={menuOpen ? "chat-header-menu" : undefined}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="More actions"
            className={`${styles.tap} ${styles.more}`}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
          >
            <IconMore />
          </IconButton>
        </Tooltip>
      </div>

      <Menu
        anchorEl={menuAnchor}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        className={styles.menu}
        id="chat-header-menu"
        onClose={() => setMenuAnchor(null)}
        open={menuOpen}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        variant="menu"
      >
        {phone && (
          <MenuItem
            className={styles.menuItem}
            onClick={() => {
              setMenuAnchor(null);
              onOpenPalette();
            }}
          >
            <IconMessages />
            Jump to a session
          </MenuItem>
        )}
        {sessionId && (
          <MenuItem
            className={`${styles.menuItem} ${copied ? styles.menuCopied : ""}`}
            onClick={() => void copyId()}
          >
            {copied ? <IconCheck /> : <IconCopy />}
            {copied ? "Session id copied" : "Copy the session id"}
            <span className={styles.menuMeta}>{sessionId.slice(0, 8)}</span>
          </MenuItem>
        )}
        {sessionId && (
          <MenuItem
            className={styles.menuItem}
            onClick={() => {
              setMenuAnchor(null);
              togglePin(sessionId);
            }}
          >
            {pinned ? <IconPin /> : <IconPinOutlined />}
            {pinned ? "Unpin this session" : "Pin this session"}
          </MenuItem>
        )}
        {(phone || sessionId) && <Divider />}
        <ListSubheader aria-hidden className={styles.menuHead}>
          Theme
        </ListSubheader>
        {THEME_OPTIONS.map((option) => (
          <MenuItem
            className={styles.menuItem}
            key={option.value}
            onClick={() => {
              setMode(option.value);
              setMenuAnchor(null);
            }}
            role="menuitemradio"
            selected={currentMode === option.value}
          >
            {option.icon}
            {option.label}
            {currentMode === option.value && <IconCheck className={styles.menuCheck} />}
          </MenuItem>
        ))}
      </Menu>

      <Popover
        anchorEl={detailsAnchor}
        anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
        id="chat-header-details"
        onClose={() => setDetailsAnchor(null)}
        open={detailsOpen}
        slotProps={{
          paper: { "aria-label": "Session details", className: styles.details, role: "dialog" },
        }}
        transformOrigin={{ horizontal: "left", vertical: "top" }}
      >
        <p className={styles.detailsTitle}>{title}</p>
        <p className={styles.detailsRow}>
          <IconFolder />
          <span>{homeRelative(cwd, home)}</span>
        </p>
        {branch && (
          <p className={styles.detailsRow}>
            <IconCodeBranch />
            <span>{branch}</span>
          </p>
        )}
      </Popover>
    </header>
  );
}
