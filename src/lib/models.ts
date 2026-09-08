import { DEFAULT_MODEL, EFFORT_LEVELS, type ModelChoice } from "./types";

function normalize(model: string) {
  return model.toLowerCase().replace(/@/g, "-");
}

function synthetic(model: string, hasEffort: boolean): ModelChoice {
  return {
    description: "Picked in your terminal",
    displayName: model,
    effortLevels: hasEffort ? EFFORT_LEVELS : [],
    value: model,
  };
}

export function resolveModelChoice(
  models: ModelChoice[],
  pref: string,
  sessionModel: string | null,
  sessionHasEffort: boolean,
  override: string | null,
): ModelChoice | undefined {
  if (override) {
    return models.find((item) => item.value === override) ?? synthetic(override, true);
  }

  if (sessionModel) {
    const wanted = normalize(sessionModel);
    const preferred = models.find((item) => item.value === pref);
    if (preferred?.resolvedModel && normalize(preferred.resolvedModel) === wanted) return preferred;

    const exact = models.find((item) => normalize(item.value) === wanted);
    if (exact) return exact;

    const alias = models.find(
      (item) =>
        item.value !== DEFAULT_MODEL &&
        item.resolvedModel &&
        normalize(item.resolvedModel) === wanted,
    );
    if (alias) return alias;

    return synthetic(sessionModel, sessionHasEffort);
  }

  return models.find((item) => item.value === pref) ?? models[0];
}
