import { jsonError, jsonOk, readJson } from "@/lib/http";
import { RunOptionsBodySchema } from "@/lib/schemas";
import { DEFAULT_MODEL } from "@/lib/types";
import { setStreamMode } from "@/server/permissions";
import { registries } from "@/server/registries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request, RunOptionsBodySchema);
  if (!body.ok) return body.response;

  const { effort, model, permissionMode, sessionId, streamId } = body.data;
  const state = registries.streams.get(streamId);
  if (!state || (sessionId && state.liveSessionId && state.liveSessionId !== sessionId)) {
    return jsonError(404, "no turn is running for that session");
  }

  const runner = state.runner;
  if (!runner || state.stopped) return jsonError(409, "that turn cannot change settings right now");

  try {
    if (permissionMode) {
      await runner.setPermissionMode(permissionMode);
      setStreamMode(state, permissionMode);
    }
    if (model) await runner.setModel(model === DEFAULT_MODEL ? undefined : model);
    if (effort !== undefined) await runner.applyFlagSettings({ effortLevel: effort });
  } catch (error) {
    return jsonError(409, String((error as Error)?.message ?? error));
  }
  return jsonOk({ ok: true });
}
