export const MAX_THREAD_ITEMS = 600;

export type PermissionMode = "default" | "acceptEdits" | "plan";

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORT_LEVELS: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

export const DEFAULT_MODEL = "default";

export type ModelChoice = {
  value: string;
  resolvedModel?: string;
  displayName: string;
  description: string;
  effortLevels: EffortLevel[];
};

export type SessionSummary = {
  sessionId: string;
  title: string;
  cwd: string | null;
  project: string;
  gitBranch: string | null;
  lastModified: number;
  createdAt: number | null;
  fileSize: number | null;
  running: boolean;
};

export type ProjectSummary = {
  cwd: string;
  label: string;
  sessionCount: number;
  lastModified: number;
};

export type FolderChoice = {
  cwd: string;
  label: string;
  sessionCount: number;
  lastModified: number | null;
};

export type ToolResult = {
  isError: boolean;
  text: string;
  images: number;
};

export type Block =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string; redacted?: boolean }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: unknown;
      streaming?: boolean;
      subText?: string;
      result: ToolResult | null;
    }
  | { kind: "image"; mediaType?: string }
  | { kind: "document"; title?: string };

export type TurnMeta = { kind: "slash"; name: string; args?: string } | { kind: "compact-summary" };

export type Turn = {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
  model?: string;
  timestamp: string | null;
  meta?: TurnMeta;
  pending?: boolean;
};

export type Divider = {
  id: string;
  label: string;
  detail?: string;
  tone: "neutral" | "warning";
};

export type ThreadItem = { type: "turn"; turn: Turn } | { type: "divider"; divider: Divider };

export type SessionPulse = {
  effort: EffortLevel | null;
  lastRecordAt: number;
  outputTokens: number;
  startedAt: number;
  thinking: boolean;
};

export type SessionDetail = {
  sessionId: string;
  title: string;
  cwd: string | null;
  project: string;
  gitBranch: string | null;
  lastModified: number;
  items: ThreadItem[];
  truncated: boolean;
  totalTurns: number;
  revision: number;
  effort: EffortLevel | null;
  model: string | null;
  pulse: SessionPulse | null;
};

export type ThreadOp =
  | { op: "add"; item: ThreadItem }
  | { op: "blocks"; id: string; at: number; blocks: Block[] }
  | { op: "model"; id: string; model: string }
  | { op: "result"; id: string; block: number; result: ToolResult };

export type LiveFrame =
  | { t: "ready"; revision: number }
  | {
      t: "ops";
      revision: number;
      ops: ThreadOp[];
      totalTurns: number;
      truncated: boolean;
      effort: EffortLevel | null;
      model: string | null;
    }
  | { t: "resync"; reason: string }
  | { t: "pulse"; sessionId: string; pulse: SessionPulse | null }
  | { t: "sessions"; sessions: SessionSummary[]; projects: ProjectSummary[] }
  | { t: "ping" };

export type PermissionAsk = {
  requestId: string;
  tool: string;
  summary: string;
  detail: string | null;
  language: string;
  mutating: boolean;
  allowAlways: boolean;
  truncatedChars: number;
};

export type ResultStats = {
  isError: boolean;
  errors: string[];
  costUsd: number;
  durationMs: number;
  numTurns: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  contextWindow: number | null;
  provider: string | null;
};

export type StreamFrame =
  | { t: "open"; streamId: string }
  | {
      t: "init";
      sessionId: string;
      model: string;
      cwd: string;
      toolCount: number;
      permissionMode: string;
    }
  | {
      t: "block_start";
      index: number;
      blockKind: "text" | "thinking" | "tool";
      toolId?: string;
      toolName?: string;
      sub: boolean;
    }
  | {
      t: "delta";
      index: number;
      kind: "text" | "thinking" | "tool_input";
      text: string;
      sub: boolean;
    }
  | { t: "block_stop"; index: number; sub: boolean }
  | { t: "tool_input"; id: string; name: string; input: unknown; sub: boolean }
  | { t: "tool_result"; id: string; result: ToolResult; sub: boolean }
  | { t: "permission"; ask: PermissionAsk }
  | { t: "permission_resolved"; requestId: string; behavior: "allow" | "deny" }
  | { t: "status"; status: string | null }
  | { t: "usage"; outputTokens: number }
  | { t: "thinking_tokens"; estimated: number }
  | { t: "compact"; trigger: "manual" | "auto"; preTokens: number }
  | { t: "result"; stats: ResultStats }
  | { t: "notice"; level: "info" | "warning" | "danger"; message: string }
  | { t: "error"; message: string }
  | { t: "done" };

export type ChatRequestBody = {
  prompt: string;
  sessionId?: string;
  cwd?: string;
  permissionMode: PermissionMode;
  model?: string;
  effort?: EffortLevel;
};

export type PermissionDecisionBody = {
  streamId: string;
  requestId: string;
  decision: "allow" | "deny";
  scope: "once" | "session";
};
