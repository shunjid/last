"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { nextDraftId, type ChatTarget } from "@/client/use-chat";
import { useModels } from "@/client/use-models";
import { useSessionList, type SessionListPush } from "@/client/use-session-list";
import type { FolderChoice, PermissionMode, ProjectSummary, SessionSummary } from "@/lib/types";

import { ChatPane } from "./chat-pane";
import { CommandPalette } from "./command-palette";
import { FolderPicker } from "./folder-picker";
import { Sidebar } from "./sidebar";
import styles from "./workspace.module.css";

type Pane = { cwd: string; draftId: string; sessionId: string | null };

function newPane(cwd: string, sessionId: string | null): Pane {
  return { cwd, draftId: nextDraftId(), sessionId };
}

function initialPane(
  sessions: SessionSummary[],
  projects: ProjectSummary[],
  home: string,
  startCwd: string | null,
  startNew: boolean,
): Pane {
  if (startNew) return newPane(startCwd ?? projects[0]?.cwd ?? home, null);
  const newest = sessions[0];
  if (newest) return newPane(newest.cwd ?? projects[0]?.cwd ?? home, newest.sessionId);
  return newPane(projects[0]?.cwd ?? home, null);
}

export function Workspace({
  folders,
  home,
  loadError,
  projects,
  sessions,
}: {
  folders: FolderChoice[];
  home: string;
  loadError: string | null;
  projects: ProjectSummary[];
  sessions: SessionSummary[];
}) {
  const searchParams = useSearchParams();
  const askedNew = searchParams.get("new") === "1";
  const askedCwdRaw = searchParams.get("cwd");
  const askedCwd =
    askedCwdRaw && folders.some((folder) => folder.cwd === askedCwdRaw) ? askedCwdRaw : null;

  const [pane, setPane] = useState<Pane>(() =>
    initialPane(sessions, projects, home, askedCwd, askedNew),
  );
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [pushed, setPushed] = useState<SessionListPush | null>(null);
  const [paneKey, setPaneKey] = useState(0);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<PermissionMode>("default");
  const models = useModels();

  const onSessionCreated = useCallback((sessionId: string) => setCreatedId(sessionId), []);

  useSessionList(setPushed);

  const liveSessions = pushed?.sessions ?? sessions;
  const liveProjects = pushed?.projects ?? projects;
  const activeSessionId = pane.sessionId ?? createdId;

  const target = useMemo<ChatTarget>(
    () => ({ cwd: pane.cwd, draftId: pane.draftId, sessionId: pane.sessionId }),
    [pane],
  );

  const summary = useMemo(
    () => liveSessions.find((session) => session.sessionId === activeSessionId) ?? null,
    [activeSessionId, liveSessions],
  );

  const openSession = useCallback((session: SessionSummary) => {
    setCreatedId(null);
    setPane(newPane(session.cwd ?? session.project, session.sessionId));
    setPaneKey((value) => value + 1);
  }, []);

  const newChatIn = useCallback((cwd: string) => {
    setCreatedId(null);
    setPane(newPane(cwd, null));
    setPaneKey((value) => value + 1);
  }, []);

  const pickFolder = useCallback(
    (cwd: string) => {
      setPickerOpen(false);
      newChatIn(cwd);
    },
    [newChatIn],
  );

  const newChat = useCallback(() => setPickerOpen(true), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      } else if (key === "b") {
        event.preventDefault();
        setSidebarHidden((value) => !value);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={`${styles.shell} ${sidebarHidden ? styles.collapsed : ""}`}>
      <div className={styles.rail}>
        <Sidebar
          activeSessionId={activeSessionId}
          home={home}
          loadError={loadError}
          onNewChat={newChat}
          onSelect={openSession}
          onToggle={() => setSidebarHidden(true)}
          sessions={liveSessions}
        />
      </div>

      <ChatPane
        home={home}
        key={paneKey}
        mode={mode}
        models={models}
        onModeChange={setMode}
        onOpenPalette={() => setPaletteOpen(true)}
        onSessionCreated={onSessionCreated}
        onToggleSidebar={() => setSidebarHidden(false)}
        sidebarHidden={sidebarHidden}
        summary={summary}
        target={target}
      />

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNewChat={newChat}
          onNewChatIn={(project) => newChatIn(project.cwd)}
          onSelect={openSession}
          projects={liveProjects}
          sessions={liveSessions}
        />
      )}

      <FolderPicker
        folders={folders}
        home={home}
        onClose={() => setPickerOpen(false)}
        onPick={pickFolder}
        open={pickerOpen}
      />
    </div>
  );
}
