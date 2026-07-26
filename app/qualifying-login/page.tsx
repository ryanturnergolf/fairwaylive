"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  exchangeQualifyingPlayerAccess,
  normalizeQualifyingCode,
  QUALIFYING_CODE_LENGTH,
  resolveQualifyingCode,
  type QualifyingAccessResolution,
} from "../lib/services/qualifyingAccessService";

export default function QualifyingLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [resolution, setResolution] = useState<QualifyingAccessResolution | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (code.length !== QUALIFYING_CODE_LENGTH) {
      setError("Unable to resolve qualifying code. Check the code and try again.");
      return;
    }
    setBusy(true);
    const result = await resolveQualifyingCode(code);
    setBusy(false);
    if (!result) {
      setResolution(null);
      setError("Unable to resolve qualifying code. Check the code and try again.");
      return;
    }
    setResolution(result);
  };

  const selectPlayer = async (playerId: string) => {
    if (busy) return;
    setBusy(true);
    const destination = await exchangeQualifyingPlayerAccess(code, playerId);
    setBusy(false);
    if (!destination) {
      setError("Unable to open qualifying. Please try again.");
      return;
    }
    router.push(destination);
  };

  return (
    <main className="min-h-screen bg-[#F6F1E6] px-4 py-8 text-[#0B3D2E]">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="font-black">Clubhouse HQ</Link>
        <section className="mt-8 rounded-3xl border border-[#D8C9AE] bg-white p-7 shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[#B8892D]">Guest access</p>
          <h1 className="mt-2 text-3xl font-black">Qualifying Login</h1>
          {!resolution ? (
            <form className="mt-6" onSubmit={submit}>
              <label htmlFor="qualifying-code" className="text-sm font-black">Qualifying code</label>
              <input id="qualifying-code" value={code} autoCapitalize="characters" autoComplete="off"
                onChange={(event) => setCode(normalizeQualifyingCode(event.target.value))}
                className="mt-2 w-full rounded-2xl border-2 px-5 py-5 text-center text-3xl font-black tracking-[0.25em]"
                placeholder="Q7TRF2" />
              <button disabled={busy} className="mt-5 min-h-14 w-full rounded-full bg-[#0B3D2E] font-black text-white">
                {busy ? "Checking…" : "Continue"}
              </button>
            </form>
          ) : resolution.blockedReason === "designated_scorer_unavailable" ? (
            <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <h2 className="font-black">{resolution.qualifyingName}</h2>
              <p className="mt-2 font-bold">Designated scorer access is not available yet.</p>
            </div>
          ) : (
            <div className="mt-6">
              <h2 className="text-2xl font-black">{resolution.qualifyingName}</h2>
              <p className="mt-2 text-[#51635C]">Select your name to open the existing mobile scorecard.</p>
              <div className="mt-5 space-y-3">
                {resolution.players.map((player) => (
                  <button key={player.playerId} disabled={busy} type="button"
                    onClick={() => void selectPlayer(player.playerId)}
                    className="min-h-14 w-full rounded-2xl border-2 px-5 text-left font-black">
                    {player.playerName}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 font-bold text-red-800">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
