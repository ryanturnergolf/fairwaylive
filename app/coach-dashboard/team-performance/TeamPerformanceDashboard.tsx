"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalyticsComparisonResult } from "../../lib/analyticsModel";
import type { StatisticEventType } from "../../lib/dynamicStatisticsModel";
import { CoachBreadcrumbs, CoachHeader, CoachState } from "../components/CoachChrome";
import {
  loadTeamPerformanceDashboard,
  type TeamPerformanceFilters,
} from "../../lib/services/teamPerformanceDashboardService";

type DashboardData = Awaited<ReturnType<typeof loadTeamPerformanceDashboard>>;

const format = (value: number | null | undefined, suffix = "") =>
  value === null || value === undefined
    ? "—"
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;

const findStatistic = (data: DashboardData | null, names: string[]) =>
  data?.statistics.comparisons?.find((item) =>
    names.some((name) => item.label.toLowerCase().includes(name))
  );

const statisticValue = (item?: AnalyticsComparisonResult) =>
  item?.aggregate.percentage !== null && item?.aggregate.percentage !== undefined
    ? format(item.aggregate.percentage, "%")
    : format(item?.aggregate.average ?? item?.aggregate.sum);

const bestLeader = (
  comparisons: AnalyticsComparisonResult[] | undefined,
  direction: "low" | "high"
) =>
  [...(comparisons ?? [])]
    .filter((item) =>
      direction === "low"
        ? item.roundAggregate?.average !== null && item.roundAggregate?.average !== undefined
        : item.aggregate.percentage !== null || item.aggregate.average !== null
    )
    .sort((left, right) => {
      const leftValue = direction === "low"
        ? left.roundAggregate?.average ?? Number.POSITIVE_INFINITY
        : left.aggregate.percentage ?? left.aggregate.average ?? Number.NEGATIVE_INFINITY;
      const rightValue = direction === "low"
        ? right.roundAggregate?.average ?? Number.POSITIVE_INFINITY
        : right.aggregate.percentage ?? right.aggregate.average ?? Number.NEGATIVE_INFINITY;
      return direction === "low" ? leftValue - rightValue : rightValue - leftValue;
    })[0];

