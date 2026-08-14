"use client";

import Link from "next/link";
import PlayerScoringCodeEntry from "../components/PlayerScoringCodeEntry";

export default function PlayerTournamentLoginPage() {
  return (
    <main className="min-h-screen bg-[#F6F1E6] px-4 py-6 text-[#0B3D2E] sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <Link className="inline-flex items-center gap-3 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B8892D]" href="/">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0B3D2E] text-sm font-black tracking-[0.2em] text-[#F6F1E6]">HQ</span>
          <span>
            <span className="block text-lg font-black">Clubhouse HQ</span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-[#B8892D]">Player Scoring</span>
          </span>
        </Link>

        <section className="mt-8 overflow-hidden rounded-[32px] border border-[#D8C9AE] bg-white shadow-[0_24px_70px_rgba(11,61,46,0.12)]">
          <div className="bg-[#0B3D2E] px-6 py-8 text-[#F6F1E6] sm:px-8">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#F0C96A]">Guest access</p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.03em]">Player Scoring Access</h1>
            <p className="mt-3 leading-7 text-[#F6F1E6]/80">
              Enter the live scoring code provided by your coach or tournament director.
            </p>
          </div>

          <div className="p-6 sm:p-8">
            <PlayerScoringCodeEntry />
          </div>
        </section>

        <p className="mt-6 text-center text-sm text-[#51635C]">
          Coaches and tournament directors can <Link className="font-black text-[#0B3D2E] underline decoration-[#B8892D] underline-offset-4" href="/coach-auth?next=/dashboard">sign in here</Link>.
        </p>
      </div>
    </main>
  );
}
