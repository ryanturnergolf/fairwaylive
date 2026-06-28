"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  loadTournamentStateFromStorage,
  loadTournamentsFromStorage,
  loadTournamentStorageEnvelope,
  mergeTournamentScoreSubmission,
} from "../../lib/tournamentStorage";

type Hole = {
  holeNumber: number;
  par: number;
  yardage: number;
};

type PlayerScorecard = {
  playerId: string;
  tournamentName: string;
  playerName: string;
  team: string;
  round: string;
  holes: Hole[];
  markerPlayerId?: string;
  markerPlayerName?: string;
  markerTeam?: string;
};

type PairingGroup = {
  groupNumber: number;
  teeTime: string;
  startingHole: string;
  players: Array<{
    playerName: string;
    teamName: string;
  }>;
};

type PersistedTournamentState = {
  pairings: PairingGroup[];
  scorecards: {
    roundSetup: {
      roundNumber: string;
      numberOfHoles: string;
    };
  };
};

const defaultHoles: Hole[] = [
  { holeNumber: 1, par: 4, yardage: 382 },
  { holeNumber: 2, par: 5, yardage: 518 },
  { holeNumber: 3, par: 3, yardage: 177 },
  { holeNumber: 4, par: 4, yardage: 401 },
  { holeNumber: 5, par: 4, yardage: 429 },
  { holeNumber: 6, par: 5, yardage: 542 },
  { holeNumber: 7, par: 3, yardage: 189 },
  { holeNumber: 8, par: 4, yardage: 413 },
  { holeNumber: 9, par: 4, yardage: 396 },
  { holeNumber: 10, par: 4, yardage: 404 },
  { holeNumber: 11, par: 5, yardage: 531 },
  { holeNumber: 12, par: 3, yardage: 171 },
  { holeNumber: 13, par: 4, yardage: 412 },
  { holeNumber: 14, par: 4, yardage: 438 },
  { holeNumber: 15, par: 4, yardage: 393 },
  { holeNumber: 16, par: 3, yardage: 205 },
  { holeNumber: 17, par: 5, yardage: 556 },
  { holeNumber: 18, par: 4, yardage: 421 },
];

const sampleScorecards: Record<string, PlayerScorecard> = {
  "101": {
    playerId: "101",
    tournamentName: "Buckeye College Invitational",
    playerName: "Miles Carter",
    team: "Bluffton University",
    round: "1",
    holes: defaultHoles,
  },
  "102": {
    playerId: "102",
    tournamentName: "Buckeye College Invitational",
    playerName: "Ethan Brooks",
    team: "Ohio Northern University",
    round: "1",
    holes: defaultHoles,
  },
};

const fallbackScorecard: PlayerScorecard = {
  playerId: "demo",
  tournamentName: "Buckeye College Invitational",
  playerName: "Demo Player",
  team: "Clubhouse HQ",
  round: "1",
  holes: defaultHoles,
};

const formatToPar = (value: number) => {
  if (value === 0) {
    return "E";
  }
  return value > 0 ? `+${value}` : `${value}`;
};

