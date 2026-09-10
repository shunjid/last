import "server-only";

const MAX_CONCURRENT_RUNS = 4;

type RunGuard = { active: number };

declare global {
  var __lastRunGuard__: RunGuard | undefined;
}

export const runGuard: RunGuard =
  globalThis.__lastRunGuard__ ?? (globalThis.__lastRunGuard__ = { active: 0 });

export function tryAcquireRun(): boolean {
  if (runGuard.active >= MAX_CONCURRENT_RUNS) return false;
  runGuard.active += 1;
  return true;
}

export function releaseRun() {
  if (runGuard.active > 0) runGuard.active -= 1;
}
