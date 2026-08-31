import { resolveConfiguredTournamentRound } from "./roundDomainService";

export type ScorecardRoundCandidate = {
  id: string;
  tournamentId: string;
  roundNumber: number;
};

export type ResolvedScorecardRound = {
  scorecardRoundId: string;
  tournamentId: string;
  roundNumber: number;
  source: "explicit" | "player_resume" | "operational" | "legacy" | "single_round";
};

export class ScorecardRoundResolutionError extends Error {}

/**
 * Resolves one immutable scorecard-session round. Stable identity always wins;
 * round-number parsing is confined to the legacy compatibility branch.
 */
export const resolveScorecardRound = ({
  tournamentId,
  configuredRounds,
  explicitScorecardRoundId,
  playerResumeRoundId,
  operationalCurrentRoundId,
  legacyRoundIdentity,
}: {
  tournamentId: string;
  configuredRounds: readonly ScorecardRoundCandidate[];
  explicitScorecardRoundId?: string | null;
  playerResumeRoundId?: string | null;
  operationalCurrentRoundId?: string | null;
  legacyRoundIdentity?: string | null;
}): ResolvedScorecardRound => {
  const ownedRounds = configuredRounds.filter((round) => round.tournamentId === tournamentId);
  const resolveStable = (roundId: string, source: ResolvedScorecardRound["source"]) => {
    const resolved = ownedRounds.find((round) => round.id === roundId);
    if (!resolved) {
      throw new ScorecardRoundResolutionError("The requested scoring round is not configured for this event.");
    }
    return {
      scorecardRoundId: resolved.id,
      tournamentId,
      roundNumber: resolved.roundNumber,
      source,
    } satisfies ResolvedScorecardRound;
  };

  if (explicitScorecardRoundId) return resolveStable(explicitScorecardRoundId, "explicit");
  if (playerResumeRoundId) return resolveStable(playerResumeRoundId, "player_resume");
  if (operationalCurrentRoundId) return resolveStable(operationalCurrentRoundId, "operational");

  if (legacyRoundIdentity) {
    const normalizedLegacyIdentity = /^\d+$/.test(legacyRoundIdentity)
      ? `round-${legacyRoundIdentity}`
      : legacyRoundIdentity;
    const resolved = resolveConfiguredTournamentRound(ownedRounds, normalizedLegacyIdentity);
    if (!resolved) {
      throw new ScorecardRoundResolutionError("This legacy scoring link does not identify a configured round.");
    }
    return {
      scorecardRoundId: resolved.id,
      tournamentId,
      roundNumber: resolved.roundNumber,
      source: "legacy",
    };
  }

  if (ownedRounds.length === 1) {
    return {
      scorecardRoundId: ownedRounds[0].id,
      tournamentId,
      roundNumber: ownedRounds[0].roundNumber,
      source: "single_round",
    };
  }

  throw new ScorecardRoundResolutionError("This scoring link does not identify a round. Ask the coach for a new link.");
};

export const scorecardRoundRequestKey = (tournamentId: string, scorecardRoundId: string) =>
  `${tournamentId}:${scorecardRoundId}`;
