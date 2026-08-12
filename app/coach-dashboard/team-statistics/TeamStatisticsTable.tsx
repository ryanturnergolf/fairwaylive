"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TeamStatisticsMetric, TeamStatisticsRosterComparison } from "../../lib/analyticsModel";
import type { StatisticEventType } from "../../lib/dynamicStatisticsModel";
import { loadTeamStatistics } from "../../lib/services/teamStatisticsService";
import { CoachBreadcrumbs, CoachHeader, CoachState } from "../components/CoachChrome";

type SortState = { key: string; direction: "best" | "worst" } | null;

const formatMetric = (metric: TeamStatisticsMetric, value: number | null) =>
  value === null
    ? "—"
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${metric.format === "percentage" ? "%" : ""}`;

export default function TeamStatisticsTable() {
  const [rosterType, setRosterType] = useState<"men" | "women">("men");
  const [seasonId, setSeasonId] = useState("");
  const [eventType, setEventType] = useState<"" | StatisticEventType>("");
  const [data, setData] = useState<TeamStatisticsRosterComparison | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await loadTeamStatistics({ rosterType, seasonId: seasonId || undefined, eventType: eventType || undefined });
      setData(result);
      setVisibleKeys((current) => current.size
        ? new Set([...current].filter((key) => result.metrics.some((metric) => metric.key === key)))
        : new Set(result.metrics.filter((metric) => metric.defaultVisible).map((metric) => metric.key)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load team statistics.");
    } finally { setLoading(false); }
  }, [eventType, rosterType, seasonId]);

  useEffect(() => { void load(); }, [load]);

  const visibleMetrics = useMemo(() => data?.metrics.filter((metric) => visibleKeys.has(metric.key)) ?? [], [data, visibleKeys]);
  const rows = useMemo(() => {
    const values = [...(data?.rows ?? [])];
    if (!sort) return values.sort((left, right) => left.playerName.localeCompare(right.playerName));
    const metric = data?.metrics.find((item) => item.key === sort.key);
    if (!metric) return values;
    const bestMultiplier = metric.better === "lower" ? 1 : -1;
    const multiplier = sort.direction === "best" ? bestMultiplier : -bestMultiplier;
    return values.sort((left, right) => {
      const leftValue = left.values[sort.key]; const rightValue = right.values[sort.key];
      if (leftValue === null) return rightValue === null ? left.playerName.localeCompare(right.playerName) : 1;
      if (rightValue === null) return -1;
      return (leftValue - rightValue) * multiplier || left.playerName.localeCompare(right.playerName);
    });
  }, [data, sort]);

  const toggleSort = (metric: TeamStatisticsMetric) => setSort((current) =>
    current?.key === metric.key ? { key: metric.key, direction: current.direction === "best" ? "worst" : "best" } : { key: metric.key, direction: "best" }
  );
  const restoreDefaults = () => {
    setVisibleKeys(new Set(data?.metrics.filter((metric) => metric.defaultVisible).map((metric) => metric.key) ?? []));
    setSort(null);
  };

  return <main className="min-h-screen overflow-x-hidden bg-[#F6F1E6] text-[#0B3D2E]">
    <CoachHeader />
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
      <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Team Performance", href: "/coach-dashboard/team-performance" }, { label: "Team Statistics" }]} />
      <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Analytics</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight">Team Statistics</h1>
      <p className="mt-2 text-[#51635C]">Compare the durable roster in one compact, sortable analytics table.</p>

      <section aria-label="Team statistics filters" className="mt-6 grid gap-4 rounded-lg border border-[#E8DCC8] bg-white p-4 sm:grid-cols-3">
        <label className="text-sm font-bold">Roster<select aria-label="Roster" value={rosterType} onChange={(event) => { setRosterType(event.target.value as "men" | "women"); setSeasonId(""); setSort(null); }} className="mt-2 min-h-11 w-full rounded-lg border border-[#D9D0C0] px-3"><option value="men">Men</option><option value="women">Women</option></select></label>
        <label className="text-sm font-bold">Season<select aria-label="Season" value={seasonId} onChange={(event) => { setSeasonId(event.target.value); setSort(null); }} className="mt-2 min-h-11 w-full rounded-lg border border-[#D9D0C0] px-3"><option value="">All seasons</option>{data?.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
        <label className="text-sm font-bold">Event type<select aria-label="Event type" value={eventType} onChange={(event) => { setEventType(event.target.value as "" | StatisticEventType); setSort(null); }} className="mt-2 min-h-11 w-full rounded-lg border border-[#D9D0C0] px-3"><option value="">All events</option><option value="tournament">Tournament</option><option value="qualifying">Qualifying</option><option value="practice">Practice</option></select></label>
      </section>

      {error ? <div className="mt-5"><CoachState tone="error" title="Unable to load team statistics" description={error} /></div> : null}
      {loading ? <div className="mt-5"><CoachState title="Loading roster comparison" description="Applying roster, season, and event filters." /></div> : null}

      {!loading && !error ? <section className="mt-6 rounded-lg border border-[#E8DCC8] bg-white p-4" aria-labelledby="roster-comparison-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="roster-comparison-heading" className="text-xl font-black">Roster Comparison</h2><p className="mt-1 text-sm text-[#51635C]">Missing observations remain distinct from zero and always sort last.</p></div>
          <details className="w-full sm:relative sm:w-auto"><summary className="ml-auto flex min-h-11 w-fit cursor-pointer list-none items-center rounded-lg border border-[#0B3D2E] px-4 text-sm font-black focus-visible:ring-2 focus-visible:ring-[#B8892D]">Choose Stats</summary><div className="mt-2 max-h-[65vh] w-full overflow-y-auto rounded-lg border border-[#D9D0C0] bg-white p-4 shadow-xl sm:absolute sm:right-0 sm:z-20 sm:w-72"><fieldset><legend className="font-black">Visible columns</legend><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-1">{data?.metrics.map((metric) => <label key={metric.key} className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={visibleKeys.has(metric.key)} onChange={() => setVisibleKeys((current) => { const next = new Set(current); if (next.has(metric.key)) next.delete(metric.key); else next.add(metric.key); return next; })} />{metric.label}</label>)}</div></fieldset><button type="button" className="mt-3 min-h-11 w-full rounded-lg border border-[#0B3D2E] font-black" onClick={restoreDefaults}>Restore defaults</button></div></details>
        </div>
        {rows.length === 0 ? <div className="mt-5"><CoachState title="No roster players" description="No durable roster players match these filters." /></div> : <div className="mt-5 max-w-full overflow-x-auto" data-testid="team-statistics-scroll"><table className="min-w-max border-collapse text-left text-sm"><thead><tr>{<th scope="col" className="sticky left-0 z-10 min-w-48 border-b border-r border-[#D9D0C0] bg-white px-3 py-2 font-black">Player</th>}{visibleMetrics.map((metric) => { const active = sort?.key === metric.key; return <th key={metric.key} scope="col" aria-sort={!active ? "none" : sort.direction === "best" ? (metric.better === "lower" ? "ascending" : "descending") : (metric.better === "lower" ? "descending" : "ascending")} className="border-b border-[#D9D0C0] p-0"><button type="button" onClick={() => toggleSort(metric)} aria-label={`Sort by ${metric.label}, ${active && sort.direction === "best" ? "worst to best" : "best to worst"}`} className="min-h-11 min-w-28 px-3 py-2 text-left font-black focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B8892D]">{metric.label}{active ? <span aria-hidden="true"> {sort.direction === "best" ? "★↓" : "★↑"}</span> : null}</button></th>; })}</tr></thead><tbody>{rows.map((row) => <tr key={row.rosterPlayerId} className="border-b border-[#E8DCC8]"><th scope="row" className="sticky left-0 z-10 border-r border-[#E8DCC8] bg-white px-3 py-2 font-bold"><Link className="rounded underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-[#B8892D]" href={`/coach-dashboard/players/${row.rosterPlayerId}`}>{row.playerName}</Link></th>{visibleMetrics.map((metric) => <td key={metric.key} className="px-3 py-2 tabular-nums text-[#51635C]">{formatMetric(metric, row.values[metric.key] ?? null)}</td>)}</tr>)}</tbody></table></div>}
      </section> : null}
    </div>
  </main>;
}
