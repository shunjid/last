import "server-only";

import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { EFFORT_LEVELS, MAX_THREAD_ITEMS } from "@/lib/types";
import type { Block, EffortLevel, ThreadItem, ThreadOp, ToolResult, Turn } from "@/lib/types";

import { PulseTracker } from "./pulse";

const MAX_RESULT_CHARS = 20_000;
const MAX_TEXT_CHARS = 200_000;
const MAX_RETAINED_ITEMS = 4 * MAX_THREAD_ITEMS;
const MAX_RUN_BLOCKS = 600;

const META_PREFIXES = [
  "<system-reminder>",
  "<local-command-caveat>",
  "<command-name>",
  "<command-message>",
  "<command-args>",
  "<local-command-stdout>",
  "<local-command-stderr>",
  "<ide_opened_file>",
  "<ide_selection>",
  "<ide_diagnostics>",
  "<user-memory-input>",
  "Caveat: The messages below",
];

const INTERRUPT_TEXTS = new Set([
  "[Request interrupted by user]",
  "[Request interrupted by user for tool use]",
]);

const SKIPPED_ENTRY_TYPES = new Set([
  "attachment",
  "file-history-snapshot",
  "summary",
  "x-mirror-error",
]);

type RawEntry = {
  uuid?: string;
  parentUuid?: string | null;
  type?: string;
  subtype?: string;
  timestamp?: string;
  effort?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  isCompactSummary?: boolean;
  promptSource?: string | null;
  toolUseResult?: unknown;
  message?: {
    role?: string;
    model?: string;
    content?: unknown;
    id?: string;
    stop_reason?: string | null;
    usage?: { output_tokens?: number };
  };
  compact_metadata?: { trigger?: string; pre_tokens?: number; post_tokens?: number };
};

export function projectsRoot() {
  return process.env.CLAUDE_CONFIG_DIR
    ? path.join(process.env.CLAUDE_CONFIG_DIR, "projects")
    : path.join(os.homedir(), ".claude", "projects");
}

