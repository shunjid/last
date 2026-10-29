import {
  query,
  type Options,
  type PermissionResult,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { readJson } from "@/lib/http";
import { ChatBodySchema } from "@/lib/schemas";
import { DEFAULT_MODEL, type StreamFrame } from "@/lib/types";
import { effortAllowed } from "@/server/models";
import {
  closeStream,
  openStream,
  requestPermission,
  requestQuestion,
  setStreamMode,
} from "@/server/permissions";
import { registerQuery, unregisterQuery, withSessionLock } from "@/server/registries";
import { releaseRun, tryAcquireRun } from "@/server/run-guard";
import { announceRun } from "@/server/run-watch";
import { FrameMapper } from "@/server/sdk-frames";
import { answersSendNow } from "@/server/send-now";
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
  const state = openStream(cwd, permissionMode);
  let detach = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let liveSessionId: string | null = sessionId ?? null;
      const mapper = new FrameMapper();

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      };
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };
      const send = (frame: StreamFrame) => write(`data: ${JSON.stringify(frame)}\n\n`);
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      detach = close;

      if (request.signal.aborted) state.stopped = true;
      request.signal.addEventListener("abort", close, { once: true });

      write(": open\n\n");
      send({ streamId: state.streamId, t: "open" });

      const canUseTool = async (
        toolName: string,
        input: Record<string, unknown>,
        options: { signal: AbortSignal },
      ): Promise<PermissionResult> => {
        const asked: string[] = [];
        const result =
          toolName === "AskUserQuestion"
            ? await requestQuestion(state, input, options.signal, (ask) => {
                asked.push(ask.requestId);
                send({ ask, t: "question" });
              })
            : await requestPermission(state, toolName, input, options.signal, (ask) => {
                asked.push(ask.requestId);
                send({ ask, t: "permission" });
              });
        for (const requestId of asked) {
          send({ behavior: result.behavior, requestId, t: "permission_resolved" });
        }
        return result;
      };

      const options: Options = {
        allowDangerouslySkipPermissions: true,
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
        if (state.stopped) return;
        const runner = query({ options, prompt });
        state.runner = runner;
        try {
          for await (const message of runner as AsyncIterable<SDKMessage>) {
            const pending = state.sendNow;
            if (pending && answersSendNow(message, pending.uuid)) {
              state.sendNow = null;
              if (state.stopped) void runner.interrupt().catch(() => undefined);
              else send({ t: "prompt", text: pending.text });
            } else if (pending && message.type === "result" && message.is_error) {
              continue;
            }
            for (const frame of mapper.map(message)) {
              if (frame.t === "init") {
                liveSessionId = frame.sessionId;
                state.liveSessionId = frame.sessionId;
                registerQuery(frame.sessionId, runner);
                announceRun(frame.sessionId);
              }
              if (frame.t === "mode") setStreamMode(state, frame.mode);
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
        request.signal.removeEventListener("abort", close);
        invalidateCwdAllowlist();
        if (state.sendNow) send({ t: "unsent" });
        send({ t: "done" });
        closeStream(state.streamId, "The turn ended");
        if (liveSessionId) unregisterQuery(liveSessionId, state.runner ?? undefined);
        releaseRun();
        close();
      }
    },

    cancel() {
      detach();
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
