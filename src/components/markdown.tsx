"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "./code-block";
import styles from "./markdown.module.css";

const LANGUAGE_ALIASES: Record<string, string> = {
  console: "bash",
  htm: "html",
  js: "javascript",
  jsonc: "json",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  yml: "yaml",
  zsh: "bash",
};

function flatten(children: unknown): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(flatten).join("");
  return "";
}

const components: Components = {
  a({ children, href }) {
    const external = typeof href === "string" && /^https?:\/\//.test(href);
    return (
      <a href={href} rel="noreferrer noopener" target={external ? "_blank" : undefined}>
        {children}
      </a>
    );
  },
  code({ children, className }) {
    const text = flatten(children).replace(/\n$/, "");
    const match = /language-([\w-]+)/.exec(className ?? "");
    if (!match && !text.includes("\n")) return <code>{text}</code>;
    const raw = (match?.[1] ?? "text").toLowerCase();
    return (
      <div className={styles.block}>
        <CodeBlock code={text} language={LANGUAGE_ALIASES[raw] ?? raw} numbered />
      </div>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  table({ children }) {
    return (
      <div className={styles.tableWrap}>
        <table>{children}</table>
      </div>
    );
  },
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className={styles.root}>
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
