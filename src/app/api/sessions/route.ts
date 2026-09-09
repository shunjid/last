import { jsonError, jsonOk } from "@/lib/http";
import { fetchSessions, groupProjects } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessions = await fetchSessions();
    return jsonOk({ projects: groupProjects(sessions), sessions });
  } catch (error) {
    console.error("[last:sessions]", error);
    return jsonError(500, "could not read local sessions");
  }
}
