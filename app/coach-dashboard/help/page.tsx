import Link from "next/link";
import { CoachBreadcrumbs, CoachHeader } from "../components/CoachChrome";
import { resolveBetaSupportContact } from "../../lib/services/betaSupportService";

const workflowHelp = [
  ["Roster and players", "Add permanent players to the correct Men’s or Women’s season roster before event setup.", "/coach-dashboard/roster"],
  ["Tournament or Qualifying", "Choose Tournament for event operations or Qualifying for team-selection sessions.", "/dashboard"],
  ["Pairings and scorecards", "Assign every player once, generate scorecards, and wait for readiness to report Ready.", "/dashboard"],
  ["QR and share access", "Distribute the existing QR link or scoring code only after the event is safe to share.", "/dashboard"],
  ["Scoring", "Players use the universal homepage code entry. Keep the scorecard open if connectivity becomes unstable.", "/player-tournament-login"],
  ["Review", "Use the Tournament workspace Review Queue for mismatches and official resolution.", "/dashboard"],
  ["Finalization", "Finalize only after all required submissions and Reviews are complete with no unresolved discrepancies.", "/dashboard"],
] as const;

const troubleshooting = [
  "Confirm the event, round, participant, and readiness state before rotating codes or regenerating anything.",
  "For a save problem, stop repeated taps, preserve the open browser, and verify the authoritative state after reconnecting.",
  "For QR or code trouble, use the existing access path and never send raw codes, share tokens, passwords, or Supabase keys to support.",
  "During live play, report the event ID, player, hole, timestamp, device, and whether play is blocked.",
];

export default function CoachHelpPage() {
  const support = resolveBetaSupportContact(process.env.NEXT_PUBLIC_BETA_SUPPORT_CONTACT);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F6F1E6] text-[#0B3D2E]">
      <CoachHeader />
      <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
        <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Help & Support" }]} />
        <header className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Controlled beta</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.03em]">Help & Support</h1>
          <p className="mt-3 text-base leading-7 text-[#51635C]">Quick guidance for preparing, running, reviewing, and finalizing an event safely.</p>
        </header>

        <section aria-labelledby="workflow-help" className="mt-8 rounded-lg border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6">
          <h2 id="workflow-help" className="text-2xl font-black">Event workflow</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {workflowHelp.map(([title, detail, href]) => (
              <article key={title} className="rounded-lg border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                <h3 className="font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#51635C]">{detail}</p>
                <Link href={href} className="mt-3 inline-flex min-h-11 items-center rounded-lg font-bold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8892D]">Open workflow</Link>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="troubleshooting-help" className="mt-5 rounded-lg border border-[#E8DCC8] bg-white p-5 sm:p-6">
          <h2 id="troubleshooting-help" className="text-2xl font-black">Common troubleshooting</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[#51635C]">{troubleshooting.map((item) => <li key={item} className="flex gap-3"><span aria-hidden="true" className="font-black text-[#B8892D]">•</span><span>{item}</span></li>)}</ul>
        </section>

        <section aria-labelledby="contact-support" className="mt-5 rounded-lg border border-[#2E6F76] bg-[#E6F3F1] p-5 sm:p-6">
          <h2 id="contact-support" className="text-2xl font-black">Contact beta support</h2>
          <p className="mt-2 text-sm leading-6 text-[#51635C]">If live play is blocked or authoritative scores appear wrong, mark the report urgent and stop repeated edits. Never include credentials or access codes.</p>
          {support.href ? <a aria-label="Contact Clubhouse HQ beta support" href={support.href} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#0B3D2E] px-5 font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8892D] focus-visible:ring-offset-2">{support.label}</a> : <p role="status" className="mt-4 rounded-lg border border-[#2E6F76]/40 bg-white px-4 py-3 font-bold">{support.label}</p>}
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold"><Link href="/coach-dashboard" className="min-h-11 rounded-lg border border-[#0B3D2E] px-4 py-3">Return to Dashboard</Link><Link href="/coach-dashboard/tasks" className="min-h-11 rounded-lg border border-[#0B3D2E] px-4 py-3">Open coach tasks</Link></div>
        </section>
      </div>
    </main>
  );
}
