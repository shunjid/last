"use client";

import { useCallback, useSyncExternalStore } from "react";

export const COMPACT_QUERY = "(max-width: 900px)";
export const PHONE_QUERY = "(max-width: 640px)";
export const SHEET_QUERY = `${PHONE_QUERY}, (max-height: 500px)`;
export const COARSE_QUERY = "(pointer: coarse)";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
