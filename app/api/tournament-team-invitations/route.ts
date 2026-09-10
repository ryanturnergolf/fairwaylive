import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabaseClient";

export const dynamic = "force-dynamic";

class AuthenticationError extends Error {}
const genericInvitationError = "Tournament team invitation is unavailable.";

const authenticatedClient = async (request: Request) => {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!token) throw new AuthenticationError("Coach authentication is required.");
  const supabase = getSupabaseServerClient({ accessToken: token });
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new AuthenticationError("The coach session is invalid or expired.");
  return supabase;
};

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  try {
    const supabase = await authenticatedClient(request);
    if (body.action === "list") {
      const tournamentId = String(body.tournamentId ?? "");
      const [{ data: teams, error: teamError }, { data: invitations, error: invitationError }] = await Promise.all([
        supabase.from("tournament_teams").select("id,display_name,display_order").eq("tournament_id", tournamentId).order("display_order"),
        supabase.from("tournament_team_roster_invitations").select("id,tournament_id,tournament_team_id,invited_email,permission,state,expires_at").eq("tournament_id", tournamentId).order("created_at", { ascending: false }),
      ]);
      if (teamError) throw teamError;
      if (invitationError) throw invitationError;
      const teamNames = new Map((teams ?? []).map((team) => [team.id, team.display_name]));
      return NextResponse.json({
        teams: (teams ?? []).map((team) => ({ id: team.id, displayName: team.display_name, displayOrder: team.display_order })),
        invitations: (invitations ?? []).map((invitation) => ({
          id: invitation.id, tournamentId: invitation.tournament_id, tournamentTeamId: invitation.tournament_team_id,
          teamName: teamNames.get(invitation.tournament_team_id) ?? "Assigned team", invitedEmail: invitation.invited_email,
          permission: invitation.permission, state: invitation.state, expiresAt: invitation.expires_at,
        })),
      });
    }
    if (body.action === "listStatisticDefinitions") {
      const { data, error } = await supabase.from("statistic_definition_versions").select("id,name,definition_id,version,statistic_definitions!inner(is_active)").eq("statistic_definitions.is_active", true).order("name");
      if (error) throw error;
      const latest = new Map<string, { definitionVersionId: string; name: string; version: number }>();
      for (const row of data ?? []) {
        const current = latest.get(row.definition_id);
        if (!current || row.version > current.version) latest.set(row.definition_id, { definitionVersionId: row.id, name: row.name, version: row.version });
      }
      return NextResponse.json([...latest.values()].map(({ definitionVersionId, name }) => ({ definitionVersionId, name })));
    }
    const rpc = body.action === "create"
      ? ["create_tournament_team_roster_invitation", { input_tournament_team_id: body.tournamentTeamId, input_invited_email: body.invitedEmail }]
      : body.action === "redeem"
        ? ["redeem_tournament_team_roster_invitation", { input_raw_token: body.rawToken }]
        : body.action === "revoke"
          ? ["revoke_tournament_team_roster_invitation", { input_invitation_id: body.invitationId }]
          : body.action === "loadRoster"
            ? ["get_tournament_team_roster_access", { input_invitation_id: body.invitationId }]
            : body.action === "saveRoster"
              ? ["replace_tournament_team_invited_roster", { input_invitation_id: body.invitationId, input_players: body.players }]
              : body.action === "loadStatisticPreferences"
                ? ["get_tournament_team_statistic_preferences", { input_invitation_id: body.invitationId }]
                : body.action === "saveStatisticPreferences"
                  ? ["set_tournament_team_statistic_preferences", { input_invitation_id: body.invitationId, input_definition_version_ids: body.definitionVersionIds }]
                  : body.action === "configureStatisticPolicy"
                    ? ["configure_tournament_statistic_policy", { input_tournament_id: body.tournamentId, input_items: body.items }]
              : null;
    if (!rpc) return NextResponse.json({ error: "Unsupported invitation action." }, { status: 400 });
    const { data, error } = await supabase.rpc(rpc[0] as string, rpc[1] as Record<string, unknown>);
    if (error) throw error;
    return NextResponse.json(body.action === "revoke" ? { ok: true } : data);
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: genericInvitationError }, { status: 403 });
  }
}
