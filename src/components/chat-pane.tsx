"use client";

import { useEffect, useMemo, useState } from "react";

import { AUTO_EFFORT, useEffortPref, useModelPref } from "@/client/prefs";
import { useChat, type ChatTarget } from "@/client/use-chat";
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
import { ThreadView } from "./thread-view";

type Pick = { against: string | null; value: string };

export function ChatPane({
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
    detail,
    enqueue,
    loadError,
    loading,
    queue,
    retry,
    send,
    stop,
    terminalBusy,
    unqueue,
    view,
  } = useChat(target, onSessionCreated);

  const [modelPref, setModelPref] = useModelPref();
  const [effortPref, setEffortPref] = useEffortPref();
  const [modelPick, setModelPick] = useState<Pick | null>(null);
  const [effortPick, setEffortPick] = useState<Pick | null>(null);

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

  useEffect(() => {
    if (!busy) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role='dialog']")) return;
      event.preventDefault();
      void stop();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, stop]);

  const title = detail?.title ?? summary?.title ?? "New chat";
  const cwd = detail?.cwd ?? summary?.cwd ?? target.cwd;
  const branch = detail?.gitBranch ?? summary?.gitBranch ?? null;
  const fresh = !target.sessionId && view.items.length === 0 && !view.live && !busy;
  const scope = target.sessionId ?? `${PENDING_SCOPE_PREFIX}${target.cwd}`;

  return (
    <main className={styles.main}>
      <ChatHeader
        branch={branch}
        busy={busy}
        cwd={cwd}
        home={home}
        onOpenPalette={onOpenPalette}
        onToggleSidebar={onToggleSidebar}
        sessionId={target.sessionId ?? detail?.sessionId ?? null}
        sidebarHidden={sidebarHidden}
        title={title}
      />

      {fresh ? (
        <EmptyState cwd={cwd} home={home} onPick={(prompt) => void send(prompt, options)} />
      ) : (
        <ThreadView
          loading={loading}
          onDecide={(ask, decision, scope) => void decide(ask, decision, scope)}
          onRetry={view.canRetry ? retry : undefined}
          onStop={() => void stop()}
          view={{ ...view, error: view.error ?? loadError }}
        />
      )}

      <Composer
        busy={busy || terminalBusy}
        disabled={loading}
        effort={effort ?? AUTO_EFFORT}
        effortLevels={effortLevels}
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
        owner={busy ? "local" : "terminal"}
        placeholder={
          target.sessionId ? "Reply to this session…" : "Ask Claude to work in this folder…"
        }
        queue={queue}
        scope={scope}
      />
    </main>
  );
}
