import {
  buildIndividualLeaderboard,
  buildTeamLeaderboard,
  limitCountingScoresToAvailablePlayers,
  type IndividualLeaderboardRow,
  type TeamLeaderboardRow,
} from "./tournamentDerivedState";
import { loadComparisonScores } from "./scoreService";
import { loadSharedTournamentScorecardState } from "./tournamentService";
import type { LegacyScorecardRow, Tournament } from "../tournamentModel";
import { buildCourseRoundProjection } from "./courseService";
import { getQualifyingBackingTournamentStatus } from "../repositories/tournamentRepository";
import { getQualifyingBackingScoringMode } from "../repositories/tournamentRepository";
import { getTournamentStateSnapshot } from "../repositories/tournamentRepository";
import { isTournamentStorageEnvelope } from "../tournamentModel";
import { buildMultiRoundTournamentLeaderboard, type MultiRoundTournamentLeaderboardProjection } from "./multiRoundLeaderboardService";
import { buildCourseHoleSequence } from "./courseService";
import { loadTournamentHoleStatistics } from "./statisticsService";

export type ShareTokenLeaderboardReadModel = {
  tournamentId: string;
  tournamentName: string;
  roundNumber: number;
  lastUpdated: string | null;
  isFinalized: boolean;
  isQualifying: boolean;
  individualLeaderboard: IndividualLeaderboardRow[];
  teamLeaderboard: TeamLeaderboardRow[];
  multiRoundProjection: MultiRoundTournamentLeaderboardProjection | null;
};

export const bindSnapshotPlayersToDurableRoster = (
  tournament: Tournament,
  scorecardRows: Array<Pick<LegacyScorecardRow, "playerName" | "team"> & { id: string | number }>
) => {
  const stableIdByIdentity = new Map(
    scorecardRows.map((row) => [`${row.playerName}\u0000${row.team}`, String(row.id)])
  );
  const stableIdBySnapshotId = new Map(
    tournament.players.map((player) => {
      const playerName = `${player.firstName} ${player.lastName}`.trim();
      const teamName = tournament.teams.find((team) => team.id === player.teamId)?.name ?? "";
      return [player.id, stableIdByIdentity.get(`${playerName}\u0000${teamName}`) ?? player.id];
    })
  );
  return {
    ...tournament,
    players: tournament.players.map((player) => ({
      ...player,
      id: stableIdBySnapshotId.get(player.id) ?? player.id,
    })),
    teams: tournament.teams.map((team) => ({
      ...team,
      players: team.players.map((playerId) => stableIdBySnapshotId.get(playerId) ?? playerId),
    })),
    scores: tournament.scores.map((score) => ({
      ...score,
      playerId: stableIdBySnapshotId.get(score.playerId) ?? score.playerId,
    })),
    pairings: tournament.pairings.map((pairing) => ({
      ...pairing,
      players: pairing.players.map((player) => ({
        ...player,
        playerId: stableIdBySnapshotId.get(player.playerId) ?? player.playerId,
      })),
    })),
  };
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

  const [scoreEntries, isQualifying, scoringMode, officialEntries, snapshot] = await Promise.all([
    loadComparisonScores({ tournamentId, shareToken }).catch(() => []),
    getQualifyingBackingTournamentStatus(tournamentId, { shareToken }).catch(() => false),
    getQualifyingBackingScoringMode(tournamentId, { shareToken }).catch(() => null),
    loadTournamentHoleStatistics({ tournamentId, shareToken }).catch(() => []),
    getTournamentStateSnapshot(tournamentId, { shareToken }).catch(() => null),
  ]);
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
  const snapshotEnvelope = snapshot && isTournamentStorageEnvelope(snapshot.state_snapshot)
    ? snapshot.state_snapshot
    : null;
  const multiRoundProjection = snapshotEnvelope?.tournament.players.length && snapshotEnvelope.tournament.rounds.length > 1 ? (() => {
    const tournament = bindSnapshotPlayersToDurableRoster(snapshotEnvelope.tournament, sharedState.scorecardRows);
    const settings = tournament.settings;
    const roundSetups = settings.roundSetups ?? {};
    const parsByHole = new Map(sharedState.courseHoles.map((hole) => [hole.holeNumber, hole.par]));
    const roundConfigurationById = Object.fromEntries(tournament.rounds.map((round) => {
      const setup = roundSetups[String(round.roundNumber)];
      const holeNumbers = buildCourseHoleSequence(Math.max(1, Number(setup?.startingHole) || 1), Math.max(1, Number(setup?.numberOfHoles) || 18));
      return [round.id, { holeNumbers, pars: holeNumbers.map((hole) => parsByHole.get(hole) ?? null), countingScores: Number(setup?.countingScores) || 4 }];
    }));
    return buildMultiRoundTournamentLeaderboard({
      tournament,
      roundConfigurationById,
      operationalCurrentRoundId: settings.operationalCurrentRoundId,
      durableScoreEntries: scoreEntries,
      officialEntries,
      scoringMode: scoringMode ?? "reciprocal",
      allowLegacyScoreFallback: !isQualifying,
    });
  })() : null;

  return {
    tournamentId,
    tournamentName: sharedState.tournament.name,
    roundNumber,
    lastUpdated: sharedState.updatedAt,
    isFinalized: sharedState.isFinalized,
    isQualifying,
    multiRoundProjection,
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
