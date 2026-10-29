"use client";

import { useEffect, useRef, useState } from "react";

import { COARSE_QUERY } from "./use-media-query";

const MARK = "lastBack";
const LEAVE_MS = 2_000;

type Layer = { close: () => void };

const layers: Layer[] = [];
let guarded = false;

function marked(state: unknown): boolean {
  return (state as Record<string, unknown> | null)?.[MARK] === true;
}

function arm() {
  if (!marked(window.history.state)) window.history.pushState({ [MARK]: true }, "");
  guarded = true;
}

function backLeavesApp(): boolean {
  const navigation = (window as Window & { navigation?: { canGoBack: boolean } }).navigation;
  return window.matchMedia(COARSE_QUERY).matches && !navigation?.canGoBack;
}

export function useBackClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const layer = { close: () => closeRef.current() };
    layers.push(layer);
    arm();
    return () => {
      const index = layers.indexOf(layer);
      if (index !== -1) layers.splice(index, 1);
    };
  }, [open]);
}

export function useBackGuard(): boolean {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function rearm() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        setLeaving(false);
      }
      arm();
    }

    function onPopState(event: PopStateEvent) {
      const wasGuarded = guarded;
      guarded = marked(event.state);
      if (guarded || !wasGuarded) return;

      const layer = layers.at(-1);
      if (layer) {
        layer.close();
        arm();
      } else if (backLeavesApp()) {
        setLeaving(true);
        timer = setTimeout(rearm, LEAVE_MS);
      } else {
        window.history.back();
      }
    }

    window.addEventListener("popstate", onPopState);
    window.addEventListener("pointerup", rearm, true);
    window.addEventListener("keydown", rearm, true);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pointerup", rearm, true);
      window.removeEventListener("keydown", rearm, true);
    };
  }, []);

  return leaving;
}
