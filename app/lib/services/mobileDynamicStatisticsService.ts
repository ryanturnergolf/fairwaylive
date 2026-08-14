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

export type MobileStatisticSummary = {
  definitionVersionId: string;
  key: string;
  name: string;
  displayOrder: number;
  recordedCount: number;
  applicableCount: number;
  displayValue: string;
};

export type MissingRequiredMobileStatistic = {
  roundPosition: number;
  courseHoleNumber: number;
  definitionVersionId: string;
  key: string;
  name: string;
};

export const getMobileStatisticTapOptions = (item: MobileStatisticItem): StatisticValue[] | null => {
  if (item.key === "shots_100_and_in") {
    return Array.from({ length: 10 }, (_, index) => String(index + 1));
  }
  if (item.key === "putts" && item.inputType === "bounded_number") {
    const minimum = item.configuration.minimum ?? 0;
    const maximum = item.configuration.maximum ?? 10;
    return Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  }
  return null;
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

export const areRequiredMobileStatisticsComplete = (
  items: MobileStatisticItem[],
  holes: Array<{ par: number }>,
  valuesByHole: Array<Record<string, StatisticValue | null>>
) => holes.every((hole, index) => missingRequiredMobileStatistics(items, hole.par, valuesByHole[index] ?? {}).length === 0);

export const buildMissingRequiredMobileStatistics = (
  items: MobileStatisticItem[],
  holes: Array<{ holeNumber: number; courseHoleNumber?: number; par: number }>,
  valuesByHole: Array<Record<string, StatisticValue | null>>
): MissingRequiredMobileStatistic[] => holes.flatMap((hole, index) =>
  missingRequiredMobileStatistics(items, hole.par, valuesByHole[index] ?? {}).map((item) => ({
    roundPosition: index + 1,
    courseHoleNumber: hole.courseHoleNumber ?? hole.holeNumber,
    definitionVersionId: item.definitionVersionId,
    key: item.key,
    name: item.name,
  }))
);

export const buildMobileStatisticSummaries = (
  items: MobileStatisticItem[],
  holes: Array<{ par: number }>,
  valuesByHole: Array<Record<string, StatisticValue | null>>
): MobileStatisticSummary[] => [...items]
  .filter((item) => item.key !== "up_and_down_opportunity")
  .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name))
  .map((item) => {
    const applicableValues = holes.flatMap((hole, index) => {
      const holeValues = valuesByHole[index] ?? {};
      return statisticAppliesToHole(item, hole.par, holeValues) ? [holeValues[item.key] ?? null] : [];
    });
    let recordedValues = applicableValues.filter((value): value is StatisticValue => value !== null);
    let displayValue = "No values recorded";

    if (item.key === "shots_100_and_in") {
      const numericValues = recordedValues
        .filter((value): value is string => typeof value === "string" && /^(?:[1-9]|10)$/.test(value))
        .map(Number);
      recordedValues = numericValues;
      const total = numericValues.reduce((sum, value) => sum + value, 0);
      displayValue = numericValues.length > 0 ? `${total} total` : displayValue;
    } else if (item.inputType === "yes_no" || item.inputType === "checkbox") {
      const yesCount = recordedValues.filter((value) => value === true).length;
      displayValue = item.key === "fairway_hit" || item.key === "green_in_regulation"
        ? `${yesCount}/${applicableValues.length}`
        : `${yesCount}/${applicableValues.length} Yes`;
    } else if (item.inputType === "bounded_number") {
      const total = recordedValues.reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
      displayValue = recordedValues.length > 0 ? `${total} total` : displayValue;
    } else if (item.inputType === "option_list" && recordedValues.length > 0) {
      const counts = new Map<string, number>();
      recordedValues.forEach((value) => {
        const label = String(value);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      });
      displayValue = [...counts.entries()].map(([label, count]) => `${label}: ${count}`).join(" · ");
    }

    return {
      definitionVersionId: item.definitionVersionId,
      key: item.key,
      name: item.name,
      displayOrder: item.displayOrder,
      recordedCount: recordedValues.length,
      applicableCount: applicableValues.length,
      displayValue,
    };
  });
