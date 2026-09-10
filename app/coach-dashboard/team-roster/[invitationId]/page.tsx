"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CoachBreadcrumbs, CoachHeader } from "../../components/CoachChrome";
import { loadInvitedTeamRoster, saveInvitedTeamRoster, type InvitedTeamRoster } from "../../../lib/services/tournamentTeamInvitationService";

export default function InvitedTeamRosterPage() {
  const invitationId = String(useParams<{ invitationId: string }>().invitationId ?? "");
  const [context, setContext] = useState<InvitedTeamRoster | null>(null);
  const [slots, setSlots] = useState<string[]>(Array(5).fill(""));
  const [message, setMessage] = useState("Loading assigned team roster...");

  useEffect(() => {
    void loadInvitedTeamRoster(invitationId).then((loaded) => {
      setContext(loaded);
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
    </div>
  </main>;
}
