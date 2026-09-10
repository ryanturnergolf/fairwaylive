import { getSupabaseAuthAccessToken } from "../supabaseClient";

export type TournamentTeamInvitation = {
  id: string;
  tournamentId: string;
  tournamentTeamId: string;
  teamName: string;
  invitedEmail: string;
  permission: "manage_roster";
  state: "pending" | "redeemed" | "revoked";
  expiresAt: string;
  rawToken?: string;
};

export type InvitedTeamRoster = {
  invitationId: string;
  tournamentId: string;
  tournamentName: string;
  tournamentTeamId: string;
  teamName: string;
  players: Array<{ playerId: string; playerName: string; slot: number }>;
  statistics?: TournamentTeamStatisticPreference[];
};

export type TournamentTeamStatisticPreference = {
  definitionVersionId: string;
  name: string;
  state: "optional" | "required";
  enabled: boolean;
};

const request = async <T>(body: Record<string, unknown>): Promise<T> => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch("/api/tournament-team-invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Tournament team invitation is unavailable.");
  return payload as T;
};

export const listTournamentTeamInvitationContext = (tournamentId: string) =>
  request<{ teams: Array<{ id: string; displayName: string; displayOrder: number }>; invitations: TournamentTeamInvitation[] }>({ action: "list", tournamentId });
export const createTournamentTeamInvitation = (tournamentTeamId: string, invitedEmail: string) =>
  request<TournamentTeamInvitation>({ action: "create", tournamentTeamId, invitedEmail });
export const redeemTournamentTeamInvitation = (rawToken: string) =>
  request<TournamentTeamInvitation>({ action: "redeem", rawToken });
export const revokeTournamentTeamInvitation = (invitationId: string) =>
  request<{ ok: true }>({ action: "revoke", invitationId });
export const loadInvitedTeamRoster = (invitationId: string) =>
  request<InvitedTeamRoster>({ action: "loadRoster", invitationId });
export const saveInvitedTeamRoster = (invitationId: string, players: InvitedTeamRoster["players"]) =>
  request<InvitedTeamRoster>({ action: "saveRoster", invitationId, players });
export const loadInvitedTeamStatisticPreferences = (invitationId: string) =>
  request<TournamentTeamStatisticPreference[]>({ action: "loadStatisticPreferences", invitationId });
export const saveInvitedTeamStatisticPreferences = (invitationId: string, definitionVersionIds: string[]) =>
  request<TournamentTeamStatisticPreference[]>({ action: "saveStatisticPreferences", invitationId, definitionVersionIds });
export const listTournamentStatisticDefinitions = () =>
  request<Array<{ definitionVersionId: string; name: string }>>({ action: "listStatisticDefinitions" });
export const configureTournamentStatisticPolicy = (tournamentId: string, items: Array<{ definitionVersionId: string; displayOrder: number; state: "optional" | "required" }>) =>
  request<{ packageVersionId: string }>({ action: "configureStatisticPolicy", tournamentId, items });
