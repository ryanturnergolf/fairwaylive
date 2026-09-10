"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseAuthAccessToken } from "../../lib/supabaseClient";
import { redeemTournamentTeamInvitation } from "../../lib/services/tournamentTeamInvitationService";

export default function TeamRosterInvitationPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Validating your team roster invitation...");

  useEffect(() => {
    const rawToken = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!rawToken) { setMessage("This invitation is invalid or unavailable."); return; }
    void getSupabaseAuthAccessToken().then((accessToken) => {
      if (!accessToken) {
        const next = `${window.location.pathname}${window.location.search}`;
        router.replace(`/coach-auth?next=${encodeURIComponent(next)}`);
        return null;
      }
      return redeemTournamentTeamInvitation(rawToken);
    }).then((invitation) => {
      if (invitation) router.replace(`/coach-dashboard/team-roster/${encodeURIComponent(invitation.id)}`);
    }).catch(() => setMessage("This invitation is invalid or unavailable."));
  }, [router]);

  return <main className="flex min-h-screen items-center justify-center bg-[#F6F1E6] px-5 text-[#0B3D2E]"><p role="status" className="rounded-2xl border border-[#E8DCC8] bg-white p-6 font-bold">{message}</p></main>;
}
