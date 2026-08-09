import Link from "next/link";
import { connection } from "next/server";
import {
  loadPracticePlannerReadModel,
  type PracticePlannerListItem,
} from "../../lib/services/practicePlannerService";

const practiceTypeStyles: Record<string, string> = {
  Team: "border-[#0B3D2E] bg-[#E6F3F1] text-[#0B3D2E]",
  Individual: "border-[#2E6F76] bg-[#E6F3F1] text-[#0B3D2E]",
  Qualifying: "border-[#B8892D] bg-[#F0C96A]/35 text-[#0B3D2E]",
  "Short Game": "border-[#8A2E2E] bg-[#FFF4F1] text-[#8A2E2E]",
  Putting: "border-[#2E6F76] bg-white text-[#2E6F76]",
  "On-Course": "border-[#0B3D2E] bg-white text-[#0B3D2E]",
  Simulator: "border-[#51635C] bg-[#FCFAF5] text-[#51635C]",
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

function PracticeList({ items, emptyLabel }: { items: PracticePlannerListItem[]; emptyLabel: string }) {
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
            </div>
            <span
              className={`w-fit shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                practiceTypeStyles[item.meta] ?? "border-[#E8DCC8] bg-white text-[#51635C]"
              }`}
            >
              {item.meta}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

export default async function PracticePlannerPage() {
  await connection();
  const planner = loadPracticePlannerReadModel();

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
                Practice Planner
              </p>
            </div>
          </Link>
          <nav className="hidden items-center gap-5 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#0B3D2E]/75 md:flex">
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard">
              Coach Dashboard
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
              {planner.currentDateLabel}
            </p>
            <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              Practice Planner
            </h2>
          </div>
          <div className="rounded-[8px] border border-[#E8DCC8] bg-white px-4 py-3 text-sm font-semibold text-[#51635C]">
            Read-only foundation
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {planner.dashboardCards.map((card) => (
            <article key={card.label} className="rounded-[8px] border border-[#E8DCC8] bg-white/90 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">{card.label}</p>
              <p className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#0B3D2E]">{card.value}</p>
              <p className="mt-2 text-sm leading-6 text-[#51635C]">{card.detail}</p>
            </article>
          ))}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionShell eyebrow="Planner" title="Upcoming Practices">
            <PracticeList items={planner.upcomingPractices} emptyLabel="No upcoming practices scheduled." />
          </SectionShell>

          <SectionShell eyebrow="Calendar" title="Weekly Calendar">
            <div className="grid gap-3 md:grid-cols-7">
              {planner.weeklyCalendar.map((day) => (
                <article key={day.id} className="min-h-40 rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">{day.label}</p>
                  <p className="mt-1 text-sm font-black text-[#0B3D2E]">{day.dateLabel}</p>
                  <div className="mt-3 space-y-2">
                    {day.practices.length > 0 ? (
                      day.practices.map((practice) => (
                        <div key={practice.id} className="rounded-[8px] border border-[#D9D0C0] bg-white p-2">
                          <p className="text-xs font-black text-[#0B3D2E]">{practice.title}</p>
                          <p className="mt-1 text-[11px] leading-5 text-[#51635C]">{practice.meta}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs font-semibold text-[#51635C]">Open</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </SectionShell>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <SectionShell eyebrow="Templates" title="Practice Templates">
            <div className="space-y-3">
              {planner.practiceTemplates.map((template) => (
                <article key={template.id} className="rounded-[8px] border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-4">
                  <h3 className="text-sm font-black text-[#0B3D2E]">{template.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#51635C]">{template.detail}</p>
                </article>
              ))}
            </div>
          </SectionShell>

          <SectionShell eyebrow="History" title="Recent Practices">
            <PracticeList items={planner.recentPractices} emptyLabel="No recent practices yet." />
          </SectionShell>
        </div>

        <div className="mt-5">
          <SectionShell eyebrow="Quick Create" title="New Practice Preview">
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">
                  {planner.quickCreate.statusLabel}
                </p>
                <h3 className="mt-2 text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                  {planner.quickCreate.defaultPractice.name}
                </h3>
                <div className="mt-4 grid gap-3 text-sm text-[#51635C] sm:grid-cols-2">
                  <p>
                    <span className="font-black text-[#0B3D2E]">Date:</span> {planner.quickCreate.defaultPractice.date}
                  </p>
                  <p>
                    <span className="font-black text-[#0B3D2E]">Time:</span>{" "}
                    {planner.quickCreate.defaultPractice.startTime} - {planner.quickCreate.defaultPractice.endTime}
                  </p>
                  <p>
                    <span className="font-black text-[#0B3D2E]">Location:</span>{" "}
                    {planner.quickCreate.defaultPractice.location}
                  </p>
                  <p>
                    <span className="font-black text-[#0B3D2E]">Type:</span>{" "}
                    {planner.quickCreate.defaultPractice.practiceType}
                  </p>
                </div>
                <p className="mt-4 text-sm leading-6 text-[#51635C]">{planner.quickCreate.defaultPractice.notes}</p>
              </div>
              <div className="rounded-[8px] border border-[#E8DCC8] bg-white p-4">
                <p className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">Practice Types</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {planner.quickCreate.availableTypes.map((practiceType) => (
                    <span
                      key={practiceType}
                      className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${
                        practiceTypeStyles[practiceType] ?? "border-[#E8DCC8] bg-[#FCFAF5] text-[#51635C]"
                      }`}
                    >
                      {practiceType}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </SectionShell>
        </div>
      </div>
    </main>
  );
}
