import "server-only";

import type { SettingSource } from "@anthropic-ai/claude-agent-sdk";

const VALID: SettingSource[] = ["user", "project", "local"];
const DEFAULT_SOURCES: SettingSource[] = [];

function parse(raw: string | undefined): SettingSource[] {
  if (raw === undefined) return DEFAULT_SOURCES;
  const trimmed = raw.trim();
  const sources = trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is SettingSource => VALID.includes(entry as SettingSource));
  if (trimmed !== "" && sources.length === 0) {
    console.warn(
      `LAST_SETTING_SOURCES="${raw}" matched no valid setting source; ` +
        `loading none. Valid options: ${VALID.join(", ")}.`,
    );
  }
  return sources;
}

export const settingSources: SettingSource[] = parse(process.env.LAST_SETTING_SOURCES);
