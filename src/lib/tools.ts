import { basename, truncateMiddle } from "@/lib/format";

type ToolInput = Record<string, unknown>;

function asRecord(input: unknown): ToolInput {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as ToolInput) : {};
}

function str(input: ToolInput, key: string): string | null {
  const value = input[key];
  return typeof value === "string" ? value : null;
}

export function toolSummary(name: string, rawInput: unknown): string {
  const input = asRecord(rawInput);

  switch (name) {
    case "Bash": {
      const command = str(input, "command");
      return command ? truncateMiddle(command.replace(/\s+/g, " ").trim(), 90) : "";
    }
    case "Read":
    case "Write":
    case "NotebookEdit": {
      const path = str(input, "file_path") ?? str(input, "notebook_path");
      return path ? truncateMiddle(path, 70) : "";
    }
    case "Edit": {
      const path = str(input, "file_path");
      const replaceAll = input.replace_all === true ? " (all)" : "";
      return path ? `${truncateMiddle(path, 60)}${replaceAll}` : "";
    }
    case "Glob":
      return str(input, "pattern") ?? "";
    case "Grep": {
      const pattern = str(input, "pattern") ?? "";
      const path = str(input, "path");
      return path ? `${pattern} in ${truncateMiddle(path, 40)}` : pattern;
    }
    case "WebFetch":
      return str(input, "url") ?? "";
    case "WebSearch":
      return str(input, "query") ?? "";
    case "Task":
    case "Agent": {
      const description = str(input, "description");
      const subagent = str(input, "subagent_type");
      return [description, subagent && `(${subagent})`].filter(Boolean).join(" ");
    }
    case "TodoWrite": {
      const todos = todosOf(input);
      return todos ? todoHeadline(todos) : "";
    }
    case "Skill":
      return str(input, "skill") ?? "";
    case "SendMessage":
      return str(input, "to") ?? "";
    default: {
      const firstString = Object.values(input).find(
        (value): value is string => typeof value === "string" && value.length > 0,
      );
      return firstString ? truncateMiddle(firstString.replace(/\s+/g, " ").trim(), 80) : "";
    }
  }
}

const MCP_NAME = /^mcp__(.+?)__(.+)$/;

function shortServer(server: string): string {
  const parts = server.replace(/^plugin_/, "").split("_");
  const useful = parts.filter((part) => part && part !== "mcp");
  return useful.length > 0 ? useful[useful.length - 1] : server;
}

export function toolDisplayName(name: string): string {
  const match = MCP_NAME.exec(name);
  if (!match) return name;
  return `${match[2]} (${shortServer(match[1])})`;
}

const OPENS_BY_DEFAULT = new Set(["ExitPlanMode", "exit_plan_mode", "TodoWrite"]);
const QUIET_ON_SUCCESS = new Set(["Edit", "NotebookEdit", "TodoWrite", "Write"]);

export function opensByDefault(name: string): boolean {
  return OPENS_BY_DEFAULT.has(name);
}

export function hidesResultOnSuccess(name: string): boolean {
  return QUIET_ON_SUCCESS.has(name);
}

const WRAPPER_TAG = /<\/?(?:tool_use_error|error|system-reminder)>/g;

export function errorHeadline(text: string): string {
  const clean = text.replace(WRAPPER_TAG, "");
  for (const line of clean.split("\n")) {
    const trimmed = line.trim();
    if (/[a-z]/i.test(trimmed)) return truncateMiddle(trimmed, 90);
  }
  return truncateMiddle(clean.trim().replace(/\s+/g, " "), 90);
}

export type Todo = { content: string; status: string };

export function todosOf(rawInput: unknown): Todo[] | null {
  const rows = asRecord(rawInput).todos;
  if (!Array.isArray(rows)) return null;
  const todos: Todo[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    const content = str(item, "content");
    const status = str(item, "status");
    if (content && status) todos.push({ content, status });
  }
  return todos.length > 0 ? todos : null;
}

export function todoHeadline(todos: Todo[]): string {
  const done = todos.filter((todo) => todo.status === "completed").length;
  const running = todos.find((todo) => todo.status === "in_progress");
  const label = running ? truncateMiddle(running.content, 60) : "Task list";
  return `${label} — ${done}/${todos.length}`;
}

const PATH_LANGUAGE_TOOLS = new Set(["NotebookRead", "Read", "Write"]);

export function toolLanguage(name: string, rawInput: unknown): string {
  const input = asRecord(rawInput);
  if (name === "Bash") return "bash";
  if (name === "Edit" || name === "NotebookEdit") return "diff";
  const path = PATH_LANGUAGE_TOOLS.has(name)
    ? (str(input, "file_path") ?? str(input, "notebook_path"))
    : null;
  if (!path) return "json";
  const extension = basename(path).split(".").pop()?.toLowerCase() ?? "";
  const byExtension: Record<string, string> = {
    bash: "bash",
    css: "css",
    go: "go",
    html: "html",
    java: "java",
    js: "javascript",
    json: "json",
    jsx: "jsx",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "bash",
    sql: "sql",
    ts: "typescript",
    tsx: "tsx",
    yaml: "yaml",
    yml: "yaml",
  };
  return byExtension[extension] ?? "text";
}

const READ_ONLY_TOOLS = new Set([
  "Glob",
  "Grep",
  "NotebookRead",
  "Read",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
]);

export function isMutatingTool(name: string): boolean {
  return !READ_ONLY_TOOLS.has(name);
}

export function primaryToolText(name: string, rawInput: unknown): string | null {
  const input = asRecord(rawInput);
  if (name === "Bash") return str(input, "command");
  if (name === "Write") return str(input, "content");
  return null;
}

export function editDiff(rawInput: unknown): { oldText: string; newText: string } | null {
  const input = asRecord(rawInput);
  const oldText = str(input, "old_string") ?? str(input, "old_source");
  const newText = str(input, "new_string") ?? str(input, "new_source");
  if (oldText === null || newText === null) return null;
  return { newText, oldText };
}
