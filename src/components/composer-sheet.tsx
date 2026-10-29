"use client";

import SwipeableDrawer from "@mui/material/SwipeableDrawer";
import { useId } from "react";

import { useBackClose } from "@/client/back";
import type { PermissionMode } from "@/lib/types";

import styles from "./composer-sheet.module.css";
import { IconCheck } from "./icons";

type Option<T extends string = string> = { label: string; value: T };

function Chips({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Option[];
  value: string;
}) {
  const id = useId();

  return (
    <section className={styles.group}>
      <h2 className={styles.head} id={id}>
        {label}
      </h2>
      <div aria-labelledby={id} className={styles.chips} role="radiogroup">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              aria-checked={selected}
              className={`${styles.chip} ${selected ? styles.selected : ""}`}
              key={option.value}
              onClick={() => onChange(option.value)}
              role="radio"
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ComposerSheet({
  effort,
  effortOptions,
  mode,
  model,
  modelOptions,
  modes,
  onClose,
  onEffortChange,
  onModeChange,
  onModelChange,
  open,
}: {
  effort: string;
  effortOptions: Option[];
  mode: PermissionMode;
  model: string;
  modelOptions: Option[];
  modes: Option<PermissionMode>[];
  onClose: () => void;
  onEffortChange: (effort: string) => void;
  onModeChange: (mode: PermissionMode) => void;
  onModelChange: (model: string) => void;
  open: boolean;
}) {
  const modeId = useId();
  useBackClose(open, onClose);

  return (
    <SwipeableDrawer
      anchor="bottom"
      disableSwipeToOpen
      onClose={onClose}
      onOpen={() => undefined}
      open={open}
      slotProps={{
        root: { className: styles.sheet },
        paper: {
          "aria-label": "Mode, model and effort",
          className: styles.paper,
          role: "dialog",
        },
      }}
    >
      <span aria-hidden className={styles.grab} />

      <section className={styles.group}>
        <h2 className={styles.head} id={modeId}>
          Permissions
        </h2>
        <div aria-labelledby={modeId} className={styles.list} role="radiogroup">
          {modes.map((option) => {
            const selected = option.value === mode;
            return (
              <button
                aria-checked={selected}
                className={`${styles.option} ${selected ? styles.selected : ""}`}
                key={option.value}
                onClick={() => onModeChange(option.value)}
                role="radio"
                type="button"
              >
                <span className={styles.mark}>{selected && <IconCheck />}</span>
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <Chips label="Model" onChange={onModelChange} options={modelOptions} value={model} />

      {effortOptions.length > 1 && (
        <Chips label="Effort" onChange={onEffortChange} options={effortOptions} value={effort} />
      )}
    </SwipeableDrawer>
  );
}
