import Link from "next/link";
import { connection } from "next/server";
import {
  loadPlayerDevelopmentReadModel,
  type DevelopmentGoalStatus,
  type DevelopmentSkillRating,
  type PlayerDevelopmentListItem,
  type SkillRatingGroupReadModel,
} from "../../lib/services/playerDevelopmentService";

const statusStyles: Record<string, string> = {
  Active: "border-[#2E6F76] bg-[#E6F3F1] text-[#0B3D2E]",
  Completed: "border-[#51635C] bg-[#FCFAF5] text-[#51635C]",
  Upcoming: "border-[#B8892D] bg-[#F0C96A]/35 text-[#0B3D2E]",
  Draft: "border-[#D9D0C0] bg-white text-[#51635C]",
  Overdue: "border-[#8A2E2E] bg-[#FFF4F1] text-[#8A2E2E]",
  "This Week": "border-[#B8892D] bg-[#F0C96A]/35 text-[#0B3D2E]",
  Scheduled: "border-[#2E6F76] bg-[#E6F3F1] text-[#0B3D2E]",
};

const trendStyles: Record<DevelopmentSkillRating["trend"], string> = {
  Improving: "border-[#2E6F76] bg-[#E6F3F1] text-[#0B3D2E]",
  Steady: "border-[#51635C] bg-[#FCFAF5] text-[#51635C]",
  "Needs Focus": "border-[#8A2E2E] bg-[#FFF4F1] text-[#8A2E2E]",
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`w-fit shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
        statusStyles[status] ?? "border-[#E8DCC8] bg-white text-[#51635C]"
      }`}
    >
      {status}
    </span>
  );
}

function DevelopmentList({
  items,
  emptyLabel,
}: {
  items: PlayerDevelopmentListItem[];
  emptyLabel: string;
}) {
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
            </div>
            <StatusBadge status={item.status ?? item.meta} />
          </div>
        </article>
      ))}
    </div>
  );
}

