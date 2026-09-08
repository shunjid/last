import "server-only";

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";

import { basename } from "@/lib/format";
import type { FolderChoice, SessionSummary } from "@/lib/types";

const CONFIG_TTL_MS = 30_000;
const MAX_CONFIG_BYTES = 8 * 1024 * 1024;
const MAX_NESTED = 500;
const SKIP_DIRS = new Set(["node_modules"]);

type TrustMap = Map<string, boolean>;

let trustCache: { at: number; map: TrustMap } | null = null;

function configPath(): string {
  return join(homedir(), ".claude.json");
}

async function readTrustMap(): Promise<TrustMap> {
  const map: TrustMap = new Map();
  try {
    const info = await stat(configPath());
    if (info.size > MAX_CONFIG_BYTES) return map;
    const raw = await readFile(configPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return map;
    const projects = (parsed as { projects?: unknown }).projects;
    if (typeof projects !== "object" || projects === null) return map;
    for (const [path, value] of Object.entries(projects as Record<string, unknown>)) {
      if (!path.startsWith(sep)) continue;
      const accepted =
        typeof value === "object" &&
        value !== null &&
        (value as { hasTrustDialogAccepted?: unknown }).hasTrustDialogAccepted === true;
      map.set(path, accepted);
    }
  } catch {
    return map;
  }
  return map;
}

async function trustMap(): Promise<TrustMap> {
  if (trustCache && Date.now() - trustCache.at < CONFIG_TTL_MS) return trustCache.map;
  const map = await readTrustMap();
  trustCache = { at: Date.now(), map };
  return map;
}

export function invalidateTrustMap() {
  trustCache = null;
}

function isTrusted(path: string, map: TrustMap): boolean {
  let current = path;
  for (;;) {
    if (map.get(current) === true) return true;
    const cut = current.lastIndexOf(sep);
    if (cut <= 0) return map.get(sep) === true;
    current = current.slice(0, cut);
  }
}

async function canonical(target: string): Promise<string | null> {
  try {
    const real = await realpath(target);
    const info = await stat(real);
    return info.isDirectory() ? real : null;
  } catch {
    return null;
  }
}

function trustedRoots(map: TrustMap): string[] {
  const roots: string[] = [];
  for (const [path, accepted] of map) {
    if (accepted) roots.push(path);
  }
  return roots;
}

async function childDirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const dirs: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      dirs.push(join(root, entry.name));
    }
    return dirs;
  } catch {
    return [];
  }
}

export async function isTrustedCwd(path: string): Promise<boolean> {
  const map = await trustMap();
  return isTrusted(path, map);
}

export async function knownFolders(sessions: SessionSummary[]): Promise<FolderChoice[]> {
  const map = await trustMap();
  const byCwd = new Map<string, FolderChoice>();

  for (const session of sessions) {
    if (!session.cwd) continue;
    if (!isTrusted(session.cwd, map)) continue;
    const existing = byCwd.get(session.cwd);
    if (existing) {
      existing.sessionCount += 1;
      existing.lastModified = Math.max(existing.lastModified ?? 0, session.lastModified);
      continue;
    }
    byCwd.set(session.cwd, {
      cwd: session.cwd,
      label: session.project,
      lastModified: session.lastModified,
      sessionCount: 1,
    });
  }

  for (const path of map.keys()) {
    if (byCwd.has(path)) continue;
    if (!isTrusted(path, map)) continue;
    byCwd.set(path, {
      cwd: path,
      label: basename(path),
      lastModified: null,
      sessionCount: 0,
    });
  }

  const nested = (await Promise.all(trustedRoots(map).map(childDirs))).flat();
  let added = 0;
  for (const path of nested) {
    if (added >= MAX_NESTED) break;
    if (byCwd.has(path)) continue;
    byCwd.set(path, {
      cwd: path,
      label: basename(path),
      lastModified: null,
      sessionCount: 0,
    });
    added += 1;
  }

  const checked = await Promise.all(
    [...byCwd.values()].map(async (folder) => {
      const real = await canonical(folder.cwd);
      return real ? { ...folder, cwd: real } : null;
    }),
  );

  const merged = new Map<string, FolderChoice>();
  for (const folder of checked) {
    if (!folder) continue;
    const existing = merged.get(folder.cwd);
    if (!existing) {
      merged.set(folder.cwd, folder);
      continue;
    }
    existing.sessionCount += folder.sessionCount;
    if (folder.lastModified !== null) {
      existing.lastModified = Math.max(existing.lastModified ?? 0, folder.lastModified);
    }
  }

  return [...merged.values()].sort((a, b) => {
    const recency = (b.lastModified ?? 0) - (a.lastModified ?? 0);
    if (recency !== 0) return recency;
    return a.label.localeCompare(b.label);
  });
}

export async function knownCwds(): Promise<Set<string>> {
  const map = await trustMap();
  const dirs = new Set<string>();
  const reals = await Promise.all([...map.keys()].map(canonical));
  for (const real of reals) {
    if (real) dirs.add(real);
  }
  return dirs;
}
