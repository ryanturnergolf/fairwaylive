"use client";

import { useEffect, useState } from "react";
import {
  loadOfficialResultsReadModel,
  type OfficialIndividualResultReadModel,
  type OfficialResultsReadModel,
  type OfficialTeamResultReadModel,
} from "../../../lib/services/statisticsService";

type OfficialResultsDashboardProps = {
  tournamentId: string;
};

type LoadState =
  | { status: "loading"; readModel: null; error: "" }
  | { status: "ready"; readModel: OfficialResultsReadModel; error: "" }
  | { status: "error"; readModel: null; error: string };

const formatScore = (value: number | null) => (value === null ? "--" : value.toLocaleString());

const formatToPar = (value: number | null) => {
  if (value === null) {
    return "--";
  }

  if (value === 0) {
    return "E";
  }

  return value > 0 ? `+${value}` : String(value);
};

const formatHole = (hole: { holeNumber: number; par: number; scoringAverage: number | null } | null) =>
  hole ? `Hole ${hole.holeNumber} (Par ${hole.par}) - ${formatScore(hole.scoringAverage)}` : "--";

const SummaryCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3">
    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#B8892D]">{label}</p>
    <p className="mt-2 text-lg font-black text-[#0B3D2E]">{value}</p>
  </div>
);

const EmptyState = ({ label }: { label: string }) => (
  <div className="rounded-[20px] border border-dashed border-[#D8C8AA] bg-[#FCFAF5] px-5 py-6 text-sm font-semibold text-[#51635C]">
    {label}
  </div>
);

