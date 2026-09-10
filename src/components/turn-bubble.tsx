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

  return (
    <div className={`${styles.row} ${styles.assistant}`}>
      <div className={styles.blocks}>
        {turn.blocks.map((block, index) => (
          <BlockView block={block} key={index} live={live && index === lastIndex} />
        ))}
      </div>

      {!live && answer && <CopyAnswer text={answer} />}
    </div>
  );
});
