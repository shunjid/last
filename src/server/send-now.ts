import "server-only";

import { randomUUID } from "node:crypto";

import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import type { StreamState } from "./registries";

async function* once(message: SDKUserMessage) {
  yield message;
}

export function injectNow(state: StreamState, text: string): boolean {
  const runner = state.runner;
  if (!runner || state.stopped || state.sendNow) return false;
  const uuid = randomUUID();
  state.sendNow = { text, uuid };
  void runner
    .streamInput(
      once({
        message: { content: text, role: "user" },
        parent_tool_use_id: null,
        priority: "now",
        type: "user",
        uuid,
      }),
    )
    .catch(() => undefined);
  return true;
}

export function answersSendNow(message: SDKMessage, uuid: string): boolean {
  const raw = message as unknown as { user_message_uuid?: unknown; user_message_uuids?: unknown };
  if (raw.user_message_uuid === uuid) return true;
  return Array.isArray(raw.user_message_uuids) && raw.user_message_uuids.includes(uuid);
}
