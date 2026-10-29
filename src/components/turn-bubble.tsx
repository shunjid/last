"use client";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { memo, useContext, useMemo } from "react";

import { userText } from "@/client/find";
import { OpenCards } from "@/client/open-cards";
import { useCopy } from "@/client/use-copy";
import { PHONE_QUERY, useMediaQuery } from "@/client/use-media-query";
import { answerCards } from "@/lib/cards";
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
    if (block.kind === "tool" && block.name !== "AskUserQuestion") {
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

function BlockView({ block, findKey, live }: { block: Block; findKey: string; live: boolean }) {
  switch (block.kind) {
    case "text":
      return (
        <div data-find={findKey}>
          <Markdown text={block.text} />
          {live && <span className={styles.caret} />}
        </div>
      );
    case "thinking":
      if (!live && !block.redacted && !block.text.trim()) return null;
      return (
        <ThinkingCard findKey={findKey} live={live} redacted={block.redacted} text={block.text} />
      );
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
  const text = userText(turn);

  return (
    <div className={`${styles.row} ${styles.user}`} data-anchor={turn.id}>
      {text && (
        <div
          className={`${styles.bubble} ${turn.pending ? styles.pending : ""}`}
          data-find={turn.id}
        >
          {turn.meta?.kind === "slash" ? (
            <span className={styles.slash}>
              <span className={styles.slashName}>/{turn.meta.name}</span>
              {turn.meta.args && <span>{turn.meta.args}</span>}
            </span>
          ) : (
            text
          )}
        </div>
      )}

      {turn.blocks.some((block) => block.kind === "image" || block.kind === "document") && (
        <div className={styles.blocks}>
          {turn.blocks
            .filter((block) => block.kind === "image" || block.kind === "document")
            .map((block, index) => (
              <BlockView block={block} findKey={`${turn.id}:${index}`} key={index} live={false} />
            ))}
        </div>
      )}
    </div>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const { copied, copy } = useCopy(text);

  return (
    <Tooltip title={copied ? "Copied" : "Copy answer"}>
      <IconButton aria-label="Copy answer" className={styles.copy} onClick={copy}>
        {copied ? <IconCheck /> : <IconCopy />}
      </IconButton>
    </Tooltip>
  );
}

function AssistantTurn({ live, turn }: { live: boolean; turn: Turn }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const openCards = useContext(OpenCards);

  const lastIndex = turn.blocks.length - 1;
  const answer = turn.blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
  const finalText = turn.blocks.findLast((block) => block.kind === "text")?.text ?? "";
  const cards = useMemo(
    () => (phone && !live && openCards ? answerCards(finalText) : null),
    [finalText, live, openCards, phone],
  );

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
              findKey={`${turn.id}:${segment.index}`}
              key={segment.index}
              live={live && segment.index === lastIndex}
            />
          ),
        )}
      </div>

      {!live && answer && (
        <div className={styles.tools}>
          <CopyAnswer text={answer} />
          {cards && (
            <Button
              className={styles.asCards}
              color="inherit"
              onClick={() => openCards?.(turn.id)}
              variant="text"
            >
              Show as cards
            </Button>
          )}
        </div>
      )}
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
  return <AssistantTurn live={live} turn={turn} />;
});
