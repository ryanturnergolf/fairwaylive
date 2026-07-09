"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { buildAppUrl, buildCurrentBrowserUrl } from "../../../lib/appUrl";
import {
  buildPrintablePairings,
  formatTotalToPar,
  type NormalizedRoundSetup,
} from "../../../lib/services/tournamentDerivedState";
import {
  buildMobileScorecardPath,
  pairingExistsForPlayer,
} from "../../../lib/services/tournamentPageHelpers";
import {
  useBodyOverflowLock,
  useQrCodeDataUrl,
} from "../../../lib/hooks/tournamentPageHooks";
import type { LegacyPairingGroup, LegacyScorecardRow } from "../../../lib/tournamentModel";
import type {
  TournamentReadiness,
  TournamentReadinessChecks,
  TournamentReadinessReason,
} from "../../../lib/services/tournamentReadinessService";
import { createShareToken } from "../../../lib/services/shareTokenService";
import type { ScorecardRow } from "./LiveScoringLeaderboard";

export type ClippdExportState = {
  tournamentId: string;
  tournamentKey: string;
  exportFormat: string;
};

export type ScoreboardImportState = {
  tournamentId: string;
  tournamentKey: string;
  options: {
    tournamentDetails: boolean;
    teams: boolean;
    players: boolean;
    courseSetup: boolean;
    scorecards: boolean;
    teeTimes: boolean;
    startingHoles: boolean;
  };
};

type TournamentMeta = {
  id: string;
  name: string;
  date: string;
  course: string;
  city: string;
  state: string;
  rounds: string;
  scoringFormat: string;
  status: string;
  settings: unknown;
};

type SetState<T> = (value: T | ((current: T) => T)) => void;

type PrintExportControls = {
  onPrintTournamentScorecards: () => void;
  onOpenQrModal: (player: ScorecardRow) => void;
  onOpenPrintScorecardModal: (player: ScorecardRow) => void;
};

type TournamentPrintExportProps = {
  activeTab: "Live Scoring" | "Clippd Export";
  tournamentId: string;
  sharedTournamentId: string;
  tournament: TournamentMeta;
  normalizedRoundSetup: NormalizedRoundSetup;
  pairings: LegacyPairingGroup[];
  scorecardRows: LegacyScorecardRow[];
  clippdExportState: ClippdExportState;
  setClippdExportState: SetState<ClippdExportState>;
  scoreboardImportState: ScoreboardImportState;
  setScoreboardImportState: SetState<ScoreboardImportState>;
  tournamentReadiness: TournamentReadiness | null;
  readinessCheckEntries: [keyof TournamentReadinessChecks, string][];
  readinessBlockingReasons: TournamentReadinessReason[];
  onRefreshReadiness: () => Promise<TournamentReadiness | null>;
  isReadinessRefreshing: boolean;
  children: (controls: PrintExportControls) => ReactNode;
};

const mobileScorecardUrl = "/scorecard/test";

const scoreboardImportOptions: Array<[keyof ScoreboardImportState["options"], string]> = [
  ["tournamentDetails", "Tournament details"],
  ["teams", "Teams"],
  ["players", "Players"],
  ["courseSetup", "Course setup"],
  ["scorecards", "Scorecards"],
  ["teeTimes", "Tee times"],
  ["startingHoles", "Starting holes"],
];

