"use client";

import { absoluteTime, clockTime } from "@/lib/format";

export function TimeStamp({ className, iso }: { className?: string; iso: string | null }) {
  const stamp = clockTime(iso);
  if (!stamp) return null;

  return (
    <time
      className={className}
      dateTime={iso ?? undefined}
      suppressHydrationWarning
      title={absoluteTime(iso)}
    >
      {stamp}
    </time>
  );
}
