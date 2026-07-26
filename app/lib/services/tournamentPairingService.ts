export type TournamentPairingArtifact = {
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  groupNumber: number;
  markerPlayerId: string;
  startingHole: number;
};

export const validateTournamentPairingArtifacts = (
  artifacts: TournamentPairingArtifact[],
  expectedPlayerRows: number
) => {
  if (artifacts.length !== expectedPlayerRows) {
    throw new Error("Tournament pairing generation did not cover every player and round.");
  }
  const keys = new Set(
    artifacts.map((artifact) => `${artifact.roundNumber}:${artifact.playerId}`)
  );
  if (keys.size !== artifacts.length) {
    throw new Error("Tournament pairing generation produced duplicate player assignments.");
  }
  if (
    artifacts.some(
      (artifact) =>
        artifact.groupNumber < 1 ||
        artifact.startingHole < 1 ||
        !artifact.markerPlayerId
    )
  ) {
    throw new Error("Tournament pairing generation produced an incomplete assignment.");
  }
};
