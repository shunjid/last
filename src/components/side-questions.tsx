"use client";

import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useEffect, useRef, useState } from "react";

import type { SideQuestion } from "@/client/side-questions";
import { useCopy } from "@/client/use-copy";

import { IconArrowUp, IconXmark } from "./icons";
import { Markdown } from "./markdown";
import styles from "./side-questions.module.css";

function CopyAnswer({ text }: { text: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <button className={styles.action} onClick={copy} type="button">
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function SideQuestions({
  items,
  onAsk,
  onClose,
  onPromote,
}: {
  items: SideQuestion[];
  onAsk?: (question: string) => void;
  onClose: () => void;
  onPromote: (question: string) => void;
}) {
  const [value, setValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const question = value.trim();

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role='dialog'], [role='search'], [role='presentation']")) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  function submit() {
    if (!onAsk || !question) return;
    setValue("");
    onAsk(question);
  }

  return (
    <aside aria-label="Side questions" className={styles.root}>
      <header className={styles.head}>
        <span className={styles.tag}>btw</span>
        <span className={styles.title}>Side questions</span>
        <Tooltip title="Close (Esc)">
          <IconButton aria-label="Close side questions" onClick={onClose} size="small">
            <IconXmark fontSize="small" />
          </IconButton>
        </Tooltip>
      </header>

      <p className={styles.note}>
        Claude answers from this conversation, without tools, and keeps working. Nothing here is
        saved to the session.
      </p>

      <div className={styles.list} ref={listRef}>
        {items.length === 0 ? (
          <p className={styles.empty}>
            Type <code>/btw</code> and a question in the composer, or ask below.
          </p>
        ) : (
          items.map((item) => (
            <article className={styles.item} key={item.id}>
              <p className={styles.question}>{item.question}</p>
              {item.status === "asking" && (
                <p className={styles.status} role="status">
                  <CircularProgress color="inherit" size={14} />
                  Thinking…
                </p>
              )}
              {item.status === "answered" && (
                <div className={styles.answer}>
                  <Markdown text={item.text} />
                </div>
              )}
              {item.status === "failed" && (
                <p className={styles.error} role="alert">
                  {item.text}
                </p>
              )}
              {item.status !== "asking" && (
                <div className={styles.actions}>
                  {item.status === "answered" && <CopyAnswer text={item.text} />}
                  <button
                    className={styles.action}
                    onClick={() => onPromote(item.question)}
                    type="button"
                  >
                    Ask in the main thread
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <form
        className={styles.foot}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          aria-label="Side question"
          autoComplete="off"
          className={styles.input}
          disabled={!onAsk}
          name="side-question"
          onChange={(event) => setValue(event.target.value)}
          placeholder={
            onAsk ? "Ask a side question…" : "Side questions work while Claude is working"
          }
          value={value}
        />
        <IconButton
          aria-label="Ask"
          className={styles.send}
          disabled={!onAsk || !question}
          type="submit"
        >
          <IconArrowUp sx={{ fontSize: 18 }} />
        </IconButton>
      </form>
    </aside>
  );
}
