"use client";

import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import { useState } from "react";

import styles from "./answer-deck.module.css";
import { IconXmark } from "./icons";
import { Markdown } from "./markdown";

export function AnswerDeck({ cards, onClose }: { cards: string[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);

  return (
    <Dialog fullScreen onClose={onClose} open slotProps={{ paper: { className: styles.paper } }}>
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