const OfficialIndividualTable = ({ players }: { players: OfficialIndividualResultReadModel[] }) => (
  <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Final Individual Results</p>
    <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">Official individual leaderboard</h3>
    {players.length > 0 ? (
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">
              {["Pos", "Player", "Team", "Rounds", "Total", "To Par", "Award"].map((heading) => (
                <th key={heading} className="border-b border-[#E8DCC8] px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.playerId} className="text-[#0B3D2E]">
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">{player.position}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">{player.playerName}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold text-[#51635C]">{player.teamName}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">
                  {player.rounds.map((round) => round.label).join(" / ")}
                </td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">{player.totalScore}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">{formatToPar(player.toPar)}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{player.isMedalist ? "Medalist" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="mt-5">
        <EmptyState label="No official individual results are available yet." />
      </div>
    )}
  </section>
);

const OfficialTeamTable = ({ teams }: { teams: OfficialTeamResultReadModel[] }) => (
  <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Final Team Results</p>
    <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">Official team leaderboard</h3>
    {teams.length > 0 ? (
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">
              {["Pos", "Team", "Rounds", "Total", "To Par", "Award"].map((heading) => (
                <th key={heading} className="border-b border-[#E8DCC8] px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.teamId ?? team.teamName} className="text-[#0B3D2E]">
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">{team.position}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">{team.teamName}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">
                  {team.rounds.map((round) => round.label).join(" / ")}
                </td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">{team.totalScore}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-black">{formatToPar(team.toPar)}</td>
                <td className="border-b border-[#F0E7D8] px-3 py-3 font-bold">{team.isChampion ? "Champion" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="mt-5">
        <EmptyState label="No official team results are available yet." />
      </div>
    )}
  </section>
);

const CountingScores = ({ teams }: { teams: OfficialTeamResultReadModel[] }) => (
  <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Team Counting Scores</p>
    <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">Official counting cards</h3>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {teams.map((team) => (
        <article key={team.teamId ?? team.teamName} className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
          <h4 className="text-lg font-black text-[#0B3D2E]">{team.teamName}</h4>
          <div className="mt-3 space-y-3">
            {team.rounds.map((round) => (
              <div key={`${team.teamName}-${round.roundNumber}`} className="border-t border-[#E8DCC8] pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-[0.22em] text-[#B8892D]">Round {round.roundNumber}</span>
                  <span className="text-sm font-black text-[#0B3D2E]">{round.countingScore} ({formatToPar(round.toPar)})</span>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#51635C]">
                  {round.countingScores.map((score) => `${score.playerName} ${score.score}`).join(", ")}
                </p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  </section>
);

const PrintableOfficialResults = ({ readModel }: { readModel: OfficialResultsReadModel }) => (
  <section className="print-official-results-root hidden">
    {["Official Results", "Team Results", "Player Results", "Statistics Summary"].map((title) => (
      <article key={title} className="print-official-sheet mb-8 border border-black p-4 text-black">
        <header className="mb-4 border-b border-black pb-2">
          <h2 className="text-xl font-black">{readModel.facts.tournamentName}</h2>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs">{readModel.facts.course} / {readModel.facts.date}</p>
        </header>
        {title === "Team Results" ? (
          <PrintTable headings={["Pos", "Team", "Total", "To Par"]} rows={readModel.teamLeaderboard.map((team) => [team.position, team.teamName, team.totalScore, formatToPar(team.toPar)])} />
        ) : title === "Player Results" ? (
          <PrintTable headings={["Pos", "Player", "Team", "Total", "To Par"]} rows={readModel.individualLeaderboard.map((player) => [player.position, player.playerName, player.teamName, player.totalScore, formatToPar(player.toPar)])} />
        ) : title === "Statistics Summary" ? (
          <PrintTable
            headings={["Metric", "Value"]}
            rows={[
              ["Hardest Hole", formatHole(readModel.statisticsSummary.hardestHole)],
              ["Easiest Hole", formatHole(readModel.statisticsSummary.easiestHole)],
              ["Birdie %", formatScore(readModel.statisticsSummary.birdieRate)],
              ["Par %", formatScore(readModel.statisticsSummary.parRate)],
              ["Bogey %", formatScore(readModel.statisticsSummary.bogeyRate)],
            ]}
          />
        ) : (
          <PrintTable
            headings={["Fact", "Value"]}
            rows={[
              ["Players", readModel.facts.players],
              ["Teams", readModel.facts.teams],
              ["Rounds", readModel.facts.rounds],
              ["Medalist", readModel.facts.winners.join(", ") || "--"],
              ["Team Champion", readModel.facts.teamChampions.join(", ") || "--"],
            ]}
          />
        )}
      </article>
    ))}
  </section>
);

const PrintTable = ({ headings, rows }: { headings: string[]; rows: Array<Array<string | number>> }) => (
  <table className="w-full border-collapse text-xs">
    <thead>
      <tr>
        {headings.map((heading) => (
          <th key={heading} className="border border-black px-2 py-1 text-left">{heading}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, index) => (
        <tr key={index}>
          {row.map((cell, cellIndex) => (
            <td key={`${index}-${cellIndex}`} className="border border-black px-2 py-1">{cell}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

export default function OfficialResultsDashboard({ tournamentId }: OfficialResultsDashboardProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading", readModel: null, error: "" });

  useEffect(() => {
    let isActive = true;

    setLoadState({ status: "loading", readModel: null, error: "" });
    loadOfficialResultsReadModel({ tournamentId })
      .then((readModel) => {
        if (isActive) {
          setLoadState({ status: "ready", readModel, error: "" });
        }
      })
      .catch((error) => {
        if (isActive) {
          setLoadState({
            status: "error",
            readModel: null,
            error: error instanceof Error ? error.message : "Unable to load official results.",
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [tournamentId]);

  if (loadState.status === "loading") {
    return <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-sm font-semibold text-[#51635C] shadow-inner">Loading official results...</div>;
  }

  if (loadState.status === "error") {
    return <div className="rounded-[28px] border border-[#D9857F] bg-[#FFF0EE] p-8 text-sm font-semibold text-[#8D2D24] shadow-inner">{loadState.error}</div>;
  }

  const readModel = loadState.readModel;

  const printOfficialResults = () => {
    document.body.classList.add("printing-official-results");
    try {
      window.print();
    } finally {
      document.body.classList.remove("printing-official-results");
    }
  };

  const exportCsv = () => {
    const blob = new Blob([readModel.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "official-results.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#E8DCC8] bg-[#0B3D2E] p-6 text-[#F6F1E6] shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">Official Results</p>
            <h3 className="mt-2 text-3xl font-black tracking-[-0.02em]">{readModel.facts.tournamentName}</h3>
            <p className="mt-2 text-sm font-semibold text-[#F6F1E6]/75">{readModel.facts.tiePolicy}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={printOfficialResults} className="rounded-full border border-[#F0C96A] px-5 py-3 text-xs font-black uppercase tracking-[0.25em] text-[#F6F1E6] transition duration-300 hover:bg-white/10">Print Official Results</button>
            <button type="button" onClick={printOfficialResults} className="rounded-full border border-[#F0C96A] px-5 py-3 text-xs font-black uppercase tracking-[0.25em] text-[#F6F1E6] transition duration-300 hover:bg-white/10">Export PDF-ready Layout</button>
            <button type="button" onClick={exportCsv} className="rounded-full bg-[#F0C96A] px-5 py-3 text-xs font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:-translate-y-0.5">Export CSV</button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCard label="Players" value={readModel.facts.players} />
          <SummaryCard label="Teams" value={readModel.facts.teams} />
          <SummaryCard label="Rounds" value={readModel.facts.rounds} />
          <SummaryCard label="Course" value={readModel.facts.course || "--"} />
          <SummaryCard label="Medalist" value={readModel.facts.winners.join(", ") || "--"} />
          <SummaryCard label="Team Champion" value={readModel.facts.teamChampions.join(", ") || "--"} />
        </div>
      </section>

      <OfficialIndividualTable players={readModel.individualLeaderboard} />
      <OfficialTeamTable teams={readModel.teamLeaderboard} />

      <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Round-by-round Summaries</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {readModel.roundSummaries.map((round) => (
            <SummaryCard
              key={round.roundNumber}
              label={`Round ${round.roundNumber}`}
              value={`${round.playerCount} players / ${formatScore(round.scoringAverage)} avg`}
            />
          ))}
        </div>
      </section>

      <CountingScores teams={readModel.teamLeaderboard} />

      <section className="rounded-[28px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Statistics Summary</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Hardest Hole" value={formatHole(readModel.statisticsSummary.hardestHole)} />
          <SummaryCard label="Easiest Hole" value={formatHole(readModel.statisticsSummary.easiestHole)} />
          <SummaryCard label="Birdie %" value={formatScore(readModel.statisticsSummary.birdieRate)} />
          <SummaryCard label="Par %" value={formatScore(readModel.statisticsSummary.parRate)} />
          <SummaryCard label="Bogey %" value={formatScore(readModel.statisticsSummary.bogeyRate)} />
        </div>
      </section>

      <PrintableOfficialResults readModel={readModel} />
    </div>
  );
}
