"use client";

import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import { useContext, useState } from "react";

import { useBackClose } from "@/client/back";
import { SessionIdentity } from "@/client/session-identity";
import { basename, truncateMiddle } from "@/lib/format";

import styles from "./answer-deck.module.css";
import { IconCodeBranch, IconFolder, IconXmark } from "./icons";
import { Markdown } from "./markdown";

export function AnswerDeck({ cards, onClose }: { cards: string[]; onClose: () => void }) {
  const { branch, cwd, title } = useContext(SessionIdentity);
  const [index, setIndex] = useState(0);
  useBackClose(true, onClose);

  return (
    <Dialog
      className={styles.deck}
      fullScreen
      onClose={onClose}
      open
      slotProps={{ paper: { className: styles.paper } }}
    >
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        <span className={styles.chips}>
          <span className={styles.chip}>
            <IconFolder />
            <span className={styles.chipLabel}>{cwd ? basename(cwd) : "unknown"}</span>
          </span>
          {branch && (
            <span className={styles.chip}>
              <IconCodeBranch />
              <span className={styles.chipLabel}>{truncateMiddle(branch, 28)}</span>
            </span>
          )}
        </span>
      </div>

      <div
        className={styles.track}
        onScroll={(event) => {
          const track = event.currentTarget;
          setIndex(Math.round(track.scrollLeft / track.clientWidth));
        }}
      >
        {cards.map((card, cardIndex) => (
          <section className={styles.card} key={cardIndex}>
            <Markdown text={card} />
          </section>
        ))}
      </div>

      <div className={styles.bar}>
        <span aria-live="polite" className={styles.count}>
          {index + 1} / {cards.length}
        </span>
        <IconButton aria-label="Close cards" className={styles.close} onClick={onClose}>
          <IconXmark />
        </IconButton>
      </div>
    </Dialog>
  );
}
