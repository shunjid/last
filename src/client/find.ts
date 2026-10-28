"use client";

import { createContext, useContext, useState } from "react";

import { hidesResultOnSuccess, pickOf, questionsOf, todosOf, toolSections } from "@/lib/tools";
import type { Block, TaskNotice, ThreadItem, Turn } from "@/lib/types";

export type FindHit = { key: string; nth: number };

type Source = { key: string; text: string };

const ALL = "last-find";
const CURRENT = "last-find-current";
const REVEAL_MARGIN = 64;

const sourceCache = new WeakMap<Turn, Source[]>();

export const FindTarget = createContext<FindHit | null>(null);

export function userText(turn: Turn): string {
  if (turn.meta?.kind === "slash") return `/${turn.meta.name} ${turn.meta.args ?? ""}`;
  return turn.blocks
    .map((block) => (block.kind === "text" ? block.text : ""))
    .join("")
    .trim();
}

function toolText(block: Extract<Block, { kind: "tool" }>): string {
  const todos = block.name === "TodoWrite" ? todosOf(block.input) : null;
  const questions = block.name === "AskUserQuestion" ? questionsOf(block.input) : [];
  const result = block.result;
  const parts = todos
    ? todos.map((todo) => todo.content)
    : questions.length > 0
      ? questions.flatMap((question) => [
          question.header,
          question.question,
          ...question.options.flatMap((option) => [option.label, option.description]),
          pickOf(question, result?.answers?.[question.question]).custom ?? "",
        ])
      : toolSections(block.name, block.input).map((section) => section.code);
  if (block.subText) parts.push(block.subText);
  if (result?.text && (result.isError || !hidesResultOnSuccess(block.name, result))) {
    parts.push(result.text);
  }
  return parts.join("\n");
}

function blockText(block: Block): string | null {
  if (block.kind === "text") return block.text;
  if (block.kind === "thinking") return block.redacted ? null : block.text;
  if (block.kind === "tool") return toolText(block);
  return null;
}

function readSources(turn: Turn): Source[] {
  if (turn.role === "user") return [{ key: turn.id, text: userText(turn).toLowerCase() }];
  return turn.blocks.flatMap((block, index) => {
    const text = blockText(block);
    if (!text) return [];
    return [
      { key: block.kind === "tool" ? block.id : `${turn.id}:${index}`, text: text.toLowerCase() },
    ];
  });
}

function taskSources(task: TaskNotice): Source[] {
  const text = [task.summary, task.result ?? ""].join("\n").toLowerCase();
  return [{ key: task.id, text }];
}

function sourcesOf(turn: Turn): Source[] {
  const cached = sourceCache.get(turn);
  if (cached) return cached;
  const sources = readSources(turn);
  sourceCache.set(turn, sources);
  return sources;
}

export function findHits(items: ThreadItem[], live: Turn | null, query: string): FindHit[] {
  if (!query.trim()) return [];
  const needle = query.toLowerCase();
  const hits: FindHit[] = [];

  const collect = (sources: Source[]) => {
    for (const source of sources) {
      let nth = 0;
      let at = source.text.indexOf(needle);
      while (at !== -1) {
        hits.push({ key: source.key, nth });
        nth += 1;
        at = source.text.indexOf(needle, at + needle.length);
      }
    }
  };

  for (const item of items) {
    if (item.type === "turn") collect(sourcesOf(item.turn));
    else if (item.type === "task") collect(taskSources(item.task));
  }
  if (live) collect(readSources(live));
  return hits;
}

export function useRevealOpen(initial: boolean, ...keys: string[]) {
  const target = useContext(FindTarget);
  const hit = target && keys.includes(target.key) ? target : null;
  const [open, setOpen] = useState(initial || hit !== null);
  const [seen, setSeen] = useState(hit);

  if (hit !== seen) {
    setSeen(hit);
    if (hit) setOpen(true);
  }

  return [open, setOpen] as const;
}

function rangesIn(container: Element, needle: string): Range[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("button, [data-find-skip]")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });

  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push(node);
    starts.push(text.length);
    text += node.data;
  }

  const haystack = text.toLowerCase();
  const ranges: Range[] = [];
  let index = 0;
  let at = haystack.indexOf(needle);

  while (at !== -1) {
    const end = at + needle.length;
    while (index < nodes.length - 1 && starts[index + 1] <= at) index += 1;
    let last = index;
    while (last < nodes.length - 1 && starts[last + 1] < end) last += 1;

    const range = document.createRange();
    range.setStart(nodes[index], at - starts[index]);
    range.setEnd(nodes[last], end - starts[last]);
    ranges.push(range);
    at = haystack.indexOf(needle, end);
  }

  return ranges;
}

function canHighlight() {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";
}

export function clearFindHighlights() {
  if (!canHighlight()) return;
  CSS.highlights.delete(ALL);
  CSS.highlights.delete(CURRENT);
}

export function paintFind(root: Element, query: string, target: FindHit | null): Range | null {
  const needle = query.trim() ? query.toLowerCase() : "";
  const all: Range[] = [];
  let current: Range | null = null;

  if (needle) {
    for (const container of root.querySelectorAll<HTMLElement>("[data-find]")) {
      const ranges = rangesIn(container, needle);
      all.push(...ranges);
      if (target && container.dataset.find === target.key && ranges.length > 0) {
        current = ranges[Math.min(target.nth, ranges.length - 1)];
      }
    }
  }

  if (canHighlight()) {
    const focus = new Highlight(...(current ? [current] : []));
    focus.priority = 1;
    CSS.highlights.set(ALL, new Highlight(...all));
    CSS.highlights.set(CURRENT, focus);
  }

  return current;
}

export function revealFind(
  viewport: HTMLElement,
  root: Element,
  target: FindHit,
  range: Range | null,
) {
  const anchor =
    range?.startContainer.parentElement ??
    [...root.querySelectorAll<HTMLElement>("[data-find]")].find(
      (container) => container.dataset.find === target.key,
    );
  if (!anchor) return;

  const measure = () => (range ?? anchor).getBoundingClientRect();

  for (let node = anchor.parentElement; node && node !== viewport; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1) {
      const box = measure();
      const frame = node.getBoundingClientRect();
      node.scrollTop += box.top + box.height / 2 - (frame.top + frame.height / 2);
    }
    if (node.scrollWidth > node.clientWidth + 1) {
      const box = measure();
      const frame = node.getBoundingClientRect();
      if (box.left < frame.left || box.right > frame.right) {
        node.scrollLeft += box.left + box.width / 2 - (frame.left + frame.width / 2);
      }
    }
  }

  const box = measure();
  const frame = viewport.getBoundingClientRect();
  if (box.top >= frame.top + REVEAL_MARGIN && box.bottom <= frame.bottom - REVEAL_MARGIN) return;
  viewport.scrollTop += box.top + box.height / 2 - (frame.top + frame.height / 2);
}
