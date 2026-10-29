"use client";

import { answerCards } from "@/lib/cards";
import type { ThreadItem, Turn } from "@/lib/types";

import { userText } from "./find";

export type Reply = {
  cards: string[] | null;
  id: string;
  live: boolean;
  prompt: string;
  text: string;
  tools: number;
  turnIds: string[];
};

export type CardsEntry = { kind: "item"; item: ThreadItem } | { kind: "reply"; reply: Reply };

type Draft = { id: string; prompt: string; turns: Turn[] };

const MAX_CACHED = 400;
const cardCache = new Map<string, string[] | null>();

function cardsOf(text: string): string[] | null {
  const hit = cardCache.get(text);
  if (hit !== undefined) return hit;
  if (cardCache.size >= MAX_CACHED) cardCache.clear();
  const cards = answerCards(text);
  cardCache.set(text, cards);
  return cards;
}

function finish(draft: Draft, live: boolean): Reply {
  let text = "";
  let tools = 0;
  for (const turn of draft.turns) {
    for (const block of turn.blocks) {
      if (block.kind === "tool") tools += 1;
      else if (block.kind === "text" && block.text.trim()) text = block.text.trim();
    }
  }
  return {
    cards: live || !text ? null : cardsOf(text),
    id: draft.id,
    live,
    prompt: draft.prompt,
    text,
    tools,
    turnIds: draft.turns.map((turn) => turn.id),
  };
}

export function collectReplies(
  items: ThreadItem[],
  live: Turn | null,
  working: boolean,
): CardsEntry[] {
  const order: Array<{ kind: "item"; item: ThreadItem } | { kind: "draft"; draft: Draft }> = [];
  let current: Draft | null = null;
  let prompt = "";
  let lastUser: string | null = null;

  const open = (draft: Draft | null, id: string): Draft => {
    if (draft) return draft;
    const next: Draft = { id, prompt, turns: [] };
    order.push({ draft: next, kind: "draft" });
    return next;
  };

  for (const item of items) {
    if (item.type === "turn" && item.turn.role === "assistant") {
      current = open(current, item.turn.id);
      current.turns.push(item.turn);
      continue;
    }
    order.push({ item, kind: "item" });
    if (item.type === "turn") {
      current = null;
      prompt = userText(item.turn);
      lastUser = item.turn.id;
    }
  }
  if (live) {
    current = open(current, live.id);
    current.turns.push(live);
  }
  if (working) current = open(current, `live-${lastUser ?? "start"}`);

  const tail = working ? current : null;
  return order.map((entry) =>
    entry.kind === "item"
      ? entry
      : { kind: "reply", reply: finish(entry.draft, entry.draft === tail) },
  );
}

export function replyPreview(text: string): string {
  const line =
    text
      .split("\n")
      .map((part) => part.trim())
      .find((part) => part && !/^(```|~~~|\||[-*_]{3,}$)/.test(part)) ?? "";
  const plain = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
  return /^(.+?[.!?])(?:\s|$)/.exec(plain)?.[1] ?? plain;
}
