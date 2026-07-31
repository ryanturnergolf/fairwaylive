import Link from "next/link";
import { CoachBreadcrumbs, CoachHeader } from "../components/CoachChrome";

export default function RosterLandingPage() {
  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <CoachHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Rosters" }]} />
        <Link href="/coach-dashboard" className="text-sm font-bold">← Coach Dashboard</Link>
        <p className="mt-10 text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Roster Management</p>
        <h1 className="mt-2 text-4xl font-black">Choose a roster</h1>
        <p className="mt-3 text-[#51635C]">Manage permanent player identities and season membership without changing historical event records.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/coach-dashboard/roster/men" className="rounded-lg border border-[#E8DCC8] bg-white p-6 text-xl font-black shadow-sm">Men&apos;s Roster</Link>
          <Link href="/coach-dashboard/roster/women" className="rounded-lg border border-[#E8DCC8] bg-white p-6 text-xl font-black shadow-sm">Women&apos;s Roster</Link>
        </div>
      </div>
    </main>
  );
}
