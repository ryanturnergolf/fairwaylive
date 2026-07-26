export type TournamentScorecardArtifact = {
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  holeCount: 9 | 18;
};

export const validateTournamentScorecardArtifacts = (
  artifacts: TournamentScorecardArtifact[],
  expectedPlayerRows: number
) => {
  if (artifacts.length !== expectedPlayerRows) {
    throw new Error("Tournament scorecard generation did not cover every player and round.");
  }
  const keys = new Set(
    artifacts.map((artifact) => `${artifact.roundNumber}:${artifact.playerId}`)
  );
  if (keys.size !== artifacts.length) {
    throw new Error("Tournament scorecard generation produced duplicate scorecards.");
  }
};
