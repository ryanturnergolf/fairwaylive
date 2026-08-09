"use client";

import { useEffect, useState } from "react";
import {
  loadQualifyingAccessCode,
  manageQualifyingAccessCode,
} from "../../lib/services/qualifyingAccessService";

export default function QualifyingAccessPanel({ sessionId }: { sessionId: string }) {
  const [code, setCode] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (action: "ensure" | "rotate" | "disable") => {
    setBusy(true);
    setError("");
    try {
      const result = await manageQualifyingAccessCode(sessionId, action);
      setCode(result.code);
      setActive(result.active);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to manage access.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadQualifyingAccessCode(sessionId)
      .then((result) => {
        setCode(result.code);
        setActive(result.active);
        if (!result.code) void run("ensure");
      })
      .catch(() => void run("ensure"));
  }, [sessionId]);

  return (
    <div className="mt-4 rounded-lg border border-[#D8C9AE] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#B8892D]">Qualifying Access</p>
          <p className="mt-1 font-black">{code || "Generating…"}</p>
          <p className="text-xs font-bold text-[#51635C]">{active ? "Active" : "Disabled"}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" disabled={!code || busy} onClick={() => void navigator.clipboard.writeText(code)}
            className="rounded-lg border px-3 py-2 text-xs font-black">Copy</button>
          <button type="button" disabled={busy} onClick={() => void run("rotate")}
            className="rounded-lg border px-3 py-2 text-xs font-black">Rotate Code</button>
          <button type="button" disabled={busy} onClick={() => window.print()}
            className="rounded-lg border px-3 py-2 text-xs font-black">Print Instructions</button>
          <button type="button" disabled={busy} onClick={() => void run(active ? "disable" : "ensure")}
            className="rounded-lg border px-3 py-2 text-xs font-black">{active ? "Disable" : "Enable"}</button>
        </div>
      </div>
      <p className="mt-3 text-sm text-[#51635C]">Go to the Clubhouse HQ homepage, choose the player scoring-code entry, enter this code, then select your name.</p>
      {error ? <p role="alert" className="mt-2 text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
