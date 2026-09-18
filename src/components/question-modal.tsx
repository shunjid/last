"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import { useState } from "react";

import { PHONE_QUERY, useMediaQuery } from "@/client/use-media-query";
import type { QuestionAsk } from "@/lib/types";

import { CodeBlock } from "./code-block";
import { IconCheck, IconHelp, IconPen, IconXmark } from "./icons";
import styles from "./question-modal.module.css";

type Draft = { kind: "options"; labels: string[] } | { kind: "custom"; text: string };

function isAnswered(draft: Draft | undefined): boolean {
  if (!draft) return false;
  return draft.kind === "custom" ? draft.text.trim().length > 0 : draft.labels.length > 0;
}

function summaryOf(draft: Draft | undefined): string {
  if (!draft) return "";
  return draft.kind === "custom" ? draft.text.trim() : draft.labels.join(", ");
}

export function QuestionModal({
  ask,
  onSubmit,
}: {
  ask: QuestionAsk;
  onSubmit: (outcome: { answers: Record<string, string> } | { cancelled: true }) => void;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [activeIndex, setActiveIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({});
  const [focusedOption, setFocusedOption] = useState<Record<number, number>>({});

  const active = ask.questions[activeIndex];
  const draft = drafts[activeIndex];
  const ready = isAnswered(draft);
  const last = activeIndex === ask.questions.length - 1;
  const hasPreviews = active.options.some((option) => option.preview);

  function selectOption(label: string, optionIndex: number) {
    setOtherOpen((prev) => ({ ...prev, [activeIndex]: false }));
    setFocusedOption((prev) => ({ ...prev, [activeIndex]: optionIndex }));
    setDrafts((prev) => {
      const current = prev[activeIndex];
      if (active.multiSelect) {
        const labels = current?.kind === "options" ? current.labels : [];
        const next = labels.includes(label)
          ? labels.filter((item) => item !== label)
          : [...labels, label];
        return { ...prev, [activeIndex]: { kind: "options", labels: next } };
      }
      return { ...prev, [activeIndex]: { kind: "options", labels: [label] } };
    });
  }

  function openOther() {
    setOtherOpen((prev) => ({ ...prev, [activeIndex]: true }));
    setDrafts((prev) => ({ ...prev, [activeIndex]: { kind: "custom", text: "" } }));
  }

  function advance() {
    if (last) {
      const answers: Record<string, string> = {};
      ask.questions.forEach((question, index) => {
        answers[question.question] = summaryOf(drafts[index]);
      });
      onSubmit({ answers });
      return;
    }
    setActiveIndex((index) => Math.min(index + 1, ask.questions.length - 1));
  }

  function cancel() {
    onSubmit({ cancelled: true });
  }

  const previewOption =
    active.options[focusedOption[activeIndex] ?? -1] ??
    active.options.find(
      (option) => draft?.kind === "options" && draft.labels.includes(option.label),
    ) ??
    active.options.find((option) => option.preview) ??
    null;

  return (
    <Dialog fullScreen={phone} fullWidth maxWidth={hasPreviews ? "md" : "sm"} onClose={cancel} open>
      <div className={styles.header}>
        <span className={styles.glyph}>
          <IconHelp />
        </span>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>Claude has a question</p>
          {ask.questions.length > 1 && (
            <div className={styles.progress}>
              {ask.questions.map((_, index) => (
                <span
                  className={`${styles.dot} ${
                    index === activeIndex
                      ? styles.dotActive
                      : isAnswered(drafts[index])
                        ? styles.dotDone
                        : ""
                  }`}
                  key={index}
                />
              ))}
              <span className={styles.progressLabel}>
                Question {activeIndex + 1} of {ask.questions.length}
              </span>
            </div>
          )}
        </div>
        <IconButton aria-label="Close without answering" onClick={cancel}>
          <IconXmark />
        </IconButton>
      </div>

      <DialogContent className={styles.content} dividers>
        {ask.questions.map((question, index) => {
          if (index === activeIndex) {
            return (
              <div className={styles.panel} key={index}>
                <span className={styles.chip}>{question.header}</span>
                <p className={styles.question}>{question.question}</p>

                <div className={hasPreviews ? styles.split : styles.stack}>
                  <div className={styles.options}>
                    {question.options.map((option, optionIndex) => {
                      const selected =
                        draft?.kind === "options" && draft.labels.includes(option.label);
                      return (
                        <button
                          aria-pressed={selected}
                          className={`${styles.option} ${selected ? styles.optionSelected : ""}`}
                          key={option.label}
                          onClick={() => selectOption(option.label, optionIndex)}
                          onMouseEnter={() =>
                            setFocusedOption((prev) => ({ ...prev, [activeIndex]: optionIndex }))
                          }
                          type="button"
                        >
                          <span className={styles.optionMark}>{selected && <IconCheck />}</span>
                          <span className={styles.optionText}>
                            <span className={styles.optionLabel}>{option.label}</span>
                            <span className={styles.optionDescription}>{option.description}</span>
                          </span>
                        </button>
                      );
                    })}

                    <button
                      className={`${styles.option} ${styles.other} ${
                        otherOpen[activeIndex] ? styles.optionSelected : ""
                      }`}
                      onClick={openOther}
                      type="button"
                    >
                      <span className={styles.optionText}>
                        <span className={styles.optionLabel}>Other…</span>
                      </span>
                    </button>

                    {otherOpen[activeIndex] && (
                      <TextField
                        autoFocus
                        minRows={2}
                        multiline
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [activeIndex]: { kind: "custom", text: event.target.value },
                          }))
                        }
                        placeholder="Type your own answer"
                        value={draft?.kind === "custom" ? draft.text : ""}
                      />
                    )}
                  </div>

                  {hasPreviews && (
                    <div className={styles.preview}>
                      {previewOption?.preview ? (
                        <CodeBlock code={previewOption.preview} label="preview" language="text" />
                      ) : (
                        <p className={styles.previewEmpty}>
                          Pick or hover an option to preview it.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (isAnswered(drafts[index])) {
            return (
              <button
                className={styles.summary}
                key={index}
                onClick={() => setActiveIndex(index)}
                type="button"
              >
                <span className={styles.chip}>{question.header}</span>
                <span className={styles.summaryText}>{summaryOf(drafts[index])}</span>
                <IconPen />
              </button>
            );
          }

          return (
            <div className={styles.pending} key={index}>
              <span className={styles.chip}>{question.header}</span>
              <span className={styles.summaryText}>{question.question}</span>
            </div>
          );
        })}
      </DialogContent>

      <DialogActions>
        <Button color="inherit" onClick={cancel} variant="text">
          Cancel
        </Button>
        <Button
          color="primary"
          disabled={!ready}
          onClick={advance}
          startIcon={<IconCheck />}
          variant="contained"
        >
          {last ? "Submit answers" : "Next question"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
