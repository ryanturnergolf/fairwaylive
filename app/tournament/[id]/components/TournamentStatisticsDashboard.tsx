"use client";

import { useEffect, useState } from "react";
import {
  loadTournamentStatisticsReadModels,
  type HoleStatisticsReadModel,
  type PlayerStatisticsReadModel,
  type TeamStatisticsReadModel,
  type TournamentStatisticsReadModels,
} from "../../../lib/services/statisticsService";

type TournamentStatisticsDashboardProps = {
  tournamentId: string;
  roundNumber: number;
};

type LoadState =
  | { status: "loading"; readModels: null; error: "" }
  | { status: "ready"; readModels: TournamentStatisticsReadModels; error: "" }
  | { status: "error"; readModels: null; error: string };

const formatStat = (value: number | null, suffix = "") =>
  value === null ? "--" : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;

const formatHoleSummary = (hole: HoleStatisticsReadModel | null) =>
  hole ? `Hole ${hole.holeNumber} (Par ${hole.par}) - ${formatStat(hole.scoringAverage)}` : "--";

const StatisticCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3">
    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#B8892D]">{label}</p>
    <p className="mt-2 text-xl font-black text-[#0B3D2E]">{value}</p>
  </div>
);

const EmptyState = ({ label }: { label: string }) => (
  <div className="rounded-[20px] border border-dashed border-[#D8C8AA] bg-[#FCFAF5] px-5 py-6 text-sm font-semibold text-[#51635C]">
    {label}
  </div>
);

const PlayerStatisticsTable = ({ players }: { players: PlayerStatisticsReadModel[] }) => (
  <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Player Statistics</p>
        <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">Field performance</h3>
      </div>
    </div>
    {players.length > 0 ? (
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">
              {["Player", "Scoring Average", "Fairway %", "GIR %", "Putts", "Putts per GIR", "Birdies", "Pars", "Bogeys", "Double+"].map((heading) => (
                <th key={heading} className="border-b border-[#E8DCC8] px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.playerId} className="text-[#0B3D2E]">
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">
                  <span>{player.playerName}</span>
                  <span className="mt-1 block text-xs font-semibold text-[#51635C]">{player.teamName}</span>
                </td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(player.scoringAverage)}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(player.fairwayPercentage, "%")}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(player.girPercentage, "%")}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{player.putts}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(player.puttsPerGir)}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{player.birdies}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{player.pars}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{player.bogeys}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{player.doublePlus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="mt-5">
        <EmptyState label="No player statistics are available yet." />
      </div>
    )}
  </section>
);

const TeamStatisticsTable = ({ teams }: { teams: TeamStatisticsReadModel[] }) => (
  <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Team Statistics</p>
    <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">Team scoring profile</h3>
    {teams.length > 0 ? (
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">
              {["Team", "Team Scoring Average", "Counting Score Average", "Fairway %", "GIR %", "Putts"].map((heading) => (
                <th key={heading} className="border-b border-[#E8DCC8] px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.teamId ?? team.teamName} className="text-[#0B3D2E]">
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">{team.teamName}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(team.teamScoringAverage)}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(team.countingScoreAverage)}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(team.fairwayPercentage, "%")}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(team.girPercentage, "%")}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{team.putts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="mt-5">
        <EmptyState label="No team statistics are available yet." />
      </div>
    )}
  </section>
);

export default function TournamentStatisticsDashboard({
  tournamentId,
  roundNumber,
}: TournamentStatisticsDashboardProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading", readModels: null, error: "" });

  useEffect(() => {
    let isActive = true;

    setLoadState({ status: "loading", readModels: null, error: "" });
    loadTournamentStatisticsReadModels({ tournamentId, roundNumber })
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
            error: error instanceof Error ? error.message : "Unable to load tournament statistics.",
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [roundNumber, tournamentId]);

  if (loadState.status === "loading") {
    return (
      <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-sm font-semibold text-[#51635C] shadow-inner">
        Loading tournament statistics...
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="rounded-[28px] border border-[#D9857F] bg-[#FFF0EE] p-8 text-sm font-semibold text-[#8D2D24] shadow-inner">
        {loadState.error}
      </div>
    );
  }

  const { playerStatistics, teamStatistics, tournamentStatistics } = loadState.readModels;
  const completeness = tournamentStatistics.completeness;

  return (
    <div className="space-y-6">
      <PlayerStatisticsTable players={playerStatistics} />
      <TeamStatisticsTable teams={teamStatistics} />

      <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Tournament Statistics</p>
        <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">Course scoring profile</h3>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatisticCard label="Hardest Hole" value={formatHoleSummary(tournamentStatistics.hardestHole)} />
          <StatisticCard label="Easiest Hole" value={formatHoleSummary(tournamentStatistics.easiestHole)} />
          <StatisticCard label="Par 3 Average" value={formatStat(tournamentStatistics.par3Average)} />
          <StatisticCard label="Par 4 Average" value={formatStat(tournamentStatistics.par4Average)} />
          <StatisticCard label="Par 5 Average" value={formatStat(tournamentStatistics.par5Average)} />
          <StatisticCard label="Birdie %" value={formatStat(tournamentStatistics.birdieRate, "%")} />
          <StatisticCard label="Par %" value={formatStat(tournamentStatistics.parRate, "%")} />
          <StatisticCard label="Bogey %" value={formatStat(tournamentStatistics.bogeyRate, "%")} />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">
                {["Hole", "Par", "Hole Scoring Average", "Birdie %", "Par %", "Bogey %"].map((heading) => (
                  <th key={heading} className="border-b border-[#E8DCC8] px-3 py-3">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tournamentStatistics.holeScoringAverages.map((hole) => (
                <tr key={hole.holeNumber} className="text-[#0B3D2E]">
                  <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">Hole {hole.holeNumber}</td>
                  <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{hole.par}</td>
                  <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(hole.scoringAverage)}</td>
                  <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(hole.birdieRate, "%")}</td>
                  <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(hole.parRate, "%")}</td>
                  <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{formatStat(hole.bogeyRate, "%")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Statistics Completeness</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">Required stats coverage</h3>
          </div>
          {completeness.isComplete ? (
            <span className="rounded-full border border-[#77B98E] bg-[#ECF8EF] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#146233]">
              Statistics Complete
            </span>
          ) : null}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatisticCard label="Missing Fairways" value={completeness.missingFairways} />
          <StatisticCard label="Missing GIR" value={completeness.missingGir} />
          <StatisticCard label="Missing Putts" value={completeness.missingPutts} />
          <StatisticCard label="Missing Penalties" value={completeness.missingPenalties} />
          <StatisticCard label="Completion Percentage" value={formatStat(completeness.completionPercentage, "%")} />
        </div>
      </section>
    </div>
  );
}
