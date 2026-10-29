import "server-only";

import { open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { sep } from "node:path";
import { StringDecoder } from "node:string_decoder";

import { getSessionInfo, listSessions, type SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";

import { basename } from "@/lib/format";
import type { ProjectSummary, SessionSummary } from "@/lib/types";
import { markRunning } from "./activity";
import { invalidateTrustMap, isTrustedCwd, knownCwds } from "./folders";
import { findTranscriptFile } from "./transcript";

const ALLOWLIST_TTL_MS = 30_000;

const PLUGIN_ROOT_PATTERN = /^\.claude(-|$)/;

const CWD_SCAN_CHUNK = 256 * 1024;
const CWD_SCAN_LIMIT = 16 * 1024 * 1024;
const CWD_FIELD = /"cwd":("(?:[^"\\]|\\.)*")/;

let allowlistCache: { at: number; dirs: Set<string> } | null = null;

async function cwdInTranscript(file: string): Promise<string | null> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(file, "r");
    const buffer = Buffer.alloc(CWD_SCAN_CHUNK);
    const decoder = new StringDecoder("utf8");
    let carry = "";
    for (let offset = 0; offset < CWD_SCAN_LIMIT; offset += CWD_SCAN_CHUNK) {
      const { bytesRead } = await handle.read(buffer, 0, CWD_SCAN_CHUNK, offset);
      if (bytesRead === 0) return null;
      const text = carry + decoder.write(buffer.subarray(0, bytesRead));
      const match = CWD_FIELD.exec(text);
      if (match) {
        const value: unknown = JSON.parse(match[1]);
        return typeof value === "string" && value ? value : null;
      }
      carry = text.slice(-4096);
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

async function sessionCwd(info: SDKSessionInfo): Promise<string | null> {
  if (info.cwd) return info.cwd;
  const file = await findTranscriptFile(info.sessionId);
  return file ? cwdInTranscript(file) : null;
}

function toSummary(info: SDKSessionInfo, cwd: string | null): SessionSummary {
  return {
    createdAt: info.createdAt ?? null,
    cwd,
    fileSize: info.fileSize ?? null,
    gitBranch: info.gitBranch ?? null,
    lastModified: info.lastModified,
    project: cwd ? basename(cwd) : "unknown",
    running: false,
    sessionId: info.sessionId,
    title: info.customTitle || info.summary || info.firstPrompt || "Untitled session",
    waiting: false,
  };
}

function isPluginCwd(cwd: string | null): boolean {
  if (!cwd) return false;
  const prefix = `${homedir()}${sep}`;
  if (!cwd.startsWith(prefix)) return false;
  const top = cwd.slice(prefix.length).split(sep)[0];
  return PLUGIN_ROOT_PATTERN.test(top);
}

export async function fetchSessions(limit = 300): Promise<SessionSummary[]> {
  const sessions = await listSessions({ limit });
  const summaries = (
    await Promise.all(sessions.map(async (info) => toSummary(info, await sessionCwd(info))))
  )
    .filter((session) => !isPluginCwd(session.cwd))
    .sort((a, b) => b.lastModified - a.lastModified);
  await markRunning(summaries);
  return summaries;
}

export function groupProjects(sessions: SessionSummary[]): ProjectSummary[] {
  const byCwd = new Map<string, ProjectSummary>();
  for (const session of sessions) {
    if (!session.cwd) continue;
    const existing = byCwd.get(session.cwd);
    if (existing) {
      existing.sessionCount += 1;
      existing.lastModified = Math.max(existing.lastModified, session.lastModified);
      continue;
    }
    byCwd.set(session.cwd, {
      cwd: session.cwd,
      label: session.project,
      lastModified: session.lastModified,
      sessionCount: 1,
    });
  }
  return [...byCwd.values()].sort((a, b) => b.lastModified - a.lastModified);
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

async function allowedCwds(): Promise<Set<string>> {
  if (allowlistCache && Date.now() - allowlistCache.at < ALLOWLIST_TTL_MS)
    return allowlistCache.dirs;
  const sessions = await listSessions({ limit: 500 });
  const dirs = await knownCwds();
  for (const session of sessions) {
    const cwd = await sessionCwd(session);
    if (!cwd) continue;
    const real = await canonical(cwd);
    if (real) dirs.add(real);
  }
  allowlistCache = { at: Date.now(), dirs };
  return dirs;
}

export function invalidateCwdAllowlist() {
  allowlistCache = null;
  invalidateTrustMap();
}

type CwdResolution = { ok: true; cwd: string } | { ok: false; reason: string };

export async function resolveChatCwd(input: {
  sessionId?: string;
  cwd?: string;
}): Promise<CwdResolution> {
  if (input.sessionId) {
    const info = await getSessionInfo(input.sessionId);
    if (!info) return { ok: false, reason: "unknown sessionId" };
    const cwd = await sessionCwd(info);
    if (!cwd) return { ok: false, reason: "session has no recorded directory" };
    const real = await canonical(cwd);
    if (!real) return { ok: false, reason: "session directory no longer exists" };
    return { cwd: real, ok: true };
  }

  if (!input.cwd) return { ok: false, reason: "sessionId or cwd is required" };

  const real = await canonical(input.cwd);
  if (!real) return { ok: false, reason: "directory does not exist" };

  if (await isTrustedCwd(real)) return { cwd: real, ok: true };

  const allowed = await allowedCwds();
  if (!allowed.has(real)) return { ok: false, reason: "directory is not a known project" };

  return { cwd: real, ok: true };
}

export type SessionMeta = Omit<SessionSummary, "createdAt" | "fileSize" | "running" | "waiting"> & {
  sessionId: string;
};

export async function fetchSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const info = await getSessionInfo(sessionId);
  const file = await findTranscriptFile(sessionId);
  if (!info && !file) return null;

  const cwd = info?.cwd ?? (file ? await cwdInTranscript(file) : null);

  return {
    cwd,
    gitBranch: info?.gitBranch ?? null,
    lastModified: info?.lastModified ?? Date.now(),
    project: cwd ? basename(cwd) : "unknown",
    sessionId,
    title: info?.customTitle || info?.summary || info?.firstPrompt || "Untitled session",
  };
}
