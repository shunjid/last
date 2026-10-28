import { jsonError, jsonOk, readJson } from "@/lib/http";
import { SendNowBodySchema } from "@/lib/schemas";
import { registries } from "@/server/registries";
import { injectNow } from "@/server/send-now";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request, SendNowBodySchema);
  if (!body.ok) return body.response;

  const { prompt, sessionId, streamId } = body.data;
  const state = registries.streams.get(streamId);
  if (!state || (sessionId && state.liveSessionId && state.liveSessionId !== sessionId)) {
    return jsonError(404, "no turn is running for that session");
  }

  if (!injectNow(state, prompt)) {
    return jsonError(409, "that turn cannot take a message right now");
  }
  return jsonOk({ ok: true });
}
