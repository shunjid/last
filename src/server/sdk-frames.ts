import "server-only";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import type { ResultStats, StreamFrame, ToolResult } from "@/lib/types";

const MAX_RESULT_CHARS = 20_000;

type OpenBlock = { kind: "text" | "thinking" | "tool"; id?: string; name?: string };

function clip(value: string) {
  return value.length <= MAX_RESULT_CHARS
    ? value
    : `${value.slice(0, MAX_RESULT_CHARS)}\n… (${value.length - MAX_RESULT_CHARS} more characters)`;
}

function flattenResult(content: unknown): ToolResult {
  if (typeof content === "string") return { images: 0, isError: false, text: clip(content) };
  if (!Array.isArray(content)) return { images: 0, isError: false, text: "" };
  const parts: string[] = [];
  let images = 0;
  for (const raw of content as Array<Record<string, unknown>>) {
    if (raw?.type === "text") parts.push(String(raw.text ?? ""));
    else if (raw?.type === "image") images += 1;
  }
  return { images, isError: false, text: clip(parts.join("\n")) };
}

function readStats(message: Record<string, unknown>): ResultStats {
  const modelUsage = (message.modelUsage ?? {}) as Record<
    string,
    {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadInputTokens?: number;
      contextWindow?: number;
      provider?: string;
    }
  >;
  const first = Object.values(modelUsage)[0];
  const usage = (message.usage ?? {}) as {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };

  return {
    cacheReadTokens: first?.cacheReadInputTokens ?? usage.cache_read_input_tokens ?? null,
    contextWindow: first?.contextWindow ?? null,
    costUsd: typeof message.total_cost_usd === "number" ? message.total_cost_usd : 0,
    durationMs: typeof message.duration_ms === "number" ? message.duration_ms : 0,
    errors: Array.isArray(message.errors) ? (message.errors as string[]) : [],
    inputTokens: first?.inputTokens ?? usage.input_tokens ?? null,
    isError: message.is_error === true,
    numTurns: typeof message.num_turns === "number" ? message.num_turns : 0,
    outputTokens: first?.outputTokens ?? usage.output_tokens ?? null,
    provider: first?.provider ?? null,
  };
}

export class FrameMapper {
  private open = new Map<number, OpenBlock>();
  private committedOutput = 0;
  private messageOutput = 0;

  map(message: SDKMessage): StreamFrame[] {
    const record = message as unknown as Record<string, never>;
    const raw = record as unknown as Record<string, unknown>;

    switch (message.type) {
      case "system":
        return this.mapSystem(raw);
      case "stream_event":
        return this.mapStreamEvent(raw);
      case "assistant":
        return this.mapAssistant(raw);
      case "user":
        return this.mapUser(raw);
      case "result":
        return [{ stats: readStats(raw), t: "result" }];
      default:
        return [];
    }
  }

  private mapSystem(raw: Record<string, unknown>): StreamFrame[] {
    if (raw.subtype === "init") {
      return [
        {
          cwd: String(raw.cwd ?? ""),
          model: String(raw.model ?? ""),
          permissionMode: String(raw.permissionMode ?? "default"),
          sessionId: String(raw.session_id ?? ""),
          t: "init",
          toolCount: Array.isArray(raw.tools) ? raw.tools.length : 0,
        },
      ];
    }
    if (raw.subtype === "status") {
      const status = raw.status;
      return [{ status: typeof status === "string" ? status : null, t: "status" }];
    }
    if (raw.subtype === "compact_boundary") {
      const meta = (raw.compact_metadata ?? {}) as { trigger?: string; pre_tokens?: number };
      return [
        {
          preTokens: meta.pre_tokens ?? 0,
          t: "compact",
          trigger: meta.trigger === "manual" ? "manual" : "auto",
        },
      ];
    }
    if (raw.subtype === "thinking_tokens") {
      const estimated = raw.estimated_tokens;
      return typeof estimated === "number" ? [{ estimated, t: "thinking_tokens" }] : [];
    }
    if (raw.subtype === "permission_denied") {
      const tool = typeof raw.tool_name === "string" ? raw.tool_name : "A tool";
      return [{ level: "warning", message: `${tool} was denied by your settings.`, t: "notice" }];
    }
    return [];
  }

