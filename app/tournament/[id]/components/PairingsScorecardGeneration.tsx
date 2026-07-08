"use client";

import type { ChangeEvent, FormEvent } from "react";
import type { NormalizedRoundSetup } from "../../../lib/services/tournamentDerivedState";

export type PairingGroupPlayer = {
  playerId: string;
  playerName: string;
  teamName: string;
};

export type PairingGroup = {
  groupNumber: number;
  teeTime: string;
  startingHole: string;
  players: PairingGroupPlayer[];
};

export type RoundSetupState = {
  roundNumber: string;
  startingHole: string;
  numberOfHoles: string;
  teeTime: string;
  countingScores: string;
};

export type AutoRepairState = {
  sourceRound: string;
  targetRound: string;
  pairingOrder: string;
  teeTimeInterval: string;
};

type PairingsScorecardGenerationProps =
  | {
      activeTab: "Pairings";
      pairings: PairingGroup[];
      pairingsMessage: string;
      isAutoRepairModalOpen: boolean;
      autoRepairState: AutoRepairState;
      onGeneratePairings: () => void;
      onOpenAutoRepairModal: () => void;
      onCloseAutoRepairModal: () => void;
      onAutoRepairInputChange: (event: ChangeEvent<HTMLSelectElement>) => void;
      onAutoRepairSubmit: (event: FormEvent<HTMLFormElement>) => void;
      onMovePlayerWithinPairing: (pairingIndex: number, playerIndex: number, direction: -1 | 1) => void;
      onMovePlayerBetweenPairings: (pairingIndex: number, playerIndex: number, direction: -1 | 1) => void;
    }
  | {
      activeTab: "Live Scoring";
      normalizedRoundSetup: NormalizedRoundSetup;
      scorecardsGenerated: boolean;
      onPrintTournamentScorecards: () => void;
      onGenerateScorecards: () => void;
      onRoundSetupChange: (event: ChangeEvent<HTMLInputElement>) => void;
    };

