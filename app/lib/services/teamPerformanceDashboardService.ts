"use client";

import type { StatisticEventType } from "../dynamicStatisticsModel";
import { getSupabaseAuthAccessToken } from "../supabaseClient";
import type { AnalyticsQueryResult, AnalyticsQueryScope } from "./analyticsQueryService";

export type TeamPerformanceFilters = {
  teamName: "Men" | "Women";
  seasonId?: string;
  dateFrom?: string;
  dateTo?: string;
  lastNRounds?: number;
  eventType?: StatisticEventType;
  statisticKey?: string;
};

const queryAnalytics = async (
  scope: AnalyticsQueryScope,
  params: Record<string, string | number | undefined>
): Promise<AnalyticsQueryResult> => {
  const token = await getSupabaseAuthAccessToken();
  if (!token) throw new Error("Coach authentication is required.");
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const response = await fetch(`/api/analytics/${scope}?${search}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as
    | AnalyticsQueryResult
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      body && "error" in body && body.error
        ? body.error
        : "Unable to load team analytics."
    );
  }
  return body as AnalyticsQueryResult;
};

const commonParams = (filters: TeamPerformanceFilters) => ({
  teamName: filters.teamName,
  seasonId: filters.seasonId,
  dateFrom: filters.dateFrom,
  dateTo: filters.dateTo,
  lastNRounds: filters.lastNRounds,
  eventType: filters.eventType,
});

const leaderStatisticKeys = [
  "fairway_hit",
  "green_in_regulation",
  "up_and_down_success",
  "sand_save",
] as const;

const builtInKeys = new Set([
  "strokes",
  "putts",
  "fairway_hit",
  "green_in_regulation",
  "penalty_strokes",
  "up_and_down_opportunity",
  "up_and_down_success",
  "sand_save",
]);

export const loadTeamPerformanceDashboard = async (
  filters: TeamPerformanceFilters
) => {
  const common = commonParams(filters);
  const [
    scores,
    scoringLeaders,
    eventTrends,
    seasonTrends,
    putts,
    statistics,
    fairways,
    gir,
    scrambling,
    sandSave,
    teamComparison,
  ] = await Promise.all([
    queryAnalytics("team", {
      ...common,
      statisticKey: "strokes",
      datasets: "aggregate,trend,rolling",
    }),
    queryAnalytics("team", {
      ...common,
      statisticKey: "strokes",
      datasets: "comparison",
      compareBy: "player",
    }),
    queryAnalytics("team", {
      ...common,
      statisticKey: "strokes",
      datasets: "comparison",
      compareBy: "event",
    }),
    queryAnalytics("team", {
      ...common,
      statisticKey: "strokes",
      datasets: "comparison",
      compareBy: "season",
    }),
    queryAnalytics("team", { ...common, statisticKey: "putts", datasets: "aggregate" }),
    queryAnalytics("team", { ...common, datasets: "raw,comparison", compareBy: "statistic" }),
    ...leaderStatisticKeys.map((statisticKey) =>
      queryAnalytics("team", {
        ...common,
        statisticKey,
        datasets: "aggregate,comparison",
        compareBy: "player",
      })
    ),
    queryAnalytics("career", {
      seasonId: filters.seasonId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      lastNRounds: filters.lastNRounds,
      eventType: filters.eventType,
      statisticKey: "strokes",
      datasets: "comparison",
      compareBy: "team",
    }),
  ]);

  const customDefinitions = new Map<string, string>();
  for (const observation of statistics.raw ?? []) {
    if (!builtInKeys.has(observation.statisticKey)) {
      customDefinitions.set(observation.statisticKey, observation.statisticName);
    }
  }
  const customLeaders = await Promise.all(
    [...customDefinitions].map(async ([statisticKey, statisticName]) => ({
      statisticKey,
      statisticName,
      result: await queryAnalytics("team", {
        ...common,
        statisticKey,
        datasets: "comparison",
        compareBy: "player",
      }),
    }))
  );

  const detail = await queryAnalytics("team", {
    ...common,
    statisticKey: filters.statisticKey ?? "strokes",
    datasets: "aggregate,trend,rolling,comparison,distribution",
    compareBy: "player",
  });

  return {
    scores,
    scoringLeaders,
    eventTrends,
    seasonTrends,
    putts,
    statistics,
    leaders: { fairways, gir, scrambling, sandSave, custom: customLeaders },
    teamComparison,
    detail,
  };
};
