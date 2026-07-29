import type {
  StatisticApplicability,
  StatisticDefinitionConfiguration,
  StatisticInputType,
  StatisticValue,
} from "../dynamicStatisticsModel";

export type MobileStatisticItem = {
  definitionVersionId: string;
  key: string;
  name: string;
  description: string | null;
  inputType: StatisticInputType;
  configuration: StatisticDefinitionConfiguration;
  applicability: StatisticApplicability;
  displayOrder: number;
  isRequired: boolean;
};

export type MobileStatisticValue = {
  id: string;
  definitionVersionId: string;
  holeNumber: number;
  value: StatisticValue;
  entryKind: "self" | "marker" | "official";
  createdAt: string;
};

export type MobileDynamicStatistics = {
  assignment: {
    eventType: "tournament" | "qualifying" | "practice" | "other";
    eventId: string;
    packageVersionId: string;
  } | null;
  items: MobileStatisticItem[];
  values: MobileStatisticValue[];
};

const request = async (body: Record<string, unknown>) => {
  const response = await fetch("/api/mobile-dynamic-statistics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load mobile statistics.");
  return result;
};

export const loadMobileDynamicStatistics = (input: {
  shareToken: string;
  tournamentId: string;
  roundNumber: number;
  playerId: string;
}): Promise<MobileDynamicStatistics> => request({ action: "load", ...input });

export const saveMobileDynamicStatistics = (input: {
  shareToken: string;
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  values: Array<{
    definitionVersionId: string;
    holeNumber: number;
    value: StatisticValue;
    operationKey: string;
  }>;
}): Promise<MobileStatisticValue[]> => request({ action: "save", ...input });

export const statisticAppliesToHole = (
  item: MobileStatisticItem,
  par: number,
  currentValues: Record<string, StatisticValue | null>
) => {
  if (item.applicability.pars?.length && !item.applicability.pars.includes(par)) return false;
  if (item.applicability.requiresDefinitionKey) {
    return currentValues[item.applicability.requiresDefinitionKey] === item.applicability.requiresValue;
  }
  return true;
};

export const missingRequiredMobileStatistics = (
  items: MobileStatisticItem[],
  par: number,
  values: Record<string, StatisticValue | null>
) =>
  items.filter(
    (item) =>
      item.isRequired &&
      statisticAppliesToHole(item, par, values) &&
      values[item.key] == null
  );
