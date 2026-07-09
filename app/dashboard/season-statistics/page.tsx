"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadSeasonStatisticsReadModels,
  type PlayerSeasonStatisticsReadModel,
  type SeasonLeaderboardEntryReadModel,
  type SeasonStatisticsReadModels,
  type TeamSeasonStatisticsReadModel,
} from "../../lib/services/seasonStatisticsService";

type LoadState =
  | { status: "loading"; readModels: null; error: "" }
  | { status: "ready"; readModels: SeasonStatisticsReadModels; error: "" }
  | { status: "error"; readModels: null; error: string };

const formatStat = (value: number | null, suffix = "") =>
  value === null ? "--" : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;

const formatSignedStat = (value: number | null) => {
  if (value === null) {
    return "--";
  }

  if (value === 0) {
    return "E";
  }

  return value > 0 ? `+${formatStat(value)}` : formatStat(value);
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const StatisticCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3">
    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#B8892D]">{label}</p>
    <p className="mt-2 text-xl font-black text-[#0B3D2E]">{value}</p>
  </div>
);

const ReportMetric = ({ label, value }: { label: string; value: string | number }) => (
  <div className="border-b border-[#F0E7D8] py-2 last:border-b-0">
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-bold text-[#51635C]">{label}</span>
      <span className="text-right text-sm font-black text-[#0B3D2E]">{value}</span>
    </div>
  </div>
);

const ReportGroup = ({
  title,
  metrics,
}: {
  title: string;
  metrics: { label: string; value: string | number }[];
}) => (
  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3">
    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#B8892D]">{title}</p>
    <div className="mt-2">
      {metrics.map((metric) => (
        <ReportMetric key={metric.label} label={metric.label} value={metric.value} />
      ))}
    </div>
  </div>
);

const EmptyState = ({ label }: { label: string }) => (
  <div className="rounded-[20px] border border-dashed border-[#D8C8AA] bg-[#FCFAF5] px-5 py-6 text-sm font-semibold text-[#51635C]">
    {label}
  </div>
);

const SectionHeader = ({ eyebrow, title }: { eyebrow: string; title: string }) => (
  <div>
    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">{eyebrow}</p>
    <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">{title}</h3>
  </div>
);

const SeasonSummary = ({ readModels }: { readModels: SeasonStatisticsReadModels }) => {
  const summary = readModels.seasonSummary;

  return (
    <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader eyebrow="Season Summary" title={readModels.seasonName ?? "Current season"} />
        <span className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">
          Read only
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatisticCard label="Total Tournaments" value={summary.totalTournaments} />
        <StatisticCard label="Completed Tournaments" value={summary.completedTournaments} />
        <StatisticCard label="Completed Rounds" value={summary.completedRounds} />
        <StatisticCard label="Statistics Completeness" value={formatStat(summary.statisticsCompleteness, "%")} />
        <StatisticCard label="Last Updated" value={formatTimestamp(summary.lastUpdated)} />
      </div>
    </section>
  );
};

const PlayerReports = ({ players }: { players: PlayerSeasonStatisticsReadModel[] }) => (
  <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
    <SectionHeader eyebrow="Player Season Reports" title="Season-long player analytics" />
    {players.length > 0 ? (
      <div className="mt-5 space-y-4">
        {players.map((player) => (
          <article key={player.playerIdentityKey} className="rounded-[24px] border border-[#E8DCC8] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">{player.playerName}</h4>
                <p className="mt-1 text-sm font-semibold text-[#51635C]">{player.teamName}</p>
              </div>
              <span className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-[#51635C]">
                {player.roundsPlayed} rounds
              </span>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
              <ReportGroup
                title="Performance Summary"
                metrics={[
                  { label: "Rounds Played", value: player.roundsPlayed },
                  { label: "Scoring Average", value: formatStat(player.scoringAverage) },
                  { label: "Total Strokes", value: player.totalStrokes },
                  { label: "To Par", value: formatSignedStat(player.toPar) },
                ]}
              />
              <ReportGroup
                title="Ball Striking & Putting"
                metrics={[
                  { label: "Fairway %", value: formatStat(player.fairwayPercentage, "%") },
                  { label: "GIR %", value: formatStat(player.girPercentage, "%") },
                  { label: "Putts per Round", value: formatStat(player.puttsPerRound) },
                  { label: "Putts per GIR", value: formatStat(player.puttsPerGir) },
                ]}
              />
              <ReportGroup
                title="Scoring Breakdown"
                metrics={[
                  { label: "Birdies", value: player.birdies },
                  { label: "Pars", value: player.pars },
                  { label: "Bogeys", value: player.bogeys },
                  { label: "Double+", value: player.doublePlus },
                  { label: "Penalty Strokes", value: player.penaltyStrokes },
                ]}
              />
              <ReportGroup
                title="Finish & Rounds"
                metrics={[
                  { label: "Best Round", value: player.bestRound?.label ?? "--" },
                  { label: "Worst Round", value: player.worstRound?.label ?? "--" },
                  { label: "Top Finish", value: formatStat(player.topFinish) },
                  { label: "Average Finish", value: formatStat(player.averageFinish) },
                ]}
              />
            </div>
          </article>
        ))}
      </div>
    ) : (
      <div className="mt-5">
        <EmptyState label="No player season reports are available yet." />
      </div>
    )}
  </section>
);

const TeamTrendList = ({ team }: { team: TeamSeasonStatisticsReadModel }) => (
  <div className="mt-3 space-y-2">
    {team.tournamentTrend.length > 0 ? (
      team.tournamentTrend.map((trend) => (
        <div key={`${trend.tournamentId}-${trend.tournamentName}`} className="flex items-center justify-between gap-3 border-b border-[#F0E7D8] py-2 last:border-b-0">
          <span className="text-xs font-bold text-[#51635C]">{trend.tournamentName}</span>
          <span className="text-right text-sm font-black text-[#0B3D2E]">{trend.label}</span>
        </div>
      ))
    ) : (
      <p className="py-2 text-sm font-semibold text-[#51635C]">--</p>
    )}
  </div>
);

const TeamReports = ({ teams }: { teams: TeamSeasonStatisticsReadModel[] }) => (
  <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
    <SectionHeader eyebrow="Team Season Reports" title="Season-long team analytics" />
    {teams.length > 0 ? (
      <div className="mt-5 space-y-4">
        {teams.map((team) => (
          <article key={team.teamIdentityKey} className="rounded-[24px] border border-[#E8DCC8] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">{team.teamName}</h4>
                <p className="mt-1 text-sm font-semibold text-[#51635C]">{team.tournamentsPlayed} tournaments</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
              <ReportGroup
                title="Team Performance"
                metrics={[
                  { label: "Team Scoring Average", value: formatStat(team.teamScoringAverage) },
                  { label: "Counting Score Average", value: formatStat(team.countingScoreAverage) },
                  { label: "Fairway %", value: formatStat(team.fairwayPercentage, "%") },
                  { label: "GIR %", value: formatStat(team.girPercentage, "%") },
                  { label: "Putts", value: team.putts },
                ]}
              />
              <ReportGroup
                title="Finishes"
                metrics={[
                  { label: "Average Finish", value: formatStat(team.averageFinish) },
                  { label: "Wins", value: team.wins },
                  { label: "Top 3", value: team.top3 },
                  { label: "Top 5", value: team.top5 },
                ]}
              />
              <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 lg:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#B8892D]">Tournament Trend</p>
                <TeamTrendList team={team} />
              </div>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <div className="mt-5">
        <EmptyState label="No team season reports are available yet." />
      </div>
    )}
  </section>
);

const Leaderboard = ({
  title,
  entries,
}: {
  title: string;
  entries: SeasonLeaderboardEntryReadModel[];
}) => (
  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3">
    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#B8892D]">{title}</p>
    <div className="mt-3 space-y-2">
      {entries.length > 0 ? (
        entries.map((entry, index) => (
          <div key={`${entry.id}-${title}`} className="flex items-center justify-between gap-3 border-b border-[#F0E7D8] py-2 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[#0B3D2E]">{index + 1}. {entry.name}</p>
              <p className="truncate text-xs font-semibold text-[#51635C]">{entry.secondaryLabel}</p>
            </div>
            <span className="shrink-0 text-sm font-black text-[#0B3D2E]">{entry.displayValue}</span>
          </div>
        ))
      ) : (
        <p className="py-2 text-sm font-semibold text-[#51635C]">--</p>
      )}
    </div>
  </div>
);

const Leaderboards = ({ readModels }: { readModels: SeasonStatisticsReadModels }) => {
  const leaderboards = readModels.leaderboards;

  return (
    <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
      <SectionHeader eyebrow="Leaderboards" title="Season leaders" />
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Leaderboard title="Lowest Scoring Average" entries={leaderboards.lowestScoringAverage} />
        <Leaderboard title="Best Fairway %" entries={leaderboards.bestFairwayPercentage} />
        <Leaderboard title="Best GIR %" entries={leaderboards.bestGirPercentage} />
        <Leaderboard title="Fewest Putts" entries={leaderboards.fewestPutts} />
        <Leaderboard title="Most Birdies" entries={leaderboards.mostBirdies} />
        <Leaderboard title="Best Average Finish" entries={leaderboards.bestAverageFinish} />
      </div>
    </section>
  );
};

export default function SeasonStatisticsPage() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading", readModels: null, error: "" });

  useEffect(() => {
    let isActive = true;

    loadSeasonStatisticsReadModels()
      .then((readModels) => {
        if (isActive) {
          setLoadState({ status: "ready", readModels, error: "" });
        }
      })
      .catch((error) => {
        if (isActive) {
          setLoadState({
            status: "error",
            readModels: null,
            error: error instanceof Error ? error.message : "Unable to load season statistics.",
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8 lg:py-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-sm font-black tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15">
            HQ
          </div>
          <div>
            <h1 className="text-lg font-black tracking-[-0.02em]">Clubhouse HQ</h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">
              College Golf Operations
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#0B3D2E]/75 md:flex">
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/dashboard">
            Dashboard
          </Link>
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/live">
            Live Scores
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8 lg:py-12">
        <div className="rounded-[36px] border border-[#E8DCC8] bg-white/90 p-8 shadow-[0_24px_80px_rgba(11,61,46,0.08)] backdrop-blur lg:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">Statistics Engine</p>
              <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] sm:text-5xl">Season Statistics</h2>
            </div>
            <Link
              href="/dashboard"
              className="rounded-full border border-[#B8892D] px-6 py-3 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
            >
              Back to Dashboard
            </Link>
          </div>

          <div className="mt-10">
            {loadState.status === "loading" ? (
              <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-sm font-semibold text-[#51635C] shadow-inner">
                Loading season statistics...
              </div>
            ) : null}
            {loadState.status === "error" ? (
              <div className="rounded-[28px] border border-[#D9857F] bg-[#FFF0EE] p-8 text-sm font-semibold text-[#8D2D24] shadow-inner">
                {loadState.error}
              </div>
            ) : null}
            {loadState.status === "ready" ? (
              <div className="space-y-6">
                <SeasonSummary readModels={loadState.readModels} />
                <PlayerReports players={loadState.readModels.playerStatistics} />
                <TeamReports teams={loadState.readModels.teamStatistics} />
                <Leaderboards readModels={loadState.readModels} />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
