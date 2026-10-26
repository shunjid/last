"use client";

import Button from "@mui/material/Button";
import {
  type RefObject,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  clearFindHighlights,
  type FindHit,
  findHits,
  FindTarget,
  paintFind,
  revealFind,
} from "@/client/find";
import type { ChatView } from "@/client/use-chat";
import { cost, duration, tokens } from "@/lib/format";
import type { PermissionAsk, ResultStats } from "@/lib/types";

import { ActivityLine } from "./activity-line";
import { FindBar } from "./find-bar";
import { IconArrowDown, IconCircleExclamation, IconLayerGroup, IconRefresh } from "./icons";
import { PermissionCard } from "./permission-card";
import styles from "./thread-view.module.css";
import { TurnBubble } from "./turn-bubble";

const BOTTOM_SLACK = 96;
const REPIN_SLACK = 24;
const AUTO_GRACE_MS = 1_200;

function StatsRow({ stats }: { stats: ResultStats }) {
  const parts: string[] = [];
  if (stats.durationMs > 0) parts.push(duration(stats.durationMs));
  if (stats.numTurns > 0) parts.push(`${stats.numTurns} step${stats.numTurns === 1 ? "" : "s"}`);
  if (stats.inputTokens !== null) parts.push(`${tokens(stats.inputTokens)} in`);
  if (stats.outputTokens !== null) parts.push(`${tokens(stats.outputTokens)} out`);
  if (stats.cacheReadTokens) parts.push(`${tokens(stats.cacheReadTokens)} cached`);
  if (stats.costUsd > 0) parts.push(cost(stats.costUsd));
  if (stats.provider) parts.push(stats.provider);
  if (parts.length === 0) return null;

  return (
    <div className={styles.stats}>
      {parts.map((part) => (
        <span key={part}>{part}</span>
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div className={styles.skeleton}>
      {[92, 74, 58, 84, 40].map((width, index) => (
        <div className={styles.bar} key={index} style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

export function ThreadView({
  findInputRef,
  findOpen,
  loading,
  onCloseFind,
  onDecide,
  onRetry,
  onStop,
  view,
}: {
  findInputRef: RefObject<HTMLInputElement | null>;
  findOpen: boolean;
  loading: boolean;
  onCloseFind: () => void;
  onDecide: (ask: PermissionAsk, decision: "allow" | "deny", scope: "once" | "session") => void;
  onRetry?: () => void;
  onStop: () => void;
  view: ChatView;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const steeringRef = useRef(false);
  const autoUntilRef = useRef(0);
  const [pinned, setPinned] = useState(true);

  const setPin = useCallback((next: boolean) => {
    pinnedRef.current = next;
    setPinned(next);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const node = viewportRef.current;
    if (!node) return;
    autoUntilRef.current = behavior === "smooth" ? Date.now() + AUTO_GRACE_MS : 0;
    node.scrollTo({ behavior, top: node.scrollHeight });
  }, []);

  const onScroll = useCallback(() => {
    const node = viewportRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;

    if (distance < REPIN_SLACK) {
      steeringRef.current = false;
      setPin(true);
      return;
    }
    if (steeringRef.current) {
      setPin(false);
      return;
    }
    if (distance > BOTTOM_SLACK && Date.now() > autoUntilRef.current) setPin(false);
  }, [setPin]);

  const takeControl = useCallback(() => {
    steeringRef.current = true;
    autoUntilRef.current = 0;
    setPin(false);
  }, [setPin]);

  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      if (event.deltaY < 0) takeControl();
    },
    [takeControl],
  );

  const jump = useCallback(() => {
    steeringRef.current = false;
    setPin(true);
    scrollToBottom("smooth");
  }, [scrollToBottom, setPin]);

  useLayoutEffect(() => {
    if (pinnedRef.current) scrollToBottom("auto");
  }, [scrollToBottom, view.asks, view.items, view.live, view.status]);

  useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom("auto");
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  const [query, setQuery] = useState("");
  const needle = useDeferredValue(findOpen ? query : "");
  const hits = useMemo(
    () => findHits(view.items, view.live, needle),
    [needle, view.items, view.live],
  );
  const [target, setTarget] = useState<FindHit | null>(null);
  const [targetNeedle, setTargetNeedle] = useState(needle);

  if (needle !== targetNeedle) {
    setTargetNeedle(needle);
    setTarget(hits.at(-1) ?? null);
  }

  const position = target
    ? hits.findIndex((hit) => hit.key === target.key && hit.nth === target.nth)
    : -1;

  const step = (direction: 1 | -1) => {
    if (hits.length === 0) return;
    const next =
      position === -1 ? hits.length - 1 : (position + direction + hits.length) % hits.length;
    setTarget({ ...hits[next] });
  };

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const viewport = viewportRef.current;
    if (!target || !inner || !viewport) return;
    takeControl();
    revealFind(viewport, inner, target, paintFind(inner, needle, target));
  }, [needle, takeControl, target]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || !needle.trim()) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      paintFind(inner, needle, target);
    };
    paint();
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(paint);
    });
    observer.observe(inner, { characterData: true, childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearFindHighlights();
    };
  }, [needle, target]);

  const running = view.phase === "connecting" || view.phase === "running";
  const activity = view.asks.length === 0 ? view.activity : null;

  return (
    <div className={styles.shell}>
      {findOpen && (
        <FindBar
          count={hits.length}
          inputRef={findInputRef}
          onClose={onCloseFind}
          onNewer={() => step(1)}
          onOlder={() => step(-1)}
          onQueryChange={setQuery}
          query={query}
          rank={position === -1 ? 0 : hits.length - position}
          searched={needle.trim() !== ""}
          truncated={view.truncated}
        />
      )}

      <div
        className={styles.viewport}
        onScroll={onScroll}
        onTouchStart={takeControl}
        onWheel={onWheel}
        ref={viewportRef}
      >
        <FindTarget.Provider value={target}>
          <div className={styles.inner} ref={innerRef}>
            {loading ? (
              <Skeleton />
            ) : (
              <>
                {view.truncated && (
                  <p className={styles.truncated}>
                    Older messages are not shown. This session is long, so only the recent part
                    loaded.
                  </p>
                )}

                {view.items.map((item) =>
                  item.type === "turn" ? (
                    <TurnBubble key={item.turn.id} turn={item.turn} />
                  ) : (
                    <div className={styles.divider} key={item.divider.id}>
                      <span
                        className={`${styles.chip} ${
                          item.divider.tone === "warning" ? styles.warning : ""
                        }`}
                      >
                        <IconLayerGroup />
                        {item.divider.label}
                        {item.divider.detail && (
                          <span className={styles.detail}>{item.divider.detail}</span>
                        )}
                      </span>
                    </div>
                  ),
                )}

                {view.live && <TurnBubble live={running} turn={view.live} />}

                {activity && (
                  <ActivityLine
                    activity={activity}
                    connecting={view.phase === "connecting"}
                    key={activity.startedAt}
                    onStop={activity.source === "local" ? onStop : undefined}
                    status={view.status}
                  />
                )}

                {view.asks.map((ask, index) => (
                  <PermissionCard
                    ask={ask}
                    key={ask.requestId}
                    onDecide={onDecide}
                    primary={index === 0}
                  />
                ))}

                {view.error && (
                  <div className={styles.error}>
                    <IconCircleExclamation />
                    <span className={styles.errorText}>{view.error}</span>
                    {onRetry && !running && (
                      <Button
                        color="inherit"
                        onClick={onRetry}
                        startIcon={<IconRefresh />}
                        variant="text"
                      >
                        Send again
                      </Button>
                    )}
                  </div>
                )}

                {view.stats && !running && <StatsRow stats={view.stats} />}
              </>
            )}
          </div>
        </FindTarget.Provider>
      </div>

      {!pinned && (
        <div className={styles.jump}>
          <Button color="inherit" onClick={jump} startIcon={<IconArrowDown />} variant="outlined">
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
}
