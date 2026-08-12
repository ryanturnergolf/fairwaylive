"use client";

import type { TeamStatisticsRosterComparison } from "../analyticsModel";
import type { StatisticEventType } from "../dynamicStatisticsModel";
import { getSupabaseAuthAccessToken } from "../supabaseClient";

export type TeamStatisticsFilters = {
  rosterType: "men" | "women";
  seasonId?: string;
  eventType?: StatisticEventType;
};

export const loadTeamStatistics = async (
  filters: TeamStatisticsFilters
): Promise<TeamStatisticsRosterComparison> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const search = new URLSearchParams({
    teamName: filters.rosterType === "men" ? "Men" : "Women",
    datasets: "roster_comparison",
  });
  if (filters.seasonId) search.set("seasonId", filters.seasonId);
  if (filters.eventType) search.set("eventType", filters.eventType);
  const response = await fetch(`/api/analytics/team?${search}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as { rosterComparison?: TeamStatisticsRosterComparison; error?: string } | null;
  if (!response.ok || !body?.rosterComparison) throw new Error(body?.error || "Unable to load team statistics.");
  return body.rosterComparison;
};
