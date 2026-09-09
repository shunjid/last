import { jsonError, jsonOk } from "@/lib/http";
import { listModels } from "@/server/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return jsonOk({ models: await listModels() });
  } catch (error) {
    console.error("[last:models]", error);
    return jsonError(500, "could not read the model list");
  }
}
