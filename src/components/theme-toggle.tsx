"use client";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import { useColorScheme } from "@mui/material/styles";
import { useEffect, type ReactNode } from "react";

import { PAGE_BACKGROUND } from "@/theme";

import { IconDark, IconLight, IconSystem } from "./icons";

export type ThemeMode = "dark" | "light" | "system";

export const THEME_OPTIONS: Array<{ icon: ReactNode; label: string; value: ThemeMode }> = [
  { icon: <IconLight />, label: "Light theme", value: "light" },
  { icon: <IconDark />, label: "Dark theme", value: "dark" },
  { icon: <IconSystem />, label: "Match the system", value: "system" },
];

function useThemeColorMeta() {
  const { colorScheme } = useColorScheme();

  useEffect(() => {
    if (!colorScheme) return;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute("content", PAGE_BACKGROUND[colorScheme]);
    }
  }, [colorScheme]);
}

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useColorScheme();
  useThemeColorMeta();

  return (
    <ToggleButtonGroup
      className={className}
      exclusive
      onChange={(_event, next: ThemeMode | null) => {
        if (next) setMode(next);
      }}
      size="small"
      value={mode ?? "system"}
    >
      {THEME_OPTIONS.map((option) => (
        <Tooltip key={option.value} title={option.label}>
          <ToggleButton aria-label={option.label} value={option.value}>
            {option.icon}
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}
