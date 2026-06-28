"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  loadTournamentStateFromStorage,
  loadTournamentsFromStorage,
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

    const featuredPlayer = pairing.players[0];
    const holeCount = Math.max(1, Math.min(18, Number(tournamentState.scorecards?.roundSetup?.numberOfHoles) || 18));

    return {
      playerId: routePlayerId || `group-${pairing.groupNumber}`,
      tournamentName: tournament.name,
      playerName: featuredPlayer.playerName,
      team: featuredPlayer.teamName,
      round: tournamentState.scorecards?.roundSetup?.roundNumber || "1",
      holes: defaultHoles.slice(0, holeCount),
    } satisfies PlayerScorecard;
  }, [requestedTournamentId, requestedPairingId, routePlayerId]);

  const scorecard = (qrResolvedScorecard && "error" in qrResolvedScorecard
    ? fallbackScorecard
    : qrResolvedScorecard ?? sampleScorecards[routePlayerId || ""] ?? fallbackScorecard);

  const [scores, setScores] = useState<number[]>(Array.from({ length: scorecard.holes.length }, () => 0));
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [savedHoles, setSavedHoles] = useState<number[]>([]);
  const [submitMessage, setSubmitMessage] = useState("");

  const currentHole = scorecard.holes[currentHoleIndex];

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

  const handleSaveHole = () => {
    setSavedHoles((current) => {
      if (current.includes(currentHole.holeNumber)) {
        return current;
      }
      return [...current, currentHole.holeNumber];
    });
    setSubmitMessage("");
  };

  const handlePreviousHole = () => {
    setCurrentHoleIndex((current) => Math.max(current - 1, 0));
  };

  const handleNextHole = () => {
    setCurrentHoleIndex((current) => Math.min(current + 1, scorecard.holes.length - 1));
  };

  const handleSubmitRound = () => {
    const roundNumber = String(Number(scorecard.round) || 1);
    const roundId = `round-${roundNumber}`;

    if (!requestedTournamentId || !routePlayerId) {
      setSubmitMessage("Unable to save this round.");
      return;
    }

    const saved = mergeTournamentScoreSubmission(requestedTournamentId, routePlayerId, roundId, scores);

    if (!saved) {
      setSubmitMessage("Unable to save this round.");
      return;
    }

    setSubmitMessage("Round submitted locally. Network sync will be connected in a future phase.");
  };

  const isHoleSaved = savedHoles.includes(currentHole.holeNumber);

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
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
            Through {totals.playedHoles}/18
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
            Score
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

          <button
            type="button"
            onClick={handleSaveHole}
            className="mt-4 w-full rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 active:translate-y-0.5"
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
          onClick={handleSubmitRound}
          className="mt-5 w-full rounded-full bg-[#B8892D] px-6 py-4 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] shadow-lg shadow-[#B8892D]/20 transition duration-300 active:translate-y-0.5"
        >
          Submit Round
        </button>

        {submitMessage ? (
          <div className="mt-4 rounded-2xl border border-[#E8DCC8] bg-white/90 px-4 py-3 text-center text-sm font-semibold text-[#0B3D2E]">
            {submitMessage}
          </div>
        ) : null}
      </section>
    </main>
  );
}
