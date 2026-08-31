"use client";

import { useMemo, type ChangeEvent } from "react";
import {
  buildIndividualLeaderboard,
  buildTeamLeaderboard,
  calculateTotal,
  formatScoreToPar,
  type NormalizedRoundSetup,
} from "../../../lib/services/tournamentDerivedState";
import PairingsScorecardGeneration from "./PairingsScorecardGeneration";
import type { OfficialScoreResolutionChoice } from "../../../lib/services/statisticsService";
import type { ScoreHoleEntryRow } from "../../../lib/repositories/statisticsRepository";
import type {
  DynamicStatisticReviewItem,
} from "../../../lib/services/dynamicStatisticsReviewService";
import { buildCourseHoleSequence } from "../../../lib/services/courseService";
import type { EventCourseHoleSnapshot } from "../../../lib/courseModel";
import MultiRoundTournamentLeaderboard from "../../../components/leaderboards/MultiRoundTournamentLeaderboard";
import type { MultiRoundTournamentLeaderboardProjection } from "../../../lib/services/multiRoundLeaderboardService";

export type ScorecardRow = {
  id: number;
  playerName: string;
  team: string;
  scores: number[];
};

export type ReviewResolutionItem = {
  id: string;
  playerId: string;
  playerName: string;
  holeNumber: number;
  displayHoleNumber: number;
  playerScore: number;
  markerScore: number;
  playerEntry: ScoreHoleEntryRow | null;
  markerEntry: ScoreHoleEntryRow | null;
};

type LiveScoringLeaderboardProps = {
  normalizedRoundSetup: NormalizedRoundSetup;
  eventCourseHoles?: EventCourseHoleSnapshot[];
  scorecardsGenerated: boolean;
  scorecardRows: ScorecardRow[];
  leaderboardScorecardRows?: ScorecardRow[];
  multiRoundProjection?: MultiRoundTournamentLeaderboardProjection | null;
  tournamentId?: string;
  onPrintTournamentScorecards: () => void;
  onGenerateScorecards: () => void;
  onRoundSetupChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onScoreInputChange: (rowId: number, holeIndex: number, value: string) => void;
  onOpenQrModal: (player: ScorecardRow) => void;
  onOpenPrintScorecardModal: (player: ScorecardRow) => void;
  isReadOnly?: boolean;
  isQualifyingTournament?: boolean;
  reviewResolutionItems?: ReviewResolutionItem[];
  reviewResolutionMessage?: string;
  reviewOverrideValues?: Record<string, string>;
  reviewOverrideReasons?: Record<string, string>;
  onReviewOverrideValueChange?: (itemId: string, value: string) => void;
  onReviewOverrideReasonChange?: (itemId: string, value: string) => void;
  onResolveReviewItem?: (item: ReviewResolutionItem, choice: OfficialScoreResolutionChoice) => void;
  dynamicStatisticReviewItems?: DynamicStatisticReviewItem[];
  dynamicStatisticReviewMessage?: string;
  dynamicStatisticOverrideValues?: Record<string, string>;
  onDynamicStatisticOverrideValueChange?: (itemId: string, value: string) => void;
  onResolveDynamicStatistic?: (
    item: DynamicStatisticReviewItem,
    choice: "player" | "marker" | "coach_override"
  ) => void;
};

