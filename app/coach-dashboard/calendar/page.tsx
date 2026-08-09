"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadCalendarReadModel,
  type CalendarEventReadModel,
  type CalendarEventType,
  type CalendarReadModel,
} from "../../lib/services/calendarService";
import { loadTournamentsFromStorage } from "../../lib/tournamentStorage";

const emptyCalendar: CalendarReadModel = {
  generatedAt: "",
  currentDateLabel: "",
  monthLabel: "",
  weekLabel: "",
  eventTypes: [],
  dashboardCards: [],
  monthDays: [],
  weekDays: [],
  upcomingEvents: [],
  agendaGroups: [],
  selectedEvent: null,
};

const typeStyles: Record<CalendarEventType, string> = {
  Practice: "border-[#2E6F76] bg-[#E6F3F1] text-[#0B3D2E]",
  Qualifying: "border-[#B8892D] bg-[#F0C96A]/35 text-[#0B3D2E]",
  Tournament: "border-[#0B3D2E] bg-[#0B3D2E] text-[#F6F1E6]",
  "Team Meeting": "border-[#51635C] bg-white text-[#51635C]",
  "Lift / Workout": "border-[#8A2E2E] bg-[#FFF4F1] text-[#8A2E2E]",
  Travel: "border-[#2E6F76] bg-white text-[#2E6F76]",
  "Team Event": "border-[#0B3D2E] bg-white text-[#0B3D2E]",
  Academic: "border-[#B8892D] bg-white text-[#8A5D1A]",
  Recruiting: "border-[#D9D0C0] bg-[#FCFAF5] text-[#51635C]",
  Other: "border-[#E8DCC8] bg-[#FCFAF5] text-[#51635C]",
};

function SectionShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[8px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_16px_45px_rgba(11,61,46,0.06)]">
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#B8892D]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-[8px] border border-dashed border-[#D9D0C0] bg-[#FCFAF5] px-4 py-5 text-sm font-semibold text-[#51635C]">
      {label}
    </div>
  );
}

