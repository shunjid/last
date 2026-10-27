import { jsonError, jsonOk, readJson } from "@/lib/http";
import { InterruptBodySchema } from "@/lib/schemas";
import { registries } from "@/server/registries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request, InterruptBodySchema);
  if (!body.ok) return body.response;

  const { sessionId, streamId } = body.data;
  const state = registries.streams.get(streamId);
  if (!state || (sessionId && state.liveSessionId && state.liveSessionId !== sessionId)) {
    return jsonError(404, "no turn is running for that session");
  }

  state.stopped = true;
  const runner = state.runner;
  if (!runner) return jsonOk({ ok: true });

  try {
    await runner.interrupt();
  } catch (error) {
    console.error("[last:interrupt]", error);
    return jsonError(500, "could not interrupt that turn");
  }
  return jsonOk({ ok: true });
}
