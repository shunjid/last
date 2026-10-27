"use client";

import IconButton from "@mui/material/IconButton";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AUTO_EFFORT, useEffortPref, useModelPref } from "@/client/prefs";
import { useChat, type ChatTarget } from "@/client/use-chat";
import { SHEET_QUERY, useMediaQuery } from "@/client/use-media-query";
import { useTitleSignal } from "@/client/use-title-signal";
import { resolveModelChoice } from "@/lib/models";
import {
  DEFAULT_MODEL,
  type EffortLevel,
  type ModelChoice,
  type PermissionMode,
} from "@/lib/types";
import type { SessionSummary } from "@/lib/types";

import { ChatHeader } from "./chat-header";
import styles from "./chat-pane.module.css";
import { Composer, PENDING_SCOPE_PREFIX } from "./composer";
import { EmptyState } from "./empty-state";
import { IconPen } from "./icons";
import { QuestionModal } from "./question-modal";
import { ThreadView } from "./thread-view";

type Pick = { against: string | null; value: string };

export function ChatPane({
  attention,
  home,
  mode,
  models,
  onModeChange,
  onOpenPalette,
  onSessionCreated,
  onToggleSidebar,
  sidebarHidden,
  summary,
  target,
}: {
  attention: boolean;
  home: string;
  mode: PermissionMode;
  models: ModelChoice[];
  onModeChange: (mode: PermissionMode) => void;
  onOpenPalette: () => void;
  onSessionCreated: (sessionId: string) => void;
  onToggleSidebar: () => void;
  sidebarHidden: boolean;
  summary: SessionSummary | null;
  target: ChatTarget;
}) {
  const {
    busy,
    decide,
    decideQuestion,
    detail,
    enqueue,
    loadError,
    loading,
    queue,
    retry,
    send,
    serverBusy,
    stop,
    terminalBusy,
    unqueue,
    view,
  } = useChat(target, onSessionCreated);

  const [modelPref, setModelPref] = useModelPref();
  const [effortPref, setEffortPref] = useEffortPref();
  const [modelPick, setModelPick] = useState<Pick | null>(null);
  const [effortPick, setEffortPick] = useState<Pick | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);
  const sheet = useMediaQuery(SHEET_QUERY);
  const [barsHidden, setBarsHidden] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const catalogReady = models.some((item) => item.value !== DEFAULT_MODEL);
  const sessionModel = catalogReady ? (detail?.model ?? null) : null;
  const sessionEffort = detail?.effort ?? null;

  const modelOverride = modelPick?.against === sessionModel ? (modelPick?.value ?? null) : null;
  const effortOverride = effortPick?.against === sessionEffort ? (effortPick?.value ?? null) : null;

  const choice = resolveModelChoice(
    models,
    modelPref,
    sessionModel,
    sessionEffort !== null,
    modelOverride,
  );
  const model = choice?.value ?? DEFAULT_MODEL;
  const effortLevels = choice?.effortLevels ?? [];
  const wanted = effortOverride ?? sessionEffort ?? effortPref;
  const effort = effortLevels.includes(wanted as EffortLevel) ? (wanted as EffortLevel) : null;

  const pickModel = (next: string) => {
    setModelPick({ against: sessionModel, value: next });
    setModelPref(next);
  };

  const pickEffort = (next: string) => {
    setEffortPick({ against: sessionEffort, value: next });
    setEffortPref(next);
  };

  const options = useMemo(() => ({ effort, mode, model }), [effort, mode, model]);

  const modelList = useMemo(
    () =>
      choice && !models.some((item) => item.value === choice.value) ? [...models, choice] : models,
    [choice, models],
  );

  useTitleSignal(busy, view.asks.length > 0);

  const stoppable = busy || serverBusy;

  useEffect(() => {
    if (!stoppable) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role='dialog'], [role='search']")) return;
      event.preventDefault();
      void stop();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stoppable, stop]);

  const title = detail?.title ?? summary?.title ?? "New chat";
  const cwd = detail?.cwd ?? summary?.cwd ?? target.cwd;
  const branch = detail?.gitBranch ?? summary?.gitBranch ?? null;
  const fresh = !target.sessionId && view.items.length === 0 && !view.live && !busy;

  const openFind = useCallback(() => {
    setFindOpen(true);
    setBarsHidden(false);
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  useEffect(() => {
    if (fresh) return;

    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey || event.key.toLowerCase() !== "f") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role='dialog'], [role='search']")) return;
      event.preventDefault();
      openFind();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fresh, openFind]);
  const scope = target.sessionId ?? `${PENDING_SCOPE_PREFIX}${target.cwd}`;
  const questionAsk = view.questionAsks[0];

  const askCount = view.asks.length + view.questionAsks.length;
  const [seenAsks, setSeenAsks] = useState(askCount);
  if (askCount !== seenAsks) {
    setSeenAsks(askCount);
    if (askCount > seenAsks) setBarsHidden(false);
  }

  useLayoutEffect(() => {
    const main = mainRef.current;
    const top = topRef.current;
    const bottom = bottomRef.current;
    if (!main || !top || !bottom) return;
    const observer = new ResizeObserver(() => {
      main.style.setProperty("--chat-top", `${top.offsetHeight}px`);
      main.style.setProperty("--chat-bottom", `${bottom.offsetHeight}px`);
    });
    observer.observe(top);
    observer.observe(bottom);
    return () => observer.disconnect();
  }, []);

  const hideBars = useCallback(() => {
    if (findOpen || bottomRef.current?.contains(document.activeElement)) return;
    setBarsHidden(true);
  }, [findOpen]);

  const showBars = useCallback(() => setBarsHidden(false), []);

  const compose = () => {
    setBarsHidden(false);
    composerRef.current?.focus({ preventScroll: true });
  };

  const away = sheet && barsHidden && !fresh;

  return (
    <main
      className={`${styles.main} ${sidebarHidden ? styles.edge : ""} ${fresh ? "" : styles.overlay} ${away ? styles.away : ""}`}
      ref={mainRef}
    >
      <div className={styles.top} onFocus={showBars} ref={topRef}>
        <ChatHeader
          attention={attention}
          branch={branch}
          busy={busy}
          contextStats={view.contextStats}
          cwd={cwd}
          home={home}
          onOpenFind={fresh ? undefined : openFind}
          onOpenPalette={onOpenPalette}
          onToggleSidebar={onToggleSidebar}
          sessionId={target.sessionId ?? detail?.sessionId ?? null}
          sidebarHidden={sidebarHidden}
          title={title}
        />
      </div>

      {questionAsk && (
        <QuestionModal
          ask={questionAsk}
          onSubmit={(outcome) => void decideQuestion(questionAsk, outcome)}
        />
      )}

      {fresh ? (
        <EmptyState cwd={cwd} home={home} onPick={(prompt) => void send(prompt, options)} />
      ) : (
        <ThreadView
          findInputRef={findInputRef}
          findOpen={findOpen}
          loading={loading}
          onCloseFind={() => setFindOpen(false)}
          onDecide={(ask, decision, scope) => void decide(ask, decision, scope)}
          onHideBars={sheet ? hideBars : undefined}
          onRetry={view.canRetry ? retry : undefined}
          onShowBars={showBars}
          onStop={() => void stop()}
          view={{ ...view, error: view.error ?? loadError }}
        />
      )}

      <div className={styles.bottom} onFocus={showBars} ref={bottomRef}>
        <Composer
          busy={stoppable || terminalBusy}
          disabled={loading}
          effort={effort ?? AUTO_EFFORT}
          effortLevels={effortLevels}
          inputRef={composerRef}
          mode={mode}
          model={model}
          models={modelList}
          onEffortChange={pickEffort}
          onModeChange={onModeChange}
          onModelChange={pickModel}
          onQueue={(prompt) => enqueue(prompt, options)}
          onSend={(prompt) => void send(prompt, options)}
          onStop={() => void stop()}
          onUnqueue={unqueue}
          owner={terminalBusy ? "terminal" : "local"}
          placeholder={
            target.sessionId ? "Reply to this session…" : "Ask Claude to work in this folder…"
          }
          queue={queue}
          scope={scope}
        />
      </div>

      {away && (
        <IconButton aria-label="Write a reply" className={styles.compose} onClick={compose}>
          <IconPen />
        </IconButton>
      )}
    </main>
  );
}
