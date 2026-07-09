"use client";

import { useMemo, type ChangeEvent } from "react";
import {
  buildIndividualLeaderboard,
  buildTeamLeaderboard,
  calculateTotal,
  formatTotalToPar,
  type NormalizedRoundSetup,
} from "../../../lib/services/tournamentDerivedState";
import PairingsScorecardGeneration from "./PairingsScorecardGeneration";

export type ScorecardRow = {
  id: number;
  playerName: string;
  team: string;
  scores: number[];
};

type LiveScoringLeaderboardProps = {
  normalizedRoundSetup: NormalizedRoundSetup;
  scorecardsGenerated: boolean;
  scorecardRows: ScorecardRow[];
  onPrintTournamentScorecards: () => void;
  onGenerateScorecards: () => void;
  onRoundSetupChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onScoreInputChange: (rowId: number, holeIndex: number, value: string) => void;
  onOpenQrModal: (player: ScorecardRow) => void;
  onOpenPrintScorecardModal: (player: ScorecardRow) => void;
  isReadOnly?: boolean;
};

export default function LiveScoringLeaderboard({
  normalizedRoundSetup,
  scorecardsGenerated,
  scorecardRows,
  onPrintTournamentScorecards,
  onGenerateScorecards,
  onRoundSetupChange,
  onScoreInputChange,
  onOpenQrModal,
  onOpenPrintScorecardModal,
  isReadOnly = false,
}: LiveScoringLeaderboardProps) {
  const displayHoleCount = normalizedRoundSetup.numberOfHoles;
  const countingScores = normalizedRoundSetup.countingScores;

  const individualLeaderboard = useMemo(
    () => buildIndividualLeaderboard({ scorecardsGenerated, scorecardRows, displayHoleCount }),
    [displayHoleCount, scorecardRows, scorecardsGenerated]
  );

  const teamLeaderboard = useMemo(
    () => buildTeamLeaderboard({ scorecardsGenerated, scorecardRows, displayHoleCount, countingScores }),
    [countingScores, displayHoleCount, scorecardRows, scorecardsGenerated]
  );

  return (
    <div className="space-y-6">
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
          This tournament is finalized. Score entry is locked, but leaderboards, scorecards, QR viewing, and print tools remain available.
        </div>
      ) : null}
      {scorecardsGenerated ? (
        scorecardRows.length > 0 ? (
          <div className="space-y-6">
            <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
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

            <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
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
            </div>

            <div className="overflow-hidden rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead className="bg-[#F6F1E6] text-left text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                    <tr>
                      <th className="px-4 py-4">Player Name</th>
                      <th className="px-4 py-4">Team</th>
                      {Array.from({ length: displayHoleCount }, (_, index) => (
                        <th key={index + 1} className="px-2 py-4 text-center">
                          {index + 1}
                        </th>
                      ))}
                      <th className="px-4 py-4 text-center">Total</th>
                      <th className="px-4 py-4 text-center">To Par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorecardRows.map((row) => {
                      const total = calculateTotal(row.scores);
                      const toPar = formatTotalToPar(total);

                      return (
                        <tr key={row.id} className="border-t border-[#E8DCC8] bg-white/70">
                          <td className="px-4 py-4 font-black text-[#0B3D2E]">
                            <div className="flex items-center gap-3">
                              <span>{row.playerName}</span>
                              <button
                                type="button"
                                onClick={() => onOpenQrModal(row)}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E8DCC8] bg-[#FCFAF5] text-sm font-black text-[#0B3D2E] transition duration-300 hover:bg-[#E8DCC8]"
                                aria-label={`Open QR code for ${row.playerName}`}
                              >
                                ⬢
                              </button>
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
