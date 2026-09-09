"use client";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import { useColorScheme } from "@mui/material/styles";
import type { ReactNode } from "react";

import { IconDark, IconLight, IconSystem } from "./icons";

type Mode = "dark" | "light" | "system";

const OPTIONS: Array<{ icon: ReactNode; label: string; value: Mode }> = [
  { icon: <IconLight />, label: "Light theme", value: "light" },
  { icon: <IconDark />, label: "Dark theme", value: "dark" },
  { icon: <IconSystem />, label: "Match the system", value: "system" },
];

export function ThemeToggle() {
  const { mode, setMode } = useColorScheme();

  return (
    <ToggleButtonGroup
      exclusive
      onChange={(_event, next: Mode | null) => {
        if (next) setMode(next);
      }}
      size="small"
      value={mode ?? "system"}
    >
      {OPTIONS.map((option) => (
        <Tooltip key={option.value} title={option.label}>
          <ToggleButton aria-label={option.label} value={option.value}>
            {option.icon}
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}
