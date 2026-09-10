"use client";

import Button from "@mui/material/Button";
import { memo, useEffect, useRef } from "react";

import { toolDisplayName } from "@/lib/tools";
import type { PermissionAsk } from "@/lib/types";

import { CodeBlock } from "./code-block";
import { IconBan, IconCheck, IconTriangleExclamation } from "./icons";
import styles from "./permission-card.module.css";

const ARM_DELAY_MS = 600;

export const PermissionCard = memo(function PermissionCard({
  ask,
  onDecide,
  primary,
}: {
  ask: PermissionAsk;
  onDecide: (ask: PermissionAsk, decision: "allow" | "deny", scope: "once" | "session") => void;
  primary: boolean;
}) {
  const armed = useRef(false);

  useEffect(() => {
    if (!primary) return;

    armed.current = false;
    const arm = setTimeout(() => {
      armed.current = true;
    }, ARM_DELAY_MS);

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, [contenteditable='true']")
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "a") {
        if (!armed.current) return;
        if (ask.mutating && !event.shiftKey) return;
        event.preventDefault();
        onDecide(ask, "allow", "once");
      } else if (key === "d") {
        if (!armed.current) return;
        event.preventDefault();
        onDecide(ask, "deny", "once");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(arm);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [ask, onDecide, primary]);

  return (
    <div className={`${styles.root} ${ask.mutating ? "" : styles.safe}`} role="alertdialog">
      <div className={styles.head}>
        <span className={styles.glyph}>
          {ask.mutating ? <IconTriangleExclamation /> : <IconCheck />}
        </span>
        <div>
          <p className={styles.title}>
            Allow {toolDisplayName(ask.tool)}
            {ask.mutating ? " to change your files?" : "?"}
          </p>
          {!(ask.tool === "Bash" && ask.detail && ask.truncatedChars === 0) && (
            <p className={styles.subtitle}>{ask.summary}</p>
          )}
        </div>
      </div>

      {ask.detail && <CodeBlock code={ask.detail} language={ask.language} />}

      {ask.truncatedChars > 0 && (
        <p className={styles.truncated}>
          <IconTriangleExclamation />
          {ask.truncatedChars} more characters are not shown here. The whole thing still runs if you
          allow it.
        </p>
      )}

      <div className={styles.actions}>
        <Button
          color="primary"
          onClick={() => onDecide(ask, "allow", "once")}
          startIcon={<IconCheck />}
          variant="contained"
        >
          Allow once
        </Button>

        {ask.allowAlways && (
          <Button
            color="inherit"
            onClick={() => onDecide(ask, "allow", "session")}
            variant="outlined"
          >
            Allow for this session
          </Button>
        )}

        <Button
          color="error"
          onClick={() => onDecide(ask, "deny", "once")}
          startIcon={<IconBan />}
          variant="outlined"
        >
          Deny
        </Button>

        {primary && (
          <span className={styles.hint}>
            <kbd className={styles.key}>{ask.mutating ? "shift+A" : "A"}</kbd> allow ·{" "}
            <kbd className={styles.key}>D</kbd> deny
          </span>
        )}
      </div>
    </div>
  );
});
