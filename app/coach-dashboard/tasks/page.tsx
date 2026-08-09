"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadTaskCenterReadModel,
  type TaskCenterReadModel,
  type TaskCenterTask,
  type TaskPriority,
  type TaskStatus,
} from "../../lib/services/taskCenterService";
import { loadTournamentsFromStorage } from "../../lib/tournamentStorage";

type TaskViewKey = keyof TaskCenterReadModel["views"];

const emptyTaskCenter: TaskCenterReadModel = {
  generatedAt: "",
  currentDateLabel: "",
  dashboardCards: [],
  views: {
    today: [],
    upcoming: [],
    overdue: [],
    completed: [],
    all: [],
  },
};

const viewLabels: Array<{ key: TaskViewKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All Tasks" },
];

const priorityStyles: Record<TaskPriority, string> = {
  Low: "border-[#D9D0C0] bg-white text-[#51635C]",
  Medium: "border-[#B8892D] bg-[#F0C96A]/35 text-[#0B3D2E]",
  High: "border-[#8A5D1A] bg-[#FFF7D6] text-[#8A5D1A]",
  Critical: "border-[#8A2E2E] bg-[#FFF4F1] text-[#8A2E2E]",
};

const statusStyles: Record<TaskStatus, string> = {
  Pending: "border-[#B8892D] bg-[#F0C96A]/35 text-[#0B3D2E]",
  "In Progress": "border-[#2E6F76] bg-[#E6F3F1] text-[#0B3D2E]",
  Completed: "border-[#51635C] bg-[#FCFAF5] text-[#51635C]",
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

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span className={`w-fit shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${className}`}>
      {children}
    </span>
  );
}

function TaskList({ tasks }: { tasks: TaskCenterTask[] }) {
  if (tasks.length === 0) {
    return <EmptyState label="No tasks in this view." />;
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <Link
          key={task.id}
          href={task.actionLink}
          className="block rounded-[8px] border border-[#E8DCC8] bg-[#FCFAF5] p-4 transition duration-200 hover:border-[#B8892D] hover:bg-[#F6F1E6]"
        >
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <Badge className={priorityStyles[task.priority]}>{task.priority}</Badge>
                <Badge className={statusStyles[task.status]}>{task.status}</Badge>
                <Badge className="border-[#E8DCC8] bg-white text-[#51635C]">{task.category}</Badge>
              </div>
              <h3 className="mt-3 text-base font-black text-[#0B3D2E]">{task.title}</h3>
              <p className="mt-1 text-sm leading-6 text-[#51635C]">{task.description}</p>
            </div>
            <div className="grid gap-2 text-sm text-[#51635C] lg:min-w-72 lg:text-right">
              <p>
                <span className="font-black text-[#0B3D2E]">Due:</span> {task.dueDateLabel}
              </p>
              <p>
                <span className="font-black text-[#0B3D2E]">Age:</span> {task.ageLabel}
              </p>
              <p>
                <span className="font-black text-[#0B3D2E]">Module:</span> {task.relatedModule}
              </p>
              <p>
                <span className="font-black text-[#0B3D2E]">Entity:</span> {task.relatedEntity}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function CoachTasksPage() {
  const [taskCenter, setTaskCenter] = useState<TaskCenterReadModel>(emptyTaskCenter);
  const [activeView, setActiveView] = useState<TaskViewKey>("today");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    void loadTaskCenterReadModel(loadTournamentsFromStorage())
      .then((readModel) => {
        if (!isCancelled) {
          setTaskCenter(readModel);
        }
      })
      .catch((error) => {
        console.warn("[CoachTasks] Unable to load task center.", error);
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

  const activeTasks = taskCenter.views[activeView];

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
                Tasks
              </p>
            </div>
          </Link>
          <nav className="hidden items-center gap-5 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#0B3D2E]/75 md:flex">
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard">
              Coach Dashboard
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/calendar">
              Calendar
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/practice-planner">
              Practice Planner
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/qualifying-manager">
              Qualifying Manager
            </Link>
            <Link className="transition duration-200 hover:text-[#B8892D]" href="/coach-dashboard/player-development">
              Player Development
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-[#B8892D]">
              {isLoading ? "Loading" : taskCenter.currentDateLabel}
            </p>
            <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              Task And Workflow Center
            </h2>
          </div>
          <div className="rounded-[8px] border border-[#E8DCC8] bg-white px-4 py-3 text-sm font-semibold text-[#51635C]">
            Read-only attention queue
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {taskCenter.dashboardCards.map((card) => (
            <article key={card.label} className="rounded-[8px] border border-[#E8DCC8] bg-white/90 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#B8892D]">{card.label}</p>
              <p className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#0B3D2E]">{card.value}</p>
              <p className="mt-2 text-sm leading-6 text-[#51635C]">{card.detail}</p>
            </article>
          ))}
        </section>

        <div className="mt-5">
          <SectionShell eyebrow="Views" title="Unified Tasks">
            <div className="mb-5 flex flex-wrap gap-2">
              {viewLabels.map((view) => (
                <button
                  key={view.key}
                  type="button"
                  onClick={() => setActiveView(view.key)}
                  className={`rounded-[8px] border px-4 py-3 text-xs font-black uppercase tracking-[0.18em] transition duration-200 ${
                    activeView === view.key
                      ? "border-[#0B3D2E] bg-[#0B3D2E] text-[#F6F1E6]"
                      : "border-[#E8DCC8] bg-white text-[#51635C] hover:border-[#B8892D] hover:text-[#0B3D2E]"
                  }`}
                >
                  {view.label} ({taskCenter.views[view.key].length})
                </button>
              ))}
            </div>

            <TaskList tasks={activeTasks} />
          </SectionShell>
        </div>
      </div>
    </main>
  );
}
