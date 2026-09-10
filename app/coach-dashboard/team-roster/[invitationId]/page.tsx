"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CoachBreadcrumbs, CoachHeader } from "../../components/CoachChrome";
import { loadInvitedTeamRoster, loadInvitedTeamStatisticPreferences, saveInvitedTeamRoster, saveInvitedTeamStatisticPreferences, type InvitedTeamRoster, type TournamentTeamStatisticPreference } from "../../../lib/services/tournamentTeamInvitationService";

export default function InvitedTeamRosterPage() {
  const invitationId = String(useParams<{ invitationId: string }>().invitationId ?? "");
  const [context, setContext] = useState<InvitedTeamRoster | null>(null);
  const [slots, setSlots] = useState<string[]>(Array(5).fill(""));
  const [message, setMessage] = useState("Loading assigned team roster...");
  const [statistics, setStatistics] = useState<TournamentTeamStatisticPreference[]>([]);

  useEffect(() => {
    void Promise.all([loadInvitedTeamRoster(invitationId), loadInvitedTeamStatisticPreferences(invitationId).catch(() => [])]).then(([loaded, preferences]) => {
      setContext(loaded);
      setStatistics(preferences);
      setSlots(Array.from({ length: 5 }, (_, index) => loaded.players.find((player) => player.slot === index + 1)?.playerName ?? ""));
      setMessage("");
    }).catch(() => setMessage("This invitation is invalid or unavailable."));
  }, [invitationId]);

  const save = async () => {
    if (!context) return;
    setMessage("Saving roster...");
    try {
      const saved = await saveInvitedTeamRoster(invitationId, slots.map((playerName, index) => ({
        playerId: `team-roster:${context.tournamentTeamId}:${index + 1}`,
        playerName: playerName.trim(),
        slot: index + 1,
      })).filter((player) => player.playerName));
      if (statistics.length > 0) setStatistics(await saveInvitedTeamStatisticPreferences(invitationId, statistics.filter((item) => item.state === "optional" && item.enabled).map((item) => item.definitionVersionId)));
      setContext(saved);
      setMessage("Roster saved.");
    } catch { setMessage("This team roster could not be saved."); }
  };

  return <main className="min-h-screen overflow-x-hidden bg-[#F6F1E6] text-[#0B3D2E]">
    <CoachHeader />
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Assigned Team Roster" }]} />
      <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Tournament roster access</p>
      <h1 className="mt-2 text-4xl font-black">{context?.teamName ?? "Assigned team"}</h1>
      {context ? <p className="mt-2 text-[#51635C]">{context.tournamentName}. You can edit only this team&apos;s five roster positions.</p> : null}
      <section className="mt-7 rounded-[28px] border border-[#E8DCC8] bg-white p-5 sm:p-7" aria-label="Assigned team roster positions">
        <div className="space-y-4">{slots.map((value, index) => <label key={index} className="block text-sm font-black">Player {index + 1}<input value={value} onChange={(event) => setSlots((current) => current.map((item, slot) => slot === index ? event.target.value : item))} disabled={!context} maxLength={120} className="mt-2 min-h-12 w-full rounded-xl border border-[#D9D0C0] px-4 text-base font-medium" /></label>)}</div>
        <button type="button" disabled={!context} onClick={() => void save()} className="mt-6 min-h-12 w-full rounded-xl bg-[#0B3D2E] px-5 py-3 font-black text-white disabled:opacity-50 sm:w-auto">Save assigned roster</button>
        {message ? <p role="status" className="mt-4 text-sm font-bold">{message}</p> : null}
      </section>
      {context && statistics.length > 0 ? <section className="mt-6 rounded-[28px] border border-[#E8DCC8] bg-white p-5 sm:p-7" aria-label="Assigned team statistics">
        <h2 className="text-xl font-black">Statistics for your team</h2>
        <div className="mt-4 space-y-3">{statistics.map((item) => <label key={item.definitionVersionId} className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-[#E8DCC8] px-4 py-3 font-bold">
          <span>{item.name}<span className="ml-2 text-xs uppercase text-[#51635C]">{item.state}</span></span>
          <input type="checkbox" checked={item.enabled} disabled={item.state === "required"} onChange={(event) => setStatistics((current) => current.map((entry) => entry.definitionVersionId === item.definitionVersionId ? { ...entry, enabled: event.target.checked } : entry))} className="h-6 w-6" />
        </label>)}</div>
      </section> : null}
    </div>
  </main>;
}