export default function PairingsScorecardGeneration(props: PairingsScorecardGenerationProps) {
  if (props.activeTab === "Pairings") {
    const {
      pairings,
      pairingsMessage,
      isAutoRepairModalOpen,
      autoRepairState,
      onGeneratePairings,
      onOpenAutoRepairModal,
      onCloseAutoRepairModal,
      onAutoRepairInputChange,
      onAutoRepairSubmit,
      onMovePlayerWithinPairing,
      onMovePlayerBetweenPairings,
    } = props;

    return (
      <>
        <div className="space-y-6">
        <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                Pairings
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                Create and refine your tee-time flow.
              </h3>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onGeneratePairings}
                className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
              >
                Generate Pairings
              </button>
              <button
                type="button"
                onClick={onOpenAutoRepairModal}
                className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
              >
                Auto Re-Pair by Results
              </button>
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-[#51635C]">
            Pairings will be generated from your tournament field and updated as your event evolves. This experience is UI-only for now.
          </p>

          <div className="mt-6 rounded-[24px] border border-[#E8DCC8] bg-white/80 p-6 shadow-inner">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
              Draft Schedule Preview
            </p>
            {pairingsMessage ? (
              <div className="mt-4 rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] px-6 py-5 text-center text-sm font-semibold uppercase tracking-[0.25em] text-[#0B3D2E]">
                {pairingsMessage}
              </div>
            ) : null}

            {pairings.length > 0 ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {/* TODO: Rebuild pairing drag-and-drop with a dedicated library such as dnd-kit. */}
                {pairings.map((pairing, pairingIndex) => (
                  <div
                    key={pairing.groupNumber}
                    className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Group {pairing.groupNumber}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                        <span className="rounded-full border border-[#E8DCC8] bg-white px-3 py-1">{pairing.teeTime}</span>
                        <span className="rounded-full border border-[#E8DCC8] bg-white px-3 py-1">Hole {pairing.startingHole}</span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {pairing.players.map((player, playerIndex) => (
                        <div
                          key={`${pairing.groupNumber}-${player.playerName}`}
                          className="rounded-2xl border border-[#E8DCC8] bg-white/80 px-4 py-3 transition duration-200"
                        >
                          <p className="font-black text-[#0B3D2E]">{player.playerName}</p>
                          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">{player.teamName}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => onMovePlayerBetweenPairings(pairingIndex, playerIndex, -1)}
                              disabled={pairingIndex === 0}
                              className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#F6F1E6] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              ← Group
                            </button>
                            <button
                              type="button"
                              onClick={() => onMovePlayerWithinPairing(pairingIndex, playerIndex, -1)}
                              disabled={playerIndex === 0}
                              className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#F6F1E6] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => onMovePlayerWithinPairing(pairingIndex, playerIndex, 1)}
                              disabled={playerIndex === pairing.players.length - 1}
                              className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#F6F1E6] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => onMovePlayerBetweenPairings(pairingIndex, playerIndex, 1)}
                              disabled={pairingIndex === pairings.length - 1}
                              className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#F6F1E6] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Group →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : pairingsMessage ? null : (
              <div className="mt-4 rounded-[20px] border border-dashed border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center text-[#51635C]">
                Draft pairing groups will appear here once the next phase is connected.
              </div>
            )}
          </div>
        </div>
        </div>

        {isAutoRepairModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm"
            onClick={onCloseAutoRepairModal}
          >
            <div
              className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                      Pairings Automation
                    </p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                      Auto Re-Pair by Results
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseAutoRepairModal}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                  >
                    ×
                  </button>
                </div>
              </div>

              <form className="px-7 py-7" onSubmit={onAutoRepairSubmit}>
                <p className="text-base leading-8 text-[#51635C]">
                  After a completed round, Clubhouse HQ will automatically reorder teams and players based on results. Worst teams go out first. Leading teams go out last. Players are also reordered within team groups from highest score to lowest score.
                </p>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    <span>Source Round</span>
                    <select
                      name="sourceRound"
                      value={autoRepairState.sourceRound}
                      onChange={onAutoRepairInputChange}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    >
                      <option>Round 1</option>
                      <option>Round 2</option>
                      <option>Round 3</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    <span>Target Round</span>
                    <select
                      name="targetRound"
                      value={autoRepairState.targetRound}
                      onChange={onAutoRepairInputChange}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    >
                      <option>Round 2</option>
                      <option>Round 3</option>
                      <option>Round 4</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    <span>Pairing Order</span>
                    <select
                      name="pairingOrder"
                      value={autoRepairState.pairingOrder}
                      onChange={onAutoRepairInputChange}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    >
                      <option>Worst to Best</option>
                      <option>Best to Worst</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    <span>Tee Time Interval</span>
                    <select
                      name="teeTimeInterval"
                      value={autoRepairState.teeTimeInterval}
                      onChange={onAutoRepairInputChange}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    >
                      <option>8 minutes</option>
                      <option>9 minutes</option>
                      <option>10 minutes</option>
                      <option>12 minutes</option>
                    </select>
                  </label>
                </div>

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={onCloseAutoRepairModal}
                    className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                  >
                    Generate Draft Pairings
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  const {
    normalizedRoundSetup,
    scorecardsGenerated,
    onPrintTournamentScorecards,
    onGenerateScorecards,
    onRoundSetupChange,
  } = props;

  return (
    <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
            Live Scoring
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
            Round Setup
          </h3>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onPrintTournamentScorecards}
            className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
          >
            Print Scorecards
          </button>
          <button
            type="button"
            onClick={onGenerateScorecards}
            className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
          >
            {scorecardsGenerated ? "Regenerate Scorecards" : "Generate Scorecards"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
          <span>Round Number</span>
          <input
            name="roundNumber"
            value={normalizedRoundSetup.roundNumber}
            onChange={onRoundSetupChange}
            className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
          <span>Starting Hole</span>
          <input
            name="startingHole"
            value={normalizedRoundSetup.startingHole}
            onChange={onRoundSetupChange}
            className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
          <span>Number of Holes</span>
          <input
            name="numberOfHoles"
            value={normalizedRoundSetup.numberOfHoles}
            onChange={onRoundSetupChange}
            className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
          <span>Tee Time</span>
          <input
            name="teeTime"
            value={normalizedRoundSetup.teeTime}
            onChange={onRoundSetupChange}
            className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
          <span>Counting Scores</span>
          <input
            name="countingScores"
            type="number"
            min="1"
            max="6"
            value={normalizedRoundSetup.countingScores}
            onChange={onRoundSetupChange}
            className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
          />
        </label>
      </div>
    </div>
  );
}
