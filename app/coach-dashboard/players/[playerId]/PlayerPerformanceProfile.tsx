"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RosterPlayer,
  Season,
  SeasonRosterMembership,
} from "../../../lib/rosterModel";
import type { AnalyticsComparisonResult } from "../../../lib/analyticsModel";
import type { AnalyticsQueryResult } from "../../../lib/services/analyticsQueryService";
import {
  loadPlayerPerformanceSummary,
  loadPlayerStatisticDetail,
} from "../../../lib/services/playerPerformanceProfileService";
import { loadRosterFoundation } from "../../../lib/services/rosterFoundationService";

type ProfileData = Awaited<ReturnType<typeof loadPlayerPerformanceSummary>>;

const statusLabel = (status: string) =>
  status ? `${status[0].toUpperCase()}${status.slice(1)}` : "Unknown";

const formatNumber = (value: number | null | undefined, suffix = "") =>
  value === null || value === undefined
    ? "—"
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;

const findStatistic = (
  comparisons: AnalyticsComparisonResult[],
  names: string[]
) =>
  comparisons.find((comparison) =>
    names.some((name) => comparison.label.toLowerCase().includes(name))
  );

const statisticDisplay = (comparison?: AnalyticsComparisonResult) => {
  if (!comparison) return "—";
  if (comparison.aggregate.percentage !== null) {
    return formatNumber(comparison.aggregate.percentage, "%");
  }
  if (comparison.aggregate.average !== null) {
    return formatNumber(comparison.aggregate.average);
  }
  return formatNumber(comparison.aggregate.sum ?? comparison.aggregate.count);
};

