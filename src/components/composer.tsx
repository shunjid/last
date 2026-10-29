"use client";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { readDraft, writeDraft } from "@/client/drafts";
import { AUTO_EFFORT } from "@/client/prefs";
import type { QueuedMessage } from "@/client/use-chat";
import { COARSE_QUERY, useMediaQuery } from "@/client/use-media-query";
import { DEFAULT_MODE, type EffortLevel, type ModelChoice, type PermissionMode } from "@/lib/types";

import styles from "./composer.module.css";
import { ComposerSheet } from "./composer-sheet";
import { IconArrowUp, IconCircleStop, IconMoreHoriz, IconXmark } from "./icons";

const SEND_SX = { minWidth: 40, width: 40, height: 40, padding: 0, borderRadius: "50%" };

const SELECT_SLOT_PROPS = {
  input: { disableUnderline: true },
  select: { SelectDisplayProps: { className: styles.select } },
};

export const PENDING_SCOPE_PREFIX = "new:";

const MODES: Array<{ label: string; value: PermissionMode }> = [
  { label: "Ask before changes", value: "default" },
  { label: "Auto-accept edits", value: "acceptEdits" },
  { label: "Plan only", value: "plan" },
  { label: "Auto-approve safe actions", value: "auto" },
  { label: "Bypass permissions", value: "bypassPermissions" },
];

const EFFORT_LABELS: Record<EffortLevel, string> = {
  high: "High",
  low: "Low",
  max: "Max",
  medium: "Medium",
  xhigh: "Extra-high",
};

export function Composer({
  busy,
  disabled,
  effort,
  effortLevels,
  inputRef: fieldRef,
  mode,
  model,
  models,
  onEffortChange,
  onModeChange,
  onModelChange,
  onQueue,
  onSend,
  onSendNow,
  onStop,
  onUnqueue,
  owner,
  placeholder,
  queue,
  scope,
  sendingNow,
}: {
  busy: boolean;
  disabled: boolean;
  effort: string;
  effortLevels: EffortLevel[];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  mode: PermissionMode;
  model: string;
  models: ModelChoice[];
  onEffortChange: (effort: string) => void;
  onModeChange: (mode: PermissionMode) => void;
  onModelChange: (model: string) => void;
  onQueue: (prompt: string) => void;
  onSend: (prompt: string) => void;
  onSendNow?: (id: string) => void;
  onStop: () => void;
  onUnqueue: (id: string) => void;
  owner: "local" | "terminal";
  placeholder: string;
  queue: QueuedMessage[];
  scope: string;
  sendingNow: QueuedMessage | null;
}) {
  const [value, setValue] = useState(() => readDraft(scope));
  const [sheetOpen, setSheetOpen] = useState(false);
  const lastScope = useRef(scope);
  const wasBusy = useRef(busy);
  const terminal = busy && owner === "terminal";
  const coarse = useMediaQuery(COARSE_QUERY);

  const modelOptions = useMemo(
    () => models.map((choice) => ({ label: choice.displayName, value: choice.value })),
    [models],
  );

  const effortOptions = useMemo(
    () => [
      { label: "Auto", value: AUTO_EFFORT },
      ...effortLevels.map((level) => ({ label: EFFORT_LABELS[level], value: level })),
    ],
    [effortLevels],
  );

  useLayoutEffect(() => {
    const node = fieldRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 280)}px`;
  }, [fieldRef, value]);

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
    if (!window.matchMedia(COARSE_QUERY).matches) fieldRef.current?.focus();
  }, [fieldRef]);

  useEffect(() => {
    const active = document.activeElement;
    const typing =
      active instanceof HTMLElement &&
      active !== fieldRef.current &&
      active.matches("input, textarea, [contenteditable='true']");
    if (wasBusy.current && !busy && !disabled && !coarse && !typing) fieldRef.current?.focus();
    wasBusy.current = busy;
  }, [busy, coarse, disabled, fieldRef]);

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
      {(queue.length > 0 || sendingNow) && (
        <div className={styles.queue}>
          {sendingNow && (
            <div className={styles.queued}>
              <span className={styles.queuedText}>{sendingNow.text}</span>
              <span className={styles.queuedStatus}>Sending now…</span>
            </div>
          )}
          {queue.length > 0 && (
            <span className={styles.queueLabel}>
              {queue.length} queued ·{" "}
              {terminal
                ? "sends when the terminal turn finishes"
                : busy
                  ? "sends when this turn finishes"
                  : "sends after your next message"}
            </span>
          )}
          {queue.map((item, index) => (
            <div className={styles.queued} key={item.id}>
              <span className={styles.queuedIndex}>{index + 1}</span>
              <span className={styles.queuedText}>{item.text}</span>
              {onSendNow && (
                <button
                  className={styles.queuedSendNow}
                  onClick={() => onSendNow(item.id)}
                  type="button"
                >
                  Send now
                </button>
              )}
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
          className={styles.field}
          id="composer-message"
          name="message"
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              (!coarse || event.metaKey || event.ctrlKey)
            ) {
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
            className={styles.picker}
            disabled={disabled}
            onChange={(event) => onModeChange(event.target.value as PermissionMode)}
            select
            size="small"
            slotProps={SELECT_SLOT_PROPS}
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
            className={styles.picker}
            disabled={disabled}
            onChange={(event) => onModelChange(event.target.value)}
            select
            size="small"
            slotProps={SELECT_SLOT_PROPS}
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
              className={styles.picker}
              disabled={disabled}
              onChange={(event) => onEffortChange(event.target.value)}
              select
              size="small"
              slotProps={SELECT_SLOT_PROPS}
              value={effort}
              variant="standard"
            >
              {effortOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label} effort
                </MenuItem>
              ))}
            </TextField>
          )}

          <IconButton
            aria-haspopup="dialog"
            aria-label={
              mode === DEFAULT_MODE
                ? "Mode, model and effort"
                : `Mode, model and effort · ${MODES.find((option) => option.value === mode)?.label}`
            }
            className={styles.options}
            disabled={disabled}
            onClick={() => setSheetOpen(true)}
          >
            <IconMoreHoriz />
            {mode !== DEFAULT_MODE && <span className={styles.flag} />}
          </IconButton>

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
                    className={styles.send}
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
                  aria-label="Stop"
                  className={styles.stop}
                  color="error"
                  onClick={onStop}
                  size="medium"
                  startIcon={<IconCircleStop />}
                  variant="outlined"
                >
                  <span className={styles.stopLabel}>Stop</span>
                </Button>
              )}
            </div>
          ) : (
            <Button
              aria-label="Send"
              className={styles.send}
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

      <ComposerSheet
        effort={effort}
        effortOptions={effortOptions}
        mode={mode}
        model={model}
        modelOptions={modelOptions}
        modes={MODES}
        onClose={() => setSheetOpen(false)}
        onEffortChange={onEffortChange}
        onModeChange={onModeChange}
        onModelChange={onModelChange}
        open={sheetOpen}
      />
    </div>
  );
}
