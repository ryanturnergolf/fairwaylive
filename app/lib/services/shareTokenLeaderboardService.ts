import {
  buildIndividualLeaderboard,
  buildTeamLeaderboard,
  limitCountingScoresToAvailablePlayers,
  type IndividualLeaderboardRow,
  type TeamLeaderboardRow,
} from "./tournamentDerivedState";
import { loadComparisonScores } from "./scoreService";
import { loadSharedTournamentScorecardState } from "./tournamentService";
import type { LegacyScorecardRow } from "../tournamentModel";
import { buildCourseRoundProjection } from "./courseService";

export type ShareTokenLeaderboardReadModel = {
  tournamentId: string;
  tournamentName: string;
  roundNumber: number;
  lastUpdated: string | null;
  isFinalized: boolean;
  individualLeaderboard: IndividualLeaderboardRow[];
  teamLeaderboard: TeamLeaderboardRow[];
};

export const loadShareTokenLeaderboard = async ({
  tournamentId,
  roundNumber,
  shareToken,
}: {
  tournamentId: string;
  roundNumber: number;
  shareToken: string;
}): Promise<ShareTokenLeaderboardReadModel | null> => {
  const sharedState = await loadSharedTournamentScorecardState(
    tournamentId,
    roundNumber,
    18,
    shareToken
  );
  if (!sharedState) {
    return null;
  }

  const scoreEntries = await loadComparisonScores({
    tournamentId,
    roundNumber,
    shareToken,
  }).catch(() => []);
  const entriesByPlayerId = new Map<string, typeof scoreEntries>();
  scoreEntries.forEach((entry) => {
    const playerId = String(entry.player_id);
    entriesByPlayerId.set(playerId, [...(entriesByPlayerId.get(playerId) ?? []), entry]);
  });

  const scorecardRows: LegacyScorecardRow[] = sharedState.scorecardRows.map((row, index) => {
    const markerEntry = (entriesByPlayerId.get(String(row.id)) ?? []).find(
      (entry) => String(entry.entered_by_player_id) !== String(entry.player_id)
    );
    return {
      id: index + 1,
      playerName: row.playerName,
      team: row.team,
      scores: markerEntry?.hole_scores?.length
        ? markerEntry.hole_scores.map((score) => Number(score) || 0)
        : row.scores,
    };
  });
  const displayHoleCount = Number(sharedState.roundSetup.numberOfHoles) || 18;
  const roundPars = buildCourseRoundProjection(
    sharedState.courseHoles,
    Number(sharedState.roundSetup.startingHole) || 1,
    displayHoleCount
  ).holes.map((hole) => hole.par || 4);
  const countingScores = limitCountingScoresToAvailablePlayers(
    Number(sharedState.roundSetup.countingScores) || 4,
    scorecardRows
  );
  const individualLeaderboard = buildIndividualLeaderboard({
    scorecardsGenerated: true,
    scorecardRows,
    displayHoleCount,
    roundPars,
  });
  const hasTeamScoring = scorecardRows.some((row) => row.team.trim().length > 0);

  return {
    tournamentId,
    tournamentName: sharedState.tournament.name,
    roundNumber,
    lastUpdated: sharedState.updatedAt,
    isFinalized: sharedState.isFinalized,
    individualLeaderboard,
    teamLeaderboard: hasTeamScoring
      ? buildTeamLeaderboard({
          scorecardsGenerated: true,
          scorecardRows,
          displayHoleCount,
          countingScores,
          roundPars,
        })
      : [],
  };
};
