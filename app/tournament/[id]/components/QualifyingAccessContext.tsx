"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadQualifyingTournamentAccessContext,
  type QualifyingTournamentAccessContext as QualifyingAccessContextModel,
} from "../../../lib/services/qualifyingAccessService";

export default function QualifyingAccessContext({
  backingTournamentId,
}: {
  backingTournamentId: string;
}) {
  const [context, setContext] = useState<QualifyingAccessContextModel | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setContext(null);
    setError("");
    if (!backingTournamentId) return () => { cancelled = true; };
    void loadQualifyingTournamentAccessContext(backingTournamentId)
      .then((result) => {
        if (!cancelled) setContext(result);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load Qualifying access context.");
        }
      });
    return () => { cancelled = true; };
  }, [backingTournamentId]);

  if (!context && !error) return null;

  return (
    <section
      aria-labelledby="qualifying-access-context-title"
      className="mt-4 rounded-[24px] border border-[#C9B47D] bg-[#FFF9E8] p-5 shadow-sm"
    >
      {context ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#8B6818]">
              Qualifying Context
            </p>
            <h3 id="qualifying-access-context-title" className="mt-2 text-xl font-black text-[#0B3D2E]">
              {context.sessionName}
            </h3>
            <p className="mt-1 text-sm font-semibold text-[#51635C]">
              Qualifying access code: <span className="font-black text-[#0B3D2E]">{context.code || "Not generated"}</span>
              {" · "}{context.active ? "Active" : "Disabled"}
            </p>
            <p className="mt-2 text-xs font-semibold text-[#725D37]">
              This shared Qualifying code is separate from Tournament Team Scoring Codes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {context.code ? (
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(context.code)}
                className="rounded-full border border-[#8B6818] px-4 py-2 text-xs font-black text-[#725D37]"
              >
                Copy Qualifying Code
              </button>
            ) : null}
            <Link
              href="/coach-dashboard/qualifying-manager"
              className="rounded-full bg-[#0B3D2E] px-4 py-2 text-xs font-black text-white"
            >
              Open Qualifying Manager
            </Link>
          </div>
        </div>
      ) : (
        <p id="qualifying-access-context-title" role="alert" className="text-sm font-bold text-[#8A2E2E]">
          {error}
        </p>
      )}
    </section>
  );
}
