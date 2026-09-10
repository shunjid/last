"use client";

import { useEffect, useRef } from "react";

const MARK = "● ";

export function useTitleSignal(busy: boolean, asking: boolean) {
  const marked = useRef(false);
  const wasBusy = useRef(busy);

  useEffect(() => {
    function clear() {
      if (document.hidden || !marked.current) return;
      marked.current = false;
      if (document.title.startsWith(MARK)) document.title = document.title.slice(MARK.length);
    }

    document.addEventListener("visibilitychange", clear);
    window.addEventListener("focus", clear);
    return () => {
      document.removeEventListener("visibilitychange", clear);
      window.removeEventListener("focus", clear);
    };
  }, []);

  useEffect(() => {
    const finished = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (!finished && !asking) return;
    if (marked.current || !document.hidden) return;
    marked.current = true;
    document.title = MARK + document.title;
  }, [asking, busy]);
}
