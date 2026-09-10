"use client";

import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { readDraft, writeDraft } from "@/client/drafts";
import { AUTO_EFFORT } from "@/client/prefs";
import type { QueuedMessage } from "@/client/use-chat";
import type { EffortLevel, ModelChoice, PermissionMode } from "@/lib/types";

import styles from "./composer.module.css";
import { IconArrowUp, IconCircleStop, IconXmark } from "./icons";

const SEND_SX = { minWidth: 40, width: 40, height: 40, padding: 0, borderRadius: "50%" };

export const PENDING_SCOPE_PREFIX = "new:";

const MODES: Array<{ label: string; value: PermissionMode }> = [
  { label: "Ask before changes", value: "default" },
  { label: "Auto-accept edits", value: "acceptEdits" },
  { label: "Plan only", value: "plan" },
];

const EFFORT_LABELS: Record<EffortLevel, string> = {
  high: "High effort",
  low: "Low effort",
  max: "Max effort",
  medium: "Medium effort",
  xhigh: "Extra-high effort",
};

export function Composer({
  busy,
  disabled,
  effort,
  effortLevels,
  mode,
  model,
  models,
  onEffortChange,
  onModeChange,
  onModelChange,
  onQueue,
  onSend,
  onStop,
  onUnqueue,
  owner,
  placeholder,
  queue,
  scope,
}: {
  busy: boolean;
  disabled: boolean;
  effort: string;
  effortLevels: EffortLevel[];
  mode: PermissionMode;
  model: string;
  models: ModelChoice[];
  onEffortChange: (effort: string) => void;
  onModeChange: (mode: PermissionMode) => void;
  onModelChange: (model: string) => void;
  onQueue: (prompt: string) => void;
  onSend: (prompt: string) => void;
  onStop: () => void;
  onUnqueue: (id: string) => void;
  owner: "local" | "terminal";
  placeholder: string;
  queue: QueuedMessage[];
  scope: string;
}) {
  const [value, setValue] = useState(() => readDraft(scope));
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const lastScope = useRef(scope);
  const wasBusy = useRef(busy);
  const terminal = busy && owner === "terminal";

  const modelOptions = useMemo(
    () => models.map((choice) => ({ label: choice.displayName, value: choice.value })),
    [models],
  );

  const effortOptions = useMemo(
    () => [
      { label: "Auto effort", value: AUTO_EFFORT },
      ...effortLevels.map((level) => ({ label: EFFORT_LABELS[level], value: level })),
    ],
    [effortLevels],
  );

  useLayoutEffect(() => {
    const node = fieldRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 280)}px`;
  }, [value]);

  useEffect(() => {
    const previous = lastScope.current;
    if (previous === scope) {
      writeDraft(scope, value);
      return;
    }

    lastScope.current = scope;
    if (previous.startsWith(PENDING_SCOPE_PREFIX)) {
      writeDraft(previous, "");
      writeDraft(scope, value);
      return;
    }

    writeDraft(previous, value);
    setValue(readDraft(scope));
  }, [scope, value]);

  useEffect(() => {
    if (wasBusy.current && !busy && !disabled) fieldRef.current?.focus();
    wasBusy.current = busy;
  }, [busy, disabled]);

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    setValue("");
    if (busy) onQueue(text);
    else onSend(text);
    fieldRef.current?.focus();
  }

  return (
    <div className={styles.dock}>
      {queue.length > 0 && (
        <div className={styles.queue}>
          <span className={styles.queueLabel}>
            {queue.length} queued ·{" "}
            {terminal
              ? "sends when the terminal turn finishes"
              : busy
                ? "sends when this turn finishes"
                : "sends after your next message"}
          </span>
          {queue.map((item, index) => (
            <div className={styles.queued} key={item.id}>
              <span className={styles.queuedIndex}>{index + 1}</span>
              <span className={styles.queuedText}>{item.text}</span>
              <button
                aria-label="Remove queued message"
                className={styles.queuedRemove}
                onClick={() => onUnqueue(item.id)}
                type="button"
              >
                <IconXmark sx={{ fontSize: 16 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={`${styles.shell} ${disabled ? styles.disabled : ""}`}>
        <textarea
          aria-label="Message"
          autoFocus
          className={styles.field}
          id="composer-message"
          name="message"
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={
            terminal
              ? "Your terminal is working — this goes next…"
              : busy
                ? "Add another message — it goes next…"
                : placeholder
          }
          ref={fieldRef}
          rows={1}
          value={value}
        />

        <div className={styles.bar}>
          <TextField
            disabled={disabled}
            onChange={(event) => onModeChange(event.target.value as PermissionMode)}
            select
            size="small"
            slotProps={{ input: { disableUnderline: true } }}
            value={mode}
            variant="standard"
          >
            {MODES.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            disabled={disabled}
            onChange={(event) => onModelChange(event.target.value)}
            select
            size="small"
            slotProps={{ input: { disableUnderline: true } }}
            value={model}
            variant="standard"
          >
            {modelOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          {effortLevels.length > 0 && (
            <TextField
              disabled={disabled}
              onChange={(event) => onEffortChange(event.target.value)}
              select
              size="small"
              slotProps={{ input: { disableUnderline: true } }}
              value={effort}
              variant="standard"
            >
              {effortOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}

          <span className={styles.hint}>
            {value.startsWith("/") ? (
              <span className={styles.slash}>slash command</span>
            ) : (
              <>
                <kbd className={styles.key}>Enter</kbd> {busy ? "queue" : "send"} ·{" "}
                <kbd className={styles.key}>Shift ↵</kbd> new line
              </>
            )}
          </span>

          {busy ? (
            <div className={styles.actions}>
              <Tooltip
                title={
                  terminal
                    ? "Queue this message for after the terminal turn"
                    : "Queue this message for after the current turn"
                }
              >
                <span>
                  <Button
                    aria-label="Queue message"
                    color="primary"
                    disabled={disabled || !value.trim()}
                    onClick={submit}
                    sx={SEND_SX}
                    variant="contained"
                  >
                    <IconArrowUp sx={{ fontSize: 20 }} />
                  </Button>
                </span>
              </Tooltip>
              {!terminal && (
                <Button
                  color="error"
                  onClick={onStop}
                  size="medium"
                  startIcon={<IconCircleStop />}
                  variant="outlined"
                >
                  Stop
                </Button>
              )}
            </div>
          ) : (
            <Button
              aria-label="Send"
              color="primary"
              disabled={disabled || !value.trim()}
              onClick={submit}
              sx={SEND_SX}
              variant="contained"
            >
              <IconArrowUp sx={{ fontSize: 20 }} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
