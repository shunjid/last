"use client";

import { useEffect, useState } from "react";

import { DEFAULT_MODEL, type ModelChoice } from "@/lib/types";

import { getModels } from "./api";

const SEED: ModelChoice[] = [
  {
    description: "Whatever your CLI is set to",
    displayName: "Default model",
    effortLevels: [],
    value: DEFAULT_MODEL,
  },
];

export function useModels(): ModelChoice[] {
  const [models, setModels] = useState<ModelChoice[]>(SEED);

  useEffect(() => {
    const controller = new AbortController();
    getModels(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted || payload.models.length === 0) return;
        setModels(payload.models);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return models;
}
