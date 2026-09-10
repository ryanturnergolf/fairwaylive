"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CoachBreadcrumbs, CoachHeader } from "../components/CoachChrome";
import type { QualifyingSessionFoundation } from "../../lib/qualifyingModel";
import { loadTournamentsFromStorage, type StoredTournament } from "../../lib/tournamentStorage";
import { listQualifyingSessionFoundations } from "../../lib/services/qualifyingSessionService";
import { loadTournamentList } from "../../lib/services/tournamentService";

const actionClass = "inline-flex min-h-12 items-center justify-center rounded-lg border border-[#0B3D2E] px-4 py-3 text-center text-sm font-black transition hover:bg-[#F6F1E6]";
type EventTypeFilter = "all" | "tournament" | "qualifying";

function isHistoricalStatus(status: string) {
  return ["archived", "complete", "completed", "finalized"].includes(status.trim().toLowerCase());
}

function activeStatusPriority(status: string) {
  const normalized = status.trim().toLowerCase();
  if (["active", "live", "in progress"].includes(normalized)) return 0;
  if (["upcoming", "draft", "provisioned"].includes(normalized)) return 1;
  return 2;
}

function EventCardActions({ eventName, openHref, manageHref, resultsHref }: {
  eventName: string;
  openHref: string;
  manageHref: string;
  resultsHref?: string;
}) {
  return (
    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-start">
      <Link className={`${actionClass} bg-[#0B3D2E] text-white hover:bg-[#164F3E] sm:min-w-40`} href={openHref}>
        Open Event
      </Link>
      <details className="group min-w-0 sm:w-52">
        <summary
          aria-label={`More actions for ${eventName}`}
          className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-[#D9D0C0] bg-white px-4 py-3 text-sm font-black transition hover:border-[#0B3D2E] hover:bg-[#F6F1E6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] [&::-webkit-details-marker]:hidden"
        >
          <span>More actions</span>
          <span aria-hidden="true" className="text-lg leading-none transition group-open:rotate-180">⌄</span>
        </summary>
        <div className="mt-2 grid min-w-0 gap-2 rounded-lg border border-[#E8DCC8] bg-white p-2 shadow-sm">
          <Link className={actionClass} href={manageHref}>Setup / Manage</Link>
          {resultsHref ? <Link className={actionClass} href={resultsHref}>Results / Live Scoring</Link> : null}
        </div>
      </details>
    </div>
  );
}

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
      {children}
    </article>
  );
}

function TournamentEventCard({ tournament }: { tournament: StoredTournament }) {
  const workspace = `/tournament/${encodeURIComponent(tournament.id)}`;
  return (
    <EventCard type="Tournament" title={tournament.name} status={tournament.status} detail={[tournament.course, tournament.date].filter(Boolean).join(" · ") || "Tournament setup"}>
      <EventCardActions
        eventName={tournament.name}
        openHref={workspace}
        manageHref={`${workspace}?tab=Teams`}
        resultsHref={`${workspace}?tab=Live+Scoring`}
      />
    </EventCard>
  );
}

function QualifyingEventCard({ foundation }: { foundation: QualifyingSessionFoundation }) {
  const { session, days } = foundation;
  const workspace = session.tournamentId ? `/tournament/${encodeURIComponent(session.tournamentId)}` : "";
  const qualifyingWorkspace = `/coach-dashboard/qualifying-manager?session=${encodeURIComponent(session.id)}`;
  return (
    <EventCard type="Qualifying" title={session.name} status={session.status} detail={`${session.selectedPlayers.length} players · ${days.length} ${days.length === 1 ? "day" : "days"}`}>
      <EventCardActions
        eventName={session.name}
        openHref={qualifyingWorkspace}
        manageHref={qualifyingWorkspace}
        resultsHref={workspace ? `${workspace}?tab=Live+Scoring` : undefined}
      />
    </EventCard>
  );
}

