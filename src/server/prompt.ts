import "server-only";

import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import type { PromptImage } from "@/lib/types";

export async function* once(message: SDKUserMessage) {
  yield message;
}

export function promptContent(
  text: string,
  images: PromptImage[],
): SDKUserMessage["message"]["content"] {
  if (images.length === 0) return text;
  return [
    ...images.map((image) => ({
      source: { data: image.data, media_type: image.mediaType, type: "base64" as const },
      type: "image" as const,
    })),
    ...(text ? [{ text, type: "text" as const }] : []),
  ];
}

export function chatPrompt(text: string, images: PromptImage[]) {
  if (images.length === 0) return text;
  return once({
    message: { content: promptContent(text, images), role: "user" },
    parent_tool_use_id: null,
    type: "user",
  });
}
