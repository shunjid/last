"use client";

import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export type Token = { color?: string; content: string; fontStyle?: number };

const theme = createCssVariablesTheme({
  fontStyle: true,
  name: "last",
  variablePrefix: "--shiki-",
});

const LOADERS: Record<string, () => Promise<unknown>> = {
  bash: () => import("@shikijs/langs/bash"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  go: () => import("@shikijs/langs/go"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  markdown: () => import("@shikijs/langs/markdown"),
  python: () => import("@shikijs/langs/python"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  sql: () => import("@shikijs/langs/sql"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  yaml: () => import("@shikijs/langs/yaml"),
};

let corePromise: Promise<HighlighterCore> | null = null;
const pending = new Map<string, Promise<void>>();

function core() {
  corePromise ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine({ forgiving: true }),
    langs: [],
    themes: [theme],
  });
  return corePromise;
}

export function isSupported(language: string) {
  return language in LOADERS;
}

export async function highlight(code: string, language: string): Promise<Token[][]> {
  const shiki = await core();
  const lang = isSupported(language) ? language : "text";

  if (lang !== "text" && !shiki.getLoadedLanguages().includes(lang)) {
    let load = pending.get(lang);
    if (!load) {
      load = LOADERS[lang]().then((module) => {
        const grammars = (module as { default: unknown }).default;
        return shiki.loadLanguage(grammars as Parameters<typeof shiki.loadLanguage>[0]);
      });
      pending.set(lang, load);
    }
    await load;
  }

  const { tokens } = shiki.codeToTokens(code, { lang, theme: "last" });
  return tokens.map((line) =>
    line.map((token) => ({
      color: token.color,
      content: token.content,
      fontStyle: token.fontStyle,
    })),
  );
}
