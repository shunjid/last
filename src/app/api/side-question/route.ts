import { jsonError, jsonOk, readJson } from "@/lib/http";
import { SideQuestionBodySchema } from "@/lib/schemas";
import { registries } from "@/server/registries";
import { askSideQuestion } from "@/server/side-question";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_RUNNING =
  "LAST isn't running a turn in this session, so there's nothing to ask on the side.";
const TURN_ENDED = "The turn ended before Claude answered. Ask it in the main thread instead.";

export async function POST(request: Request) {
  const body = await readJson(request, SideQuestionBodySchema);
  if (!body.ok) return body.response;

  const { history, question, sessionId } = body.data;
  const runner = registries.queries.get(sessionId);
  if (!runner) return jsonError(409, NOT_RUNNING);

  try {
    const response = await askSideQuestion(runner, question, history, request.signal);
    if (response === null) return jsonError(502, "Claude didn't answer that side question.");
    return jsonOk({ response });
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    if (/cancel/i.test(message) || registries.queries.get(sessionId) !== runner) {
      return jsonError(409, TURN_ENDED);
    }
    return jsonError(502, message);
  }
}
