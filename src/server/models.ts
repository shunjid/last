import "server-only";

import os from "node:os";

import { query, type ModelInfo } from "@anthropic-ai/claude-agent-sdk";

import { DEFAULT_MODEL, EFFORT_LEVELS, type EffortLevel, type ModelChoice } from "@/lib/types";

const TTL_MS = 10 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const PROBE_TIMEOUT_MS = 20_000;

const FALLBACK: ModelChoice[] = [
  {
    description: "Whatever your CLI is set to",
    displayName: "Default",
    effortLevels: EFFORT_LEVELS,
    value: DEFAULT_MODEL,
  },
];

type Cache = { at: number; models: ModelChoice[] } | null;

type CatalogState = {
  cache: Cache;
  failedAt: number | null;
  inFlight: Promise<ModelChoice[]> | null;
};

declare global {
  var __lastModelCatalog__: CatalogState | undefined;
}

const state: CatalogState =
  globalThis.__lastModelCatalog__ ??
  (globalThis.__lastModelCatalog__ = { cache: null, failedAt: null, inFlight: null });

function toChoice(info: ModelInfo): ModelChoice {
  const levels = info.supportsEffort ? (info.supportedEffortLevels ?? EFFORT_LEVELS) : [];
  return {
    description: info.description || "",
    displayName: info.displayName || info.value,
    effortLevels: levels.filter((level): level is EffortLevel =>
      EFFORT_LEVELS.includes(level as EffortLevel),
    ),
    resolvedModel: info.resolvedModel,
    value: info.value,
  };
}

async function* idlePrompt(): AsyncGenerator<never> {
  await new Promise(() => undefined);
}

async function probe(): Promise<ModelChoice[]> {
  const runner = query({
    options: { cwd: os.homedir(), stderr: () => undefined },
    prompt: idlePrompt(),
  });

  const timer = setTimeout(() => runner.close(), PROBE_TIMEOUT_MS);
  try {
    const models = await runner.supportedModels();
    const choices = models.map(toChoice).filter((choice) => choice.value);
    return choices.length > 0 ? choices : FALLBACK;
  } finally {
    clearTimeout(timer);
    runner.close();
  }
}

export async function listModels(): Promise<ModelChoice[]> {
  const fresh = state.cache && Date.now() - state.cache.at < TTL_MS;
  if (fresh && state.cache) return state.cache.models;
  if (state.inFlight) return state.inFlight;
  if (state.failedAt !== null && Date.now() - state.failedAt < FAILURE_TTL_MS) {
    return state.cache?.models ?? FALLBACK;
  }

  const pending = probe()
    .then((models) => {
      state.cache = { at: Date.now(), models };
      state.failedAt = null;
      return models;
    })
    .catch(() => {
      state.failedAt = Date.now();
      return state.cache?.models ?? FALLBACK;
    })
    .finally(() => {
      state.inFlight = null;
    });

  state.inFlight = pending;
  return pending;
}

export async function effortAllowed(model: string, effort: EffortLevel): Promise<boolean> {
  const models = await listModels();
  const match = models.find((choice) => choice.value === model);
  if (!match) return true;
  return match.effortLevels.includes(effort);
}
