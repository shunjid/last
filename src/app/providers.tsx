"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import type { ReactNode } from "react";

import { theme } from "@/theme";

export function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <AppRouterCacheProvider options={{ key: "last", nonce }}>
      <ThemeProvider
        theme={theme}
        defaultMode="system"
        modeStorageKey="last-mode"
        colorSchemeStorageKey="last-color-scheme"
        disableTransitionOnChange
      >
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
