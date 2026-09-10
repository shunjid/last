import { jsonError, jsonOk, readJson } from "@/lib/http";
import { PermissionDecisionSchema } from "@/lib/schemas";
import { decide } from "@/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request, PermissionDecisionSchema);
  if (!body.ok) return body.response;

  const { decision, requestId, scope, streamId } = body.data;
  const outcome = decide(streamId, requestId, decision, scope);
  if (!outcome.ok) return jsonError(404, "that permission request is no longer pending");

  return jsonOk({ ok: true, tool: outcome.tool });
}
