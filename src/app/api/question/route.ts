import { jsonError, jsonOk, readJson } from "@/lib/http";
import { QuestionDecisionSchema } from "@/lib/schemas";
import { decideQuestion } from "@/server/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request, QuestionDecisionSchema);
  if (!body.ok) return body.response;

  const { requestId, streamId } = body.data;
  const outcome =
    body.data.decision === "answer"
      ? decideQuestion(streamId, requestId, { answers: body.data.answers })
      : decideQuestion(streamId, requestId, { cancelled: true });
  if (!outcome.ok) return jsonError(404, "that question is no longer pending");

  return jsonOk({ ok: true });
}