export async function findTranscriptFile(sessionId: string): Promise<string | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(sessionId)) return null;
  const root = projectsRoot();
  let dirs: string[];
  try {
    dirs = await readdir(root);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const candidate = path.join(root, dir, `${sessionId}.jsonl`);
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function clip(value: string, max: number) {
  return value.length <= max
    ? value
    : `${value.slice(0, max)}\n… (${value.length - max} more characters)`;
}

function flattenResult(content: unknown): ToolResult {
  if (typeof content === "string") {
    return { images: 0, isError: false, text: clip(content, MAX_RESULT_CHARS) };
  }
  if (!Array.isArray(content)) return { images: 0, isError: false, text: "" };
  const parts: string[] = [];
  let images = 0;
  for (const raw of content as Array<Record<string, unknown>>) {
    if (raw?.type === "text") parts.push(String(raw.text ?? ""));
    else if (raw?.type === "image") images += 1;
  }
  return { images, isError: false, text: clip(parts.join("\n"), MAX_RESULT_CHARS) };
}

export type UserTextClass =
  | { kind: "content" }
  | { kind: "meta" }
  | { kind: "interrupt" }
  | { kind: "slash"; name: string; args?: string };

export function classifyUserText(text: string): UserTextClass {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "meta" };
  if (INTERRUPT_TEXTS.has(trimmed)) return { kind: "interrupt" };

  const command = /<command-name>\s*([^<]+?)\s*<\/command-name>/.exec(trimmed);
  if (command) {
    const args = /<command-args>\s*([\s\S]*?)\s*<\/command-args>/.exec(trimmed);
    return { args: args?.[1] || undefined, kind: "slash", name: command[1] };
  }
  if (META_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return { kind: "meta" };
  return { kind: "content" };
}

type ParsedContent = {
  blocks: Block[];
  toolResults: Array<{ id: string; result: ToolResult }>;
  hasRealText: boolean;
  classes: UserTextClass[];
};

function parseContent(content: unknown, role: "user" | "assistant"): ParsedContent {
  const blocks: Block[] = [];
  const toolResults: Array<{ id: string; result: ToolResult }> = [];
  const classes: UserTextClass[] = [];
  let hasRealText = false;

  const push = (text: string) => {
    if (role === "user") {
      const verdict = classifyUserText(text);
      classes.push(verdict);
      if (verdict.kind !== "content") return;
    }
    if (!text.trim()) return;
    hasRealText = true;
    blocks.push({ kind: "text", text: clip(text, MAX_TEXT_CHARS) });
  };

  if (typeof content === "string") {
    push(content);
    return { blocks, classes, hasRealText, toolResults };
  }
  if (!Array.isArray(content)) return { blocks, classes, hasRealText, toolResults };

  for (const raw of content as Array<Record<string, never>>) {
    const block = raw as unknown as Record<string, unknown>;
    switch (block.type) {
      case "text":
        push(String(block.text ?? ""));
        break;
      case "thinking": {
        const thinking = String(block.thinking ?? "");
        if (thinking.trim())
          blocks.push({ kind: "thinking", text: clip(thinking, MAX_TEXT_CHARS) });
        break;
      }
      case "redacted_thinking":
        blocks.push({ kind: "thinking", redacted: true, text: "" });
        break;
      case "tool_use":
      case "server_tool_use":
      case "mcp_tool_use":
        blocks.push({
          id: String(block.id ?? ""),
          input: block.input,
          kind: "tool",
          name: String(block.name ?? "tool"),
          result: null,
        });
        break;
      case "tool_result":
      case "web_search_tool_result":
      case "mcp_tool_result": {
        const result = flattenResult(block.content);
        result.isError = block.is_error === true;
        toolResults.push({ id: String(block.tool_use_id ?? ""), result });
        break;
      }
      case "image":
        blocks.push({
          kind: "image",
          mediaType: (block.source as { media_type?: string })?.media_type,
        });
        break;
      case "document":
        blocks.push({ kind: "document", title: block.title ? String(block.title) : undefined });
        break;
      default:
        break;
    }
  }

  return { blocks, classes, hasRealText, toolResults };
}

type ToolSite = { block: Block & { kind: "tool" }; blockIndex: number; turnId: string };

function copyBlock(block: Block): Block {
  return block.kind === "tool" ? { ...block } : block;
}

function copyItem(item: ThreadItem): ThreadItem {
  if (item.type === "divider") return item;
  return { turn: { ...item.turn, blocks: item.turn.blocks.map(copyBlock) }, type: "turn" };
}

export class ThreadBuilder {
  readonly items: ThreadItem[] = [];
  readonly pulse = new PulseTracker();
  ops: ThreadOp[] | null = null;
  totalTurns = 0;
  lastEffort: EffortLevel | null = null;
  lastModel: string | null = null;
  private run: Turn | null = null;
  private tools = new Map<string, ToolSite>();
  private counter = 0;
  private dropped = false;

  get truncated() {
    return this.dropped || this.items.length > MAX_THREAD_ITEMS;
  }

  markTruncated() {
    this.dropped = true;
  }

  private nextId(prefix: string, uuid?: string) {
    this.counter += 1;
    return `${prefix}-${uuid ?? this.counter}`;
  }

  private flush() {
    this.run = null;
  }

  private forget(item: ThreadItem) {
    if (item.type !== "turn") return;
    for (const block of item.turn.blocks) {
      if (block.kind === "tool") this.tools.delete(block.id);
    }
  }

  private record(item: ThreadItem) {
    this.items.push(item);
    if (item.type === "turn") this.totalTurns += 1;
    this.ops?.push({ item: copyItem(item), op: "add" });
    while (this.items.length > MAX_RETAINED_ITEMS) {
      const oldest = this.items.shift();
      if (!oldest) break;
      this.forget(oldest);
      this.dropped = true;
    }
  }

  attachResults(results: Array<{ id: string; result: ToolResult }>) {
    for (const entry of results) {
      const site = this.tools.get(entry.id);
      if (!site) continue;
      site.block.result = entry.result;
      this.ops?.push({
        block: site.blockIndex,
        id: site.turnId,
        op: "result",
        result: entry.result,
      });
    }
  }

  noteRun(model: string | undefined, effort: string | undefined) {
    if (!model || model === "<synthetic>") return;
    this.lastModel = model;
    this.lastEffort = EFFORT_LEVELS.includes(effort as EffortLevel)
      ? (effort as EffortLevel)
      : null;
  }

  addUserTurn(turn: Turn) {
    this.flush();
    this.record({ turn, type: "turn" });
  }

  addDivider(id: string, label: string, tone: "neutral" | "warning", detail?: string) {
    this.flush();
    this.record({ divider: { detail, id, label, tone }, type: "divider" });
  }

  addAssistantBlocks(
    blocks: Block[],
    uuid: string | undefined,
    model: string | undefined,
    timestamp: string | null,
  ) {
    if (blocks.length === 0) return;
    let carried = model;
    if (this.run && this.run.blocks.length >= MAX_RUN_BLOCKS) {
      carried = model ?? this.run.model;
      this.flush();
    }
    if (!this.run) {
      this.run = {
        blocks: [],
        id: this.nextId("run", uuid),
        model: carried,
        role: "assistant",
        timestamp,
      };
      this.record({ turn: this.run, type: "turn" });
    } else if (model && !this.run.model) {
      this.run.model = model;
      this.ops?.push({ id: this.run.id, model, op: "model" });
    }
    const at = this.run.blocks.length;
    for (const block of blocks) {
      const blockIndex = this.run.blocks.length;
      this.run.blocks.push(block);
      if (block.kind === "tool")
        this.tools.set(block.id, { block, blockIndex, turnId: this.run.id });
    }
    this.ops?.push({ at, blocks: blocks.map(copyBlock), id: this.run.id, op: "blocks" });
  }

  makeUserTurn(uuid: string | undefined, blocks: Block[], timestamp: string | null): Turn {
    return { blocks, id: this.nextId("user", uuid), role: "user", timestamp };
  }

  window() {
    const all = this.items;
    return {
      items: all.length > MAX_THREAD_ITEMS ? all.slice(all.length - MAX_THREAD_ITEMS) : all,
      totalTurns: this.totalTurns,
      truncated: this.truncated,
    };
  }
}

export function feedLine(builder: ThreadBuilder, line: string) {
  if (!line.trim()) return;
  let entry: RawEntry;
  try {
    entry = JSON.parse(line) as RawEntry;
  } catch {
    return;
  }

  if (entry.isMeta === true) return;

  const at = entry.timestamp ? Date.parse(entry.timestamp) : Number.NaN;
  if (!Number.isNaN(at) && entry.isSidechain !== true) builder.pulse.touch(at);

  if (entry.type && SKIPPED_ENTRY_TYPES.has(entry.type)) return;

  if (entry.type === "system" && entry.subtype === "compact_boundary") {
    const meta = entry.compact_metadata ?? {};
    const tokens = meta.pre_tokens
      ? `${Math.round(meta.pre_tokens / 1000)}k tokens compacted`
      : undefined;
    builder.addDivider(
      `compact-${entry.uuid ?? builder.items.length}`,
      meta.trigger === "manual" ? "Context compacted manually" : "Context compacted automatically",
      "neutral",
      tokens,
    );
    return;
  }

  if (entry.type === "system") {
    if (entry.subtype === "turn_duration") builder.pulse.end();
    return;
  }

  const role = entry.message?.role ?? entry.type;
  const timestamp = entry.timestamp ?? null;

  if (role === "assistant") {
    const parsed = parseContent(entry.message?.content, "assistant");
    builder.noteRun(entry.isSidechain === true ? undefined : entry.message?.model, entry.effort);
    builder.attachResults(parsed.toolResults);
    builder.addAssistantBlocks(parsed.blocks, entry.uuid, entry.message?.model, timestamp);
    if (entry.isSidechain !== true) {
      builder.pulse.assistant(
        entry.message?.id,
        entry.message?.usage?.output_tokens,
        entry.message?.stop_reason,
        entry.effort,
        parsed.blocks,
      );
    }
    return;
  }

  if (role !== "user") return;

  const parsed = parseContent(entry.message?.content, "user");
  if (parsed.toolResults.length > 0) builder.attachResults(parsed.toolResults);

  const interrupt = parsed.classes.some((item) => item.kind === "interrupt");
  if (interrupt) {
    builder.pulse.end();
    builder.addDivider(
      `interrupt-${entry.uuid ?? builder.items.length}`,
      "Interrupted by user",
      "warning",
    );
    return;
  }

  const slash = parsed.classes.find((item) => item.kind === "slash");
  if (slash && slash.kind === "slash") {
    const turn = builder.makeUserTurn(entry.uuid, parsed.blocks, timestamp);
    turn.meta = { args: slash.args, kind: "slash", name: slash.name };
    builder.addUserTurn(turn);
    return;
  }

  if (!parsed.hasRealText && parsed.blocks.length === 0) return;

  const turn = builder.makeUserTurn(entry.uuid, parsed.blocks, timestamp);
  if (entry.isCompactSummary === true) turn.meta = { kind: "compact-summary" };
  builder.addUserTurn(turn);

  const prompted =
    entry.promptSource != null &&
    entry.toolUseResult === undefined &&
    entry.isSidechain !== true &&
    entry.isCompactSummary !== true;
  if (prompted && !Number.isNaN(at)) builder.pulse.begin(at);
}