function EventBadge({ type }: { type: CalendarEventType }) {
  return (
    <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${typeStyles[type]}`}>
      {type}
    </span>
  );
}

function CompactEvent({ event }: { event: CalendarEventReadModel }) {
  return (
    <Link
      href={event.href}
      className="block rounded-[8px] border border-[#D9D0C0] bg-white p-2 transition duration-200 hover:border-[#B8892D]"
    >
      <p className="truncate text-xs font-black text-[#0B3D2E]">{event.title}</p>
      <p className="mt-1 text-[11px] leading-5 text-[#51635C]">{event.time}</p>
    </Link>
  );
}

function EventList({ events, emptyLabel }: { events: CalendarEventReadModel[]; emptyLabel: string }) {
  if (events.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <Link
          key={event.id}
          href={event.href}
          className="block rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4 transition duration-200 hover:border-[#B8892D] hover:bg-[#F6F1E6]"
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h3 className="text-sm font-black text-[#0B3D2E]">{event.title}</h3>
              <p className="mt-1 text-sm leading-6 text-[#51635C]">
                {event.dateLabel} / {event.time} / {event.location}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#51635C]">{event.notes}</p>
            </div>
            <EventBadge type={event.type} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function EventDetails({ event }: { event: CalendarEventReadModel | null }) {
  if (!event) {
    return <EmptyState label="No event selected." />;
  }

  return (
    <article className="rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">Event Details</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">{event.title}</h3>
        </div>
        <EventBadge type={event.type} />
      </div>
      <div className="mt-5 grid gap-3 text-sm text-[#51635C] sm:grid-cols-2">
        <p><span className="font-black text-[#0B3D2E]">Date:</span> {event.dateLabel}</p>
        <p><span className="font-black text-[#0B3D2E]">Time:</span> {event.time}</p>
        <p><span className="font-black text-[#0B3D2E]">Type:</span> {event.type}</p>
        <p><span className="font-black text-[#0B3D2E]">Location:</span> {event.location}</p>
        <p><span className="font-black text-[#0B3D2E]">Related Module:</span> {event.relatedModule}</p>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#51635C]">{event.notes}</p>
    </article>
  );
}

export default function CoachCalendarPage() {
  const [calendar, setCalendar] = useState<CalendarReadModel>(emptyCalendar);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    void loadCalendarReadModel(loadTournamentsFromStorage())
      .then((readModel) => {
        if (!isCancelled) {
          setCalendar(readModel);
        }
      })
      .catch((error) => {
        console.warn("[CoachCalendar] Unable to load calendar.", error);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <header className="border-b border-[#E8DCC8] bg-[#FCFAF5]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#B8892D]/30 bg-[#0B3D2E] text-sm font-black tracking-[0.2em] text-[#F6F1E6]">
              HQ
            </div>
            <div>
              <h1 className="text-lg font-black tracking-[-0.02em]">Clubhouse HQ</h1>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B8892D]">
                Calendar
              </p>
            </div>
          </Link>
          <nav className="hidden items-center gap-5 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#0B3D2E]/75 md:flex">
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard">
              Coach Dashboard
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/practice-planner">
              Practice Planner
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/qualifying-manager">
              Qualifying Manager
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/dashboard">
              Director Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-[#B8892D]">
              {isLoading ? "Loading" : calendar.currentDateLabel}
            </p>
            <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              Unified Calendar
            </h2>
          </div>
          <div className="rounded-[8px] border border-[#E8DCC8] bg-white px-4 py-3 text-sm font-semibold text-[#51635C]">
            Read-only scheduling hub
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {calendar.dashboardCards.map((card) => (
            <article key={card.label} className="rounded-[8px] border border-[#E8DCC8] bg-white/90 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">{card.label}</p>
              <p className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#0B3D2E]">{card.value}</p>
              <p className="mt-2 text-sm leading-6 text-[#51635C]">{card.detail}</p>
            </article>
          ))}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
          <SectionShell eyebrow="Month" title={calendar.monthLabel || "Month View"}>
            <div className="grid grid-cols-7 gap-2">
              {calendar.monthDays.map((day) => (
                <article
                  key={day.id}
                  className={`min-h-32 rounded-[8px] border p-2 ${
                    day.isToday
                      ? "border-[#B8892D] bg-[#F0C96A]/20"
                      : day.isCurrentMonth
                        ? "border-[#E8DCC8] bg-[#FCFAF5]"
                        : "border-[#E8DCC8] bg-white/60 text-[#51635C]"
                  }`}
                >
                  <p className="text-xs font-black">{day.dayNumber}</p>
                  <div className="mt-2 space-y-2">
                    {day.events.map((event) => (
                      <CompactEvent key={event.id} event={event} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </SectionShell>

          <SectionShell eyebrow="Details" title="Next Event">
            <EventDetails event={calendar.selectedEvent} />
            <div className="mt-5 flex flex-wrap gap-2">
              {calendar.eventTypes.map((type) => (
                <EventBadge key={type} type={type} />
              ))}
            </div>
          </SectionShell>
        </div>

        <div className="mt-5">
          <SectionShell eyebrow="Week" title={calendar.weekLabel || "Week View"}>
            <div className="grid gap-3 md:grid-cols-7">
              {calendar.weekDays.map((day) => (
                <article
                  key={day.id}
                  className={`min-h-44 rounded-[8px] border p-3 ${
                    day.isToday ? "border-[#B8892D] bg-[#F0C96A]/20" : "border-[#E8DCC8] bg-[#FCFAF5]"
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">{day.label}</p>
                  <p className="mt-1 text-sm font-black text-[#0B3D2E]">{day.dateLabel}</p>
                  <div className="mt-3 space-y-2">
                    {day.events.length > 0 ? (
                      day.events.map((event) => <CompactEvent key={event.id} event={event} />)
                    ) : (
                      <p className="text-xs font-semibold text-[#51635C]">Open</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </SectionShell>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <SectionShell eyebrow="Upcoming" title="Unified Timeline">
            <EventList events={calendar.upcomingEvents} emptyLabel="No upcoming events." />
          </SectionShell>

          <SectionShell eyebrow="Agenda" title="Grouped By Date">
            {calendar.agendaGroups.length === 0 ? (
              <EmptyState label="No agenda items." />
            ) : (
              <div className="space-y-5">
                {calendar.agendaGroups.map((group) => (
                  <div key={group.id}>
                    <h3 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                      {group.label}
                    </h3>
                    <EventList events={group.events} emptyLabel="No events." />
                  </div>
                ))}
              </div>
            )}
          </SectionShell>
        </div>
      </div>
    </main>
  );
}
