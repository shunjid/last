"use client";

import IconButton from "@mui/material/IconButton";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { steerThread } from "@/client/steer";
import { cardTitle } from "@/lib/cards";

import styles from "./answer-deck.module.css";
import { IconChevronLeft, IconChevronRight } from "./icons";
import { Markdown } from "./markdown";

const SETTLE_MS = 120;

function shownIndex(track: HTMLElement): number {
  const cards = track.children;
  const step = (cards[1] as HTMLElement).offsetLeft - (cards[0] as HTMLElement).offsetLeft;
  return Math.min(cards.length - 1, Math.max(0, Math.round(track.scrollLeft / step)));
}

function fit(track: HTMLElement) {
  track.style.height = `${(track.children[shownIndex(track)] as HTMLElement).offsetHeight}px`;
}

function outOfView(node: HTMLElement): boolean {
  const box = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return (
    box.top < parseFloat(style.scrollMarginTop) ||
    box.bottom > window.innerHeight - parseFloat(style.scrollMarginBottom)
  );
}

export function AnswerDeck({ cards, findKey }: { cards: string[]; findKey: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const settleRef = useRef(0);
  const turnedRef = useRef(false);
  const [index, setIndex] = useState(0);
  const titles = useMemo(() => cards.map(cardTitle), [cards]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    fit(track);
    const observer = new ResizeObserver(() => fit(track));
    for (const card of track.children) observer.observe(card);
    return () => observer.disconnect();
  }, [cards]);

  useEffect(() => () => window.clearTimeout(settleRef.current), []);

  const settle = useCallback(() => {
    const track = trackRef.current;
    const root = rootRef.current;
    if (!track || !root) return;
    const before = track.offsetHeight;
    fit(track);
    if (!turnedRef.current) return;
    turnedRef.current = false;
    const away = outOfView(root);
    if (away || track.offsetHeight > before) steerThread(root);
    if (away) root.scrollIntoView({ block: "start" });
  }, []);

  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setIndex(shownIndex(track));
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(settle, SETTLE_MS);
  }, [settle]);

  const go = useCallback((next: number) => {
    const track = trackRef.current;
    const card = track?.children[next] as HTMLElement | undefined;
    if (!track || !card) return;
    turnedRef.current = true;
    track.scrollTo({ left: card.offsetLeft });
  }, []);

  const title = titles[index];

  return (
    <div className={styles.root} ref={rootRef}>
      <div
        className={styles.track}
        data-find={findKey}
        onPointerDown={() => {
          turnedRef.current = true;
        }}
        onScroll={onScroll}
        ref={trackRef}
      >
        {cards.map((card, cardIndex) => (
          <section className={styles.card} key={cardIndex}>
            <Markdown text={card} />
          </section>
        ))}
      </div>

      <div className={styles.nav}>
        <IconButton
          aria-label="Previous card"
          className={styles.step}
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          <IconChevronLeft />
        </IconButton>
        <div className={styles.where}>
          <div className={styles.dots}>
            {cards.map((_, cardIndex) => (
              <span
                className={`${styles.dot} ${cardIndex === index ? styles.on : ""}`}
                key={cardIndex}
              />
            ))}
          </div>
          <span aria-live="polite" className={styles.label}>
            {index + 1} / {cards.length}
            {title && ` · ${title}`}
          </span>
        </div>
        <IconButton
          aria-label="Next card"
          className={styles.step}
          disabled={index === cards.length - 1}
          onClick={() => go(index + 1)}
        >
          <IconChevronRight />
        </IconButton>
      </div>
    </div>
  );
}
