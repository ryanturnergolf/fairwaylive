export type ReciprocalPairingPlayer = {
  playerId?: string;
  markerPlayerId?: string;
};

export type ReciprocalScoringAssignments<TPlayer extends ReciprocalPairingPlayer> = {
  markedPlayer: TPlayer | undefined;
  assignedMarkerPlayer: TPlayer | undefined;
};

export const resolveReciprocalScoringAssignments = <TPlayer extends ReciprocalPairingPlayer>(
  players: TPlayer[],
  currentPlayer: TPlayer
): ReciprocalScoringAssignments<TPlayer> => {
  const currentPlayerIndex = players.indexOf(currentPlayer);
  if (currentPlayerIndex < 0 || players.length < 2) {
    return {
      markedPlayer: undefined,
      assignedMarkerPlayer: undefined,
    };
  }

  const currentPlayerId = currentPlayer.playerId ? String(currentPlayer.playerId) : "";
  const markedPlayer = currentPlayer.markerPlayerId
    ? players.find((player) => String(player.playerId) === String(currentPlayer.markerPlayerId))
    : players[(currentPlayerIndex + 1) % players.length];
  const assignedMarkerPlayer = currentPlayerId
    ? players.find((player) => String(player.markerPlayerId) === currentPlayerId)
    : undefined;

  return {
    markedPlayer,
    assignedMarkerPlayer:
      assignedMarkerPlayer ?? players[(currentPlayerIndex - 1 + players.length) % players.length],
  };
};
