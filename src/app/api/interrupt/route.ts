import { jsonError, jsonOk, readJson } from "@/lib/http";
import { InterruptBodySchema } from "@/lib/schemas";
import { findQuery, registries } from "@/server/registries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request, InterruptBodySchema);
  if (!body.ok) return body.response;

  const { sessionId, streamId } = body.data;
  if (registries.streams.get(streamId)?.liveSessionId !== sessionId) {
    return jsonError(404, "no turn is running for that session");
  }

  const runner = findQuery(sessionId);
  if (!runner) return jsonError(404, "no turn is running for that session");

  try {
    await runner.interrupt();
  } catch (error) {
    console.error("[last:interrupt]", error);
    return jsonError(500, "could not interrupt that turn");
  }
  return jsonOk({ ok: true });
}
