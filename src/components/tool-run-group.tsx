"use client";

import { memo, useState } from "react";

import { toolDisplayName } from "@/lib/tools";
import type { Block } from "@/lib/types";

import { IconChevronRight, IconLayerGroup } from "./icons";
import styles from "./tool-run-group.module.css";
import { ToolCard } from "./tool-card";

type ToolBlock = Extract<Block, { kind: "tool" }>;

function preview(blocks: ToolBlock[]): string {
  const names = Array.from(new Set(blocks.map((block) => toolDisplayName(block.name))));
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
}

export const ToolRunGroup = memo(function ToolRunGroup({ blocks }: { blocks: ToolBlock[] }) {
  const failed = blocks.some((block) => block.result?.isError === true);
  const [open, setOpen] = useState(failed);

  return (
    <div className={`${styles.root} ${failed ? styles.failed : ""} ${open ? styles.open : ""}`}>
      <button
        aria-expanded={open}
        className={styles.head}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className={styles.glyph}>
          <IconLayerGroup />
        </span>
        <span className={styles.name}>
          {blocks.length} tool call{blocks.length === 1 ? "" : "s"}
          {failed ? " · failed" : ""}
        </span>
        <span className={styles.summary}>{preview(blocks)}</span>
        <span className={styles.chevron}>
          <IconChevronRight />
        </span>
      </button>

      {open && (
        <div className={styles.body}>
          {blocks.map((block) => (
            <ToolCard block={block} key={block.id} />
          ))}
        </div>
      )}
    </div>
  );
});