export default function PlayerScorecardPage() {
  const params = useParams<{ playerId: string }>();
  const searchParams = useSearchParams();
  const routePlayerId = Array.isArray(params?.playerId) ? params.playerId[0] : params?.playerId;
  const requestedTournamentId = searchParams.get("tournamentId") ?? "";
  const requestedPairingId = searchParams.get("pairing") ?? "";

  const qrResolvedScorecard = useMemo(() => {
    if (!requestedTournamentId && !requestedPairingId) {
      return null;
    }

    if (!requestedTournamentId || !requestedPairingId) {
      return { error: "Missing tournament or pairing information in this QR code." } as const;
    }

    const tournament = loadTournamentsFromStorage().find((item) => item.id === requestedTournamentId);
    if (!tournament) {
      return { error: "We could not find that tournament. Please request a new mobile scoring link." } as const;
    }

    const tournamentState = loadTournamentStateFromStorage<PersistedTournamentState>(requestedTournamentId);
    if (!tournamentState || !Array.isArray(tournamentState.pairings) || tournamentState.pairings.length === 0) {
      return { error: "This tournament does not have any saved pairings yet." } as const;
    }

    const pairingNumber = Number(requestedPairingId);
    const pairing = tournamentState.pairings.find((item) => item.groupNumber === pairingNumber);
    if (!pairing || pairing.players.length === 0) {
      return { error: "We could not find that pairing. Please request a new mobile scoring link." } as const;
    }

    const storedEnvelope = loadTournamentStorageEnvelope(requestedTournamentId);
    if (!storedEnvelope || storedEnvelope.tournament.players.length === 0) {
      return { error: "This tournament has no player data. Please request a new mobile scoring link." } as const;
    }

    let selectedPlayer = null;
    let selectedPlayerId = routePlayerId;
    let markerPlayer = null;
    let markerPlayerId: string | undefined;

    if (routePlayerId && !routePlayerId.startsWith("group-")) {
      const matchedPlayer = storedEnvelope.tournament.players.find((p) => String(p.id) === routePlayerId);
      if (matchedPlayer) {
        selectedPlayerId = matchedPlayer.id;
        const matchedInPairing = pairing.players.find(
          (player) =>
            player.playerName === `${matchedPlayer.firstName} ${matchedPlayer.lastName}`.trim() &&
            player.teamName === (storedEnvelope.tournament.teams.find((t) => t.id === matchedPlayer.teamId)?.name || "Unassigned")
        );
        if (matchedInPairing) {
          selectedPlayer = matchedInPairing;
          const selectedIndex = pairing.players.indexOf(matchedInPairing);
          const markerIndex = (selectedIndex + 1) % pairing.players.length;
          const markerPlayerData = pairing.players[markerIndex];
          if (markerPlayerData) {
            const matchedMarker = storedEnvelope.tournament.players.find(
              (p) =>
                `${p.firstName} ${p.lastName}`.trim() === markerPlayerData.playerName &&
                (p.teamId ? storedEnvelope.tournament.teams.find((t) => t.id === p.teamId)?.name : "Unassigned") === markerPlayerData.teamName
            );
            if (matchedMarker) {
              markerPlayerId = matchedMarker.id;
              markerPlayer = markerPlayerData;
            }
          }
        }
      }
    }

    if (!selectedPlayer) {
      return { error: "Invalid scoring link. Please request a new mobile scoring link." } as const;
    }

    const holeCount = Math.max(1, Math.min(18, Number(tournamentState.scorecards?.roundSetup?.numberOfHoles) || 18));

    return {
      playerId: String(selectedPlayerId),
      tournamentName: tournament.name,
      playerName: selectedPlayer.playerName,
      team: selectedPlayer.teamName,
      round: tournamentState.scorecards?.roundSetup?.roundNumber || "1",
      holes: defaultHoles.slice(0, holeCount),
      markerPlayerId,
      markerPlayerName: markerPlayer?.playerName,
      markerTeam: markerPlayer?.teamName,
    } satisfies PlayerScorecard;
  }, [requestedTournamentId, requestedPairingId, routePlayerId]);

  const scorecard = (qrResolvedScorecard && "error" in qrResolvedScorecard
    ? fallbackScorecard
    : qrResolvedScorecard ?? sampleScorecards[routePlayerId || ""] ?? fallbackScorecard);

  const [scores, setScores] = useState<number[]>(Array.from({ length: scorecard.holes.length }, () => 0));
  const [markerScores, setMarkerScores] = useState<number[]>(Array.from({ length: scorecard.holes.length }, () => 0));
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [savedHoles, setSavedHoles] = useState<number[]>([]);
  const [view, setView] = useState<"scoring" | "review" | "submitted">("scoring");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveError, setSaveError] = useState("");

  const currentHole = scorecard.holes[currentHoleIndex];
  const allHolesScored = scorecard.holes.length > 0 && scores.every((s) => s > 0);

  const front9Holes = scorecard.holes.slice(0, 9);
  const back9Holes = scorecard.holes.slice(9);
  const front9Total = scores.slice(0, 9).reduce((sum, s) => sum + (s > 0 ? s : 0), 0);
  const back9Total = scores.slice(9, scorecard.holes.length).reduce((sum, s) => sum + (s > 0 ? s : 0), 0);
  const front9Par = front9Holes.reduce((sum, h) => sum + h.par, 0);
  const back9Par = back9Holes.reduce((sum, h) => sum + h.par, 0);

  const totals = useMemo(() => {
    const playedHoles = scores.filter((score) => score > 0).length;
    const total = scores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0);
    const parPlayed = scorecard.holes.slice(0, playedHoles).reduce((sum, hole) => sum + hole.par, 0);

    return {
      playedHoles,
      total,
      toPar: playedHoles > 0 ? formatToPar(total - parPlayed) : "--",
    };
  }, [scorecard.holes, scores]);

  if (qrResolvedScorecard && "error" in qrResolvedScorecard) {
    return (
      <main className="min-h-screen bg-[#F6F1E6] px-4 py-8 text-[#0B3D2E]">
        <div className="mx-auto max-w-md rounded-[28px] border border-[#E8DCC8] bg-white/90 p-6 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-xs font-black tracking-[0.25em] text-[#F6F1E6]">
              HQ
            </div>
            <div>
              <h1 className="text-sm font-black tracking-[-0.02em]">Clubhouse HQ</h1>
              <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">
                Mobile Scorecard
              </p>
            </div>
          </div>

          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
            Mobile Score Entry Unavailable
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0B3D2E]">
            This scoring link is not valid.
          </h2>
          <p className="mt-4 text-base leading-8 text-[#51635C]">
            {qrResolvedScorecard.error}
          </p>

          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const updateScore = (value: string) => {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

    setScores((current) =>
      current.map((score, index) => (index === currentHoleIndex ? safeValue : score))
    );
  };

  const updateMarkerScore = (value: string) => {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

    setMarkerScores((current) =>
      current.map((score, index) => (index === currentHoleIndex ? safeValue : score))
    );
  };

  const handleSaveHole = () => {
    if (scores[currentHoleIndex] === 0) return;

    setSavedHoles((current) => {
      if (current.includes(currentHole.holeNumber)) return current;
      return [...current, currentHole.holeNumber];
    });
    setSaveError("");

    if (requestedTournamentId && scorecard.playerId) {
      const roundNumber = String(Number(scorecard.round) || 1);
      const roundId = `round-${roundNumber}`;
      
      mergeTournamentScoreSubmission(requestedTournamentId, scorecard.playerId, roundId, scores);
      
      if (scorecard.markerPlayerId && markerScores[currentHoleIndex] > 0) {
        mergeTournamentScoreSubmission(requestedTournamentId, scorecard.markerPlayerId, roundId, markerScores);
      }
    }

    if (currentHoleIndex < scorecard.holes.length - 1) {
      setCurrentHoleIndex((current) => current + 1);
    }
  };

  const handlePreviousHole = () => {
    setCurrentHoleIndex((current) => Math.max(current - 1, 0));
  };

  const handleNextHole = () => {
    setCurrentHoleIndex((current) => Math.min(current + 1, scorecard.holes.length - 1));
  };

  const handleReviewRound = () => {
    setView("review");
    setShowConfirm(false);
    setSaveError("");
  };

  const handleConfirmSubmit = () => {
    if (!requestedTournamentId || !scorecard.playerId) {
      setSaveError("Unable to submit. Please try again.");
      return;
    }
    const roundNumber = String(Number(scorecard.round) || 1);
    const roundId = `round-${roundNumber}`;
    const ok = mergeTournamentScoreSubmission(requestedTournamentId, scorecard.playerId, roundId, scores);
    if (!ok) {
      setSaveError("Unable to submit. Please try again.");
      return;
    }
    setView("submitted");
  };

  const isHoleSaved = savedHoles.includes(currentHole.holeNumber);

  const sharedHeader = (
    <header className="sticky top-0 z-10 border-b border-[#E8DCC8] bg-[#F6F1E6]/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-xs font-black tracking-[0.25em] text-[#F6F1E6]">
            HQ
          </div>
          <div>
            <h1 className="text-sm font-black tracking-[-0.02em]">Clubhouse HQ</h1>
            <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">
              Mobile Scorecard
            </p>
          </div>
        </Link>
        <span className="rounded-full border border-[#E8DCC8] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
          Round {scorecard.round}
        </span>
      </div>
    </header>
  );

  if (view === "submitted") {
    return (
      <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
        {sharedHeader}
        <section className="mx-auto max-w-md px-4 py-5">
          <div className="rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Round Submitted</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              Scorecard Saved
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#51635C]">
              {scorecard.playerName}&rsquo;s round {scorecard.round} scorecard has been recorded.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {front9Holes.length > 0 ? (
                <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Front 9</p>
                  <p className="mt-2 text-lg font-black text-[#0B3D2E]">{front9Total}</p>
                </div>
              ) : null}
              {back9Holes.length > 0 ? (
                <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Back 9</p>
                  <p className="mt-2 text-lg font-black text-[#0B3D2E]">{back9Total}</p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Total</p>
                <p className="mt-2 text-lg font-black text-[#0B3D2E]">{totals.total}</p>
              </div>
            </div>
            <div className="mt-3 rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">
              {totals.toPar} to par
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (view === "review") {
    return (
      <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
        {sharedHeader}
        <section className="mx-auto max-w-md px-4 py-5">
          <div className="rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Review Scorecard</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              {scorecard.playerName}
            </h2>
            <p className="mt-0.5 text-xs text-[#51635C]">{scorecard.team}</p>

            {front9Holes.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Front 9</p>
                <div className="overflow-hidden rounded-2xl border border-[#E8DCC8]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E8DCC8] bg-[#FCFAF5]">
                        <th className="px-3 py-2 text-left font-black uppercase tracking-[0.2em] text-[#51635C]">Hole</th>
                        <th className="px-3 py-2 text-center font-black uppercase tracking-[0.2em] text-[#51635C]">Par</th>
                        <th className="px-3 py-2 text-center font-black uppercase tracking-[0.2em] text-[#51635C]">Score</th>
                        <th className="px-3 py-2 text-center font-black uppercase tracking-[0.2em] text-[#51635C]">+/-</th>
                      </tr>
                    </thead>
                    <tbody>
                      {front9Holes.map((hole, i) => {
                        const score = scores[i];
                        const diff = score > 0 ? score - hole.par : null;
                        return (
                          <tr key={hole.holeNumber} className="border-b border-[#E8DCC8] last:border-0">
                            <td className="px-3 py-2 font-black text-[#0B3D2E]">{hole.holeNumber}</td>
                            <td className="px-3 py-2 text-center text-[#51635C]">{hole.par}</td>
                            <td className="px-3 py-2 text-center font-black text-[#0B3D2E]">{score > 0 ? score : "—"}</td>
                            <td className="px-3 py-2 text-center font-semibold text-[#51635C]">
                              {diff === null ? "—" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-[#FCFAF5]">
                        <td className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#B8892D]" colSpan={2}>Front 9</td>
                        <td className="px-3 py-2 text-center font-black text-[#0B3D2E]">{front9Total}</td>
                        <td className="px-3 py-2 text-center font-semibold text-[#51635C]">
                          {front9Total > 0 ? (front9Total - front9Par === 0 ? "E" : front9Total - front9Par > 0 ? `+${front9Total - front9Par}` : `${front9Total - front9Par}`) : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {back9Holes.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Back 9</p>
                <div className="overflow-hidden rounded-2xl border border-[#E8DCC8]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E8DCC8] bg-[#FCFAF5]">
                        <th className="px-3 py-2 text-left font-black uppercase tracking-[0.2em] text-[#51635C]">Hole</th>
                        <th className="px-3 py-2 text-center font-black uppercase tracking-[0.2em] text-[#51635C]">Par</th>
                        <th className="px-3 py-2 text-center font-black uppercase tracking-[0.2em] text-[#51635C]">Score</th>
                        <th className="px-3 py-2 text-center font-black uppercase tracking-[0.2em] text-[#51635C]">+/-</th>
                      </tr>
                    </thead>
                    <tbody>
                      {back9Holes.map((hole, i) => {
                        const score = scores[9 + i];
                        const diff = score > 0 ? score - hole.par : null;
                        return (
                          <tr key={hole.holeNumber} className="border-b border-[#E8DCC8] last:border-0">
                            <td className="px-3 py-2 font-black text-[#0B3D2E]">{hole.holeNumber}</td>
                            <td className="px-3 py-2 text-center text-[#51635C]">{hole.par}</td>
                            <td className="px-3 py-2 text-center font-black text-[#0B3D2E]">{score > 0 ? score : "—"}</td>
                            <td className="px-3 py-2 text-center font-semibold text-[#51635C]">
                              {diff === null ? "—" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-[#FCFAF5]">
                        <td className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#B8892D]" colSpan={2}>Back 9</td>
                        <td className="px-3 py-2 text-center font-black text-[#0B3D2E]">{back9Total}</td>
                        <td className="px-3 py-2 text-center font-semibold text-[#51635C]">
                          {back9Total > 0 ? (back9Total - back9Par === 0 ? "E" : back9Total - back9Par > 0 ? `+${back9Total - back9Par}` : `${back9Total - back9Par}`) : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#0B3D2E]/20 bg-[#0B3D2E]/5 px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#0B3D2E]">Total</span>
              <div className="text-right">
                <span className="text-xl font-black text-[#0B3D2E]">{totals.total}</span>
                <span className="ml-2 text-sm font-semibold text-[#51635C]">({totals.toPar})</span>
              </div>
            </div>
          </div>

          {!showConfirm ? (
            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setView("scoring")}
                className="w-full rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300"
              >
                Edit Scores
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="w-full rounded-full bg-[#B8892D] px-6 py-4 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] shadow-lg shadow-[#B8892D]/20 transition duration-300 active:translate-y-0.5"
              >
                Submit Round
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-[28px] border border-[#B8892D]/40 bg-[#B8892D]/8 p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Confirm Submission</p>
              <p className="mt-3 text-sm leading-6 text-[#0B3D2E]">
                Please verify all scores are correct before submitting. Incorrect submitted scores may result in disqualification.
              </p>
              {saveError ? (
                <p className="mt-3 text-sm font-semibold text-red-700">{saveError}</p>
              ) : null}
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  className="w-full rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 active:translate-y-0.5"
                >
                  Confirm Submit
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="w-full rounded-full border border-[#E8DCC8] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#51635C] transition duration-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      {sharedHeader}

      <section className="mx-auto max-w-md px-4 py-5">
        <div className="rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
            Tournament
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0B3D2E]">
            {scorecard.tournamentName}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Player</p>
              <p className="mt-2 text-sm font-black text-[#0B3D2E]">{scorecard.playerName}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Team</p>
              <p className="mt-2 text-sm font-black text-[#0B3D2E]">{scorecard.team}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Current Total</p>
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{totals.total}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">To Par</p>
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{totals.toPar}</p>
            </div>
          </div>

          <div className="mt-3 rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">
            Through {totals.playedHoles}/{scorecard.holes.length}
          </div>
        </div>

        <div className="mt-5 rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
              Hole {currentHole.holeNumber}
            </p>
            {isHoleSaved ? (
              <span className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
                Saved
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Hole</p>
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{currentHole.holeNumber}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Par</p>
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{currentHole.par}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Yards</p>
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{currentHole.yardage}</p>
            </div>
          </div>

          <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
            {scorecard.playerName}'s Score
            <input
              type="number"
              min="1"
              max="12"
              value={scores[currentHoleIndex] === 0 ? "" : scores[currentHoleIndex]}
              onChange={(event) => updateScore(event.target.value)}
              placeholder="Enter score"
              className="mt-2 w-full rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-4 text-center text-2xl font-black tracking-[-0.02em] text-[#0B3D2E] outline-none"
            />
          </label>

          {scorecard.markerPlayerName ? (
            <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
              {scorecard.markerPlayerName}'s Score
              <input
                type="number"
                min="1"
                max="12"
                value={markerScores[currentHoleIndex] === 0 ? "" : markerScores[currentHoleIndex]}
                onChange={(event) => updateMarkerScore(event.target.value)}
                placeholder="Enter score"
                className="mt-2 w-full rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-4 text-center text-2xl font-black tracking-[-0.02em] text-[#0B3D2E] outline-none"
              />
            </label>
          ) : null}

          <button
            type="button"
            onClick={handleSaveHole}
            disabled={scores[currentHoleIndex] === 0}
            className="mt-4 w-full rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Hole
          </button>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handlePreviousHole}
              disabled={currentHoleIndex === 0}
              className="rounded-full border border-[#B8892D] px-4 py-3 text-xs font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous Hole
            </button>
            <button
              type="button"
              onClick={handleNextHole}
              disabled={currentHoleIndex === scorecard.holes.length - 1}
              className="rounded-full border border-[#B8892D] px-4 py-3 text-xs font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next Hole
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReviewRound}
          disabled={!allHolesScored}
          className="mt-5 w-full rounded-full bg-[#B8892D] px-6 py-4 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] shadow-lg shadow-[#B8892D]/20 transition duration-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Review &amp; Submit Round
        </button>

        {!allHolesScored ? (
          <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#51635C]">
            Save all {scorecard.holes.length} holes to submit
          </p>
        ) : null}
      </section>
    </main>
  );
}
