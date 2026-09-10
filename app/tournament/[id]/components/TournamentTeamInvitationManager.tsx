"use client";

import { useEffect, useState } from "react";
import {
  createTournamentTeamInvitation,
  listTournamentTeamInvitationContext,
  revokeTournamentTeamInvitation,
  type TournamentTeamInvitation,
} from "../../../lib/services/tournamentTeamInvitationService";

type Team = { id: string; displayName: string; displayOrder: number };

export default function TournamentTeamInvitationManager({ tournamentId, isReadOnly }: { tournamentId: string; isReadOnly: boolean }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [invitations, setInvitations] = useState<TournamentTeamInvitation[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");

  const reload = async () => {
    const context = await listTournamentTeamInvitationContext(tournamentId);
    setTeams(context.teams);
    setInvitations(context.invitations);
  };

  useEffect(() => { void reload().catch(() => setFeedback("Team roster invitations are unavailable.")); }, [tournamentId]);

  const create = async (team: Team) => {
    setFeedback("");
    try {
      const invitation = await createTournamentTeamInvitation(team.id, emails[team.id] ?? "");
      const link = `${window.location.origin}/coach-dashboard/team-roster-invitation?token=${encodeURIComponent(invitation.rawToken ?? "")}`;
      setLinks((current) => ({ ...current, [invitation.id]: link }));
      setInvitations((current) => [invitation, ...current]);
      setEmails((current) => ({ ...current, [team.id]: "" }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Team roster invitation is unavailable.");
    }
  };

  return (
    <section aria-labelledby="team-roster-invitations-title" className="mb-6 rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-5 sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Team access</p>
      <h3 id="team-roster-invitations-title" className="mt-2 text-2xl font-black">Coach roster-entry links</h3>
      <p className="mt-2 text-sm text-[#51635C]">Each authenticated coach can manage only the five roster positions for the assigned team.</p>
      {feedback ? <p role="alert" className="mt-4 text-sm font-bold text-[#8A3E2F]">{feedback}</p> : null}
      <div className="mt-5 space-y-4">
        {teams.map((team) => (
          <div key={team.id} className="rounded-2xl border border-[#E8DCC8] bg-white p-4">
            <h4 className="font-black">{team.displayName}</h4>
            {!isReadOnly ? <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <label className="flex-1 text-sm font-bold">Invited coach email
                <input aria-label={`${team.displayName} invited coach email`} type="email" value={emails[team.id] ?? ""} onChange={(event) => setEmails((current) => ({ ...current, [team.id]: event.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-[#D9D0C0] px-4" />
              </label>
              <button type="button" onClick={() => void create(team)} className="min-h-12 self-end rounded-xl bg-[#0B3D2E] px-5 py-3 font-black text-white">Create link</button>
            </div> : null}
          </div>
        ))}
      </div>
      {invitations.length ? <div className="mt-5 space-y-3" aria-label="Issued team roster invitations">
        {invitations.map((invitation) => <article key={invitation.id} className="rounded-2xl border border-[#E8DCC8] bg-white p-4 text-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><strong>{invitation.teamName} · {invitation.invitedEmail}</strong><span className="font-black uppercase">{invitation.state}</span></div>
          {links[invitation.id] ? <input aria-label={`${invitation.teamName} roster invitation link`} readOnly value={links[invitation.id]} className="mt-3 min-h-12 w-full rounded-xl border border-[#D9D0C0] px-3 font-mono text-xs" /> : null}
          {!isReadOnly && invitation.state !== "revoked" ? <button type="button" onClick={() => void revokeTournamentTeamInvitation(invitation.id).then(reload).catch(() => setFeedback("Team roster invitation is unavailable."))} className="mt-3 min-h-12 rounded-xl border border-[#8A3E2F] px-4 font-black text-[#8A3E2F]">Revoke</button> : null}
        </article>)}
      </div> : null}
    </section>
  );
}
