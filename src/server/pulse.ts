import "server-only";

import { EFFORT_LEVELS } from "@/lib/types";
import type { Block, EffortLevel, SessionPulse } from "@/lib/types";

const SETTLED = new Set([
  "end_turn",
  "max_tokens",
  "model_context_window_exceeded",
  "refusal",
  "stop_sequence",
]);

export const PULSE_STALE_MS = 15 * 60 * 1_000;

export class PulseTracker {
  private startedAt = 0;
  private lastRecordAt = 0;
  private effort: EffortLevel | null = null;
  private thinking = false;
  private tokens = new Map<string, number>();

  touch(at: number) {
    if (at > this.lastRecordAt) this.lastRecordAt = at;
  }

  begin(at: number) {
    this.startedAt = at;
    this.effort = null;
    this.thinking = false;
    this.tokens.clear();
  }

  end() {
    this.startedAt = 0;
    this.thinking = false;
  }

  assistant(
    messageId: string | undefined,
    outputTokens: number | undefined,
    stopReason: string | null | undefined,
    effort: string | undefined,
    blocks: Block[],
  ) {
    if (this.startedAt === 0) return;
    if (messageId && typeof outputTokens === "number") {
      const seen = this.tokens.get(messageId) ?? 0;
      this.tokens.set(messageId, Math.max(seen, outputTokens));
    }
    if (EFFORT_LEVELS.includes(effort as EffortLevel)) this.effort = effort as EffortLevel;
    const tail = blocks[blocks.length - 1];
    if (tail) this.thinking = tail.kind === "thinking";
    if (typeof stopReason === "string" && SETTLED.has(stopReason)) this.end();
  }

  snapshot(now: number): SessionPulse | null {
    if (this.startedAt === 0) return null;
    if (now - this.lastRecordAt > PULSE_STALE_MS) return null;
    let total = 0;
    for (const value of this.tokens.values()) total += value;
    return {
      effort: this.effort,
      lastRecordAt: this.lastRecordAt,
      outputTokens: total,
      startedAt: this.startedAt,
      thinking: this.thinking,
    };
  }
}