const formatStatisticValue = (value: DynamicStatisticReviewItem["playerValue"]) => {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const statisticStatusLabel: Record<DynamicStatisticReviewItem["status"], string> = {
  match: "Match",
  different: "Different",
  missing: "Missing",
  required_missing: "Required Missing",
};

export default function LiveScoringLeaderboard({
  normalizedRoundSetup,
  eventCourseHoles = [],
  scorecardsGenerated,
  scorecardRows,
  leaderboardScorecardRows = scorecardRows,
  multiRoundProjection = null,
  tournamentId = "",
  onPrintTournamentScorecards,
  onGenerateScorecards,
  onRoundSetupChange,
  onScoreInputChange,
  onOpenQrModal,
  onOpenPrintScorecardModal,
  isReadOnly = false,
  isQualifyingTournament = false,
  reviewResolutionItems = [],
  reviewResolutionMessage = "",
  reviewOverrideValues = {},
  reviewOverrideReasons = {},
  onReviewOverrideValueChange,
  onReviewOverrideReasonChange,
  onResolveReviewItem,
  dynamicStatisticReviewItems = [],
  dynamicStatisticReviewMessage = "",
  dynamicStatisticOverrideValues = {},
  onDynamicStatisticOverrideValueChange,
  onResolveDynamicStatistic,
}: LiveScoringLeaderboardProps) {
  const displayHoleCount = normalizedRoundSetup.numberOfHoles;
  const displayHoleNumbers = useMemo(
    () => buildCourseHoleSequence(normalizedRoundSetup.startingHole, displayHoleCount),
    [displayHoleCount, normalizedRoundSetup.startingHole]
  );
  const countingScores = normalizedRoundSetup.countingScores;
  const roundPars = useMemo(() => {
    const parsByHole = new Map(eventCourseHoles.map((hole) => [hole.holeNumber, hole.par]));
    return displayHoleNumbers.map((holeNumber) => parsByHole.get(holeNumber) || 4);
  }, [displayHoleNumbers, eventCourseHoles]);

  const individualLeaderboard = useMemo(
    () => buildIndividualLeaderboard({ scorecardsGenerated, scorecardRows: leaderboardScorecardRows, displayHoleCount, roundPars }),
    [displayHoleCount, leaderboardScorecardRows, roundPars, scorecardsGenerated]
  );

  const teamLeaderboard = useMemo(
    () => buildTeamLeaderboard({
      scorecardsGenerated,
      scorecardRows: leaderboardScorecardRows,
      displayHoleCount,
      countingScores,
      roundPars,
    }),
    [countingScores, displayHoleCount, leaderboardScorecardRows, roundPars, scorecardsGenerated]
  );

  return (
    <div className="space-y-6" aria-label="Tournament live scoring workspace">
      <PairingsScorecardGeneration
        activeTab="Live Scoring"
        normalizedRoundSetup={normalizedRoundSetup}
        scorecardsGenerated={scorecardsGenerated}
        onPrintTournamentScorecards={onPrintTournamentScorecards}
        onGenerateScorecards={onGenerateScorecards}
        onRoundSetupChange={onRoundSetupChange}
        isReadOnly={isReadOnly}
      />
      {isReadOnly ? (
        <div className="rounded-[24px] border border-[#77B98E] bg-[#ECF8EF] px-5 py-4 text-sm font-semibold text-[#146233]">
          This tournament is finalized. Score entry is locked, but leaderboards, scorecards, print tools, and reports remain available.
        </div>
      ) : null}
      {reviewResolutionItems.length > 0 ? (
        <section className="rounded-[28px] border border-[#E0B14F] bg-[#FFFDF7] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                Official Review
              </p>
              <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                Resolve Score Discrepancies
              </h4>
            </div>
            <span className="rounded-full border border-[#E0B14F] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#725D37]">
              {reviewResolutionItems.length} Open
            </span>
          </div>
          {reviewResolutionMessage ? (
            <p className="mt-4 rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-sm font-bold text-[#51635C]">
              {reviewResolutionMessage}
            </p>
          ) : null}
          <div className="mt-5 space-y-4">
            {reviewResolutionItems.map((item) => (
              <div key={item.id} className="rounded-[20px] border border-[#E8DCC8] bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                      Hole {item.displayHoleNumber}
                    </p>
                    <p className="mt-1 text-lg font-black text-[#0B3D2E]">{item.playerName}</p>
                    <p className="mt-1 text-sm font-semibold text-[#51635C]">
                      Player {item.playerScore} vs Marker {item.markerScore}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onResolveReviewItem?.(item, "marker")}
                      disabled={isReadOnly}
                      className="rounded-full border border-[#0B3D2E] px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#0B3D2E] transition duration-300 hover:bg-[#ECF8EF] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Accept Marker Score
                    </button>
                    <button
                      type="button"
                      onClick={() => onResolveReviewItem?.(item, "player")}
                      disabled={isReadOnly}
                      className="rounded-full border border-[#0B3D2E] px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#0B3D2E] transition duration-300 hover:bg-[#ECF8EF] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Accept Player Score
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[140px_1fr_auto] md:items-end">
                  <label className="text-xs font-black uppercase tracking-[0.2em] text-[#51635C]">
                    Coach Score
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={reviewOverrideValues[item.id] ?? ""}
                      onChange={(event) => onReviewOverrideValueChange?.(item.id, event.target.value)}
                      disabled={isReadOnly}
                      className="mt-2 h-11 w-full rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-4 text-sm font-black text-[#0B3D2E] outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="text-xs font-black uppercase tracking-[0.2em] text-[#51635C]">
                    Override Reason
                    <input
                      type="text"
                      value={reviewOverrideReasons[item.id] ?? ""}
                      onChange={(event) => onReviewOverrideReasonChange?.(item.id, event.target.value)}
                      disabled={isReadOnly}
                      className="mt-2 h-11 w-full rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-4 text-sm font-semibold text-[#0B3D2E] outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onResolveReviewItem?.(item, "coach_override")}
                    disabled={isReadOnly}
                    className="h-11 rounded-full bg-[#0B3D2E] px-5 text-[10px] font-black uppercase tracking-[0.22em] text-[#F6F1E6] transition duration-300 hover:bg-[#12543F] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Enter Coach Override
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : reviewResolutionMessage ? (
        <div className="rounded-[24px] border border-[#77B98E] bg-[#ECF8EF] px-5 py-4 text-sm font-semibold text-[#146233]">
          {reviewResolutionMessage}
        </div>
      ) : null}
      {dynamicStatisticReviewItems.length > 0 ? (
        <section className="rounded-[28px] border border-[#7DA7BE] bg-[#F7FCFE] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#255D78]">
                Dynamic Statistics Review
              </p>
              <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                Player and Marker Values
              </h4>
            </div>
            <span className="rounded-full border border-[#7DA7BE] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#255D78]">
              Assigned Package
            </span>
          </div>
          {dynamicStatisticReviewMessage ? (
            <p className="mt-4 rounded-2xl border border-[#C8DCE7] bg-white px-4 py-3 text-sm font-bold text-[#51635C]">
              {dynamicStatisticReviewMessage}
            </p>
          ) : null}
          <div className="mt-5 space-y-4">
            {dynamicStatisticReviewItems.map((item) => (
              <div key={item.id} className="rounded-[20px] border border-[#C8DCE7] bg-white p-4">
                <div className="grid gap-4 lg:grid-cols-[1.4fr_repeat(4,minmax(90px,0.7fr))] lg:items-center">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                      {item.playerName} · Hole {item.displayHoleNumber ?? item.holeNumber}
                    </p>
                    <p className="mt-1 text-lg font-black text-[#0B3D2E]">
                      {item.name}
                      <span className="ml-2 text-xs text-[#B8892D]">
                        {item.isRequired ? "Required" : "Optional"}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">Player Value</p>
                    <p className="mt-1 font-black text-[#0B3D2E]">{formatStatisticValue(item.playerValue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">Marker Value</p>
                    <p className="mt-1 font-black text-[#0B3D2E]">{formatStatisticValue(item.markerValue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">Official Value</p>
                    <p className="mt-1 font-black text-[#0B3D2E]">{formatStatisticValue(item.officialValue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">Status</p>
                    <p className="mt-1 font-black text-[#255D78]">{statisticStatusLabel[item.status]}</p>
                  </div>
                </div>
                {item.playerEntry || item.markerEntry ? (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <button
                      type="button"
                      disabled={isReadOnly || !item.playerEntry}
                      onClick={() => onResolveDynamicStatistic?.(item, "player")}
                      className="h-10 rounded-full border border-[#0B3D2E] px-4 text-[10px] font-black uppercase tracking-[0.2em] text-[#0B3D2E] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Accept Player Value
                    </button>
                    <button
                      type="button"
                      disabled={isReadOnly || !item.markerEntry}
                      onClick={() => onResolveDynamicStatistic?.(item, "marker")}
                      className="h-10 rounded-full border border-[#0B3D2E] px-4 text-[10px] font-black uppercase tracking-[0.2em] text-[#0B3D2E] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Accept Marker Value
                    </button>
                    <label className="min-w-44 text-[10px] font-black uppercase tracking-[0.2em] text-[#51635C]">
                      Corrected Official Value
                      {item.inputType === "option_list" ? (
                        <select
                          value={dynamicStatisticOverrideValues[item.id] ?? ""}
                          onChange={(event) =>
                            onDynamicStatisticOverrideValueChange?.(item.id, event.target.value)
                          }
                          disabled={isReadOnly}
                          className="mt-2 h-10 w-full rounded-full border border-[#C8DCE7] bg-[#FCFAF5] px-3 text-sm text-[#0B3D2E]"
                        >
                          <option value="">Select</option>
                          {item.configuration.options?.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : item.inputType === "checkbox" || item.inputType === "yes_no" ? (
                        <select
                          value={dynamicStatisticOverrideValues[item.id] ?? ""}
                          onChange={(event) =>
                            onDynamicStatisticOverrideValueChange?.(item.id, event.target.value)
                          }
                          disabled={isReadOnly}
                          className="mt-2 h-10 w-full rounded-full border border-[#C8DCE7] bg-[#FCFAF5] px-3 text-sm text-[#0B3D2E]"
                        >
                          <option value="">Select</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={item.configuration.minimum}
                          max={item.configuration.maximum}
                          value={dynamicStatisticOverrideValues[item.id] ?? ""}
                          onChange={(event) =>
                            onDynamicStatisticOverrideValueChange?.(item.id, event.target.value)
                          }
                          disabled={isReadOnly}
                          className="mt-2 h-10 w-full rounded-full border border-[#C8DCE7] bg-[#FCFAF5] px-3 text-sm text-[#0B3D2E]"
                        />
                      )}
                    </label>
                    <button
                      type="button"
                      disabled={isReadOnly || !(dynamicStatisticOverrideValues[item.id] ?? "")}
                      onClick={() => onResolveDynamicStatistic?.(item, "coach_override")}
                      className="h-10 rounded-full bg-[#0B3D2E] px-4 text-[10px] font-black uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {item.officialEntry ? "Correct Official Value" : "Enter Official Value"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {scorecardsGenerated ? (
        leaderboardScorecardRows.length > 0 ? (
          <div className="space-y-6">
            {multiRoundProjection ? (
              <MultiRoundTournamentLeaderboard
                projection={multiRoundProjection}
                eventId={tournamentId}
                hideTeams={isQualifyingTournament}
              />
            ) : <><div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                    Live Leaderboard
                  </p>
                  <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                    Individual Standings
                  </h4>
                </div>
                <div className="rounded-full border border-[#E8DCC8] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                  Updated Live
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead className="bg-[#F6F1E6] text-left text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                    <tr>
                      <th className="px-4 py-4">Position</th>
                      <th className="px-4 py-4">Player</th>
                      <th className="px-4 py-4">Team</th>
                      <th className="px-4 py-4 text-center">Total Score</th>
                      <th className="px-4 py-4 text-center">To Par</th>
                      <th className="px-4 py-4 text-center">Through</th>
                      <th className="px-4 py-4 text-center">Today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {individualLeaderboard.map((player) => (
                      <tr key={player.id} className="border-t border-[#E8DCC8] bg-white/70">
                        <td className="px-4 py-4 font-black text-[#0B3D2E]">{player.position}</td>
                        <td className="px-4 py-4 font-black text-[#0B3D2E]">{player.playerName}</td>
                        <td className="px-4 py-4 text-sm text-[#51635C]">{player.team}</td>
                        <td className="px-4 py-4 text-center font-black text-[#0B3D2E]">{player.totalScore}</td>
                        <td className="px-4 py-4 text-center font-black text-[#B8892D]">{player.toPar}</td>
                        <td className="px-4 py-4 text-center text-sm text-[#51635C]">{player.through}</td>
                        <td className="px-4 py-4 text-center font-black text-[#0B3D2E]">{player.today}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!isQualifyingTournament ? <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                  Team Scores
                </p>
                <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                  Counting Score Total ({countingScores})
                </h4>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead className="bg-[#F6F1E6] text-left text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                    <tr>
                      <th className="px-4 py-4">Position</th>
                      <th className="px-4 py-4">Team Name</th>
                      <th className="px-4 py-4 text-center">Total Score</th>
                      <th className="px-4 py-4 text-center">To Par</th>
                      <th className="px-4 py-4 text-center">Through</th>
                      <th className="px-4 py-4 text-center">Today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamLeaderboard.map((team) => (
                      <tr key={team.teamName} className="border-t border-[#E8DCC8] bg-white/70">
                        <td className="px-4 py-4 font-black text-[#0B3D2E]">{team.position}</td>
                        <td className="px-4 py-4 font-black text-[#0B3D2E]">{team.teamName}</td>
                        <td className="px-4 py-4 text-center font-black text-[#0B3D2E]">{team.totalScore}</td>
                        <td className="px-4 py-4 text-center font-black text-[#B8892D]">{team.toPar}</td>
                        <td className="px-4 py-4 text-center text-sm text-[#51635C]">{team.through}</td>
                        <td className="px-4 py-4 text-center font-black text-[#0B3D2E]">{team.today}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div> : null}</>}

            <div className="overflow-hidden rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead className="bg-[#F6F1E6] text-left text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                    <tr>
                      <th className="px-4 py-4">Player Name</th>
                      <th className="px-4 py-4">Team</th>
                      {displayHoleNumbers.map((holeNumber) => (
                        <th key={holeNumber} className="px-2 py-4 text-center">
                          {holeNumber}
                        </th>
                      ))}
                      <th className="px-4 py-4 text-center">Total</th>
                      <th className="px-4 py-4 text-center">To Par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardScorecardRows.map((row) => {
                      const total = calculateTotal(row.scores);
                      const playedHoles = row.scores.filter((score) => score > 0).length;
                      const playedPar = row.scores.reduce(
                        (sum, score, index) => sum + (score > 0 ? roundPars[index] || 4 : 0),
                        0
                      );
                      const toPar = playedHoles > 0 ? formatScoreToPar(total - playedPar) : "--";

                      return (
                        <tr key={row.id} className="border-t border-[#E8DCC8] bg-white/70">
                          <td className="px-4 py-4 font-black text-[#0B3D2E]">
                            <div className="flex items-center gap-3">
                              <span>{row.playerName}</span>
                              {!isReadOnly ? <button
                                type="button"
                                onClick={() => onOpenQrModal(row)}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E8DCC8] bg-[#FCFAF5] text-sm font-black text-[#0B3D2E] transition duration-300 hover:bg-[#E8DCC8]"
                                aria-label={`Open QR code for ${row.playerName}`}
                              >
                                ⬢
                              </button> : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-[#51635C]">{row.team}</td>
                          {row.scores.map((score, holeIndex) => (
                            <td key={`${row.id}-${holeIndex}`} className="px-2 py-3 text-center">
                              <input
                                type="number"
                                min="1"
                                max="12"
                                 value={score}
                                 onChange={(event) => onScoreInputChange(row.id, holeIndex, event.target.value)}
                                 disabled={isReadOnly}
                                 className="h-9 w-12 rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-2 py-1 text-center text-sm font-semibold text-[#0B3D2E] outline-none"
                              />
                            </td>
                          ))}
                          <td className="px-4 py-4 text-center font-black text-[#0B3D2E]">{total}</td>
                          <td className="px-4 py-4 text-center font-black text-[#B8892D]">{toPar}</td>
                          <td className="px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => onOpenPrintScorecardModal(row)}
                              className="rounded-full border border-[#B8892D] px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                            >
                              Print Scorecard
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center shadow-inner">
            <h4 className="text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
              No players have been added yet.
            </h4>
            <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-[#51635C]">
              Add players in the Players tab first, then generate scorecards for the tournament field.
            </p>
          </div>
        )
      ) : (
        <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center shadow-inner">
          <h4 className="text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
            Scorecards ready to generate.
          </h4>
          <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-[#51635C]">
            Use the button above to generate scorecards for each player in the roster and begin editing strokes hole by hole.
          </p>
        </div>
      )}
    </div>
  );
}
