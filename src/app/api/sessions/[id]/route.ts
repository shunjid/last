import { jsonError, jsonOk } from "@/lib/http";
import { SessionIdSchema } from "@/lib/schemas";
import { acquireThread, snapshotThread } from "@/server/live";
import { fetchSessionMeta } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = SessionIdSchema.safeParse(id);
  if (!parsed.success) return jsonError(400, "invalid session id");

  try {
    const meta = await fetchSessionMeta(parsed.data);
    if (!meta) return jsonError(404, "session not found");
    const thread = await acquireThread(parsed.data);
    return jsonOk({ ...meta, ...snapshotThread(thread) });
  } catch (error) {
    console.error("[last:session-detail]", error);
    return jsonError(500, "could not read that transcript");
  }
}