  private mapStreamEvent(raw: Record<string, unknown>): StreamFrame[] {
    const event = raw.event as Record<string, unknown> | undefined;
    if (!event) return [];
    const sub = raw.parent_tool_use_id != null;
    const index = typeof event.index === "number" ? event.index : 0;

    if (event.type === "content_block_start") {
      const block = (event.content_block ?? {}) as Record<string, unknown>;
      if (block.type === "text") {
        this.open.set(index, { kind: "text" });
        return [{ blockKind: "text", index, sub, t: "block_start" }];
      }
      if (block.type === "thinking") {
        this.open.set(index, { kind: "thinking" });
        return [{ blockKind: "thinking", index, sub, t: "block_start" }];
      }
      if (
        block.type === "tool_use" ||
        block.type === "server_tool_use" ||
        block.type === "mcp_tool_use"
      ) {
        const id = String(block.id ?? `tool-${index}`);
        const name = String(block.name ?? "tool");
        this.open.set(index, { id, kind: "tool", name });
        return [{ blockKind: "tool", index, sub, t: "block_start", toolId: id, toolName: name }];
      }
      return [];
    }

    if (event.type === "content_block_delta") {
      const delta = (event.delta ?? {}) as Record<string, unknown>;
      if (delta.type === "text_delta") {
        return [{ index, kind: "text", sub, t: "delta", text: String(delta.text ?? "") }];
      }
      if (delta.type === "thinking_delta") {
        return [{ index, kind: "thinking", sub, t: "delta", text: String(delta.thinking ?? "") }];
      }
      if (delta.type === "input_json_delta") {
        return [
          { index, kind: "tool_input", sub, t: "delta", text: String(delta.partial_json ?? "") },
        ];
      }
      return [];
    }

    if (event.type === "content_block_stop") {
      if (!this.open.has(index)) return [];
      this.open.delete(index);
      return [{ index, sub, t: "block_stop" }];
    }

    if (event.type === "message_start" && !sub) {
      this.committedOutput += this.messageOutput;
      this.messageOutput = 0;
      return [];
    }

    if (event.type === "message_delta" && !sub) {
      const usage = (event.usage ?? {}) as { output_tokens?: number };
      if (typeof usage.output_tokens !== "number") return [];
      this.messageOutput = usage.output_tokens;
      return [{ outputTokens: this.committedOutput + this.messageOutput, t: "usage" }];
    }

    return [];
  }

  private mapAssistant(raw: Record<string, unknown>): StreamFrame[] {
    const message = (raw.message ?? {}) as { content?: unknown };
    if (!Array.isArray(message.content)) return [];
    const sub = raw.parent_tool_use_id != null;
    const frames: StreamFrame[] = [];
    for (const item of message.content as Array<Record<string, unknown>>) {
      if (
        item?.type === "tool_use" ||
        item?.type === "server_tool_use" ||
        item?.type === "mcp_tool_use"
      ) {
        frames.push({
          id: String(item.id ?? ""),
          input: item.input,
          name: String(item.name ?? "tool"),
          sub,
          t: "tool_input",
        });
      }
    }
    return frames;
  }

  private mapUser(raw: Record<string, unknown>): StreamFrame[] {
    const message = (raw.message ?? {}) as { content?: unknown };
    if (!Array.isArray(message.content)) return [];
    const sub = raw.parent_tool_use_id != null;
    const frames: StreamFrame[] = [];
    for (const item of message.content as Array<Record<string, unknown>>) {
      if (item?.type !== "tool_result" && item?.type !== "web_search_tool_result") continue;
      const result = flattenResult(item.content);
      result.isError = item.is_error === true;
      frames.push({ id: String(item.tool_use_id ?? ""), result, sub, t: "tool_result" });
    }
    return frames;
  }
}
