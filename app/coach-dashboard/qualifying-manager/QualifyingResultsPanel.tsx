"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  QualifyingPlayerResult,
  QualifyingResultsReadModel,
  QualifyingSessionStatus,
  QualifyingStatisticsSummary,
} from "../../lib/qualifyingModel";
import { finalizeQualifyingSession } from "../../lib/services/qualifyingFinalizationService";
import { loadQualifyingResults } from "../../lib/services/qualifyingSessionService";

const formatToPar = (value: number | null) => {
  if (value === null) return "—";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : String(value);
};

const formatStatistics = (statistics: QualifyingStatisticsSummary) =>
  `${statistics.fairwaysHit}/${statistics.fairwaysAvailable} FW · ${statistics.greensInRegulation}/${statistics.greensAvailable} GIR · ${statistics.totalPutts} putts`;

const ResultsTable = ({ players }: { players: QualifyingPlayerResult[] }) => (
  <div className="overflow-hidden rounded-lg border border-[#E8DCC8] bg-white">
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#F6F1E6] text-xs uppercase tracking-wide text-[#51635C]">
          <tr>
            <th className="px-3 py-3">Pos</th>
            <th className="px-3 py-3">Player</th>
            <th className="px-3 py-3">Score</th>
            <th className="px-3 py-3">To Par</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Statistics</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.playerId} className="border-t border-[#E8DCC8]">
              <td className="px-3 py-3 font-black">{player.position ?? "—"}</td>
              <td className="px-3 py-3 font-bold">{player.playerName}</td>
              <td className="px-3 py-3">{player.score ?? "—"}</td>
              <td className="px-3 py-3">{formatToPar(player.toPar)}</td>
              <td className="px-3 py-3 capitalize">{player.completionStatus}</td>
              <td className="px-3 py-3 text-xs text-[#51635C]">{formatStatistics(player.statistics)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {players.map((player) => (
      <details key={`${player.playerId}-rounds`} className="border-t border-[#E8DCC8] px-3 py-3">
        <summary className="cursor-pointer text-sm font-black">{player.playerName} round summaries</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {player.segments.map((segment) => (
            <div key={segment.roundNumber} className="rounded border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-xs">
              <p className="font-black">Day {segment.dayNumber} · Segment {segment.segmentNumber}</p>
              <p className="mt-1">
                {segment.holeCount} holes · {segment.score ?? "—"} / par {segment.par} · {formatToPar(segment.toPar)}
              </p>
              <p className="mt-1 capitalize">
                {segment.completionStatus} · Review {segment.reviewComplete ? "complete" : "open"} · {segment.submitted ? "Submitted" : "Not submitted"}
              </p>
              <p className="mt-1 text-[#51635C]">{formatStatistics(segment.statistics)}</p>
            </div>
          ))}
        </div>
      </details>
    ))}
  </div>
);

