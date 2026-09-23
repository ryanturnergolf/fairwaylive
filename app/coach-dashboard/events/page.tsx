"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CoachBreadcrumbs, CoachHeader } from "../components/CoachChrome";
import type { QualifyingSessionFoundation } from "../../lib/qualifyingModel";
import { loadTournamentsFromStorage, type StoredTournament } from "../../lib/tournamentStorage";
import { listQualifyingSessionFoundations } from "../../lib/services/qualifyingSessionService";
import { loadTournamentList } from "../../lib/services/tournamentService";
import {
  archiveOldEvents,
  loadEventArchiveInventory,
  type EventArchiveInventory,
  type EventArchiveScope,
} from "../../lib/services/eventArchiveService";

const actionClass = "inline-flex min-h-12 items-center justify-center rounded-lg border border-[#0B3D2E] px-4 py-3 text-center text-sm font-black transition hover:bg-[#F6F1E6]";
type EventTypeFilter = "all" | "tournament" | "qualifying";
type EventVisibilityFilter = "current" | "archived";

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
    <EventCard type="Tournament" title={tournament.name} status={tournament.archivedAt ? `Archived · ${tournament.status}` : tournament.status} detail={[tournament.course, tournament.date].filter(Boolean).join(" · ") || "Tournament setup"}>
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
    <EventCard type="Qualifying" title={session.name} status={session.archivedAt ? `Archived · ${session.status}` : session.status} detail={`${session.selectedPlayers.length} players · ${days.length} ${days.length === 1 ? "day" : "days"}`}>
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
  const [visibility, setVisibility] = useState<EventVisibilityFilter>("current");
  const [archiveInventory, setArchiveInventory] = useState<EventArchiveInventory | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [archiveMessage, setArchiveMessage] = useState("");
  const [archiveBusy, setArchiveBusy] = useState<EventArchiveScope | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadTournamentList(
        loadTournamentsFromStorage(),
        (tournament) => tournament,
        { includeLocalOnly: false }
      ),
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

  useEffect(() => {
    let cancelled = false;
    void loadEventArchiveInventory().then((inventory) => {
      if (!cancelled) setArchiveInventory(inventory);
    }).catch((cause) => {
      if (!cancelled) setArchiveError(cause instanceof Error ? cause.message : "Unable to load archive inventory.");
    });
    return () => { cancelled = true; };
  }, []);

  const handleArchive = async (scope: EventArchiveScope) => {
    if (!archiveInventory || archiveBusy) return;
    const tournamentCandidates = scope === "qualifying" ? [] : archiveInventory.tournamentCandidates;
    const qualifyingCandidates = scope === "tournaments" ? [] : archiveInventory.qualifyingCandidates;
    const total = tournamentCandidates.length + qualifyingCandidates.length;
    if (total === 0) return;
    const label = scope === "both" ? "old Tournaments and Qualifying events" : scope === "tournaments" ? "old Tournaments" : "old Qualifying events";
    if (!window.confirm(`Archive ${total} ${label}? Historical data and direct links will remain available.`)) return;

    setArchiveBusy(scope);
    setArchiveError("");
    setArchiveMessage("");
    try {
      const result = await archiveOldEvents(scope);
      const tournamentIds = new Set(tournamentCandidates.map((event) => event.id));
      const qualifyingIds = new Set(qualifyingCandidates.map((event) => event.id));
      const archivedAt = new Date().toISOString();
      setTournaments((current) => current.map((event) => tournamentIds.has(event.id) ? { ...event, archivedAt } : event));
      setQualifying((current) => current.map((foundation) => qualifyingIds.has(foundation.session.id)
        ? { ...foundation, session: { ...foundation.session, archivedAt } }
        : foundation));
      setArchiveInventory({
        ...result,
        tournamentCandidates: scope === "qualifying" ? result.tournamentCandidates : [],
        qualifyingCandidates: scope === "tournaments" ? result.qualifyingCandidates : [],
      });
      setArchiveMessage(`${result.archivedTournamentCount} Tournaments and ${result.archivedQualifyingCount} Qualifying events archived.`);
    } catch (cause) {
      setArchiveError(cause instanceof Error ? cause.message : "Unable to archive events.");
    } finally {
      setArchiveBusy(null);
    }
  };

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
    const tournamentCandidateIds = new Set(archiveInventory?.tournamentCandidates.map((item) => item.id) ?? []);
    const qualifyingCandidateIds = new Set(archiveInventory?.qualifyingCandidates.map((item) => item.id) ?? []);
    return {
      currentTournaments: tournamentItems.filter((item) => !item.archivedAt && !tournamentCandidateIds.has(item.id)),
      archivedTournaments: tournamentItems.filter((item) => Boolean(item.archivedAt)),
      cleanupTournaments: tournamentItems.filter((item) => tournamentCandidateIds.has(item.id)),
      currentQualifying: qualifyingItems.filter(({ session }) => !session.archivedAt && !qualifyingCandidateIds.has(session.id)),
      archivedQualifying: qualifyingItems.filter(({ session }) => Boolean(session.archivedAt)),
      cleanupQualifying: qualifyingItems.filter(({ session }) => qualifyingCandidateIds.has(session.id)),
    };
  }, [archiveInventory, eventType, qualifying, search, tournaments]);

  const currentCount = visibleEvents.currentTournaments.length + visibleEvents.currentQualifying.length;
  const archivedCount = visibleEvents.archivedTournaments.length + visibleEvents.archivedQualifying.length;
  const cleanupCount = (archiveInventory?.tournamentCandidates.length ?? 0) + (archiveInventory?.qualifyingCandidates.length ?? 0);
  const displayedCount = visibility === "current" ? currentCount : archivedCount;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F6F1E6] text-[#0B3D2E]">
      <CoachHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
        <CoachBreadcrumbs items={[{ label: "Coach Portal", href: "/coach-dashboard/events" }, { label: "Events" }]} />
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
        {archiveError ? <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 font-bold text-red-800">{archiveError}</p> : null}
        {archiveMessage ? <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-900">{archiveMessage}</p> : null}
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
              <div className="mt-3 flex flex-wrap gap-2 border-t border-[#E8DCC8] pt-3" aria-label="Event visibility">
                {(["current", "archived"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={visibility === value}
                    onClick={() => setVisibility(value)}
                    className={`min-h-12 rounded-full border px-4 text-sm font-black transition ${visibility === value ? "border-[#0B3D2E] bg-[#0B3D2E] text-white" : "border-[#D9D0C0] bg-white hover:border-[#0B3D2E]"}`}
                  >
                    {value === "current" ? `Current Events (${currentCount})` : `Archived Events (${archivedCount})`}
                  </button>
                ))}
              </div>
            </section>

            {visibility === "current" && cleanupCount > 0 ? (
              <details className="rounded-xl border border-[#D9D0C0] bg-white">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-black [&::-webkit-details-marker]:hidden">
                  <span>Old events ready to archive <span className="text-sm font-semibold text-[#51635C]">({cleanupCount})</span></span>
                  <span aria-hidden="true">⌄</span>
                </summary>
                <div className="border-t border-[#E8DCC8] p-5">
                  <p className="text-sm text-[#51635C]">Only completed or inactive events dated before {archiveInventory?.cutoffDate} qualify. Active scoring and backing Tournaments for protected Qualifying events are excluded.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {visibleEvents.cleanupTournaments.map((event) => <p key={event.id} className="rounded-lg bg-[#FCFAF5] p-3 text-sm"><strong>Tournament:</strong> {event.name} · {event.date || "No date"} · {event.status}</p>)}
                    {visibleEvents.cleanupQualifying.map(({ session, days }) => <p key={session.id} className="rounded-lg bg-[#FCFAF5] p-3 text-sm"><strong>Qualifying:</strong> {session.name} · {days.at(-1)?.playDate || "No date"} · {session.status}</p>)}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={archiveBusy !== null || !archiveInventory?.tournamentCandidates.length} onClick={() => void handleArchive("tournaments")} className={actionClass}>Archive old Tournaments</button>
                    <button type="button" disabled={archiveBusy !== null || !archiveInventory?.qualifyingCandidates.length} onClick={() => void handleArchive("qualifying")} className={actionClass}>Archive old Qualifying</button>
                    <button type="button" disabled={archiveBusy !== null || cleanupCount === 0} onClick={() => void handleArchive("both")} className={`${actionClass} bg-[#0B3D2E] text-white hover:bg-[#164F3E]`}>Archive both</button>
                  </div>
                </div>
              </details>
            ) : null}

            {displayedCount ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {eventType !== "qualifying" ? (
                  <section aria-labelledby="tournament-events-title" className="rounded-xl border border-[#E8DCC8] bg-white p-5 sm:p-6">
                    <h2 id="tournament-events-title" className="text-2xl font-black">{visibility === "current" ? "Tournaments" : "Archived Tournaments"}</h2>
                    <p className="mt-2 text-sm text-[#51635C]">{visibility === "current" ? "Active, upcoming, and recent competition events." : "Historical events remain available through their original workspace."}</p>
                    <div className="mt-5 space-y-4">
                      {(visibility === "current" ? visibleEvents.currentTournaments : visibleEvents.archivedTournaments).length ? (visibility === "current" ? visibleEvents.currentTournaments : visibleEvents.archivedTournaments).map((tournament) => (
                        <TournamentEventCard key={tournament.id} tournament={tournament} />
                      )) : <p className="rounded-lg border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-5 text-sm font-semibold text-[#51635C]">No {visibility} Tournaments match.</p>}
                    </div>
                  </section>
                ) : null}

                {eventType !== "tournament" ? (
                  <section aria-labelledby="qualifying-events-title" className="rounded-xl border border-[#E8DCC8] bg-white p-5 sm:p-6">
                    <h2 id="qualifying-events-title" className="text-2xl font-black">{visibility === "current" ? "Qualifying Sessions" : "Archived Qualifying"}</h2>
                    <p className="mt-2 text-sm text-[#51635C]">{visibility === "current" ? "Active, upcoming, and recent team-selection events." : "Historical sessions remain available through their original workspace."}</p>
                    <div className="mt-5 space-y-4">
                      {(visibility === "current" ? visibleEvents.currentQualifying : visibleEvents.archivedQualifying).length ? (visibility === "current" ? visibleEvents.currentQualifying : visibleEvents.archivedQualifying).map((foundation) => (
                        <QualifyingEventCard key={foundation.session.id} foundation={foundation} />
                      )) : <p className="rounded-lg border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-5 text-sm font-semibold text-[#51635C]">No {visibility} Qualifying Sessions match.</p>}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : (
              <p role="status" className="rounded-xl border border-dashed border-[#D9D0C0] bg-white p-6 text-sm font-semibold text-[#51635C]">No {visibility} events match your filters.</p>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
