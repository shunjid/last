"use client";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Image from "next/image";
import {
  type DragEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { readDraft, readDraftImages, writeDraft, writeDraftImages } from "@/client/drafts";
import { type ImageDraft, readImage, toPromptImage } from "@/client/images";
import { AUTO_EFFORT } from "@/client/prefs";
import { localId } from "@/client/thread";
import type { QueuedMessage } from "@/client/use-chat";
import { COARSE_QUERY, useMediaQuery } from "@/client/use-media-query";
import {
  DEFAULT_MODE,
  type EffortLevel,
  MAX_IMAGES,
  MAX_IMAGES_CHARS,
  type ModelChoice,
  type PermissionMode,
  type PromptImage,
} from "@/lib/types";

import styles from "./composer.module.css";
import { ComposerSheet } from "./composer-sheet";
import { IconArrowUp, IconImage, IconImagePlus, IconMoreHoriz, IconXmark } from "./icons";

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

function draggingFiles(event: DragEvent) {
  return event.dataTransfer.types.includes("Files");
}

function QueuedImages({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className={styles.queuedImages}>
      <IconImage sx={{ fontSize: 14 }} />
      {count}
    </span>
  );
}

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
  onSendPromptNow,
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
  onQueue: (prompt: string, images: PromptImage[]) => void;
  onSend: (prompt: string, images: PromptImage[]) => void;
  onSendNow?: (id: string) => void;
  onSendPromptNow?: (prompt: string, images: PromptImage[]) => void;
  onUnqueue: (id: string) => void;
  owner: "local" | "terminal";
  placeholder: string;
  queue: QueuedMessage[];
  scope: string;
  sendingNow: QueuedMessage | null;
}) {
  const [value, setValue] = useState(() => readDraft(scope));
  const [images, setImages] = useState<ImageDraft[]>(() => readDraftImages(scope));
  const [reading, setReading] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [long, setLong] = useState(false);
  if (long && !value) setLong(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastScope = useRef(scope);
  const wasBusy = useRef(busy);
  const terminal = busy && owner === "terminal";
  const coarse = useMediaQuery(COARSE_QUERY);
  const imageChars = images.reduce((sum, image) => sum + image.url.length, 0);
  const imageLimit =
    images.length > MAX_IMAGES
      ? `Send up to ${MAX_IMAGES} images at a time.`
      : imageChars > MAX_IMAGES_CHARS
        ? "These images are too large to send together."
        : null;
  const notice = imageError ?? imageLimit;
  const canSend =
    !disabled && reading === 0 && !imageLimit && (value.trim().length > 0 || images.length > 0);

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
  }, [fieldRef, long, value]);

  useEffect(() => {
    const node = fieldRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (node.value && node.clientHeight > parseFloat(getComputedStyle(node).minHeight)) {
        setLong(true);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fieldRef]);

  useEffect(() => {
    const previous = lastScope.current;
    if (previous === scope) {
      writeDraft(scope, value);
      writeDraftImages(scope, images);
      return;
    }

    lastScope.current = scope;
    if (previous.startsWith(PENDING_SCOPE_PREFIX)) {
      writeDraft(previous, "");
      writeDraftImages(previous, []);
      writeDraft(scope, value);
      writeDraftImages(scope, images);
      return;
    }

    writeDraft(previous, value);
    writeDraftImages(previous, images);
    setValue(readDraft(scope));
    setImages(readDraftImages(scope));
    setImageError(null);
  }, [images, scope, value]);

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

  function submit(now: boolean) {
    if (!canSend) return;
    const text = value.trim();
    const attached = images.map(toPromptImage);
    setValue("");
    setImages([]);
    setImageError(null);
    if (!busy) onSend(text, attached);
    else if (now && onSendPromptNow) onSendPromptNow(text, attached);
    else onQueue(text, attached);
    fieldRef.current?.focus();
  }

  async function attach(files: File[]) {
    const picked = files.filter((file) => file.type.startsWith("image/"));
    if (picked.length === 0) {
      if (files.length > 0) setImageError("Only images can be attached.");
      return;
    }
    const target = scope;
    setImageError(null);
    setReading((count) => count + picked.length);
    const results = await Promise.allSettled(picked.map(readImage));
    setReading((count) => count - picked.length);
    if (lastScope.current !== target) return;

    const ready = results.flatMap((result) =>
      result.status === "fulfilled" ? [{ ...result.value, id: localId("image") }] : [],
    );
    const failure = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    )[0];
    if (ready.length > 0) setImages((current) => [...current, ...ready]);
    if (failure !== undefined) {
      setImageError(failure instanceof Error ? failure.message : "Could not read that image.");
    }
  }

  function detach(id: string) {
    setImages((current) => current.filter((image) => image.id !== id));
    setImageError(null);
  }

  return (
    <div className={styles.dock}>
      {(queue.length > 0 || sendingNow) && (
        <div className={styles.queue}>
          {sendingNow && (
            <div className={styles.queued}>
              <QueuedImages count={sendingNow.images.length} />
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
              <QueuedImages count={item.images.length} />
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

      <div
        className={`${styles.shell} ${disabled ? styles.disabled : ""} ${dragging ? styles.dragging : ""} ${long ? styles.long : ""}`}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDragOver={(event) => {
          if (disabled || !draggingFiles(event)) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={(event) => {
          if (disabled || !draggingFiles(event)) return;
          event.preventDefault();
          setDragging(false);
          void attach([...event.dataTransfer.files]);
        }}
      >
        {(images.length > 0 || reading > 0 || notice) && (
          <div className={styles.attachments}>
            {images.map((image, index) => (
              <div className={styles.thumb} key={image.id}>
                <Image
                  alt={`Attached image ${index + 1}`}
                  className={styles.thumbImage}
                  height={56}
                  src={image.url}
                  unoptimized
                  width={56}
                />
                <button
                  aria-label={`Remove attached image ${index + 1}`}
                  className={styles.thumbRemove}
                  onClick={() => detach(image.id)}
                  type="button"
                >
                  <IconXmark sx={{ fontSize: 14 }} />
                </button>
              </div>
            ))}
            {Array.from({ length: reading }, (_, index) => (
              <div
                aria-label="Reading image"
                className={`${styles.thumb} ${styles.thumbReading}`}
                key={`reading-${index}`}
                role="status"
              />
            ))}
            {notice && (
              <span className={styles.notice} role="alert">
                {notice}
              </span>
            )}
          </div>
        )}

        <textarea
          aria-label="Message"
          className={styles.field}
          id="composer-message"
          name="message"
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onPaste={(event) => {
            const files = [...event.clipboardData.files].filter((file) =>
              file.type.startsWith("image/"),
            );
            if (files.length === 0 || event.clipboardData.getData("text/plain")) return;
            event.preventDefault();
            void attach(files);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            const modifier = event.metaKey || event.ctrlKey;
            const enter = event.key === "Enter";
            const now =
              modifier &&
              !event.altKey &&
              ((enter && event.shiftKey) || (!event.shiftKey && event.key.toLowerCase() === "j"));
            if (now || (enter && !event.shiftKey && (!coarse || modifier))) {
              event.preventDefault();
              submit(now);
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
          <Tooltip title="Attach images">
            <span className={styles.attach}>
              <IconButton
                aria-label="Attach images"
                disabled={disabled}
                onClick={() => fileRef.current?.click()}
              >
                <IconImagePlus />
              </IconButton>
            </span>
          </Tooltip>
          <input
            accept="image/*"
            hidden
            id="composer-images"
            multiple
            name="images"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              void attach(files);
            }}
            ref={fileRef}
            type="file"
          />

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

          <div className={styles.end}>
            <span className={styles.hint}>
              {value.startsWith("/") ? (
                <span className={styles.slash}>slash command</span>
              ) : (
                <>
                  <kbd className={styles.key}>Enter</kbd> {busy ? "queue" : "send"} ·{" "}
                  {busy && onSendPromptNow && (
                    <>
                      <kbd className={styles.key}>⌘J</kbd> send now ·{" "}
                    </>
                  )}
                  <kbd className={styles.key}>Shift ↵</kbd> new line
                </>
              )}
            </span>

            {busy ? (
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
                    disabled={!canSend}
                    onClick={() => submit(false)}
                    sx={SEND_SX}
                    variant="contained"
                  >
                    <IconArrowUp sx={{ fontSize: 20 }} />
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                aria-label="Send"
                className={styles.send}
                color="primary"
                disabled={!canSend}
                onClick={() => submit(false)}
                sx={SEND_SX}
                variant="contained"
              >
                <IconArrowUp sx={{ fontSize: 20 }} />
              </Button>
            )}
          </div>
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
