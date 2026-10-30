"use client";

import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import { memo, useCallback, useContext, useEffect, useRef, useState } from "react";

import { useBackClose } from "@/client/back";
import { SessionIdentity } from "@/client/session-identity";
import { basename, truncateMiddle } from "@/lib/format";

import styles from "./answer-deck.module.css";
import { IconChevronDown, IconChevronUp, IconCodeBranch, IconFolder, IconXmark } from "./icons";
import { Markdown } from "./markdown";

export type DeckReply = { cards: string[]; id: string; prompt: string };

function sameCards(a: string[], b: string[]): boolean {
  return a === b || (a.length === b.length && a.every((card, index) => card === b[index]));
}

function Asked({ prompt }: { prompt: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const toggles = clipped || open;

  useEffect(() => {
    const node = ref.current;
    if (!node || open) return;
    const observer = new ResizeObserver(() => setClipped(node.scrollHeight > node.clientHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, prompt]);

  return (
    <button
      aria-expanded={toggles ? open : undefined}
      className={`${styles.asked} ${toggles ? styles.toggles : ""}`}
      disabled={!toggles}
      onClick={() => setOpen(!open)}
      type="button"
    >
      <span className={styles.you}>You</span>
      <span className={`${styles.prompt} ${open ? styles.promptOpen : ""}`} ref={ref}>
        {prompt}
      </span>
    </button>
  );
}

const Page = memo(
  function Page({
    index,
    near,
    onCard,
    register,
    reply,
  }: {
    index: number;
    near: boolean;
    onCard: (index: number, card: number) => void;
    register: (index: number, node: HTMLDivElement | null) => void;
    reply: DeckReply;
  }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
      register(index, ref.current);
      return () => register(index, null);
    }, [index, near, register]);

    return (
      <section aria-label={`Reply ${index + 1}`} className={styles.page}>
        {near && (
          <div
            className={styles.track}
            onScroll={(event) => {
              const track = event.currentTarget;
              onCard(index, Math.round(track.scrollLeft / track.clientWidth));
            }}
            ref={ref}
          >
            {reply.cards.map((card, cardIndex) => (
              <article className={styles.card} key={cardIndex}>
                {cardIndex === 0 && reply.prompt && <Asked prompt={reply.prompt} />}
                <Markdown text={card} />
              </article>
            ))}
          </div>
        )}
      </section>
    );
  },
  (a, b) =>
    a.index === b.index &&
    a.near === b.near &&
    a.onCard === b.onCard &&
    a.register === b.register &&
    a.reply.id === b.reply.id &&
    a.reply.prompt === b.reply.prompt &&
    sameCards(a.reply.cards, b.reply.cards),
);

export function AnswerDeck({
  onClose,
  replies,
  start,
}: {
  onClose: () => void;
  replies: DeckReply[];
  start: number;
}) {
  const { branch, cwd, title } = useContext(SessionIdentity);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const tracks = useRef(new Map<number, HTMLDivElement>());
  const placed = useRef(false);
  const [page, setPage] = useState(start);
  const [card, setCard] = useState(0);
  useBackClose(true, onClose);

  const current = Math.min(page, replies.length - 1);
  const reply = replies[current];

  const attachPages = useCallback(
    (node: HTMLDivElement | null) => {
      pagesRef.current = node;
      if (!node || placed.current) return;
      placed.current = true;
      node.scrollTop = start * node.clientHeight;
    },
    [start],
  );

  const register = useCallback((index: number, node: HTMLDivElement | null) => {
    if (node) tracks.current.set(index, node);
    else tracks.current.delete(index);
  }, []);

  const onCard = useCallback(
    (index: number, next: number) => {
      if (index === current) setCard(next);
    },
    [current],
  );

  const onScroll = () => {
    const node = pagesRef.current;
    if (!node || node.clientHeight === 0) return;
    const next = Math.min(Math.round(node.scrollTop / node.clientHeight), replies.length - 1);
    if (next === page) return;
    setPage(next);
    const track = tracks.current.get(next);
    setCard(track ? Math.round(track.scrollLeft / track.clientWidth) : 0);
  };

  const go = (next: number) => {
    const node = pagesRef.current;
    if (!node || next < 0 || next >= replies.length) return;
    node.scrollTo({ behavior: "smooth", top: next * node.clientHeight });
  };

  const slide = (delta: number) => {
    const track = tracks.current.get(current);
    track?.scrollBy({ behavior: "smooth", left: delta * track.clientWidth });
  };

  if (!reply) return null;

  return (
    <Dialog
      className={styles.deck}
      fullScreen
      onClose={onClose}
      onKeyDown={(event) => {
        const step = { ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1 }[event.key];
        if (step === undefined) return;
        event.preventDefault();
        if (event.key === "ArrowUp" || event.key === "ArrowDown") go(current + step);
        else slide(step);
      }}
      open
      slotProps={{ paper: { className: styles.paper } }}
    >
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        <span className={styles.chips}>
          {replies.length > 1 && (
            <span className={styles.position}>
              Reply {current + 1} of {replies.length}
            </span>
          )}
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

      <div className={styles.pages} onScroll={onScroll} ref={attachPages}>
        {replies.map((item, index) => (
          <Page
            index={index}
            key={item.id}
            near={Math.abs(index - current) <= 1}
            onCard={onCard}
            register={register}
            reply={item}
          />
        ))}
      </div>

      <div className={styles.bar}>
        {replies.length > 1 && (
          <div className={styles.nav}>
            <IconButton
              aria-label="Previous reply"
              disabled={current === 0}
              onClick={() => go(current - 1)}
            >
              <IconChevronUp />
            </IconButton>
            <span className={styles.navLabel}>Replies</span>
            <IconButton
              aria-label="Next reply"
              disabled={current === replies.length - 1}
              onClick={() => go(current + 1)}
            >
              <IconChevronDown />
            </IconButton>
          </div>
        )}
        {reply.cards.length > 1 && (
          <span aria-hidden className={styles.dots}>
            {reply.cards.map((_, index) => (
              <i className={index === card ? styles.dotOn : undefined} key={index} />
            ))}
          </span>
        )}
        <span aria-live="polite" className={styles.count}>
          {card + 1} / {reply.cards.length}
        </span>
        <IconButton aria-label="Close cards" className={styles.close} onClick={onClose}>
          <IconXmark />
        </IconButton>
      </div>
    </Dialog>
  );
}
