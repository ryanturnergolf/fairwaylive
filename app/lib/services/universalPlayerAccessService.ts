import {
  exchangeQualifyingPlayerAccess,
  type QualifyingAccessResolution,
} from "./qualifyingAccessService";
import {
  resolveTeamPlayerScorecardPath,
  type TeamTournamentLoginResolution,
} from "./teamTournamentLoginService";

export const PLAYER_SCORING_CODE_LENGTH = 6;

export type UniversalPlayerAccessResolution =
  | { eventType: "tournament"; resolution: TeamTournamentLoginResolution }
  | { eventType: "qualifying"; resolution: QualifyingAccessResolution };

export const normalizePlayerScoringCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, PLAYER_SCORING_CODE_LENGTH);

export const resolvePlayerScoringCode = async (
  code: string
): Promise<UniversalPlayerAccessResolution | null> => {
  try {
    const response = await fetch("/api/player-scoring-code/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: normalizePlayerScoringCode(code) }),
    });
    if (!response.ok) return null;
    return (await response.json()) as UniversalPlayerAccessResolution;
  } catch {
    return null;
  }
};

export const resolveUniversalPlayerScorecardPath = async ({
  code,
  playerId,
  access,
}: {
  code: string;
  playerId: string;
  access: UniversalPlayerAccessResolution;
}) => {
  if (access.eventType === "tournament") {
    return resolveTeamPlayerScorecardPath(access.resolution, playerId);
  }
  return exchangeQualifyingPlayerAccess(code, playerId);
};
