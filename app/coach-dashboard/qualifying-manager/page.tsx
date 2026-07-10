import Link from "next/link";
import { connection } from "next/server";
import {
  loadQualifyingManagerReadModel,
  type QualifyingSessionDetailReadModel,
  type QualifyingSessionListItem,
  type QualifyingStatus,
} from "../../lib/services/qualifyingService";

const statusStyles: Record<QualifyingStatus, string> = {
  Scheduled: "border-[#2E6F76] bg-[#E6F3F1] text-[#0B3D2E]",
  Active: "border-[#B8892D] bg-[#F0C96A]/35 text-[#0B3D2E]",
  Complete: "border-[#51635C] bg-[#FCFAF5] text-[#51635C]",
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

function SessionList({ items, emptyLabel }: { items: QualifyingSessionListItem[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.id} className="rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h3 className="text-sm font-black text-[#0B3D2E]">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-[#51635C]">{item.detail}</p>
              <p className="mt-2 text-sm leading-6 text-[#51635C]">{item.notes}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#51635C]">
                <span className="rounded-full border border-[#E8DCC8] bg-white px-3 py-1">
                  {item.participantCount} players
                </span>
                <span className="rounded-full border border-[#E8DCC8] bg-white px-3 py-1">{item.meta}</span>
              </div>
            </div>
            <span
              className={`w-fit shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                statusStyles[item.status]
              }`}
            >
              {item.status}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function SessionDetails({ session }: { session: QualifyingSessionDetailReadModel | null }) {
  if (!session) {
    return <EmptyState label="No qualifying session selected." />;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">Session Details</p>
            <h3 className="mt-2 text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">{session.name}</h3>
          </div>
          <span
            className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
              statusStyles[session.status]
            }`}
          >
            {session.status}
          </span>
        </div>

        <div className="mt-5">
          <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">Participants</h4>
          <div className="mt-3 grid gap-2">
            {session.participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center justify-between gap-3 rounded-[8px] border border-[#E8DCC8] bg-white px-3 py-2 text-sm"
              >
                <span className="font-black text-[#0B3D2E]">{participant.name}</span>
                <span className="text-[#51635C]">
                  {participant.teamName} / {participant.classYear}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5">
        <div className="rounded-[8px] border border-[#E8DCC8] bg-white p-4">
          <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">Rounds</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {session.rounds.map((round) => (
              <article key={round.id} className="rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-3">
                <p className="text-sm font-black text-[#0B3D2E]">{round.label}</p>
                <p className="mt-1 text-sm leading-6 text-[#51635C]">
                  {round.date} - {round.course}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-[8px] border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-4">
          <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">Current Leaderboard</h4>
          <p className="mt-3 text-sm leading-6 text-[#51635C]">{session.currentLeaderboardPlaceholder}</p>
        </div>

        <div className="rounded-[8px] border border-[#E8DCC8] bg-white p-4">
          <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">Session Notes</h4>
          <p className="mt-3 text-sm leading-6 text-[#51635C]">{session.notes}</p>
        </div>
      </div>
    </div>
  );
}

export default async function QualifyingManagerPage() {
  await connection();
  const qualifying = loadQualifyingManagerReadModel();

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <header className="border-b border-[#E8DCC8] bg-[#FCFAF5]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Link href="/coach-dashboard" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#B8892D]/30 bg-[#0B3D2E] text-sm font-black tracking-[0.2em] text-[#F6F1E6]">
              HQ
            </div>
            <div>
              <h1 className="text-lg font-black tracking-[-0.02em]">Clubhouse HQ</h1>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B8892D]">
                Qualifying Manager
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
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/dashboard/season-statistics">
              Statistics
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/live">
              Live Scores
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-[#B8892D]">
              {qualifying.currentDateLabel}
            </p>
            <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              Qualifying Manager
            </h2>
          </div>
          <div className="rounded-[8px] border border-[#E8DCC8] bg-white px-4 py-3 text-sm font-semibold text-[#51635C]">
            Read-only foundation
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {qualifying.dashboardCards.map((card) => (
            <article key={card.label} className="rounded-[8px] border border-[#E8DCC8] bg-white/90 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">{card.label}</p>
              <p className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#0B3D2E]">{card.value}</p>
              <p className="mt-2 text-sm leading-6 text-[#51635C]">{card.detail}</p>
            </article>
          ))}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionShell eyebrow="Upcoming Sessions" title="Scheduled Qualifying">
            <SessionList items={qualifying.upcomingSessions} emptyLabel="No upcoming qualifying sessions." />
          </SectionShell>

          <SectionShell eyebrow="Active Sessions" title="In Progress">
            <SessionList items={qualifying.activeSessions} emptyLabel="No active qualifying sessions." />
          </SectionShell>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionShell eyebrow="Completed Sessions" title="Qualifying History">
            <SessionList items={qualifying.completedSessions} emptyLabel="No completed qualifying sessions." />
          </SectionShell>

          <SectionShell eyebrow="Season Standings" title="Standings Placeholder">
            <div className="rounded-[8px] border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-4">
              <p className="text-sm leading-6 text-[#51635C]">{qualifying.seasonStandingsPlaceholder}</p>
            </div>
          </SectionShell>
        </div>

        <div className="mt-5">
          <SectionShell eyebrow="Quick Create" title="New Qualifying Preview">
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">
                  {qualifying.quickCreate.statusLabel}
                </p>
                <h3 className="mt-2 text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                  {qualifying.quickCreate.defaultSession.name}
                </h3>
                <div className="mt-4 grid gap-3 text-sm text-[#51635C] sm:grid-cols-2">
                  <p>
                    <span className="font-black text-[#0B3D2E]">Date:</span>{" "}
                    {qualifying.quickCreate.defaultSession.date}
                  </p>
                  <p>
                    <span className="font-black text-[#0B3D2E]">Course:</span>{" "}
                    {qualifying.quickCreate.defaultSession.course}
                  </p>
                  <p>
                    <span className="font-black text-[#0B3D2E]">Format:</span>{" "}
                    {qualifying.quickCreate.defaultSession.format}
                  </p>
                  <p>
                    <span className="font-black text-[#0B3D2E]">Rounds:</span>{" "}
                    {qualifying.quickCreate.defaultSession.numberOfRounds}
                  </p>
                </div>
                <p className="mt-4 text-sm leading-6 text-[#51635C]">{qualifying.quickCreate.defaultSession.notes}</p>
              </div>
              <div className="rounded-[8px] border border-[#E8DCC8] bg-white p-4">
                <p className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">Formats</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {qualifying.quickCreate.availableFormats.map((format) => (
                    <span
                      key={format}
                      className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#51635C]"
                    >
                      {format}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </SectionShell>
        </div>

        <div className="mt-5">
          <SectionShell eyebrow="Session Details" title="Read-only Detail View">
            <SessionDetails session={qualifying.selectedSession} />
          </SectionShell>
        </div>
      </div>
    </main>
  );
}
