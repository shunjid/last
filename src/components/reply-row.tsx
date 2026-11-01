"use client";

import CircularProgress from "@mui/material/CircularProgress";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { type Reply, replyPreview, taskCards } from "@/client/replies";
import type { TaskNotice } from "@/lib/types";

import { IconCards, IconChevronRight, IconLayerGroup, IconNotes } from "./icons";
import { Markdown } from "./markdown";
import styles from "./reply-row.module.css";
import { TASK_KINDS, TASK_STATUS, usageParts } from "./task-card";

function toolCount(tools: number): string {
  return `${tools} tool call${tools === 1 ? "" : "s"}`;
}

function ReplyRow({ onOpen, reply }: { onOpen: (id: string) => void; reply: Reply }) {
  const count = reply.cards?.length ?? 1;
  const stacked = count > 1;

  return (
    <div className={stacked ? styles.stack : undefined}>
      <button
        className={`${styles.row} ${stacked ? styles.stacked : ""}`}
        onClick={() => onOpen(reply.id)}
        type="button"
      >
        <span className={styles.glyph}>{stacked ? <IconCards /> : <IconNotes />}</span>
        <span className={styles.text}>
          <span className={styles.title}>{replyPreview(reply.text)}</span>
          <span className={styles.meta}>
            <span className={styles.count}>
              {count} card{count === 1 ? "" : "s"}
            </span>
            {reply.tools > 0 && ` · ${toolCount(reply.tools)}`}
          </span>
        </span>
        <IconChevronRight className={styles.chevron} />
      </button>
    </div>
  );
}

function ShortReply({
  available,
  onOpen,
  reply,
}: {
  available: number;
  onOpen: (id: string) => void;
  reply: Reply;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || available <= 0) return;
    const observer = new ResizeObserver(() => {
      if (node.offsetHeight <= available) return;
      observer.disconnect();
      setTall(true);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [available]);

  if (tall) return <ReplyRow onOpen={onOpen} reply={reply} />;
  return (
    <div className={styles.short} ref={ref}>
      <Markdown text={reply.text} />
    </div>
  );
}

function sameReply(a: Reply, b: Reply): boolean {
  return (
    a.id === b.id &&
    a.text === b.text &&
    a.tools === b.tools &&
    a.live === b.live &&
    a.cards === b.cards
  );
}

export const ReplyEntry = memo(
  function ReplyEntry({
    available,
    onOpen,
    reply,
  }: {
    available: number;
    onOpen: (id: string) => void;
    reply: Reply;
  }) {
    if (reply.live) {
      return (
        <div className={`${styles.row} ${styles.working}`}>
          <span className={styles.glyph}>
            <CircularProgress size={16} />
          </span>
          <span className={styles.text}>
            <span className={`${styles.title} ${styles.shimmer}`}>Claude is working…</span>
            <span className={styles.meta}>
              {reply.tools > 0 ? `${toolCount(reply.tools)} so far · ` : ""}opens when it finishes
            </span>
          </span>
        </div>
      );
    }

    if (!reply.text) {
      return (
        <div className={styles.empty}>
          <IconLayerGroup />
          {reply.tools > 0 ? `${toolCount(reply.tools)}, no reply text` : "No reply text"}
        </div>
      );
    }

    if (reply.cards) return <ReplyRow onOpen={onOpen} reply={reply} />;
    return <ShortReply available={available} key={available} onOpen={onOpen} reply={reply} />;
  },
  (a, b) => a.available === b.available && a.onOpen === b.onOpen && sameReply(a.reply, b.reply),
);

export const TaskRow = memo(function TaskRow({
  onOpen,
  task,
}: {
  onOpen: (id: string) => void;
  task: TaskNotice;
}) {
  const count = useMemo(() => taskCards(task).length, [task]);
  const stacked = count > 1;
  const usage = usageParts(task);

  return (
    <div className={stacked ? styles.stack : undefined}>
      <button
        className={[styles.row, styles.task, styles[task.status], stacked ? styles.stacked : ""]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onOpen(task.id)}
        type="button"
      >
        <span className={styles.glyph}>{TASK_KINDS[task.kind].glyph}</span>
        <span className={styles.text}>
          <span className={styles.title}>{task.title || TASK_KINDS[task.kind].name}</span>
          <span className={styles.meta}>
            <span className={styles.status}>{TASK_STATUS[task.status]}</span>
            {usage.map((part) => ` · ${part}`).join("")}
          </span>
        </span>
        <IconChevronRight className={styles.chevron} />
      </button>
    </div>
  );
});
