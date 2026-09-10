"use client";

import { memo, useState } from "react";

import { IconBrain, IconChevronRight } from "./icons";
import styles from "./thinking-card.module.css";

export const ThinkingCard = memo(function ThinkingCard({
  live,
  redacted,
  text,
}: {
  live: boolean;
  redacted?: boolean;
  text: string;
}) {
  const [open, setOpen] = useState(false);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className={`${styles.root} ${open ? styles.open : ""}`}>
      <button
        aria-expanded={open}
        className={styles.head}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className={styles.chevron}>
          <IconChevronRight />
        </span>
        <IconBrain />
        <span className={live ? styles.shimmer : undefined}>
          {live ? "Thinking…" : `Thought for ${words} word${words === 1 ? "" : "s"}`}
        </span>
      </button>

      {open &&
        (redacted ? (
          <p className={`${styles.body} ${styles.redacted}`}>
            This reasoning was encrypted by the model and cannot be shown.
          </p>
        ) : (
          <div className={styles.body}>{text}</div>
        ))}
    </div>
  );
});
