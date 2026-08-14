"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resolveShareToken } from "../lib/services/shareTokenService";
import {
  loadShareTokenLeaderboard,
  type ShareTokenLeaderboardReadModel,
} from "../lib/services/shareTokenLeaderboardService";

const invalidLinkMessage =
  "This secure scoring link is invalid or expired. Please request a new QR code.";

const formatLastUpdated = (value: string | null) => {
  if (!value) return "Latest available scores";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Latest available scores"
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

function StandingsTable({
  title,
  rows,
  isTeam = false,
}: {
  title: string;
  rows: Array<{
    position: string;
    playerName?: string;
    team?: string;
    teamName?: string;
    totalScore: number;
    toPar: string;
    through: string;
  }>;
  isTeam?: boolean;
}) {
  return (
    <section className="rounded-[28px] border border-[#E8DCC8] bg-white/90 p-4 shadow-[0_18px_45px_rgba(11,61,46,0.08)] sm:p-6">
      <h2 className="text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">{title}</h2>
      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-[42px_minmax(0,1fr)_58px_54px_62px] gap-2 px-2 text-[9px] font-black uppercase tracking-[0.16em] text-[#6F7C74]">
          <span>Pos</span>
          <span>{isTeam ? "Team" : "Player / Team"}</span>
          <span className="text-center">Score</span>
          <span className="text-center">To Par</span>
          <span className="text-right">Status</span>
        </div>
        {rows.map((row) => (
          <div
            key={`${isTeam ? row.teamName : row.playerName}-${row.position}`}
            className="grid grid-cols-[42px_minmax(0,1fr)_58px_54px_62px] items-center gap-2 rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-2 py-3 text-xs"
          >
            <span className="font-black text-[#0B3D2E]">{row.position}</span>
            <span className="min-w-0">
              <span className="block truncate font-black text-[#0B3D2E]">
                {isTeam ? row.teamName : row.playerName}
              </span>
              {!isTeam && row.team ? (
                <span className="block truncate text-[10px] text-[#6F7C74]">{row.team}</span>
              ) : null}
            </span>
            <span className="text-center font-black text-[#0B3D2E]">{row.totalScore}</span>
            <span className="text-center font-black text-[#B8892D]">{row.toPar}</span>
            <span className="text-right font-semibold text-[#51635C]">
              {row.through === "F" ? "Finished" : row.through}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShareTokenLeaderboardContent() {
  const searchParams = useSearchParams();
  const shareToken = searchParams.get("shareToken") ?? "";
  const requestedRound = Number(searchParams.get("round") ?? "1");
  const roundNumber = Number.isInteger(requestedRound) && requestedRound > 0 ? requestedRound : 1;
  const [model, setModel] = useState<ShareTokenLeaderboardReadModel | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError("");
      setModel(null);
      try {
        const resolution = await resolveShareToken(shareToken);
        if (!resolution) {
          throw new Error(invalidLinkMessage);
        }
        const nextModel = await loadShareTokenLeaderboard({
          tournamentId: resolution.tournamentId,
          roundNumber,
          shareToken,
        });
        if (!nextModel) {
          throw new Error("This tournament leaderboard is unavailable for the requested round.");
        }
        if (!cancelled) setModel(nextModel);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : invalidLinkMessage);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [roundNumber, shareToken]);

  return (
    <main className="min-h-screen bg-[#F6F1E6] px-4 py-5 text-[#0B3D2E]">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0B3D2E] text-xs font-black tracking-[0.2em] text-[#F6F1E6]">
              HQ
            </span>
            <span>
              <span className="block text-sm font-black">Clubhouse HQ</span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.3em] text-[#B8892D]">
                Live Leaderboard
              </span>
            </span>
          </Link>
          <span className="rounded-full border border-[#E8DCC8] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#51635C]">
            Round {roundNumber}
          </span>
        </header>

        {isLoading ? (
          <div role="status" className="mt-8 rounded-[28px] border border-[#E8DCC8] bg-white p-8 text-center">
            <p className="font-black">Loading live leaderboard…</p>
            <p className="mt-2 text-sm text-[#51635C]">Validating your secure tournament link.</p>
          </div>
        ) : error ? (
          <div role="alert" className="mt-8 rounded-[28px] border border-red-200 bg-red-50 p-6">
            <h1 className="text-xl font-black text-red-800">Leaderboard Link Unavailable</h1>
            <p className="mt-3 text-sm leading-6 text-red-700">{error}</p>
          </div>
        ) : model ? (
          <>
            <section className="mt-6 rounded-[28px] border border-[#E8DCC8] bg-[#0B3D2E] p-5 text-[#F6F1E6] shadow-[0_18px_45px_rgba(11,61,46,0.15)] sm:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#F0C96A]">
                {model.isFinalized ? "Final Results" : "Live Tournament"}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-[-0.03em]">{model.tournamentName}</h1>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
                <span>Round {model.roundNumber}</span>
                <span aria-hidden>•</span>
                <span>Updated {formatLastUpdated(model.lastUpdated)}</span>
              </div>
            </section>

            <div className="mt-5 space-y-5">
              {!model.isQualifying && model.teamLeaderboard.length > 0 ? (
                <StandingsTable title="Team Leaderboard" rows={model.teamLeaderboard} isTeam />
              ) : null}
              <StandingsTable title="Individual Leaderboard" rows={model.individualLeaderboard} />
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

export default function ShareTokenLeaderboardPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F6F1E6] px-4 py-12 text-center font-black text-[#0B3D2E]">
          Loading live leaderboard…
        </main>
      }
    >
      <ShareTokenLeaderboardContent />
    </Suspense>
  );
}
