import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import type { Metadata, Viewport } from "next";
import { Google_Sans, Google_Sans_Code } from "next/font/google";
import { headers } from "next/headers";

import { Providers } from "./providers";
import "./globals.css";

const sans = Google_Sans({ display: "swap", subsets: ["latin"], variable: "--font-sans" });
const mono = Google_Sans_Code({ display: "swap", subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  description: "LAST — browse and continue your local Claude Code terminal sessions.",
  title: "LAST",
};

export const viewport: Viewport = {
  initialScale: 1,
  width: "device-width",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html className={`${sans.variable} ${mono.variable}`} lang="en" suppressHydrationWarning>
      <body>
        <InitColorSchemeScript
          attribute="data-theme"
          colorSchemeStorageKey="last-color-scheme"
          defaultMode="system"
          modeStorageKey="last-mode"
          nonce={nonce}
        />
        <div id="app-root">
          <Providers nonce={nonce}>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
