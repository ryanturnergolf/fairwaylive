"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CoachBreadcrumbs, CoachHeader } from "../components/CoachChrome";
import type { QualifyingSessionFoundation } from "../../lib/qualifyingModel";
import { loadTournamentsFromStorage, type StoredTournament } from "../../lib/tournamentStorage";
import { listQualifyingSessionFoundations } from "../../lib/services/qualifyingSessionService";
import { loadTournamentList } from "../../lib/services/tournamentService";

const actionClass = "inline-flex min-h-12 items-center justify-center rounded-lg border border-[#0B3D2E] px-4 py-3 text-center text-sm font-black transition hover:bg-[#F6F1E6]";

function EventCard({
  title,
  type,
  detail,
  status,
  children,
}: {
  title: string;
  type: "Tournament" | "Qualifying";
  detail: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-[#E8DCC8] bg-[#FCFAF5] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">{type}</p>
          <h3 className="mt-2 text-xl font-black">{title}</h3>
          <p className="mt-2 text-sm text-[#51635C]">{detail}</p>
        </div>
        <span className="w-fit rounded-full border border-[#D9D0C0] bg-white px-3 py-1 text-xs font-black uppercase">{status}</span>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{children}</div>
    </article>
  );
}

export default function EventsPage() {
  const [tournaments, setTournaments] = useState<StoredTournament[]>([]);
  const [qualifying, setQualifying] = useState<QualifyingSessionFoundation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadTournamentList(loadTournamentsFromStorage(), (tournament) => tournament),
      listQualifyingSessionFoundations(),
    ]).then(([loadedTournaments, loadedQualifying]) => {
      if (cancelled) return;
      const qualifyingTournamentIds = new Set(loadedQualifying.map((item) => item.session.tournamentId).filter(Boolean));
      setTournaments(loadedTournaments.filter((tournament) => !qualifyingTournamentIds.has(tournament.id)));
      setQualifying(loadedQualifying);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load events.");
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F6F1E6] text-[#0B3D2E]">
      <CoachHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
        <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Events" }]} />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Competition</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Events</h1>
            <p className="mt-3 max-w-2xl text-[#51635C]">Manage Tournaments and Qualifying Sessions from one place.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className={actionClass} href="/dashboard#create-tournament">Create Tournament</Link>
            <Link className={`${actionClass} bg-[#0B3D2E] text-white hover:bg-[#164F3E]`} href="/coach-dashboard/qualifying-manager/new">Create Qualifying</Link>
          </div>
        </div>

        {error ? <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 font-bold text-red-800">{error}</p> : null}
        {isLoading ? <p role="status" className="mt-8 rounded-lg border border-[#E8DCC8] bg-white p-6 font-semibold text-[#51635C]">Loading events...</p> : null}

        {!isLoading ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="tournament-events-title" className="rounded-xl border border-[#E8DCC8] bg-white p-5 sm:p-6">
              <h2 id="tournament-events-title" className="text-2xl font-black">Tournaments</h2>
              <p className="mt-2 text-sm text-[#51635C]">Team and individual competition events.</p>
              <div className="mt-5 space-y-4">
                {tournaments.length ? tournaments.map((tournament) => (
                  <EventCard key={tournament.id} type="Tournament" title={tournament.name} status={tournament.status} detail={[tournament.course, tournament.date].filter(Boolean).join(" · ") || "Tournament setup"}>
                    <Link className={`${actionClass} bg-[#0B3D2E] text-white hover:bg-[#164F3E]`} href={`/tournament/${encodeURIComponent(tournament.id)}`}>Open Event</Link>
                    <Link className={actionClass} href={`/tournament/${encodeURIComponent(tournament.id)}?tab=Teams`}>Setup / Manage</Link>
                    <Link className={actionClass} href={`/tournament/${encodeURIComponent(tournament.id)}?tab=Live+Scoring`}>Results / Live Scoring</Link>
                  </EventCard>
                )) : <p className="rounded-lg border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-5 text-sm font-semibold text-[#51635C]">No Tournaments yet.</p>}
              </div>
            </section>

            <section aria-labelledby="qualifying-events-title" className="rounded-xl border border-[#E8DCC8] bg-white p-5 sm:p-6">
              <h2 id="qualifying-events-title" className="text-2xl font-black">Qualifying Sessions</h2>
              <p className="mt-2 text-sm text-[#51635C]">Roster-based qualifying and team-selection events.</p>
              <div className="mt-5 space-y-4">
                {qualifying.length ? qualifying.map(({ session, days }) => {
                  const workspace = session.tournamentId ? `/tournament/${encodeURIComponent(session.tournamentId)}` : "";
                  return (
                    <EventCard key={session.id} type="Qualifying" title={session.name} status={session.status} detail={`${session.selectedPlayers.length} players · ${days.length} ${days.length === 1 ? "day" : "days"}`}>
                      {workspace ? <Link className={`${actionClass} bg-[#0B3D2E] text-white hover:bg-[#164F3E]`} href={workspace}>Open Event</Link> : null}
                      <Link className={actionClass} href="/coach-dashboard/qualifying-manager">Setup / Manage</Link>
                      {workspace ? <Link className={actionClass} href={`${workspace}?tab=Live+Scoring`}>Results / Live Scoring</Link> : null}
                    </EventCard>
                  );
                }) : <p className="rounded-lg border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-5 text-sm font-semibold text-[#51635C]">No Qualifying Sessions yet.</p>}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
