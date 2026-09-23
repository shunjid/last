"use client";

import { useCopy } from "@/client/use-copy";
import { resumeCommand } from "@/lib/format";

import { IconCheck, IconCopy } from "./icons";

export function CopyResume({
  className,
  cwd,
  sessionId,
}: {
  className: string;
  cwd: string | null;
  sessionId: string;
}) {
  const { copied, copy } = useCopy(resumeCommand(cwd, sessionId));
  const label = copied ? "Resume command copied" : "Copy resume command";

  return (
    <button
      aria-label={label}
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        copy();
      }}
      title={label}
      type="button"
    >
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  );
}