export default function EventsPage() {
  const [tournaments, setTournaments] = useState<StoredTournament[]>([]);
  const [qualifying, setQualifying] = useState<QualifyingSessionFoundation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState<EventTypeFilter>("all");

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

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesSearch = (...values: Array<string | null | undefined>) =>
      !query || values.some((value) => value?.toLowerCase().includes(query));
    const tournamentItems = eventType === "qualifying" ? [] : tournaments
      .filter((tournament) => matchesSearch(tournament.name, tournament.course, tournament.date))
      .sort((left, right) => activeStatusPriority(left.status) - activeStatusPriority(right.status));
    const qualifyingItems = eventType === "tournament" ? [] : qualifying
      .filter(({ session, days }) => matchesSearch(session.name, session.status, ...days.map((day) => day.courseName)))
      .sort((left, right) => activeStatusPriority(left.session.status) - activeStatusPriority(right.session.status));
    return {
      activeTournaments: tournamentItems.filter((item) => !isHistoricalStatus(item.status)),
      historicalTournaments: tournamentItems.filter((item) => isHistoricalStatus(item.status)),
      activeQualifying: qualifyingItems.filter(({ session }) => !isHistoricalStatus(session.status)),
      historicalQualifying: qualifyingItems.filter(({ session }) => isHistoricalStatus(session.status)),
    };
  }, [eventType, qualifying, search, tournaments]);

  const historyCount = visibleEvents.historicalTournaments.length + visibleEvents.historicalQualifying.length;
  const activeCount = visibleEvents.activeTournaments.length + visibleEvents.activeQualifying.length;

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
          <div className="mt-8 space-y-6">
            <section aria-label="Filter events" className="rounded-xl border border-[#E8DCC8] bg-white p-4 sm:p-5">
              <label htmlFor="event-search" className="text-sm font-black">Search events</label>
              <input
                id="event-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by event or course"
                className="mt-2 min-h-12 w-full rounded-lg border border-[#D9D0C0] bg-[#FCFAF5] px-4 text-base outline-none transition focus:border-[#0B3D2E] focus:ring-2 focus:ring-[#0B3D2E]/20"
              />
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Event type">
                {(["all", "tournament", "qualifying"] as const).map((value) => {
                  const labels = { all: "All", tournament: "Tournaments", qualifying: "Qualifying" };
                  const selected = eventType === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setEventType(value)}
                      className={`min-h-12 rounded-full border px-4 text-sm font-black transition ${selected ? "border-[#0B3D2E] bg-[#0B3D2E] text-white" : "border-[#D9D0C0] bg-white hover:border-[#0B3D2E]"}`}
                    >
                      {labels[value]}
                    </button>
                  );
                })}
              </div>
            </section>

            {activeCount ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {eventType !== "qualifying" ? (
                  <section aria-labelledby="tournament-events-title" className="rounded-xl border border-[#E8DCC8] bg-white p-5 sm:p-6">
                    <h2 id="tournament-events-title" className="text-2xl font-black">Tournaments</h2>
                    <p className="mt-2 text-sm text-[#51635C]">Team and individual competition events.</p>
                    <div className="mt-5 space-y-4">
                      {visibleEvents.activeTournaments.length ? visibleEvents.activeTournaments.map((tournament) => (
                        <TournamentEventCard key={tournament.id} tournament={tournament} />
                      )) : <p className="rounded-lg border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-5 text-sm font-semibold text-[#51635C]">No current Tournaments match.</p>}
                    </div>
                  </section>
                ) : null}

                {eventType !== "tournament" ? (
                  <section aria-labelledby="qualifying-events-title" className="rounded-xl border border-[#E8DCC8] bg-white p-5 sm:p-6">
                    <h2 id="qualifying-events-title" className="text-2xl font-black">Qualifying Sessions</h2>
                    <p className="mt-2 text-sm text-[#51635C]">Roster-based qualifying and team-selection events.</p>
                    <div className="mt-5 space-y-4">
                      {visibleEvents.activeQualifying.length ? visibleEvents.activeQualifying.map((foundation) => (
                        <QualifyingEventCard key={foundation.session.id} foundation={foundation} />
                      )) : <p className="rounded-lg border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-5 text-sm font-semibold text-[#51635C]">No current Qualifying Sessions match.</p>}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : (
              <p role="status" className="rounded-xl border border-dashed border-[#D9D0C0] bg-white p-6 text-sm font-semibold text-[#51635C]">No current events match your filters.</p>
            )}

            {historyCount ? (
              <details className="group rounded-xl border border-[#D9D0C0] bg-white">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] [&::-webkit-details-marker]:hidden">
                  <span>History <span className="text-sm font-semibold text-[#51635C]">({historyCount})</span></span>
                  <span aria-hidden="true" className="text-lg leading-none transition group-open:rotate-180">⌄</span>
                </summary>
                <div className="grid gap-6 border-t border-[#E8DCC8] p-5 lg:grid-cols-2">
                  {visibleEvents.historicalTournaments.length ? (
                    <section aria-labelledby="historical-tournaments-title">
                      <h2 id="historical-tournaments-title" className="text-lg font-black">Tournaments</h2>
                      <div className="mt-3 space-y-4">
                        {visibleEvents.historicalTournaments.map((tournament) => <TournamentEventCard key={tournament.id} tournament={tournament} />)}
                      </div>
                    </section>
                  ) : null}
                  {visibleEvents.historicalQualifying.length ? (
                    <section aria-labelledby="historical-qualifying-title">
                      <h2 id="historical-qualifying-title" className="text-lg font-black">Qualifying Sessions</h2>
                      <div className="mt-3 space-y-4">
                        {visibleEvents.historicalQualifying.map((foundation) => <QualifyingEventCard key={foundation.session.id} foundation={foundation} />)}
                      </div>
                    </section>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
