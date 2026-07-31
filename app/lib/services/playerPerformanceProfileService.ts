"use client";

import type { AnalyticsQueryResult, AnalyticsQueryScope } from "./analyticsQueryService";
import { getSupabaseAuthAccessToken } from "../supabaseClient";

export type PlayerPerformanceFilters = {
  rosterPlayerId: string;
  seasonId?: string;
  dateFrom?: string;
  dateTo?: string;
  lastNRounds?: number;
  statisticKey?: string;
};

const analyticsQuery = async (
  scope: AnalyticsQueryScope,
  params: Record<string, string | number | undefined>
): Promise<AnalyticsQueryResult> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const response = await fetch(`/api/analytics/${scope}?${search}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
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
        : "Unable to load player analytics."
    );
  }
  return body as AnalyticsQueryResult;
};

const commonParams = (filters: PlayerPerformanceFilters) => ({
  rosterPlayerId: filters.rosterPlayerId,
  seasonId: filters.seasonId,
  dateFrom: filters.dateFrom,
  dateTo: filters.dateTo,
  lastNRounds: filters.lastNRounds,
});

export const loadPlayerPerformanceSummary = async (
  filters: PlayerPerformanceFilters
) => {
  const common = commonParams(filters);
  const [scores, putts, statistics] = await Promise.all([
    analyticsQuery("player", {
      ...common,
      statisticKey: "strokes",
      datasets: "aggregate,trend,rolling,comparison,distribution",
      compareBy: "event",
    }),
    analyticsQuery("player", {
      ...common,
      statisticKey: "putts",
      datasets: "aggregate",
    }),
    analyticsQuery("player", {
      ...common,
      datasets: "raw,comparison",
      compareBy: "statistic",
    }),
  ]);
  return { scores, putts, statistics };
};

export const loadPlayerStatisticDetail = async (
  filters: PlayerPerformanceFilters
) =>
  analyticsQuery("player", {
    ...commonParams(filters),
    statisticKey: filters.statisticKey,
    datasets: "raw,aggregate,trend,rolling,comparison,distribution",
    compareBy: "event",
  });
