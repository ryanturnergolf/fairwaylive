import { loadCoachStatisticConfiguration } from "./dynamicStatisticsService";

export const defaultQualifyingStatisticKeys = [
  "fairway_hit",
  "green_in_regulation",
  "putts",
] as const;

export type QualifyingStatisticChoice = {
  definitionId: string;
  definitionVersionId: string;
  key: string;
  name: string;
  description: string | null;
  group: "Built-in statistics" | "Custom statistics";
};

export const buildQualifyingStatisticChoices = (
  configuration: Awaited<ReturnType<typeof loadCoachStatisticConfiguration>>
): QualifyingStatisticChoice[] => configuration.definitions
  .filter(({ definition }) => definition.isActive)
  .map(({ definition, latestVersion }) => ({
    definitionId: definition.id,
    definitionVersionId: latestVersion.id,
    key: definition.key,
    name: latestVersion.name,
    description: latestVersion.description,
    group: definition.isBuiltIn ? "Built-in statistics" : "Custom statistics",
  }));

export const loadQualifyingStatisticChoices = async () =>
  buildQualifyingStatisticChoices(await loadCoachStatisticConfiguration());

export const getDefaultQualifyingStatisticKeys = () =>
  new Set<string>(defaultQualifyingStatisticKeys);

