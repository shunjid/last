"use client";

import { memo, type ReactNode } from "react";

import { useRevealOpen } from "@/client/find";
import { duration, tokens } from "@/lib/format";
import type { TaskNotice } from "@/lib/types";

import { CodeBlock } from "./code-block";
import { IconChevronRight, IconLayerGroup, IconSubAgent, IconTerminal, IconToolbox } from "./icons";
import { Markdown } from "./markdown";
import styles from "./task-card.module.css";

const KINDS: Record<TaskNotice["kind"], { glyph: ReactNode; name: string }> = {
  agent: { glyph: <IconSubAgent />, name: "Background agent" },
  command: { glyph: <IconTerminal />, name: "Background command" },
  task: { glyph: <IconToolbox />, name: "Background task" },
  workflow: { glyph: <IconLayerGroup />, name: "Workflow" },
};

const STATUS_LABELS: Record<TaskNotice["status"], string> = {
  completed: "Finished",
  failed: "Failed",
  stopped: "Stopped",
};

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function usageParts(task: TaskNotice) {
  const usage = task.usage;
  if (!usage) return [];
  const parts: string[] = [];
  if (usage.agents) parts.push(plural(usage.agents, "agent"));
  if (usage.toolUses) parts.push(plural(usage.toolUses, "tool use"));
  if (usage.durationMs) parts.push(duration(usage.durationMs));
  if (usage.tokens) parts.push(`${tokens(usage.tokens)} tokens`);
  return parts;
}

function prettyJson(text: string) {
  if (!/^[[{]/.test(text)) return null;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

export const TaskCard = memo(function TaskCard({ task }: { task: TaskNotice }) {
  const [open, setOpen] = useRevealOpen(false, task.id);
  const kind = KINDS[task.kind];
  const usage = usageParts(task);
  const json = open && task.result ? prettyJson(task.result) : null;

  return (
    <div
      className={[styles.root, styles[task.status], open ? styles.open : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        aria-expanded={open}
        className={styles.head}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className={styles.glyph}>{kind.glyph}</span>
        <span className={styles.name}>{kind.name}</span>
        <span className={styles.summary}>{task.title}</span>
        <span className={styles.status}>
          {STATUS_LABELS[task.status]}
          <span className={styles.dot} />
        </span>
        <span className={styles.chevron}>
          <IconChevronRight />
        </span>
      </button>

      {open && (
        <div className={styles.body} data-find={task.id}>
          <p className={styles.line}>{task.summary}</p>

          {usage.length > 0 && (
            <p className={styles.usage} data-find-skip>
              {usage.map((part) => (
                <span key={part}>{part}</span>
              ))}
            </p>
          )}

          {task.result &&
            (json ? (
              <CodeBlock code={json} label="result" language="json" />
            ) : (
              <div className={styles.report}>
                <Markdown text={task.result} />
              </div>
            ))}
        </div>
      )}
    </div>
  );
});
