import Link from "next/link";
import type { ReactNode } from "react";

const groups = [
  {
    label: "Team Management",
    links: [
      ["Rosters", "/coach-dashboard/roster"],
      ["Players", "/coach-dashboard/players"],
      ["Player Development", "/coach-dashboard/player-development"],
    ],
  },
  {
    label: "Competition",
    links: [
      ["Qualifying", "/coach-dashboard/qualifying-manager"],
      ["Tournament Director", "/dashboard"],
      ["Live Scores", "/live"],
    ],
  },
  {
    label: "Performance",
    links: [
      ["Player Profiles", "/coach-dashboard/players"],
      ["Team Performance", "/coach-dashboard/team-performance"],
      ["Season Statistics", "/dashboard/season-statistics"],
    ],
  },
  {
    label: "Configuration",
    links: [
      ["Statistics", "/coach-dashboard/statistics"],
      ["Tasks", "/coach-dashboard/tasks"],
      ["Calendar", "/coach-dashboard/calendar"],
      ["Practice Planner", "/coach-dashboard/practice-planner"],
      ["Help & Support", "/coach-dashboard/help"],
    ],
  },
] as const;

export function CoachHeader() {
  return (
    <header className="relative z-40 border-b border-[#E8DCC8] bg-[#FCFAF5]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <Link href="/" className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8892D]">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0B3D2E] text-xs font-black tracking-[0.18em] text-white">HQ</span>
          <span><span className="block font-black">Clubhouse HQ</span><span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[#B8892D]">Coach Portal</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <nav aria-label="Coach quick links" className="hidden items-center gap-1 xl:flex">
            <Link href="/coach-dashboard/qualifying-manager" className="rounded-lg px-2 py-3 text-xs font-bold hover:bg-[#F6F1E6]">Qualifying</Link>
            <Link href="/coach-dashboard/players" className="rounded-lg px-2 py-3 text-xs font-bold hover:bg-[#F6F1E6]">Players</Link>
            <Link href="/coach-dashboard/team-performance" className="rounded-lg px-2 py-3 text-xs font-bold hover:bg-[#F6F1E6]">Team Performance</Link>
            <Link href="/coach-dashboard/statistics" className="rounded-lg px-2 py-3 text-xs font-bold hover:bg-[#F6F1E6]">Stat Configuration</Link>
          </nav>
          <Link href="/coach-dashboard" className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-black text-[#0B3D2E] hover:bg-[#F6F1E6] sm:inline-flex">Dashboard</Link>
          <details className="group relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-[#0B3D2E] bg-white px-4 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8892D]">Coach Menu</summary>
            <nav aria-label="Coach navigation" className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[#D9D0C0] bg-white p-4 shadow-xl">
              <div className="grid gap-4 sm:grid-cols-2">
                {groups.map((group) => (
                  <section key={group.label} aria-labelledby={`coach-nav-${group.label.replaceAll(" ", "-").toLowerCase()}`}>
                    <h2 id={`coach-nav-${group.label.replaceAll(" ", "-").toLowerCase()}`} className="text-[10px] font-black uppercase tracking-[0.18em] text-[#B8892D]">{group.label}</h2>
                    <div className="mt-2 grid gap-1">{group.links.map(([label, href]) => <Link key={href} href={href} className="rounded-md px-2 py-2 text-sm font-bold hover:bg-[#F6F1E6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8892D]">{label}</Link>)}</div>
                  </section>
                ))}
              </div>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function CoachBreadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 overflow-x-auto text-sm font-bold text-[#51635C]">
      <ol className="flex min-w-max items-center gap-2">
        {items.map((item, index) => <li key={`${item.label}-${index}`} className="flex items-center gap-2">{index ? <span aria-hidden="true">/</span> : null}{item.href ? <Link href={item.href} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8892D]">{item.label}</Link> : <span aria-current="page" className="text-[#0B3D2E]">{item.label}</span>}</li>)}
      </ol>
    </nav>
  );
}

export function CoachState({
  title,
  description,
  tone = "neutral",
  children,
}: {
  title: string;
  description?: string;
  tone?: "neutral" | "error";
  children?: ReactNode;
}) {
  return <div role={tone === "error" ? "alert" : undefined} aria-live={tone === "error" ? undefined : "polite"} className={`rounded-lg border p-5 ${tone === "error" ? "border-[#8A2E2E]/40 bg-[#FFF4F1] text-[#8A2E2E]" : "border-dashed border-[#D9D0C0] bg-[#FCFAF5] text-[#51635C]"}`}><h2 className="font-black text-current">{title}</h2>{description ? <p className="mt-1 text-sm">{description}</p> : null}{children ? <div className="mt-4">{children}</div> : null}</div>;
}