export default function QualifyingResultsPanel({
  sessionId,
  tournamentId,
  sessionStatus = "active",
  historyMode = false,
  onFinalized,
}: {
  sessionId: string;
  tournamentId: string;
  sessionStatus?: QualifyingSessionStatus;
  historyMode?: boolean;
  onFinalized?: () => void;
}) {
  const [results, setResults] = useState<QualifyingResultsReadModel | null>(null);
  const [activeTab, setActiveTab] = useState("combined");
  const [isLoading, setIsLoading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    setError("");
    setIsLoading(true);
    try {
      setResults(await loadQualifyingResults(sessionId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load qualifying results.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (historyMode) void refresh();
  }, [historyMode]);

  const handleFinalize = async () => {
    setError("");
    setIsFinalizing(true);
    try {
      await finalizeQualifyingSession(sessionId);
      await refresh();
      onFinalized?.();
    } catch (finalizationError) {
      setError(
        finalizationError instanceof Error
          ? finalizationError.message
          : "Unable to finalize qualifying."
      );
    } finally {
      setIsFinalizing(false);
    }
  };

  const isFinalized = sessionStatus === "finalized" || results?.sessionStatus === "finalized";
  const effectiveTournamentId = tournamentId || results?.tournamentId || "";

  return (
    <section className="mt-4 rounded-lg border border-[#D9D0C0] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black">{historyMode ? "Qualifying History" : "Qualifying Operations"}</h3>
            {isFinalized ? (
              <span className="rounded-full bg-[#0B3D2E] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                Read Only
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-[#51635C]">
            {isFinalized
              ? "Permanent read-only results from the finalized Tournament Engine."
              : "Read-only progress and results from the Tournament Engine."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {effectiveTournamentId ? (
            <Link
              href={`/tournament/${effectiveTournamentId}`}
              className="rounded-lg border border-[#0B3D2E] px-3 py-2 text-xs font-black"
            >
              Open Tournament Workspace
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            className="rounded-lg bg-[#0B3D2E] px-3 py-2 text-xs font-black text-white disabled:opacity-60"
          >
            {isLoading ? "Loading Results..." : results ? "Refresh Results" : "Results"}
          </button>
          {isFinalized ? (
            <Link
              href={`/coach-dashboard/qualifying-manager/${sessionId}`}
              className="rounded-lg border border-[#0B3D2E] px-3 py-2 text-xs font-black"
            >
              View History
            </Link>
          ) : null}
        </div>
      </div>

      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-[#8A2E2E]">{error}</p> : null}
      {results ? (
        <div className="mt-4">
          {results.finalizedAt ? (
            <p className="mb-4 rounded-lg border border-[#77B98E] bg-[#ECF8EF] p-3 text-sm font-semibold text-[#146233]">
              Finalized {new Date(results.finalizedAt).toLocaleString()} by {results.finalizedByName || "Coach"}.
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded bg-[#F6F1E6] p-3"><p className="text-xs text-[#51635C]">Session</p><p className="font-black capitalize">{results.sessionStatus}</p></div>
            <div className="rounded bg-[#F6F1E6] p-3"><p className="text-xs text-[#51635C]">Player progress</p><p className="font-black">{results.readiness.playerRoundAssignments}/{results.readiness.expectedPlayerRoundAssignments}</p></div>
            <div className="rounded bg-[#F6F1E6] p-3"><p className="text-xs text-[#51635C]">Scorecards</p><p className="font-black">{results.readiness.scorecards}/{results.readiness.expectedScorecards}</p></div>
            <div className="rounded bg-[#F6F1E6] p-3"><p className="text-xs text-[#51635C]">Submitted</p><p className="font-black">{results.readiness.submittedSegments}/{results.readiness.requiredSubmittedSegments}</p></div>
            <div className="rounded bg-[#F6F1E6] p-3"><p className="text-xs text-[#51635C]">Unresolved</p><p className="font-black">{results.readiness.unresolvedDiscrepancies}</p></div>
            <div className="rounded bg-[#F6F1E6] p-3"><p className="text-xs text-[#51635C]">Readiness</p><p className="font-black">{results.readiness.ready ? "Ready" : "In progress"}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Qualifying results">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "combined"}
              onClick={() => setActiveTab("combined")}
              className={`rounded-lg px-3 py-2 text-xs font-black ${activeTab === "combined" ? "bg-[#0B3D2E] text-white" : "border border-[#D9D0C0]"}`}
            >
              Combined
            </button>
            {results.days.map((day) => (
              <button
                key={day.dayNumber}
                type="button"
                role="tab"
                aria-selected={activeTab === `day-${day.dayNumber}`}
                onClick={() => setActiveTab(`day-${day.dayNumber}`)}
                className={`rounded-lg px-3 py-2 text-xs font-black ${activeTab === `day-${day.dayNumber}` ? "bg-[#0B3D2E] text-white" : "border border-[#D9D0C0]"}`}
              >
                Day {day.dayNumber}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <ResultsTable
              players={
                activeTab === "combined"
                  ? results.combined
                  : results.days.find((day) => `day-${day.dayNumber}` === activeTab)?.players ?? []
              }
            />
          </div>
          {!historyMode && !isFinalized && results.readiness.ready ? (
            <button
              type="button"
              onClick={() => void handleFinalize()}
              disabled={isFinalizing}
              className="mt-4 w-full rounded-lg bg-[#B8892D] px-4 py-3 text-sm font-black text-[#0B3D2E] disabled:opacity-60"
            >
              {isFinalizing ? "Finalizing Qualifying..." : "Finalize Qualifying"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
