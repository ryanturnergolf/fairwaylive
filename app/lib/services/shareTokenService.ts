import {
  createTournamentShareToken,
  type TournamentShareTokenRow,
} from "../repositories/tournamentRepository";
import type { ShareTokenPurpose } from "../shareTokens";

export type ResolvedShareToken = {
  tournamentId: string;
  purpose: ShareTokenPurpose;
  expiresAt: string;
};

export const createShareToken = async (
  tournamentId: string,
  purpose: ShareTokenPurpose
): Promise<TournamentShareTokenRow> => createTournamentShareToken(tournamentId, purpose);

export const resolveShareToken = async (token: string): Promise<ResolvedShareToken | null> => {
  if (!token) {
    return null;
  }

  const response = await fetch("/api/share-tokens/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as ResolvedShareToken;
};
