"use client";

import { useSyncExternalStore } from "react";

function subscribeViewport(onChange: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", onChange);
  viewport?.addEventListener("scroll", onChange);
  return () => {
    viewport?.removeEventListener("resize", onChange);
    viewport?.removeEventListener("scroll", onChange);
  };
}

function readKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport || viewport.scale > 1.01) return 0;
  return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
}

export function useKeyboardInset() {
  return useSyncExternalStore(subscribeViewport, readKeyboardInset, () => 0);
}
