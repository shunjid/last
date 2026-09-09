import os from "node:os";

import { Landing } from "@/components/landing";
import { knownFolders } from "@/server/folders";
import { fetchSessions } from "@/server/sessions";

export const dynamic = "force-dynamic";

export default async function Page() {
  let sessions: Awaited<ReturnType<typeof fetchSessions>> = [];
  let loadError: string | null = null;

  try {
    sessions = await fetchSessions();
  } catch (error) {
    console.error("[last:home]", error);
    loadError = "Could not read ~/.claude/projects. Is Claude Code installed for this user?";
  }

  const folders = await knownFolders(sessions);

  return (
    <Landing
      folders={folders}
      home={os.homedir()}
      loadError={loadError}
      sessionCount={sessions.length}
    />
  );
}
