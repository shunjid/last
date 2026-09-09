import { jsonError } from "@/lib/http";
import { SessionIdSchema } from "@/lib/schemas";
import { attachList, attachThread, encodeFrame, type LiveSink } from "@/server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("session");
  const wantsList = url.searchParams.get("list") === "1";

  let sessionId: string | null = null;
  if (raw !== null) {
    const parsed = SessionIdSchema.safeParse(raw);
    if (!parsed.success) return jsonError(400, "invalid session id");
    sessionId = parsed.data;
  }

  const revision = Number(url.searchParams.get("rev") ?? "0");
  if (!Number.isInteger(revision) || revision < 0) return jsonError(400, "invalid revision");
  if (!sessionId && !wantsList) return jsonError(400, "nothing to stream");

  const encoder = new TextEncoder();
  let detachThread: (() => void) | null = null;
  let detachList: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  function release() {
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    detachThread?.();
    detachList?.();
    detachThread = null;
    detachList = null;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function teardown() {
        if (closed) return;
        release();
        try {
          controller.close();
        } catch {
          return;
        }
      }

      request.signal.addEventListener("abort", teardown, { once: true });
      if (request.signal.aborted) return teardown();

      const sink: LiveSink = (payload) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          release();
        }
      };

      controller.enqueue(encoder.encode(": open\n\n"));

      if (wantsList) detachList = attachList(sink);

      if (sessionId) {
        const detach = await attachThread(sessionId, sink, revision);
        if (closed) {
          detach();
          return;
        }
        detachThread = detach;
      }

      if (closed) return;
      heartbeat = setInterval(() => sink(encodeFrame({ t: "ping" })), HEARTBEAT_MS);
      heartbeat.unref?.();
    },
    cancel() {
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}
