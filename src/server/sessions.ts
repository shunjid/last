import "server-only";

import { realpath, stat } from "node:fs/promises";

import { getSessionInfo, listSessions, type SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";

import { basename } from "@/lib/format";
import type { ProjectSummary, SessionSummary } from "@/lib/types";
import { markRunning } from "./activity";
import { invalidateTrustMap, isTrustedCwd, knownCwds } from "./folders";
import { findTranscriptFile } from "./transcript";

const ALLOWLIST_TTL_MS = 30_000;

let allowlistCache: { at: number; dirs: Set<string> } | null = null;

function toSummary(info: SDKSessionInfo): SessionSummary {
  const cwd = info.cwd ?? null;
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
  };
}

export async function fetchSessions(limit = 300): Promise<SessionSummary[]> {
  const sessions = await listSessions({ limit });
  const summaries = sessions.map(toSummary).sort((a, b) => b.lastModified - a.lastModified);
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
    if (!session.cwd) continue;
    const real = await canonical(session.cwd);
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
    if (!info.cwd) return { ok: false, reason: "session has no recorded directory" };
    const real = await canonical(info.cwd);
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

export type SessionMeta = Omit<SessionSummary, "createdAt" | "fileSize" | "running"> & {
  sessionId: string;
};

export async function fetchSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const info = await getSessionInfo(sessionId);
  const file = await findTranscriptFile(sessionId);
  if (!info && !file) return null;

  const cwd = info?.cwd ?? null;

  return {
    cwd,
    gitBranch: info?.gitBranch ?? null,
    lastModified: info?.lastModified ?? Date.now(),
    project: cwd ? basename(cwd) : "unknown",
    sessionId,
    title: info?.customTitle || info?.summary || info?.firstPrompt || "Untitled session",
  };
}
