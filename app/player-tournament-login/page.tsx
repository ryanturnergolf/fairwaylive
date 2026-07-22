"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  normalizeTeamTournamentCode,
  resolveTeamPlayerScorecardPath,
  resolveTeamTournamentCode,
  TEAM_TOURNAMENT_CODE_LENGTH,
  type TeamTournamentLoginResolution,
} from "../lib/services/teamTournamentLoginService";

export default function PlayerTournamentLoginPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [resolution, setResolution] = useState<TeamTournamentLoginResolution | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "invalid_code" | "unavailable">("idle");

  const focusCode = () => requestAnimationFrame(() => inputRef.current?.focus());

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "loading") return;

    setResolution(null);
    if (code.length !== TEAM_TOURNAMENT_CODE_LENGTH) {
      setStatus("invalid_code");
      focusCode();
      return;
    }

    setStatus("loading");
    const result = await resolveTeamTournamentCode(code);
    if (!result.ok) {
      setStatus(result.reason);
      focusCode();
      return;
    }

    setResolution(result.resolution);
    setStatus("idle");
  };

  const changeCode = () => {
    setResolution(null);
    setCode("");
    setStatus("idle");
    focusCode();
  };

  const selectPlayer = (playerId: string) => {
    if (!resolution) return;
    const destination = resolveTeamPlayerScorecardPath(resolution, playerId);
    if (!destination) {
      setResolution(null);
      setStatus("unavailable");
      focusCode();
      return;
    }
    router.push(destination);
  };

  const errorMessage = status === "invalid_code"
    ? "That team scoring code is invalid. Check the code and try again."
    : status === "unavailable"
      ? "Player Tournament Login is temporarily unavailable. Please try again."
      : "";

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
            <h1 className="mt-3 text-3xl font-black tracking-[-0.03em]">Player Tournament Login</h1>
            <p className="mt-3 leading-7 text-[#F6F1E6]/80">
              Enter the team scoring code provided by your coach or tournament director.
            </p>
          </div>

          <div className="p-6 sm:p-8">
            {!resolution ? (
              <form onSubmit={submitCode} noValidate>
                <label className="block text-sm font-black" htmlFor="team-scoring-code">Team scoring code</label>
                <input
                  ref={inputRef}
                  id="team-scoring-code"
                  name="team-scoring-code"
                  aria-describedby="team-code-help team-code-error"
                  aria-invalid={Boolean(errorMessage)}
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="mt-3 w-full rounded-2xl border-2 border-[#C9B997] bg-[#FCFAF5] px-5 py-5 text-center text-3xl font-black uppercase tracking-[0.28em] outline-none transition focus:border-[#B8892D] focus:ring-4 focus:ring-[#B8892D]/15"
                  inputMode="text"
                  placeholder="BX7KM2"
                  spellCheck={false}
                  value={code}
                  onChange={(event) => {
                    setCode(normalizeTeamTournamentCode(event.target.value).slice(0, TEAM_TOURNAMENT_CODE_LENGTH));
                    if (status !== "loading") setStatus("idle");
                  }}
                />
                <p id="team-code-help" className="mt-3 text-center text-sm text-[#51635C]">Six characters · spaces and hyphens are ignored</p>
                {errorMessage ? (
                  <p id="team-code-error" role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
                    {errorMessage}
                  </p>
                ) : <span id="team-code-error" />}
                <button
                  className="mt-6 min-h-14 w-full rounded-full bg-[#0B3D2E] px-6 py-4 text-base font-black text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/20 transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
                  disabled={status === "loading"}
                  type="submit"
                >
                  {status === "loading" ? "Finding Your Team..." : "Find My Team"}
                </button>
              </form>
            ) : (
              <div aria-live="polite">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">{resolution.tournament.name}</p>
                <h2 className="mt-2 break-words text-3xl font-black tracking-[-0.03em]">{resolution.team.name}</h2>
                <p className="mt-3 text-[#51635C]">Select your name to open your scorecard.</p>

                <div className="mt-6 space-y-3">
                  {resolution.players.map((player) => (
                    <button
                      key={player.playerId}
                      className="min-h-16 w-full rounded-2xl border-2 border-[#D8C9AE] bg-[#FCFAF5] px-5 py-4 text-left text-lg font-black shadow-sm transition hover:border-[#B8892D] hover:bg-[#F6F1E6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B8892D]"
                      type="button"
                      onClick={() => selectPlayer(player.playerId)}
                    >
                      {player.playerName}
                    </button>
                  ))}
                </div>

                <button className="mt-6 min-h-12 w-full rounded-full border-2 border-[#0B3D2E] px-6 py-3 font-black transition hover:bg-[#0B3D2E]/5" type="button" onClick={changeCode}>
                  Change Code
                </button>
              </div>
            )}
          </div>
        </section>

        <p className="mt-6 text-center text-sm text-[#51635C]">
          Coaches and tournament directors can <Link className="font-black text-[#0B3D2E] underline decoration-[#B8892D] underline-offset-4" href="/coach-auth?next=/dashboard">sign in here</Link>.
        </p>
      </div>
    </main>
  );
}
