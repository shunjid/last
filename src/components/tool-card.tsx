"use client";

import CircularProgress from "@mui/material/CircularProgress";
import { memo, type ReactNode } from "react";

import { useRevealOpen } from "@/client/find";
import {
  errorHeadline,
  hidesResultOnSuccess,
  opensByDefault,
  todosOf,
  toolDisplayName,
  toolSections,
  toolSummary,
} from "@/lib/tools";
import type { Block } from "@/lib/types";

import { CodeBlock } from "./code-block";
import {
  IconChevronRight,
  IconCode,
  IconFileLines,
  IconFolderOpen,
  IconGlobe,
  IconListCheck,
  IconPen,
  IconPuzzlePiece,
  IconSearch,
  IconSubAgent,
  IconTerminal,
  IconToolbox,
} from "./icons";
import { TodoList } from "./todo-list";
import styles from "./tool-card.module.css";

type ToolBlock = Extract<Block, { kind: "tool" }>;

const ICONS: Record<string, ReactNode> = {
  Agent: <IconSubAgent />,
  Bash: <IconTerminal />,
  BashOutput: <IconTerminal />,
  Edit: <IconPen />,
  Glob: <IconFolderOpen />,
  Grep: <IconSearch />,
  NotebookEdit: <IconPen />,
  Read: <IconFileLines />,
  Skill: <IconPuzzlePiece />,
  Task: <IconSubAgent />,
  TodoWrite: <IconListCheck />,
  WebFetch: <IconGlobe />,
  WebSearch: <IconGlobe />,
  Write: <IconCode />,
};

function glyphFor(name: string) {
  if (ICONS[name]) return ICONS[name];
  if (name.startsWith("mcp__")) return <IconPuzzlePiece />;
  return <IconToolbox />;
}

export const ToolCard = memo(function ToolCard({ block }: { block: ToolBlock }) {
  const running = !block.streaming && block.result === null;
  const failed = block.result?.isError === true;
  const [open, setOpen] = useRevealOpen(opensByDefault(block.name), block.id);

  const todos = block.name === "TodoWrite" ? todosOf(block.input) : null;
  const summary = toolSummary(block.name, block.input);
  const headline = failed && block.result?.text ? errorHeadline(block.result.text) : null;
  const sections = open && !todos ? toolSections(block.name, block.input) : [];
  const quiet = !failed && hidesResultOnSuccess(block.name);

  return (
    <div
      className={[
        styles.root,
        running ? styles.running : "",
        failed ? styles.failed : "",
        open ? styles.open : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        aria-expanded={open}
        className={styles.head}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className={styles.glyph}>{glyphFor(block.name)}</span>
        <span className={styles.name}>{toolDisplayName(block.name)}</span>
        <span className={headline ? styles.errorLine : styles.summary}>{headline ?? summary}</span>
        <span className={styles.status}>
          {block.streaming || running ? (
            <CircularProgress />
          ) : (
            <span className={`${styles.dot} ${failed ? styles.dotError : ""}`} />
          )}
        </span>
        <span className={styles.chevron}>
          <IconChevronRight />
        </span>
      </button>

      {open && (
        <div className={styles.body} data-find={block.id}>
          {todos && <TodoList todos={todos} />}

          {sections.map((section) => (
            <CodeBlock
              code={section.code}
              key={section.label}
              label={section.label}
              language={section.language}
              numbered={section.numbered}
            />
          ))}

          {block.subText && (
            <div className={styles.section}>
              <span className={styles.sectionLabel} data-find-skip>
                subagent
              </span>
              <div className={styles.sub}>{block.subText}</div>
            </div>
          )}

          {block.result ? (
            quiet ? null : block.result.text ? (
              <CodeBlock
                code={block.result.text}
                label={block.result.isError ? "error" : "result"}
                language="text"
                tone={block.result.isError ? "error" : "default"}
              />
            ) : (
              <p className={styles.empty} data-find-skip>
                {block.result.images > 0
                  ? `Returned ${block.result.images} image${block.result.images > 1 ? "s" : ""}.`
                  : "No output."}
              </p>
            )
          ) : (
            <p className={styles.empty} data-find-skip>
              Still running…
            </p>
          )}
        </div>
      )}
    </div>
  );
});
