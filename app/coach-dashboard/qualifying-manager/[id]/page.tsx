"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import QualifyingResultsPanel from "../QualifyingResultsPanel";

export default function QualifyingHistoryPage() {
  const params = useParams<{ id: string }>();
  const sessionId = String(params.id ?? "");

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <header className="border-b border-[#E8DCC8] bg-[#FCFAF5]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/coach-dashboard" className="font-black">Clubhouse HQ</Link>
          <Link
            href="/coach-dashboard/qualifying-manager"
            className="text-sm font-bold text-[#51635C]"
          >
            Qualifying Sessions
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">
          Historical Results
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Finalized Qualifying</h1>
        <QualifyingResultsPanel
          sessionId={sessionId}
          tournamentId=""
          sessionStatus="finalized"
          historyMode
        />
      </div>
    </main>
  );
}
