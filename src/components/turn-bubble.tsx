"use client";

import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { memo } from "react";

import { useCopy } from "@/client/use-copy";
import type { Block, Turn } from "@/lib/types";

import { IconCheck, IconCopy, IconFileLines, IconImage } from "./icons";
import { Markdown } from "./markdown";
import styles from "./turn-bubble.module.css";
import { ThinkingCard } from "./thinking-card";
import { ToolCard } from "./tool-card";
import { ToolRunGroup } from "./tool-run-group";

type ToolBlock = Extract<Block, { kind: "tool" }>;

type Segment =
  { kind: "block"; block: Block; index: number } | { kind: "toolRun"; blocks: ToolBlock[] };

function segmentBlocks(blocks: Block[], liveIndex: number | null): Segment[] {
  const segments: Segment[] = [];
  let run: ToolBlock[] = [];
  let runStart = -1;

  const flush = () => {
    if (run.length === 0) return;
    const hasLive =
      liveIndex !== null && liveIndex >= runStart && liveIndex < runStart + run.length;
    if (run.length > 1 && !hasLive) {
      segments.push({ blocks: run, kind: "toolRun" });
    } else {
      run.forEach((block, offset) =>
        segments.push({ block, index: runStart + offset, kind: "block" }),
      );
    }
    run = [];
    runStart = -1;
  };

  blocks.forEach((block, index) => {
    if (block.kind === "tool") {
      if (run.length === 0) runStart = index;
      run.push(block);
      return;
    }
    flush();
    segments.push({ block, index, kind: "block" });
  });
  flush();

  return segments;
}

function BlockView({ block, live }: { block: Block; live: boolean }) {
  switch (block.kind) {
    case "text":
      return (
        <div>
          <Markdown text={block.text} />
          {live && <span className={styles.caret} />}
        </div>
      );
    case "thinking":
      if (!live && !block.redacted && !block.text.trim()) return null;
      return <ThinkingCard live={live} redacted={block.redacted} text={block.text} />;
    case "tool":
      return <ToolCard block={block} />;
    case "image":
      return (
        <span className={styles.attachment}>
          <IconImage />
          {block.mediaType ?? "image"}
        </span>
      );
    case "document":
      return (
        <span className={styles.attachment}>
          <IconFileLines />
          {block.title ?? "document"}
        </span>
      );
  }
}

function UserTurn({ turn }: { turn: Turn }) {
  const text = turn.blocks
    .map((block) => (block.kind === "text" ? block.text : ""))
    .join("")
    .trim();

  return (
    <div className={`${styles.row} ${styles.user}`}>
      <div className={`${styles.bubble} ${turn.pending ? styles.pending : ""}`}>
        {turn.meta?.kind === "slash" ? (
          <span className={styles.slash}>
            <span className={styles.slashName}>/{turn.meta.name}</span>
            {turn.meta.args && <span>{turn.meta.args}</span>}
          </span>
        ) : (
          text
        )}
      </div>

      {turn.blocks.some((block) => block.kind === "image" || block.kind === "document") && (
        <div className={styles.blocks}>
          {turn.blocks
            .filter((block) => block.kind === "image" || block.kind === "document")
            .map((block, index) => (
              <BlockView block={block} key={index} live={false} />
            ))}
        </div>
      )}
    </div>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const { copied, copy } = useCopy(text);

  return (
    <div className={styles.tools}>
      <Tooltip title={copied ? "Copied" : "Copy answer"}>
        <IconButton aria-label="Copy answer" onClick={copy}>
          {copied ? <IconCheck /> : <IconCopy />}
        </IconButton>
      </Tooltip>
    </div>
  );
}

export const TurnBubble = memo(function TurnBubble({
  live = false,
  turn,
}: {
  live?: boolean;
  turn: Turn;
}) {
  if (turn.role === "user") return <UserTurn turn={turn} />;

  const lastIndex = turn.blocks.length - 1;
  const answer = turn.blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();

  const segments = segmentBlocks(turn.blocks, live ? lastIndex : null);

  return (
    <div className={`${styles.row} ${styles.assistant}`}>
      <div className={styles.blocks}>
        {segments.map((segment) =>
          segment.kind === "toolRun" ? (
            <ToolRunGroup blocks={segment.blocks} key={`run-${segment.blocks[0].id}`} />
          ) : (
            <BlockView
              block={segment.block}
              key={segment.index}
              live={live && segment.index === lastIndex}
            />
          ),
        )}
      </div>

      {!live && answer && <CopyAnswer text={answer} />}
    </div>
  );
});