export default function TournamentPrintExport({
  activeTab,
  tournamentId,
  sharedTournamentId,
  tournament,
  normalizedRoundSetup,
  pairings,
  scorecardRows,
  clippdExportState,
  setClippdExportState,
  scoreboardImportState,
  setScoreboardImportState,
  tournamentReadiness,
  readinessCheckEntries,
  readinessBlockingReasons,
  onRefreshReadiness,
  isReadinessRefreshing,
  children,
}: TournamentPrintExportProps) {
  const [isScoreboardImportModalOpen, setIsScoreboardImportModalOpen] = useState(false);
  const [activeQrPlayer, setActiveQrPlayer] = useState<ScorecardRow | null>(null);
  const [blockedQrPlayer, setBlockedQrPlayer] = useState<ScorecardRow | null>(null);
  const [activePrintPlayer, setActivePrintPlayer] = useState<ScorecardRow | null>(null);
  const [activeQrCodeDataUrl, setActiveQrCodeDataUrl] = useState("");
  const [activeQrShareToken, setActiveQrShareToken] = useState("");

  const activeQrPairing = useMemo(() => {
    if (!activeQrPlayer) {
      return null;
    }

    return pairingExistsForPlayer(pairings, activeQrPlayer.playerName) ?? null;
  }, [activeQrPlayer, pairings]);

  const activeQrScoringPlayerId = useMemo(() => {
    if (!activeQrPairing || !activeQrPlayer) {
      return "";
    }

    return (
      activeQrPairing.players.find(
        (player) => player.playerName === activeQrPlayer.playerName && player.teamName === activeQrPlayer.team
      )?.playerId || String(activeQrPlayer.id)
    );
  }, [activeQrPairing, activeQrPlayer]);

  const browserMobileScorecardPath = useMemo(() => {
    return buildMobileScorecardPath({ tournamentId, activeQrPairing, activeQrScoringPlayerId });
  }, [activeQrPairing, activeQrScoringPlayerId, tournamentId]);

  const qrMobileScorecardPath = useMemo(() => {
    return buildMobileScorecardPath({
      shareToken: activeQrShareToken,
      activeQrPairing,
      activeQrScoringPlayerId,
    });
  }, [activeQrPairing, activeQrScoringPlayerId, activeQrShareToken]);

  const resolvedMobileScorecardUrl = useMemo(() => buildAppUrl(qrMobileScorecardPath), [qrMobileScorecardPath]);
  const browserMobileScorecardUrl = useMemo(() => buildCurrentBrowserUrl(browserMobileScorecardPath), [browserMobileScorecardPath]);
  const isQrMobileScorecardReady = Boolean(activeQrShareToken && activeQrPairing && activeQrScoringPlayerId);
  const printablePairings = useMemo(
    () => buildPrintablePairings({ pairings, scorecardRows, normalizedRoundSetup }),
    [normalizedRoundSetup, pairings, scorecardRows]
  );
  const safeScorecardRows = Array.isArray(scorecardRows) ? scorecardRows : [];
  const displayedReadinessBlockers = readinessBlockingReasons.length > 0
    ? readinessBlockingReasons
    : tournamentReadiness?.reasons.filter((reason) => reason.severity !== "pass") ?? [];

  useBodyOverflowLock(Boolean(activeQrPlayer || blockedQrPlayer));
  useEffect(() => {
    let isCancelled = false;

    setActiveQrShareToken("");
    setActiveQrCodeDataUrl("");

    if (!activeQrPlayer || !activeQrPairing || !activeQrScoringPlayerId || !sharedTournamentId) {
      return;
    }

    void createShareToken(sharedTournamentId, "mobile_scoring")
      .then((shareToken) => {
        if (!isCancelled) {
          setActiveQrShareToken(shareToken.token || "");
        }
      })
      .catch((error) => {
        console.warn("[ShareTokenService] Unable to create mobile scoring share token.", error);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeQrPairing, activeQrPlayer, activeQrScoringPlayerId, sharedTournamentId]);

  useQrCodeDataUrl({
    shouldGenerate: Boolean(activeQrPlayer && isQrMobileScorecardReady),
    resolvedMobileScorecardUrl,
    setActiveQrCodeDataUrl,
  });

  const handleClippdInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setClippdExportState((current) => ({ ...current, [name]: value }));
  };

  const handleClippdSave = () => {
    setClippdExportState((current) => ({ ...current }));
  };

  const handleClippdGenerate = () => {
    setClippdExportState((current) => ({ ...current }));
  };

  const handleScoreboardImportInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = event.target;

    if (type === "checkbox") {
      setScoreboardImportState((current) => ({
        ...current,
        options: {
          ...current.options,
          [name]: checked,
        },
      }));
      return;
    }

    setScoreboardImportState((current) => ({ ...current, [name]: value }));
  };

  const closeScoreboardImportModal = () => {
    setIsScoreboardImportModalOpen(false);
  };

  const handleScoreboardImportSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    closeScoreboardImportModal();
  };

  const openQrModal = async (player: ScorecardRow) => {
    const readiness = tournamentReadiness?.isSafeToShare ? tournamentReadiness : await onRefreshReadiness();

    if (!readiness?.isSafeToShare) {
      setActiveQrCodeDataUrl("");
      setActiveQrPlayer(null);
      setBlockedQrPlayer(player);
      return;
    }

    setActiveQrCodeDataUrl("");
    setBlockedQrPlayer(null);
    setActiveQrPlayer(player);
  };

  const closeQrModal = () => {
    setActiveQrCodeDataUrl("");
    setActiveQrPlayer(null);
  };

  const closeReadinessBlockedModal = () => {
    setBlockedQrPlayer(null);
  };

  const handleRefreshBlockedReadiness = async () => {
    const readiness = await onRefreshReadiness();

    if (readiness?.isSafeToShare && blockedQrPlayer) {
      const player = blockedQrPlayer;
      setBlockedQrPlayer(null);
      setActiveQrCodeDataUrl("");
      setActiveQrPlayer(player);
    }
  };

  const openPrintScorecardModal = (player: ScorecardRow) => {
    setActivePrintPlayer(player);
  };

  const closePrintScorecardModal = () => {
    setActivePrintPlayer(null);
  };

  const handlePrintScorecard = () => {
    window.print();
  };

  const handlePrintTournamentScorecards = () => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.classList.add("printing-batch-scorecards");

    try {
      window.print();
    } finally {
      document.body.classList.remove("printing-batch-scorecards");
    }
  };

  const handlePrintFromQrModal = () => {
    if (!activeQrPlayer) {
      return;
    }

    closeQrModal();
    openPrintScorecardModal(activeQrPlayer);
  };

  return (
    <>
      {activeTab === "Clippd Export" ? (
        <div className="space-y-6">
          <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                Clippd Export
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                Prepare tournament results for submission.
              </h3>
            </div>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-[#51635C]">
              Clubhouse HQ can prepare your tournament results for submission to Scoreboard powered by Clippd.
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                <span>Clippd Tournament ID</span>
                <input
                  name="tournamentId"
                  value={clippdExportState.tournamentId}
                  onChange={handleClippdInputChange}
                  className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                  placeholder="e.g. 10482"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                <span>Clippd Tournament Key</span>
                <input
                  name="tournamentKey"
                  value={clippdExportState.tournamentKey}
                  onChange={handleClippdInputChange}
                  className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                  placeholder="e.g. 6f8a2c"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] md:col-span-2">
                <span>Export Format</span>
                <select
                  name="exportFormat"
                  value={clippdExportState.exportFormat}
                  onChange={handleClippdInputChange}
                  className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                >
                  <option>Final Results CSV</option>
                  <option>Hole-by-Hole CSV</option>
                  <option>Team Results CSV</option>
                </select>
              </label>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleClippdSave}
                className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
              >
                Save Clippd Info
              </button>
              <button
                type="button"
                onClick={() => setIsScoreboardImportModalOpen(true)}
                className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
              >
                Import from Scoreboard
              </button>
              <button
                type="button"
                onClick={handleClippdGenerate}
                className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
              >
                Generate Export
              </button>
            </div>
          </div>
        </div>
      ) : (
        children({
          onPrintTournamentScorecards: handlePrintTournamentScorecards,
          onOpenQrModal: openQrModal,
          onOpenPrintScorecardModal: openPrintScorecardModal,
        })
      )}

      {isScoreboardImportModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm"
          onClick={closeScoreboardImportModal}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Scoreboard Import
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    Import Tournament from Scoreboard
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeScoreboardImportModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  &times;
                </button>
              </div>
            </div>

            <form className="px-7 py-7" onSubmit={handleScoreboardImportSubmit}>
              <p className="text-base leading-8 text-[#51635C]">
                Enter your Scoreboard Tournament ID and Tournament Key to import event details, teams, players, course setup, scorecards, tee times, and starting holes.
              </p>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] md:col-span-2">
                  <span>Scoreboard Tournament ID</span>
                  <input
                    name="tournamentId"
                    value={scoreboardImportState.tournamentId}
                    onChange={handleScoreboardImportInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. 10482"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] md:col-span-2">
                  <span>Tournament Key</span>
                  <input
                    name="tournamentKey"
                    value={scoreboardImportState.tournamentKey}
                    onChange={handleScoreboardImportInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. 6f8a2c"
                  />
                </label>
              </div>

              <div className="mt-8">
                <p className="text-sm font-black uppercase tracking-[0.3em] text-[#B8892D]">
                  Import Options
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {scoreboardImportOptions.map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 rounded-2xl border border-[#E8DCC8] bg-white/80 px-4 py-3 text-sm font-semibold text-[#0B3D2E]">
                      <input
                        type="checkbox"
                        name={key}
                        checked={Boolean(scoreboardImportState.options[key])}
                        onChange={handleScoreboardImportInputChange}
                        className="h-4 w-4 rounded border-[#E8DCC8] text-[#0B3D2E] focus:ring-[#0B3D2E]"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeScoreboardImportModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  Import Preview
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {blockedQrPlayer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-8 backdrop-blur-sm"
          onClick={closeReadinessBlockedModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="readiness-blocked-title"
            className="flex max-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Tournament Readiness
                  </p>
                  <h3 id="readiness-blocked-title" className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    Sharing is blocked
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeReadinessBlockedModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                  aria-label="Close readiness modal"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto px-7 py-7">
              <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-[#0B3D2E]">
                      {blockedQrPlayer.playerName}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#51635C]">
                      This tournament is not Ready yet, so QR and mobile scorecard sharing are paused until the checklist passes.
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-[#E0B14F] bg-[#FFF7E3] px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-[#7A5610]">
                    {tournamentReadiness?.status ?? "Checking"}
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#0B3D2E]/65">
                    Checklist
                  </p>
                  <div className="mt-3 grid gap-2">
                    {readinessCheckEntries.map(([checkKey, label]) => {
                      const hasPassed = Boolean(tournamentReadiness?.checks[checkKey]);

                      return (
                        <div key={checkKey} className="flex items-center justify-between gap-3 rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2">
                          <span className="text-xs font-bold text-[#0B3D2E]">{label}</span>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${hasPassed ? "bg-[#ECF8EF] text-[#146233]" : "bg-[#F6F1E6] text-[#725D37]"}`}>
                            {hasPassed ? "Pass" : "Open"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#0B3D2E]/65">
                    Blocking Reasons
                  </p>
                  <div className="mt-3 space-y-2">
                    {displayedReadinessBlockers.length > 0 ? (
                      displayedReadinessBlockers.map((reason) => (
                        <div key={reason.code} className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2">
                          <p className="text-xs font-bold leading-5 text-[#51635C]">
                            {reason.message}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2">
                        <p className="text-xs font-bold leading-5 text-[#51635C]">
                          Readiness is being checked. Refresh to evaluate the latest shared tournament state.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeReadinessBlockedModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleRefreshBlockedReadiness}
                  disabled={isReadinessRefreshing}
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isReadinessRefreshing ? "Refreshing..." : "Refresh Readiness"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeQrPlayer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-8 backdrop-blur-sm"
          onClick={closeQrModal}
        >
          <div
            className="flex max-h-[calc(100vh-4rem)] w-full max-w-xl flex-col overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Mobile Score Entry
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    {activeQrPlayer.playerName}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeQrModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto px-7 py-7">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Player Name</p>
                  <p className="mt-2 font-black text-[#0B3D2E]">{activeQrPlayer.playerName}</p>
                </div>
                <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Team</p>
                  <p className="mt-2 font-black text-[#0B3D2E]">{activeQrPlayer.team}</p>
                </div>
                <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5 md:col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Round</p>
                  <p className="mt-2 font-black text-[#0B3D2E]">{normalizedRoundSetup.roundNumber}</p>
                </div>
              </div>

              <div className="mt-6 rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center shadow-inner">
                <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-[24px] border border-dashed border-[#B8892D] bg-white text-4xl font-black text-[#0B3D2E]">
                  {activeQrCodeDataUrl ? (
                    <Image
                      src={activeQrCodeDataUrl}
                      alt={`QR code for ${activeQrPairing ? `group ${activeQrPairing.groupNumber}` : activeQrPlayer.playerName}`}
                      width={128}
                      height={128}
                      unoptimized
                      className="h-full w-full rounded-[20px] object-contain p-2"
                    />
                  ) : (
                    "..."
                  )}
                </div>
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  {isQrMobileScorecardReady
                    ? `Group ${activeQrPairing?.groupNumber ?? ""} mobile scoring access`
                    : "Preparing mobile scoring access"}
                </p>
                <div className="mt-4 rounded-2xl border border-[#E8DCC8] bg-white/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  {isQrMobileScorecardReady
                    ? `Scorecard URL: ${resolvedMobileScorecardUrl || mobileScorecardUrl}`
                    : "Scorecard URL: Preparing shared link"}
                </div>
              </div>

              <p className="mt-6 text-center text-base leading-8 text-[#51635C]">
                Players simply scan this QR code to enter scores from any phone. No app required.
              </p>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeQrModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Close
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Download QR
                </button>
                <Link
                  href={resolvedMobileScorecardUrl || browserMobileScorecardUrl || mobileScorecardUrl}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Open Mobile Scorecard
                </Link>
                <button
                  type="button"
                  onClick={handlePrintFromQrModal}
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  Print Scorecard
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activePrintPlayer ? (
        <div
          className="print-scorecard-overlay fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm"
          onClick={closePrintScorecardModal}
        >
          <div
            className="print-scorecard-shell w-full max-w-5xl overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="print-hide bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Printable Scorecard
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    {activePrintPlayer.playerName}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closePrintScorecardModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="px-7 py-7">
              <div className="print-scorecard-sheet rounded-[28px] border border-[#E8DCC8] bg-white/80 p-6 shadow-inner">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-sm font-black tracking-[0.25em] text-[#F6F1E6]">
                      HQ
                    </div>
                    <div>
                      <p className="text-lg font-black tracking-[-0.02em] text-[#0B3D2E]">Clubhouse HQ</p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">College Golf Operations</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Tournament</p>
                    <p className="mt-1 font-black text-[#0B3D2E]">{tournament.name}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Round Number</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{normalizedRoundSetup.roundNumber}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Player</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{activePrintPlayer.playerName}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Team</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{activePrintPlayer.team}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Tee Time</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{normalizedRoundSetup.teeTime}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Starting Hole</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{normalizedRoundSetup.startingHole}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Course</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{tournament.course}</p>
                  </div>
                </div>

                <div className="mt-6 overflow-hidden rounded-[24px] border border-[#E8DCC8]">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead className="bg-[#F6F1E6] text-left text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                      <tr>
                        <th className="px-3 py-3">Hole</th>
                        <th className="px-3 py-3">Par</th>
                        <th className="px-3 py-3">Yardage</th>
                        <th className="px-3 py-3">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 18 }, (_, index) => {
                        const holeNumber = index + 1;
                        const score = activePrintPlayer.scores[holeNumber - 1] ?? 0;
                        const scoreDisplay = score > 0 ? score : "";
                        const par = 4;
                        const yardage = 350 + holeNumber * 6;
                        return (
                          <tr key={holeNumber} className="border-t border-[#E8DCC8] bg-white/70">
                            <td className="px-3 py-3 font-black text-[#0B3D2E]">{holeNumber}</td>
                            <td className="px-3 py-3 text-[#51635C]">{par}</td>
                            <td className="px-3 py-3 text-[#51635C]">{yardage}</td>
                            <td className="px-3 py-3 font-black text-[#0B3D2E]">{scoreDisplay}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Front 9 Total</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{activePrintPlayer.scores.slice(0, 9).reduce((sum, score) => sum + score, 0)}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Back 9 Total</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{activePrintPlayer.scores.slice(9, 18).reduce((sum, score) => sum + score, 0)}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Overall Total</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{activePrintPlayer.scores.reduce((sum, score) => sum + score, 0)}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">To Par</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{formatTotalToPar(activePrintPlayer.scores.reduce((sum, score) => sum + score, 0))}</p>
                  </div>
                  <div className="rounded-full border border-[#E8DCC8] bg-white px-4 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    Notes
                  </div>
                </div>

                <div className="mt-6 rounded-[24px] border border-[#E8DCC8] bg-[#FCFAF5] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Notes</p>
                  <div className="print-notes-area mt-3 min-h-20 rounded-[18px] border border-dashed border-[#E8DCC8] bg-white/80 p-4 text-sm text-[#51635C]">
                    Add notes for the player or round here.
                  </div>
                </div>
              </div>

              <div className="print-hide mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closePrintScorecardModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handlePrintScorecard}
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  Print
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="print-batch-scorecards-root hidden">
        {printablePairings.map((pairing) => {
          const pairingPlayers = Array.isArray(pairing.players) ? pairing.players : [];

          const rowsForGroup = pairingPlayers.map((player) => {
            const matchingScorecardRow = safeScorecardRows.find((row) => row.playerName === player.playerName);
            const scores = Array.from({ length: 18 }, (_, index) => matchingScorecardRow?.scores[index] ?? 0);
            const total = scores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0);

            return {
              playerName: player.playerName,
              teamName: player.teamName,
              scores,
              total,
            };
          });

          return (
            <article key={`print-group-${pairing.groupNumber}`} className="print-batch-sheet mb-8 border border-black p-4 text-black">
              <header className="mb-4 border-b border-black pb-2">
                <h2 className="text-xl font-black">{tournament.name}</h2>
                <p className="mt-1 text-sm font-semibold">Round {normalizedRoundSetup.roundNumber}</p>
                <p className="text-sm font-semibold">Group {pairing.groupNumber}</p>
                <p className="text-sm font-semibold">Players: {pairingPlayers.map((player) => player.playerName).join(", ")}</p>
              </header>

              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-1 text-left">Player</th>
                    {Array.from({ length: 18 }, (_, index) => (
                      <th key={`print-hole-${pairing.groupNumber}-${index + 1}`} className="border border-black px-2 py-1 text-center">
                        {index + 1}
                      </th>
                    ))}
                    <th className="border border-black px-2 py-1 text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-1 font-semibold">Par</td>
                    {Array.from({ length: 18 }, (_, index) => (
                      <td key={`print-par-${pairing.groupNumber}-${index + 1}`} className="border border-black px-2 py-1 text-center">
                        4
                      </td>
                    ))}
                    <td className="border border-black px-2 py-1 text-center font-semibold">72</td>
                  </tr>

                  {rowsForGroup.map((row) => (
                    <tr key={`print-player-row-${pairing.groupNumber}-${row.playerName}`}>
                      <td className="border border-black px-2 py-1">
                        <div className="font-semibold">{row.playerName}</div>
                        <div className="text-[10px]">{row.teamName}</div>
                      </td>
                      {row.scores.map((score, index) => (
                        <td key={`print-score-${pairing.groupNumber}-${row.playerName}-${index + 1}`} className="border border-black px-2 py-1 text-center">
                          {score > 0 ? score : ""}
                        </td>
                      ))}
                      <td className="border border-black px-2 py-1 text-center font-semibold">{row.total > 0 ? row.total : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          );
        })}
      </section>
    </>
  );
}
