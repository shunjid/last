import os from "node:os";

import { Workspace } from "@/components/workspace";
import { knownFolders } from "@/server/folders";
import { fetchSessions, groupProjects } from "@/server/sessions";

export const dynamic = "force-dynamic";

export default async function Page() {
  let sessions: Awaited<ReturnType<typeof fetchSessions>> = [];
  let loadError: string | null = null;

  try {
    sessions = await fetchSessions();
  } catch (error) {
    console.error("[last:sessions]", error);
    loadError = "Could not read ~/.claude/projects. Is Claude Code installed for this user?";
  }

  const folders = await knownFolders(sessions);

  return (
    <Workspace
      folders={folders}
      home={os.homedir()}
      loadError={loadError}
      projects={groupProjects(sessions)}
      sessions={sessions}
    />
  );
}
