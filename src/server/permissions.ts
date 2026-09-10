import "server-only";

import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, dirname, join, normalize, resolve, sep } from "node:path";

import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

import type { PermissionAsk } from "@/lib/types";
import { editDiff, isMutatingTool, toolDisplayName, toolLanguage, toolSummary } from "@/lib/tools";
import { registries, type StreamState } from "./registries";

const TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_PER_STREAM = 32;
const MAX_DETAIL_CHARS = 2_000;
const MAX_URL_CHARS = 500;

const ALWAYS_ALLOWED_CANDIDATES = new Set([
  "Glob",
  "Grep",
  "NotebookRead",
  "Read",
  "TodoWrite",
  "WebSearch",
]);

export function openStream(cwd: string): StreamState {
  const streamId = randomUUID();
  const state: StreamState = {
    allowedTools: new Set<string>(),
    cwd,
    liveSessionId: null,
    pending: new Map(),
    streamId,
  };
  registries.streams.set(streamId, state);
  return state;
}

export function closeStream(streamId: string, message: string) {
  const state = registries.streams.get(streamId);
  if (!state) return;
  for (const entry of [...state.pending.values()]) {
    entry.resolve({ behavior: "deny", message });
  }
  state.pending.clear();
  registries.streams.delete(streamId);
}

type Redaction = Pick<PermissionAsk, "detail" | "summary" | "truncatedChars">;

function clip(text: string, summary: string, limit: number = MAX_DETAIL_CHARS): Redaction {
  const truncatedChars = Math.max(0, text.length - limit);
  return { detail: text.slice(0, limit) || null, summary, truncatedChars };
}

function prefixLines(text: string, marker: string): string[] {
  return text.split("\n").map((line) => `${marker}${line}`);
}

function diffText(input: Record<string, unknown>): string {
  const diff = editDiff(input);
  if (diff) {
    const removed = diff.oldText ? prefixLines(diff.oldText, "- ") : [];
    const added = diff.newText ? prefixLines(diff.newText, "+ ") : [];
    return [...removed, ...added].join("\n");
  }
  const added = typeof input.new_source === "string" ? input.new_source : "";
  return added ? prefixLines(added, "+ ").join("\n") : "";
}

function redact(toolName: string, input: Record<string, unknown>): Redaction {
  const summary = toolSummary(toolName, input);
  if (toolName === "Bash") {
    return clip(typeof input.command === "string" ? input.command : "", summary);
  }
  if (toolName === "Write") {
    return clip(typeof input.content === "string" ? input.content : "", summary);
  }
  if (toolName === "Edit" || toolName === "NotebookEdit") {
    return clip(diffText(input), summary);
  }
  if (toolName === "WebFetch" || toolName === "WebSearch") {
    const value = typeof input.url === "string" ? input.url : input.query;
    return clip(typeof value === "string" ? value : "", summary, MAX_URL_CHARS);
  }
  try {
    return clip(JSON.stringify(input, null, 2), summary);
  } catch {
    return { detail: null, summary, truncatedChars: 0 };
  }
}

export function buildAsk(
  requestId: string,
  toolName: string,
  input: Record<string, unknown>,
): PermissionAsk {
  const { detail, summary, truncatedChars } = redact(toolName, input);
  return {
    allowAlways: ALWAYS_ALLOWED_CANDIDATES.has(toolName),
    detail,
    language: toolLanguage(toolName, input),
    mutating: isMutatingTool(toolName),
    requestId,
    summary: summary || toolDisplayName(toolName),
    tool: toolName,
    truncatedChars,
  };
}

const PATH_KEYS = ["file_path", "notebook_path", "path"];
const SENSITIVE_SEGMENTS = new Set([".aws", ".claude", ".env", ".gnupg", ".ssh"]);

function realPath(path: string): string | null {
  const pending: string[] = [];
  let current = path;
  for (;;) {
    try {
      const real = realpathSync(current);
      return pending.length > 0 ? join(real, ...pending) : real;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
      const parent = dirname(current);
      if (parent === current) return null;
      pending.unshift(basename(current));
      current = parent;
    }
  }
}

function pathsStayInside(cwd: string, input: Record<string, unknown>): boolean {
  try {
    if (!cwd) return false;
    const root = realPath(normalize(resolve(cwd)));
    if (!root) return false;
    for (const key of PATH_KEYS) {
      const value = input[key];
      if (typeof value !== "string" || value.length === 0) continue;
      const target = realPath(normalize(resolve(root, value)));
      if (!target) return false;
      if (target !== root && !target.startsWith(root.endsWith(sep) ? root : root + sep)) {
        return false;
      }
      const segments = target.split(sep).filter(Boolean);
      for (const segment of segments) {
        if (SENSITIVE_SEGMENTS.has(segment)) return false;
      }
      if (basename(target).startsWith(".env")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function requestPermission(
  state: StreamState,
  toolName: string,
  input: Record<string, unknown>,
  signal: AbortSignal,
  emit: (ask: PermissionAsk) => void,
): Promise<PermissionResult> {
  if (state.allowedTools.has(toolName) && pathsStayInside(state.cwd, input)) {
    return Promise.resolve({ behavior: "allow", updatedInput: input });
  }
  if (state.pending.size >= MAX_PENDING_PER_STREAM) {
    return Promise.resolve({ behavior: "deny", message: "Too many pending permission requests" });
  }

  const requestId = randomUUID();

  return new Promise<PermissionResult>((resolve) => {
    const settle = (result: PermissionResult) => {
      const entry = state.pending.get(requestId);
      if (!entry) return;
      state.pending.delete(requestId);
      clearTimeout(entry.timer);
      resolve(result);
    };

    const timer = setTimeout(
      () => settle({ behavior: "deny", message: "Permission request expired" }),
      TTL_MS,
    );
    timer.unref?.();

    signal.addEventListener("abort", () => settle({ behavior: "deny", message: "Turn aborted" }), {
      once: true,
    });

    state.pending.set(requestId, {
      requestId,
      resolve: settle,
      streamId: state.streamId,
      timer,
      toolName,
    });
    emit(buildAsk(requestId, toolName, input));
  });
}

export function decide(
  streamId: string,
  requestId: string,
  decision: "allow" | "deny",
  scope: "once" | "session",
): { ok: boolean; tool?: string } {
  const state = registries.streams.get(streamId);
  const entry = state?.pending.get(requestId);
  if (!state || !entry) return { ok: false };

  if (
    decision === "allow" &&
    scope === "session" &&
    ALWAYS_ALLOWED_CANDIDATES.has(entry.toolName)
  ) {
    state.allowedTools.add(entry.toolName);
  }

  entry.resolve(
    decision === "allow"
      ? { behavior: "allow" }
      : { behavior: "deny", message: "The user declined this tool call." },
  );
  return { ok: true, tool: entry.toolName };
}