function DataTable({
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
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[#D9D0C0]">
            {headings.map((heading) => <th key={heading} className="px-3 py-3 font-black">{heading}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`} className="border-b border-[#E8DCC8]">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 text-[#51635C]">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PlayerPerformanceProfile({ playerId }: { playerId: string }) {
  const [player, setPlayer] = useState<RosterPlayer | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [memberships, setMemberships] = useState<SeasonRosterMembership[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lastNRounds, setLastNRounds] = useState("10");
  const [selectedStatistic, setSelectedStatistic] = useState("strokes");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [detail, setDetail] = useState<AnalyticsQueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadIdentity = useCallback(async () => {
    const foundation = await loadRosterFoundation();
    const selectedPlayer = foundation.players.find((candidate) => candidate.id === playerId) ?? null;
    const membershipGroups = await Promise.all(
      foundation.seasons.map((season) => loadRosterFoundation(season.id))
    );
    const playerMemberships = membershipGroups
      .flatMap((group) => group.memberships)
      .filter((membership) => membership.rosterPlayerId === playerId);
    const initialSeason =
      playerMemberships.find((membership) =>
        foundation.seasons.find(
          (season) => season.id === membership.seasonId && season.status === "active"
        )
      )?.seasonId ?? playerMemberships[0]?.seasonId ?? "";
    setPlayer(selectedPlayer);
    setSeasons(
      foundation.seasons.filter((season) =>
        playerMemberships.some((membership) => membership.seasonId === season.id)
      )
    );
    setMemberships(playerMemberships);
    setSeasonId((current) => current || initialSeason);
    return { selectedPlayer, initialSeason };
  }, [playerId]);

  const analyticsFilters = useMemo(() => ({
    rosterPlayerId: playerId,
    seasonId: seasonId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    lastNRounds: lastNRounds ? Number(lastNRounds) : undefined,
  }), [dateFrom, dateTo, lastNRounds, playerId, seasonId]);

  const loadAnalytics = useCallback(async () => {
    if (!player) return;
    setIsLoading(true);
    setError("");
    try {
      const [nextProfile, nextDetail] = await Promise.all([
        loadPlayerPerformanceSummary(analyticsFilters),
        loadPlayerStatisticDetail({ ...analyticsFilters, statisticKey: selectedStatistic }),
      ]);
      setProfile(nextProfile);
      setDetail(nextDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load performance analytics.");
    } finally {
      setIsLoading(false);
    }
  }, [analyticsFilters, player, selectedStatistic]);

  useEffect(() => {
    setIsLoading(true);
    loadIdentity()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load player."))
      .finally(() => setIsLoading(false));
  }, [loadIdentity]);

  useEffect(() => {
    if (player) void loadAnalytics();
  }, [loadAnalytics, player]);

  const comparisons = profile?.statistics.comparisons ?? [];
  const statisticOptions = useMemo(() => {
    const options = new Map<string, string>([["strokes", "Score"]]);
    comparisons.forEach((comparison) => {
      const raw = profile?.statistics.raw?.find(
        (observation) => observation.statisticDefinitionVersionId === comparison.key
      );
      options.set(raw?.statisticKey ?? comparison.key, comparison.label);
    });
    ["fairway_hit", "green_in_regulation", "putts", "penalty_strokes"].forEach((key) => {
      const label: Record<string, string> = {
        fairway_hit: "Fairway Hit",
        green_in_regulation: "Green in Regulation",
        putts: "Putts",
        penalty_strokes: "Penalty Strokes",
      };
      if (comparisons.some((item) => item.label === label[key])) options.set(key, label[key]);
    });
    return [...options.entries()];
  }, [comparisons, profile?.statistics.raw]);

  const membership = memberships.find((candidate) => candidate.seasonId === seasonId) ?? memberships[0];
  const selectedSeason = seasons.find((season) => season.id === seasonId);
  const score = profile?.scores.roundAggregate;
  const fairway = findStatistic(comparisons, ["fairway"]);
  const gir = findStatistic(comparisons, ["green in regulation"]);
  const penalties = findStatistic(comparisons, ["penalty"]);
  const scrambling = findStatistic(comparisons, ["scrambl", "up-and-down success"]);
  const sandSave = findStatistic(comparisons, ["sand save"]);
  const upAndDown = findStatistic(comparisons, ["up-and-down success"]);
  const builtInNames = new Set([
    fairway?.label, gir?.label, penalties?.label, scrambling?.label, sandSave?.label, upAndDown?.label, "Putts", "Score",
  ].filter(Boolean));
  const customStatistics = comparisons.filter((item) => !builtInNames.has(item.label));

  if (!isLoading && !player) {
    return <main className="min-h-screen bg-[#F6F1E6] p-8 text-[#0B3D2E]"><p role="alert">Player not found.</p></main>;
  }

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <header className="border-b border-[#E8DCC8] bg-[#FCFAF5]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
          <Link href="/coach-dashboard/players" className="font-black">← Players</Link>
          <Link href="/coach-dashboard" className="text-sm font-bold">Coach Dashboard</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Player Performance Profile</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">
          {player ? `${player.preferredName || player.firstName} ${player.lastName}` : "Loading player..."}
        </h1>
        <p className="mt-2 text-[#51635C]">
          {player?.rosterType === "women" ? "Women's Team" : "Men's Team"} · {membership?.classYear || "Class year not specified"} · {statusLabel(membership?.status ?? player?.status ?? "")}
        </p>
        <p className="mt-1 text-sm text-[#51635C]">
          Seasons available: {seasons.map((season) => season.name).join(", ") || "None"}
        </p>

        <section className="mt-6 grid gap-4 rounded-lg border border-[#E8DCC8] bg-white p-5 md:grid-cols-4">
          <label className="text-sm font-bold">Season<select aria-label="Season" value={seasonId} onChange={(event) => setSeasonId(event.target.value)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="">Career</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
          <label className="text-sm font-bold">From<input aria-label="From" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
          <label className="text-sm font-bold">To<input aria-label="To" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
          <label className="text-sm font-bold">Last N rounds<select aria-label="Last N rounds" value={lastNRounds} onChange={(event) => setLastNRounds(event.target.value)} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="">All rounds</option>{[5, 10, 20, 50].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        </section>

        {error ? <p role="alert" className="mt-5 rounded-lg border border-[#8A2E2E] bg-[#FFF4F1] p-4 font-bold text-[#8A2E2E]">{error}</p> : null}
        {isLoading ? <p role="status" className="mt-5 text-sm font-bold text-[#51635C]">Loading performance analytics...</p> : null}

        <section aria-label="Performance summary" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Scoring Average", formatNumber(score?.average)],
            ["Best Round", formatNumber(score?.min)],
            ["Worst Round", formatNumber(score?.max)],
            ["Rounds Played", formatNumber(score?.roundsPlayed)],
            ["Events Played", formatNumber(score?.eventsPlayed)],
            ["Fairways %", statisticDisplay(fairway)],
            ["GIR %", statisticDisplay(gir)],
            ["Putts/Round", formatNumber(profile?.putts.roundAggregate?.average)],
            ["Penalty Strokes", formatNumber(penalties?.aggregate.sum)],
            ["Scrambling %", statisticDisplay(scrambling)],
            ["Sand Save %", statisticDisplay(sandSave)],
            ["Up-and-Down %", statisticDisplay(upAndDown)],
          ].map(([label, value]) => (
            <article key={label} className="rounded-lg border border-[#E8DCC8] bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#B8892D]">{label}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
            </article>
          ))}
          {customStatistics.map((statistic) => (
            <article key={statistic.key} className="rounded-lg border border-[#7DA7BE] bg-[#F7FCFE] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#255D78]">{statistic.label}</p>
              <p className="mt-2 text-3xl font-black">{statisticDisplay(statistic)}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-[#E8DCC8] bg-white p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div><p className="text-xs font-black uppercase tracking-[0.22em] text-[#B8892D]">Detail Tables</p><h2 className="mt-1 text-2xl font-black">Statistic Detail</h2></div>
            <label className="text-sm font-bold">Statistic<select aria-label="Statistic" value={selectedStatistic} onChange={(event) => setSelectedStatistic(event.target.value)} className="mt-2 w-full min-w-56 rounded-lg border border-[#D9D0C0] px-3 py-2">{statisticOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>
        </section>

        <div className="mt-5 grid gap-5">
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Round History</h2><div className="mt-4"><DataTable headings={["Event", "Round", "Date", "Total", "Average"]} rows={(profile?.scores.rounds ?? []).map((round) => [round.eventId, round.roundNumber, round.eventDate || "—", formatNumber(round.aggregate.sum), formatNumber(round.aggregate.average)])} empty="No round history for these filters." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Event History</h2><div className="mt-4"><DataTable headings={["Event", "Type", "Date", "Rounds", "Total"]} rows={(profile?.scores.events ?? []).map((event) => [event.eventId, event.eventType, event.eventDate || "—", event.rounds.length, formatNumber(event.aggregate.sum)])} empty="No event history for these filters." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Season History</h2><div className="mt-4"><DataTable headings={["Season", "Events", "Count", "Average"]} rows={(profile?.scores.seasons ?? []).map((season) => [season.seasonId, season.events.length, season.aggregate.count, formatNumber(season.aggregate.average)])} empty="No season history for these filters." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Career History</h2><div className="mt-4"><DataTable headings={["Scope", "Rounds", "Events", "Average", "Best", "Worst"]} rows={score ? [["Career", score.roundsPlayed, score.eventsPlayed, formatNumber(score.average), formatNumber(score.min), formatNumber(score.max)]] : []} empty="No career history is available." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Trend Table</h2><div className="mt-4"><DataTable headings={["Event", "Round", "Date", "Value", "Rolling Average"]} rows={(detail?.rolling ?? []).map((point) => [point.eventId, point.roundNumber, point.eventDate || "—", formatNumber(point.value), formatNumber(point.rollingAverage)])} empty="No trend data for this statistic." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Comparison Table</h2><div className="mt-4"><DataTable headings={["Group", "Count", "Average", "Percentage", "Min", "Max"]} rows={(detail?.comparisons ?? []).map((comparison) => [comparison.label, comparison.aggregate.count, formatNumber(comparison.aggregate.average), formatNumber(comparison.aggregate.percentage, "%"), formatNumber(comparison.aggregate.min), formatNumber(comparison.aggregate.max)])} empty="No comparison data for this statistic." /></div></section>
          <section className="rounded-lg border border-[#E8DCC8] bg-white p-5"><h2 className="text-xl font-black">Distribution Table</h2><div className="mt-4"><DataTable headings={["Range / Value", "Count", "Minimum", "Maximum"]} rows={(detail?.distribution ?? []).map((bucket) => [bucket.label, bucket.count, formatNumber(bucket.minimum), formatNumber(bucket.maximum)])} empty="No distribution data for this statistic." /></div></section>
        </div>
        <p className="mt-6 text-xs text-[#51635C]">Selected season: {selectedSeason?.name ?? "Career"}</p>
      </div>
    </main>
  );
}
