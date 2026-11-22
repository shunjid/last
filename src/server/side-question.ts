import "server-only";

import type { Query } from "@anthropic-ai/claude-agent-sdk";

import type { SideQuestionTurn } from "@/lib/types";

type SideQuestionRunner = Query & {
  askSideQuestion?: (
    question: string,
    options?: { history?: SideQuestionTurn[]; signal?: AbortSignal },
  ) => Promise<{ response: string } | null>;
};

export async function askSideQuestion(
  runner: Query,
  question: string,
  history: SideQuestionTurn[],
  signal: AbortSignal,
): Promise<string | null> {
  const ask = (runner as SideQuestionRunner).askSideQuestion;
  if (typeof ask !== "function") {
    throw new Error("This version of the Agent SDK can't answer side questions.");
  }
  const answer = await ask.call(runner, question, { history, signal });
  return answer?.response ?? null;
}
