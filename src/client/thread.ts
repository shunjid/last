import type {
  Block,
  EffortLevel,
  PermissionAsk,
  ResultStats,
  StreamFrame,
  ThreadItem,
  Turn,
} from "@/lib/types";

const MAX_SUB_CHARS = 6000;

let counter = 0;

export function localId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}-${Date.now().toString(36)}`;
}

export type RunPhase = "idle" | "connecting" | "running" | "done" | "error";

export type RunState = {
  asks: PermissionAsk[];
  current: Turn | null;
  effort: EffortLevel | null;
  error: string | null;
  indexMap: Map<number, number>;
  model: string | null;
  outputTokens: number;
  phase: RunPhase;
  produced: ThreadItem[];
  sessionId: string | null;
  startedAt: number;
  stats: ResultStats | null;
  status: string | null;
  streamId: string | null;
  taskPos: number | null;
  thinkingTokens: number;
  toolMap: Map<string, number>;
};

export function createRun(): RunState {
  return {
    asks: [],
    current: null,
    effort: null,
    error: null,
    indexMap: new Map(),
    model: null,
    outputTokens: 0,
    phase: "connecting",
    produced: [],
    sessionId: null,
    startedAt: Date.now(),
    stats: null,
    status: null,
    streamId: null,
    taskPos: null,
    thinkingTokens: 0,
    toolMap: new Map(),
  };
}

export function userTurn(prompt: string): Turn {
  const slash = /^\/([a-z0-9][\w-]*)(?:\s+([\s\S]*))?$/i.exec(prompt.trim());
  return {
    blocks: [{ kind: "text", text: prompt }],
    id: localId("user"),
    meta: slash
      ? { args: slash[2]?.trim() || undefined, kind: "slash", name: slash[1] }
      : undefined,
    role: "user",
    timestamp: new Date().toISOString(),
  };
}

function ensureTurn(run: RunState): Turn {
  if (run.current) return run.current;
  run.indexMap.clear();
  run.toolMap.clear();
  run.taskPos = null;
  run.current = {
    blocks: [],
    id: localId("live"),
    model: run.model ?? undefined,
    pending: true,
    role: "assistant",
    timestamp: new Date().toISOString(),
  };
  return run.current;
}

function replaceBlock(run: RunState, position: number, next: Block) {
  const turn = run.current;
  if (!turn) return;
  const blocks = turn.blocks.slice();
  blocks[position] = next;
  run.current = { ...turn, blocks };
}

function pushBlock(run: RunState, block: Block): number {
  const turn = ensureTurn(run);
  const blocks = [...turn.blocks, block];
  run.current = { ...turn, blocks };
  return blocks.length - 1;
}

export function commitCurrent(run: RunState) {
  if (!run.current) return;
  const blocks = run.current.blocks.filter(
    (block) => block.kind !== "text" || block.text.trim().length > 0,
  );
  if (blocks.length > 0) {
    run.produced.push({ turn: { ...run.current, blocks, pending: false }, type: "turn" });
  }
  run.current = null;
  run.indexMap.clear();
  run.toolMap.clear();
  run.taskPos = null;
}

function pushDivider(
  run: RunState,
  label: string,
  detail: string | undefined,
  tone: "neutral" | "warning",
) {
  commitCurrent(run);
  run.produced.push({ divider: { detail, id: localId("div"), label, tone }, type: "divider" });
}

function isTaskTool(name: string) {
  return name === "Task" || name === "Agent";
}

export function isThinking(run: RunState): boolean {
  const turn = run.current;
  if (!turn) return false;
  for (const position of run.indexMap.values()) {
    if (turn.blocks[position]?.kind === "thinking") return true;
  }
  return false;
}

export function applyFrame(run: RunState, frame: StreamFrame): void {
  switch (frame.t) {
    case "open": {
      run.streamId = frame.streamId;
      return;
    }

    case "init": {
      run.sessionId = frame.sessionId;
      run.model = frame.model || null;
      run.phase = "running";
      return;
    }

    case "block_start": {
      if (frame.sub) return;
      if (frame.blockKind === "tool") {
        const id = frame.toolId ?? localId("tool");
        const name = frame.toolName ?? "tool";
        const position = pushBlock(run, {
          id,
          input: undefined,
          kind: "tool",
          name,
          result: null,
          streaming: true,
        });
        run.toolMap.set(id, position);
        run.indexMap.set(frame.index, position);
        if (isTaskTool(name)) run.taskPos = position;
        return;
      }
      const block: Block =
        frame.blockKind === "thinking"
          ? { kind: "thinking", text: "" }
          : { kind: "text", text: "" };
      run.indexMap.set(frame.index, pushBlock(run, block));
      return;
    }

    case "delta": {
      if (frame.sub) {
        if (run.taskPos === null || frame.kind === "tool_input") return;
        const block = run.current?.blocks[run.taskPos];
        if (block?.kind !== "tool") return;
        const merged = `${block.subText ?? ""}${frame.text}`;
        replaceBlock(run, run.taskPos, {
          ...block,
          subText:
            merged.length > MAX_SUB_CHARS ? merged.slice(merged.length - MAX_SUB_CHARS) : merged,
        });
        return;
      }

      const position = run.indexMap.get(frame.index);
      if (position === undefined) return;
      const block = run.current?.blocks[position];
      if (!block) return;
      if (frame.kind === "text" && block.kind === "text") {
        replaceBlock(run, position, { ...block, text: block.text + frame.text });
      } else if (frame.kind === "thinking" && block.kind === "thinking") {
        replaceBlock(run, position, { ...block, text: block.text + frame.text });
      }
      return;
    }

    case "block_stop": {
      if (frame.sub) return;
      const position = run.indexMap.get(frame.index);
      if (position === undefined) return;
      const block = run.current?.blocks[position];
      if (block?.kind === "tool") replaceBlock(run, position, { ...block, streaming: false });
      run.indexMap.delete(frame.index);
      return;
    }

    case "tool_input": {
      if (frame.sub) return;
      const position = run.toolMap.get(frame.id);
      if (position === undefined) {
        const next = pushBlock(run, {
          id: frame.id,
          input: frame.input,
          kind: "tool",
          name: frame.name,
          result: null,
          streaming: false,
        });
        run.toolMap.set(frame.id, next);
        if (isTaskTool(frame.name)) run.taskPos = next;
        return;
      }
      const block = run.current?.blocks[position];
      if (block?.kind !== "tool") return;
      replaceBlock(run, position, { ...block, input: frame.input, streaming: false });
      return;
    }

    case "tool_result": {
      const position = run.toolMap.get(frame.id);
      if (position === undefined) return;
      const block = run.current?.blocks[position];
      if (block?.kind !== "tool") return;
      replaceBlock(run, position, { ...block, result: frame.result, streaming: false });
      if (run.taskPos === position) run.taskPos = null;
      return;
    }

    case "permission": {
      if (run.asks.some((ask) => ask.requestId === frame.ask.requestId)) return;
      run.asks = [...run.asks, frame.ask];
      return;
    }

    case "permission_resolved": {
      run.asks = run.asks.filter((ask) => ask.requestId !== frame.requestId);
      return;
    }

    case "status": {
      run.status = frame.status;
      return;
    }

    case "usage": {
      if (frame.outputTokens > run.outputTokens) run.outputTokens = frame.outputTokens;
      return;
    }

    case "thinking_tokens": {
      if (frame.estimated > run.thinkingTokens) run.thinkingTokens = frame.estimated;
      return;
    }

    case "compact": {
      pushDivider(
        run,
        "Context compacted",
        `${frame.trigger === "manual" ? "Manual" : "Automatic"}${frame.preTokens ? ` · ${frame.preTokens.toLocaleString()} tokens before` : ""}`,
        "neutral",
      );
      return;
    }

    case "notice": {
      pushDivider(run, frame.message, undefined, frame.level === "info" ? "neutral" : "warning");
      return;
    }

    case "result": {
      run.stats = frame.stats;
      run.status = null;
      if (frame.stats.isError && !run.error) {
        run.error = frame.stats.errors[0] ?? "The turn ended with an error.";
      }
      return;
    }

    case "error": {
      run.error = frame.message;
      run.phase = "error";
      return;
    }

    case "done": {
      commitCurrent(run);
      run.asks = [];
      run.status = null;
      if (run.phase !== "error") run.phase = "done";
      return;
    }
  }
}
