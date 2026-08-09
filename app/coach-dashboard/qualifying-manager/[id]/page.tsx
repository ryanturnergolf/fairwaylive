"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import QualifyingResultsPanel from "../QualifyingResultsPanel";
import { CoachBreadcrumbs, CoachHeader } from "../../components/CoachChrome";

export default function QualifyingHistoryPage() {
  const params = useParams<{ id: string }>();
  const sessionId = String(params.id ?? "");

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <CoachHeader />
      <header className="hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-black">Clubhouse HQ</Link>
          <Link
            href="/coach-dashboard/qualifying-manager"
            className="text-sm font-bold text-[#51635C]"
          >
            Qualifying Sessions
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Qualifying", href: "/coach-dashboard/qualifying-manager" }, { label: "History" }]} />
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
