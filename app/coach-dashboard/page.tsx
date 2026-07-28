"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadCoachDashboardReadModel,
  type CoachDashboardAlert,
  type CoachDashboardListItem,
  type CoachDashboardReadModel,
} from "../lib/services/coachDashboardService";
import { loadTournamentsFromStorage } from "../lib/tournamentStorage";

const emptyDashboard: CoachDashboardReadModel = {
  generatedAt: "",
  today: {
    currentDate: "",
    upcomingPractices: [],
    upcomingTournaments: [],
    tasksRequiringAttention: [],
    activeTournaments: [],
  },
  quickActions: [],
  programSnapshot: {
    metrics: [],
    recentResults: [],
  },
  alerts: [],
  recentActivity: {
    recentlyEditedTournaments: [],
    recentlyFinalizedTournaments: [],
    recentlyCompletedPractices: [],
    recentPlayerUpdates: [],
  },
};

const alertStyles: Record<CoachDashboardAlert["severity"], string> = {
  info: "border-[#2E6F76] bg-[#E6F3F1] text-[#0B3D2E]",
  warning: "border-[#B8892D] bg-[#F0C96A]/30 text-[#0B3D2E]",
  critical: "border-[#8A2E2E] bg-[#FFF4F1] text-[#8A2E2E]",
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

function ItemList({ items, emptyLabel }: { items: CoachDashboardListItem[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="block rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4 transition duration-200 hover:border-[#B8892D] hover:bg-[#F6F1E6]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-[#0B3D2E]">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-[#51635C]">{item.detail}</p>
            </div>
            <span className="shrink-0 rounded-full border border-[#E8DCC8] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#51635C]">
              {item.meta}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function CoachDashboardPage() {
  const [dashboard, setDashboard] = useState<CoachDashboardReadModel>(emptyDashboard);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    void loadCoachDashboardReadModel(loadTournamentsFromStorage())
      .then((readModel) => {
        if (!isCancelled) {
          setDashboard(readModel);
        }
      })
      .catch((error) => {
        console.warn("[CoachDashboard] Unable to load dashboard.", error);
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
                Coach Portal
              </p>
            </div>
          </Link>
          <nav className="hidden items-center gap-5 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#0B3D2E]/75 md:flex">
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/tasks">
              Tasks
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/calendar">
              Calendar
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/practice-planner">
              Practice Planner
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/qualifying-manager">
              Qualifying
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/roster">
              Roster
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/statistics">
              Stat Configuration
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/player-development">
              Player Development
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/dashboard">
              Director Dashboard
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
              {isLoading ? "Loading" : dashboard.today.currentDate}
            </p>
            <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              Coach Dashboard
            </h2>
          </div>
          <div className="rounded-[8px] border border-[#E8DCC8] bg-white px-4 py-3 text-sm font-semibold text-[#51635C]">
            Read-only program overview
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <SectionShell eyebrow="Today" title="Daily Command Center">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                  Upcoming Practices
                </h3>
                <ItemList items={dashboard.today.upcomingPractices} emptyLabel="No practices scheduled." />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                  Upcoming Tournaments
                </h3>
                <ItemList items={dashboard.today.upcomingTournaments} emptyLabel="No upcoming tournaments." />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                  Tasks Requiring Attention
                </h3>
                <ItemList items={dashboard.today.tasksRequiringAttention} emptyLabel="No tasks requiring attention." />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                  Active Tournaments
                </h3>
                <ItemList items={dashboard.today.activeTournaments} emptyLabel="No active tournaments." />
              </div>
            </div>
          </SectionShell>

          <SectionShell eyebrow="Quick Actions" title="Shortcuts">
            <div className="grid gap-3">
              {dashboard.quickActions.map((action) =>
                action.enabled ? (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="rounded-[8px] border border-[#0B3D2E] bg-[#0B3D2E] px-4 py-4 text-[#F6F1E6] transition duration-200 hover:-translate-y-0.5"
                  >
                    <span className="block text-sm font-black uppercase tracking-[0.2em]">{action.label}</span>
                    <span className="mt-1 block text-sm text-[#F6F1E6]/75">{action.detail}</span>
                  </Link>
                ) : (
                  <div
                    key={action.label}
                    className="rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-4 text-[#51635C]"
                  >
                    <span className="block text-sm font-black uppercase tracking-[0.2em]">{action.label}</span>
                    <span className="mt-1 block text-sm">{action.detail}</span>
                  </div>
                )
              )}
            </div>
          </SectionShell>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <SectionShell eyebrow="Program Snapshot" title="Roster And Season">
            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              <Link href="/coach-dashboard/roster/men" className="rounded-[8px] border border-[#0B3D2E] px-4 py-3 text-center text-sm font-black">
                Manage Men&apos;s Roster
              </Link>
              <Link href="/coach-dashboard/roster/women" className="rounded-[8px] border border-[#0B3D2E] px-4 py-3 text-center text-sm font-black">
                Manage Women&apos;s Roster
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {dashboard.programSnapshot.metrics.map((metric) => (
                <div key={metric.label} className="rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                  <p className="text-3xl font-black text-[#0B3D2E]">{metric.value}</p>
                  <p className="mt-2 text-sm font-black uppercase tracking-[0.22em] text-[#B8892D]">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-sm text-[#51635C]">{metric.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                Recent Results
              </h3>
              <ItemList items={dashboard.programSnapshot.recentResults} emptyLabel="No finalized results yet." />
            </div>
          </SectionShell>

          <SectionShell eyebrow="Alerts" title="Items To Watch">
            {dashboard.alerts.length === 0 ? (
              <EmptyState label="No alerts right now." />
            ) : (
              <div className="grid gap-3">
                {dashboard.alerts.map((alert) => (
                  <Link
                    key={alert.id}
                    href={alert.href}
                    className={`rounded-[8px] border px-4 py-4 transition duration-200 hover:-translate-y-0.5 ${alertStyles[alert.severity]}`}
                  >
                    <span className="block text-sm font-black uppercase tracking-[0.2em]">{alert.title}</span>
                    <span className="mt-1 block text-sm">{alert.detail}</span>
                  </Link>
                ))}
              </div>
            )}
          </SectionShell>
        </div>

        <div className="mt-5">
          <SectionShell eyebrow="Recent Activity" title="Latest Program Movement">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                  Recently Edited Tournaments
                </h3>
                <ItemList items={dashboard.recentActivity.recentlyEditedTournaments} emptyLabel="No recently edited tournaments." />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                  Recently Finalized Tournaments
                </h3>
                <ItemList items={dashboard.recentActivity.recentlyFinalizedTournaments} emptyLabel="No recently finalized tournaments." />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                  Recently Completed Practices
                </h3>
                <ItemList items={dashboard.recentActivity.recentlyCompletedPractices} emptyLabel="No completed practices yet." />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#51635C]">
                  Recent Player Updates
                </h3>
                <ItemList items={dashboard.recentActivity.recentPlayerUpdates} emptyLabel="No recent player updates." />
              </div>
            </div>
          </SectionShell>
        </div>
      </div>
    </main>
  );
}
