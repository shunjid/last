import {
  query,
  type Options,
  type PermissionResult,
  type Query,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { readJson } from "@/lib/http";
import { ChatBodySchema } from "@/lib/schemas";
import { DEFAULT_MODEL, type StreamFrame } from "@/lib/types";
import { effortAllowed } from "@/server/models";
import { closeStream, openStream, requestPermission } from "@/server/permissions";
import { registerQuery, unregisterQuery, withSessionLock } from "@/server/registries";
import { releaseRun, tryAcquireRun } from "@/server/run-guard";
import { FrameMapper } from "@/server/sdk-frames";
import { invalidateCwdAllowlist, resolveChatCwd } from "@/server/sessions";
import { settingSources } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 3600;

const encoder = new TextEncoder();
const HEARTBEAT_MS = 15_000;

export async function POST(request: Request) {
  const body = await readJson(request, ChatBodySchema);
  if (!body.ok) return body.response;

  const resolved = await resolveChatCwd({ cwd: body.data.cwd, sessionId: body.data.sessionId });
  if (!resolved.ok) {
    return Response.json({ error: resolved.reason }, { status: 400 });
  }

  const { effort, model, permissionMode, prompt, sessionId } = body.data;
  const cwd = resolved.cwd;
  const useModel = model && model !== DEFAULT_MODEL ? model : undefined;
  const useEffort =
    effort && (await effortAllowed(model ?? DEFAULT_MODEL, effort)) ? effort : undefined;
  if (!tryAcquireRun()) {
    return Response.json({ error: "too many turns are already running" }, { status: 429 });
  }
  const state = openStream(cwd);

  let releasedRun = false;
  const releaseSlot = () => {
    if (releasedRun) return;
    releasedRun = true;
    releaseRun();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let runner: Query | undefined;
      let liveSessionId: string | null = sessionId ?? null;
      const mapper = new FrameMapper();

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const send = (frame: StreamFrame) => write(`data: ${JSON.stringify(frame)}\n\n`);

      write(": open\n\n");
      send({ streamId: state.streamId, t: "open" });

      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      const cleanup = () => {
        releaseSlot();
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        closeStream(state.streamId, "Client disconnected");
        if (liveSessionId) unregisterQuery(liveSessionId, runner);
      };

      const onAbort = () => {
        runner?.interrupt().catch(() => undefined);
        runner?.close();
        cleanup();
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", onAbort, { once: true });

      const canUseTool = (
        toolName: string,
        input: Record<string, unknown>,
        options: { signal: AbortSignal },
      ): Promise<PermissionResult> =>
        requestPermission(state, toolName, input, options.signal, (ask) =>
          send({ ask, t: "permission" }),
        );

      const options: Options = {
        canUseTool,
        cwd,
        env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "last" },
        forwardSubagentText: true,
        includePartialMessages: true,
        permissionMode,
        settingSources,
        stderr: () => undefined,
        ...(useModel ? { model: useModel } : {}),
        ...(useEffort ? { effort: useEffort } : {}),
        ...(sessionId ? { resume: sessionId } : {}),
      };

      const run = async () => {
        runner = query({ options, prompt });
        try {
          for await (const message of runner as AsyncIterable<SDKMessage>) {
            if (closed) break;
            for (const frame of mapper.map(message)) {
              if (frame.t === "init") {
                liveSessionId = frame.sessionId;
                state.liveSessionId = frame.sessionId;
                if (runner) registerQuery(frame.sessionId, runner);
              }
              send(frame);
            }
          }
        } catch (error) {
          const text = String((error as Error)?.message ?? error);
          if (!text.startsWith("Claude Code returned an error result:")) {
            send({ message: text, t: "error" });
          }
        }
      };

      try {
        if (sessionId) await withSessionLock(sessionId, run);
        else await run();
      } finally {
        request.signal.removeEventListener("abort", onAbort);
        invalidateCwdAllowlist();
        send({ t: "done" });
        cleanup();
        try {
          controller.close();
        } catch {}
      }
    },

    cancel() {
      closeStream(state.streamId, "Client disconnected");
      releaseSlot();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform, no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
    status: 200,
  });
}
