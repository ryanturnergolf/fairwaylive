"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  normalizePlayerScoringCode,
  PLAYER_SCORING_CODE_LENGTH,
  resolvePlayerScoringCode,
  resolveUniversalPlayerScorecardPath,
  type UniversalPlayerAccessResolution,
} from "../lib/services/universalPlayerAccessService";

type PlayerScoringCodeEntryProps = {
  compact?: boolean;
};

export default function PlayerScoringCodeEntry({ compact = false }: PlayerScoringCodeEntryProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [access, setAccess] = useState<UniversalPlayerAccessResolution | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "opening" | "invalid_code">("idle");

  const focusCode = () => requestAnimationFrame(() => inputRef.current?.focus());

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "loading") return;

    setAccess(null);
    if (code.length !== PLAYER_SCORING_CODE_LENGTH) {
      setStatus("invalid_code");
      focusCode();
      return;
    }

    setStatus("loading");
    const result = await resolvePlayerScoringCode(code);
    if (!result) {
      setStatus("invalid_code");
      focusCode();
      return;
    }

    setAccess(result);
    setStatus("idle");
  };

  const changeCode = () => {
    setAccess(null);
    setCode("");
    setStatus("idle");
    focusCode();
  };

  const selectPlayer = async (playerId: string) => {
    if (!access || status === "opening") return;
    setStatus("opening");
    const destination = await resolveUniversalPlayerScorecardPath({ code, playerId, access });
    if (!destination) {
      setAccess(null);
      setStatus("invalid_code");
      focusCode();
      return;
    }
    router.push(destination);
  };

  const errorMessage = status === "invalid_code"
    ? "Unable to access live scoring. Check the code and try again."
    : "";
  const players = access?.resolution.players ?? [];
  const eventName = access?.eventType === "tournament"
    ? access.resolution.tournament.name
    : access?.resolution.qualifyingName ?? "";
  const groupName = access?.eventType === "tournament"
    ? access.resolution.team.name
    : "Select your player";

  if (access) {
    return (
      <div aria-live="polite">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">{eventName}</p>
        <h2 className={`mt-2 break-words font-black tracking-[-0.03em] ${compact ? "text-2xl" : "text-3xl"}`}>{groupName}</h2>
        <p className="mt-3 text-[#51635C]">Select your name to open your scorecard.</p>
        <div className="mt-6 space-y-3">
          {players.map((player) => (
            <button
              key={player.playerId}
              disabled={status === "opening"}
              className="min-h-16 w-full rounded-2xl border-2 border-[#D8C9AE] bg-[#FCFAF5] px-5 py-4 text-left text-lg font-black shadow-sm transition hover:border-[#B8892D] hover:bg-[#F6F1E6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B8892D]"
              type="button"
              onClick={() => void selectPlayer(player.playerId)}
            >
              {player.playerName}
            </button>
          ))}
        </div>
        <button className="mt-6 min-h-12 w-full rounded-full border-2 border-[#0B3D2E] px-6 py-3 font-black transition hover:bg-[#0B3D2E]/5" type="button" onClick={changeCode}>
          Change Code
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submitCode} noValidate>
      <label className="block text-sm font-black" htmlFor={compact ? "homepage-player-scoring-code" : "player-scoring-code"}>Live scoring code</label>
      <input
        ref={inputRef}
        id={compact ? "homepage-player-scoring-code" : "player-scoring-code"}
        name="player-scoring-code"
        aria-describedby={`${compact ? "homepage-" : ""}scoring-code-help ${compact ? "homepage-" : ""}scoring-code-error`}
        aria-invalid={Boolean(errorMessage)}
        autoCapitalize="characters"
        autoComplete="off"
        className={`mt-3 min-h-14 w-full rounded-2xl border-2 border-[#C9B997] bg-[#FCFAF5] px-4 text-center font-black uppercase outline-none transition focus:border-[#B8892D] focus:ring-4 focus:ring-[#B8892D]/15 ${compact ? "py-4 text-2xl tracking-[0.22em] sm:text-3xl" : "px-5 py-5 text-3xl tracking-[0.28em]"}`}
        inputMode="text"
        placeholder="BX7KM2"
        spellCheck={false}
        value={code}
        onChange={(event) => {
          setCode(normalizePlayerScoringCode(event.target.value));
          if (status !== "loading" && status !== "opening") setStatus("idle");
        }}
      />
      <p id={`${compact ? "homepage-" : ""}scoring-code-help`} className="mt-3 text-center text-sm text-[#51635C]">Six characters · spaces and hyphens are ignored</p>
      {errorMessage ? (
        <p id={`${compact ? "homepage-" : ""}scoring-code-error`} role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
          {errorMessage}
        </p>
      ) : <span id={`${compact ? "homepage-" : ""}scoring-code-error`} />}
      <button
        className="mt-6 min-h-14 w-full rounded-full bg-[#0B3D2E] px-6 py-4 text-base font-black text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/20 transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
        disabled={status === "loading"}
        type="submit"
      >
        {status === "loading" ? "Finding Your Event..." : "Continue"}
      </button>
    </form>
  );
}