function Table({
  headings,
  rows,
  empty,
}: {
  headings: string[];
  rows: Array<Array<string | number>>;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed border-[#D9D0C0] p-5 text-sm text-[#51635C]">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left text-sm">
        <thead><tr className="border-b border-[#D9D0C0]">{headings.map((heading) => <th key={heading} className="px-3 py-3 font-black">{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-b border-[#E8DCC8]">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 text-[#51635C]">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function TeamPerformanceDashboard() {
  const [teamName, setTeamName] = useState<TeamPerformanceFilters["teamName"]>("Men");
  const [seasonId, setSeasonId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lastNRounds, setLastNRounds] = useState("10");
  const [eventType, setEventType] = useState<"" | StatisticEventType>("");
  const [statisticKey, setStatisticKey] = useState("strokes");
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const filters = useMemo<TeamPerformanceFilters>(() => ({
    teamName,
    seasonId: seasonId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    lastNRounds: lastNRounds ? Number(lastNRounds) : undefined,
    eventType: eventType || undefined,
    statisticKey,
  }), [dateFrom, dateTo, eventType, lastNRounds, seasonId, statisticKey, teamName]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setData(await loadTeamPerformanceDashboard(filters));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load team performance.");
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  const seasons = useMemo(() => [...new Set((data?.statistics.raw ?? []).map((item) => item.seasonId).filter((value): value is string => Boolean(value)))].sort(), [data]);
  const statisticOptions = useMemo(() => {
    const options = new Map<string, string>([["strokes", "Score"]]);
    for (const item of data?.statistics.raw ?? []) options.set(item.statisticKey, item.statisticName);
    return [...options];
  }, [data]);
  const fairway = findStatistic(data, ["fairway"]);
  const gir = findStatistic(data, ["green in regulation"]);
  const scrambling = findStatistic(data, ["scrambl", "up-and-down success"]);
  const sandSave = findStatistic(data, ["sand save"]);
  const scoringLeader = bestLeader(data?.scoringLeaders.comparisons, "low");
  const leaderCards = [
    ["Lowest Scoring Average", scoringLeader, scoringLeader?.roundAggregate?.average],
    ["Best GIR", bestLeader(data?.leaders.gir.comparisons, "high"), bestLeader(data?.leaders.gir.comparisons, "high")?.aggregate.percentage],
    ["Best Fairways", bestLeader(data?.leaders.fairways.comparisons, "high"), bestLeader(data?.leaders.fairways.comparisons, "high")?.aggregate.percentage],
    ["Best Scrambling", bestLeader(data?.leaders.scrambling.comparisons, "high"), bestLeader(data?.leaders.scrambling.comparisons, "high")?.aggregate.percentage],
  ] as const;

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <CoachHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Team Performance" }]} />
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Analytics</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Team Performance Dashboard</h1>
        <div className="flex flex-wrap items-end justify-between gap-3"><p className="mt-2 text-[#51635C]">Read-only team performance from the authenticated Analytics API.</p><Link href="/coach-dashboard/team-statistics" className="inline-flex min-h-11 items-center rounded-lg border border-[#0B3D2E] bg-white px-4 text-sm font-black">Open Team Statistics</Link></div>

        <section aria-label="Team performance filters" className="mt-6 grid gap-4 rounded-lg border border-[#E8DCC8] bg-white p-5 md:grid-cols-3 xl:grid-cols-7">
          <label className="text-sm font-bold">Team<select aria-label="Team" value={teamName} onChange={(event) => { setTeamName(event.target.value as TeamPerformanceFilters["teamName"]); setSeasonId(""); }} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="Men">Men</option><option value="Women">Women</option></select></label>
          <label className="text-sm font-bold">Season<select aria-label="Season" value={seasonId} onChange={(event) => setSeasonId(event.target.value)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="">All seasons</option>{seasons.map((season) => <option key={season} value={season}>{season}</option>)}</select></label>
          <label className="text-sm font-bold">From<input aria-label="From" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
          <label className="text-sm font-bold">To<input aria-label="To" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
          <label className="text-sm font-bold">Last N rounds<select aria-label="Last N rounds" value={lastNRounds} onChange={(event) => setLastNRounds(event.target.value)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="">All</option>{[5, 10, 20, 50].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          <label className="text-sm font-bold">Event type<select aria-label="Event type" value={eventType} onChange={(event) => setEventType(event.target.value as "" | StatisticEventType)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="">All</option><option value="tournament">Tournament</option><option value="qualifying">Qualifying</option><option value="practice">Practice</option></select></label>
          <label className="text-sm font-bold">Statistic<select aria-label="Statistic" value={statisticKey} onChange={(event) => setStatisticKey(event.target.value)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2">{statisticOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </section>

        {error ? <div className="mt-5"><CoachState title="Unable to load team performance" description={error} tone="error" /></div> : null}
        {isLoading ? <div className="mt-5"><CoachState title="Loading team analytics" description="Applying team, season, event, and statistic filters." /></div> : null}

        <section aria-label="Team summary" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Team Scoring Average", format(data?.scores.roundAggregate?.average)],
            ["Team Best Round", format(data?.scores.roundAggregate?.min)],
            ["Team Events Played", format(data?.scores.roundAggregate?.eventsPlayed)],
            ["Team Rounds Played", format(data?.scores.roundAggregate?.roundsPlayed)],
            ["Team Fairways %", statisticValue(fairway)],
            ["Team GIR %", statisticValue(gir)],
            ["Team Putts/Round", format(data?.putts.roundAggregate?.average)],
            ["Team Scrambling %", statisticValue(scrambling)],
            ["Team Sand Save %", statisticValue(sandSave)],
          ].map(([label, value]) => <article key={label} className="rounded-lg border border-[#E8DCC8] bg-white p-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#B8892D]">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></article>)}
        </section>

        <section className="mt-6 rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-2xl font-black">Team Leaders</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{leaderCards.map(([label, leader, value]) => <article key={label} className="rounded-lg bg-[#FCFAF5] p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#B8892D]">{label}</p><p className="mt-2 text-lg font-black">{leader?.label ?? "—"}</p><p className="text-sm text-[#51635C]">{format(value, label === "Lowest Scoring Average" ? "" : "%")}</p></article>)}</div>{(data?.leaders.custom ?? []).map((custom) => { const leader = bestLeader(custom.result.comparisons, "high"); return <div key={custom.statisticKey} className="mt-3 flex justify-between rounded-lg border border-[#7DA7BE] bg-[#F7FCFE] p-3 text-sm"><strong>Best {custom.statisticName}</strong><span>{leader?.label ?? "—"} · {statisticValue(leader)}</span></div>; })}</section>

        <div className="mt-6 grid gap-5">
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Round Trends</h2><div className="mt-4"><Table headings={["Event", "Round", "Date", "Team Total", "Rolling Average"]} rows={(data?.scores.rolling ?? []).map((point) => [point.eventId, point.roundNumber, point.eventDate ?? "—", format(point.value), format(point.rollingAverage)])} empty="No round trends for these filters." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Event Trends</h2><div className="mt-4"><Table headings={["Event", "Total", "Average", "Best", "Worst"]} rows={(data?.eventTrends.comparisons ?? []).map((item) => [item.label, format(item.aggregate.sum), format(item.aggregate.average), format(item.aggregate.min), format(item.aggregate.max)])} empty="No event trends for these filters." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Season Trends</h2><div className="mt-4"><Table headings={["Season", "Total", "Average", "Best", "Worst"]} rows={(data?.seasonTrends.comparisons ?? []).map((item) => [item.label, format(item.aggregate.sum), format(item.aggregate.average), format(item.aggregate.min), format(item.aggregate.max)])} empty="No season trends for these filters." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Team Comparison</h2><div className="mt-4"><Table headings={["Team", "Rounds", "Scoring Average", "Best", "Worst"]} rows={(data?.teamComparison.comparisons ?? []).map((item) => [item.label, item.roundAggregate?.roundsPlayed ?? 0, format(item.roundAggregate?.average), format(item.roundAggregate?.min), format(item.roundAggregate?.max)])} empty="No team comparison is available." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Player Comparison</h2><div className="mt-4"><Table headings={["Player", "Rounds", "Average", "Percentage", "Best", "Worst"]} rows={(data?.detail.comparisons ?? []).map((item) => [item.label, item.roundAggregate?.roundsPlayed ?? 0, format(item.roundAggregate?.average ?? item.aggregate.average), format(item.aggregate.percentage, "%"), format(item.roundAggregate?.min ?? item.aggregate.min), format(item.roundAggregate?.max ?? item.aggregate.max)])} empty="No player comparison for this statistic." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Recent Rounds</h2><div className="mt-4"><Table headings={["Event", "Round", "Date", "Team Total", "Average"]} rows={(data?.scores.rounds ?? []).slice(-10).reverse().map((round) => [round.eventId, round.roundNumber, round.eventDate ?? "—", format(round.aggregate.sum), format(round.aggregate.average)])} empty="No recent rounds." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Recent Events</h2><div className="mt-4"><Table headings={["Event", "Type", "Date", "Rounds", "Total"]} rows={(data?.scores.events ?? []).slice(-10).reverse().map((event) => [event.eventId, event.eventType, event.eventDate ?? "—", event.rounds.length, format(event.aggregate.sum)])} empty="No recent events." /></div></section>
        </div>
      </div>
    </main>
  );
}