function SkillRatingGroups({ groups }: { groups: SkillRatingGroupReadModel[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((group) => (
        <article key={group.key} className="rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h3 className="text-sm font-black text-[#0B3D2E]">{group.label}</h3>
              <p className="mt-1 text-sm leading-6 text-[#51635C]">
                Average {group.average} / Top {group.topPlayer}
              </p>
            </div>
            <span className="w-fit rounded-full border border-[#E8DCC8] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#51635C]">
              {group.needsFocusCount} focus
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {group.ratings.map((rating) => (
              <div
                key={`${group.key}-${rating.playerName}`}
                className="grid gap-3 rounded-[8px] border border-[#D9D0C0] bg-white p-3 text-sm md:grid-cols-[0.65fr_0.35fr]"
              >
                <div>
                  <p className="font-black text-[#0B3D2E]">{rating.playerName}</p>
                  <p className="mt-1 leading-6 text-[#51635C]">{rating.note}</p>
                </div>
                <div className="flex items-center justify-between gap-2 md:justify-end">
                  <span className="text-xl font-black text-[#0B3D2E]">{rating.value}</span>
                  <span
                    className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                      trendStyles[rating.trend]
                    }`}
                  >
                    {rating.trend}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function SkillBars({ ratings }: { ratings: DevelopmentSkillRating[] }) {
  return (
    <div className="space-y-3">
      {ratings.map((rating) => (
        <div key={rating.key} className="rounded-[8px] border border-[#E8DCC8] bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-[#0B3D2E]">{rating.label}</p>
            <span className="text-sm font-black text-[#0B3D2E]">{rating.value}/10</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#E8DCC8]">
            <div className="h-2 rounded-full bg-[#2E6F76]" style={{ width: `${rating.value * 10}%` }} />
          </div>
          <div className="mt-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <p className="text-sm leading-6 text-[#51635C]">{rating.note}</p>
            <span
              className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                trendStyles[rating.trend]
              }`}
            >
              {rating.trend}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalStatusLegend() {
  const statuses: DevelopmentGoalStatus[] = ["Active", "Upcoming", "Completed"];

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {statuses.map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  );
}

export default async function PlayerDevelopmentPage() {
  await connection();
  const development = loadPlayerDevelopmentReadModel();
  const selectedPlayer = development.selectedPlayer;

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
                Player Development
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
              {development.currentDateLabel}
            </p>
            <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              Player Development
            </h2>
          </div>
          <div className="rounded-[8px] border border-[#E8DCC8] bg-white px-4 py-3 text-sm font-semibold text-[#51635C]">
            Read-only foundation
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {development.dashboardCards.map((card) => (
            <article key={card.label} className="rounded-[8px] border border-[#E8DCC8] bg-white/90 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">{card.label}</p>
              <p className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#0B3D2E]">{card.value}</p>
              <p className="mt-2 text-sm leading-6 text-[#51635C]">{card.detail}</p>
            </article>
          ))}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <SectionShell eyebrow="Plans" title="Player Development Plans">
            <DevelopmentList items={development.developmentPlans} emptyLabel="No player development plans yet." />
          </SectionShell>

          <SectionShell eyebrow="Goals" title="Goals">
            <GoalStatusLegend />
            <DevelopmentList items={development.goals} emptyLabel="No goals yet." />
          </SectionShell>
        </div>

        <div className="mt-5">
          <SectionShell eyebrow="Skill Ratings" title="Skill Ratings">
            <SkillRatingGroups groups={development.skillRatings} />
          </SectionShell>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionShell eyebrow="Reviews" title="Review Schedule">
            <DevelopmentList items={development.reviewSchedule} emptyLabel="No reviews scheduled." />
          </SectionShell>

          <SectionShell eyebrow="Notes" title="Recent Coach Notes">
            <DevelopmentList items={development.recentCoachNotes} emptyLabel="No coach notes yet." />
          </SectionShell>
        </div>

        <div className="mt-5">
          <SectionShell eyebrow="Player Detail" title="Read-only Player Detail">
            {selectedPlayer ? (
              <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-5">
                  <article className="rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">
                          Development Summary
                        </p>
                        <h3 className="mt-2 text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                          {selectedPlayer.playerName}
                        </h3>
                        <p className="mt-1 text-sm font-semibold text-[#51635C]">{selectedPlayer.playerMeta}</p>
                      </div>
                      <StatusBadge status={selectedPlayer.planStatus} />
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[#51635C]">{selectedPlayer.developmentSummary}</p>
                  </article>

                  <article className="rounded-[8px] border border-[#E8DCC8] bg-white p-4">
                    <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">Strengths</h4>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedPlayer.strengths.map((strength) => (
                        <span
                          key={strength}
                          className="rounded-full border border-[#2E6F76] bg-[#E6F3F1] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#0B3D2E]"
                        >
                          {strength}
                        </span>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-[8px] border border-[#E8DCC8] bg-white p-4">
                    <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                      Improvement Areas
                    </h4>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedPlayer.improvementAreas.map((area) => (
                        <span
                          key={area}
                          className="rounded-full border border-[#B8892D] bg-[#F0C96A]/35 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#0B3D2E]"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-[8px] border border-dashed border-[#D9D0C0] bg-[#FCFAF5] p-4">
                    <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                      Progress Timeline
                    </h4>
                    <p className="mt-3 text-sm leading-6 text-[#51635C]">
                      {selectedPlayer.progressTimelinePlaceholder}
                    </p>
                  </article>
                </div>

                <div className="space-y-5">
                  <article className="rounded-[8px] border border-[#E8DCC8] bg-white p-4">
                    <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">Current Goals</h4>
                    <div className="mt-3">
                      <DevelopmentList items={selectedPlayer.currentGoals} emptyLabel="No current goals." />
                    </div>
                  </article>

                  <article className="rounded-[8px] border border-[#E8DCC8] bg-white p-4">
                    <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">Skill Ratings</h4>
                    <div className="mt-3">
                      <SkillBars ratings={selectedPlayer.skillRatings} />
                    </div>
                  </article>

                  <article className="rounded-[8px] border border-[#E8DCC8] bg-white p-4">
                    <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">Recent Notes</h4>
                    <div className="mt-3">
                      <DevelopmentList items={selectedPlayer.recentNotes} emptyLabel="No recent notes." />
                    </div>
                  </article>

                  <article className="rounded-[8px] border border-[#E8DCC8] bg-white p-4">
                    <h4 className="text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                      Upcoming Review
                    </h4>
                    <div className="mt-3">
                      {selectedPlayer.upcomingReview ? (
                        <DevelopmentList items={[selectedPlayer.upcomingReview]} emptyLabel="No upcoming review." />
                      ) : (
                        <EmptyState label="No upcoming review." />
                      )}
                    </div>
                  </article>
                </div>
              </div>
            ) : (
              <EmptyState label="No player selected." />
            )}
          </SectionShell>
        </div>
      </div>
    </main>
  );
}
