import type {
  QualifyingResultsReadModel,
  QualifyingRosterPlayer,
  QualifyingRoundPairingGroup,
} from "../qualifyingModel";
import { getSupabaseAuthAccessToken } from "../supabaseClient";

type RePairInput = {
  players: QualifyingRosterPlayer[];
  results: QualifyingResultsReadModel;
  targetRoundNumber: number;
  groupSizes: number[];
  startingHoles: number[];
};

const withReciprocalMarkers = (
  groups: Array<Omit<QualifyingRoundPairingGroup, "players"> & {
    players: Array<Omit<QualifyingRoundPairingGroup["players"][number], "markerPlayerId">>;
  }>
): QualifyingRoundPairingGroup[] => groups.map((group) => ({
  ...group,
  players: group.players.map((player, index, players) => ({
    ...player,
    markerPlayerId: players.length > 1 ? players[(index + 1) % players.length].playerId : null,
  })),
}));

const normalizedGroupSizes = (groupSizes: number[], playerCount: number) => {
  const valid = groupSizes.filter((size) => Number.isInteger(size) && size > 0);
  if (valid.reduce((total, size) => total + size, 0) === playerCount) return valid;
  const preferredSize = valid[0] ?? Math.min(4, playerCount);
  const sizes: number[] = [];
  for (let remaining = playerCount; remaining > 0;) {
    const size = Math.min(preferredSize, remaining);
    sizes.push(size);
    remaining -= size;
  }
  if (sizes.length > 1 && sizes.at(-1) === 1) {
    sizes[sizes.length - 2] -= 1;
    sizes[sizes.length - 1] += 1;
  }
  return sizes;
};

export const buildQualifyingPairingsByScore = ({
  players,
  results,
  targetRoundNumber,
  groupSizes,
  startingHoles,
}: RePairInput): QualifyingRoundPairingGroup[] => {
  if (!Number.isInteger(targetRoundNumber) || targetRoundNumber < 2) {
    throw new Error("Re-pair by Score is available beginning with Round 2.");
  }
  const priorRoundNumbers = Array.from({ length: targetRoundNumber - 1 }, (_, index) => index + 1);
  const rosterOrder = new Map(players.map((player, index) => [player.id, index]));
  const resultByPlayer = new Map(results.combined.map((player) => [player.playerId, player]));
  const ranked = players.map((player) => {
    const segments = resultByPlayer.get(player.id)?.segments ?? [];
    const priorSegments = priorRoundNumbers.map((roundNumber) =>
      segments.find((segment) => segment.roundNumber === roundNumber)
    );
    if (priorSegments.some((segment) => !segment?.submitted || segment.score === null)) {
      throw new Error(`Every player must submit R${targetRoundNumber - 1} before R${targetRoundNumber} can be re-paired by score.`);
    }
    return {
      player,
      total: priorSegments.reduce((sum, segment) => sum + (segment?.score ?? 0), 0),
      toPar: priorSegments.reduce((sum, segment) => sum + (segment?.toPar ?? 0), 0),
    };
  }).sort((left, right) =>
    left.toPar - right.toPar ||
    left.total - right.total ||
    (rosterOrder.get(left.player.id) ?? 0) - (rosterOrder.get(right.player.id) ?? 0) ||
    left.player.id.localeCompare(right.player.id)
  );

  const sizes = normalizedGroupSizes(groupSizes, ranked.length);
  let offset = 0;
  return withReciprocalMarkers(sizes.map((size, groupIndex) => {
    const groupPlayers = ranked.slice(offset, offset + size);
    offset += size;
    return {
      roundNumber: targetRoundNumber,
      groupNumber: groupIndex + 1,
      startingHole: startingHoles[groupIndex] ?? startingHoles[0] ?? 1,
      players: groupPlayers.map(({ player }, position) => ({
        playerId: player.id,
        playerName: player.name,
        position: position + 1,
      })),
    };
  }));
};

export const normalizeQualifyingManualPairings = (
  roundNumber: number,
  groups: QualifyingRoundPairingGroup[],
  expectedPlayerIds: string[]
): QualifyingRoundPairingGroup[] => {
  const playerIds = groups.flatMap((group) => group.players.map((player) => player.playerId));
  if (groups.length < 1 || groups.some((group) => group.players.length < 2)) {
    throw new Error("Every reciprocal group must contain at least two players.");
  }
  if (
    new Set(playerIds).size !== playerIds.length ||
    playerIds.length !== expectedPlayerIds.length ||
    expectedPlayerIds.some((playerId) => !playerIds.includes(playerId))
  ) {
    throw new Error("Assign every player to exactly one group.");
  }
  if (groups.some((group) => !Number.isInteger(group.startingHole) || group.startingHole < 1 || group.startingHole > 18)) {
    throw new Error("Starting holes must be between 1 and 18.");
  }
  return withReciprocalMarkers(groups.map((group, groupIndex) => ({
    roundNumber,
    groupNumber: groupIndex + 1,
    startingHole: group.startingHole,
    players: group.players.map((player, position) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      position: position + 1,
    })),
  })));
};

export const saveQualifyingRoundPairings = async (
  sessionId: string,
  roundNumber: number,
  groups: QualifyingRoundPairingGroup[]
) => {
  const accessToken = await getSupabaseAuthAccessToken();
  if (!accessToken) throw new Error("Coach authentication is required.");
  const response = await fetch(`/api/qualifying-sessions/${encodeURIComponent(sessionId)}/pairings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ roundNumber, groups }),
  });
  const body = await response.json().catch(() => null) as { groups?: QualifyingRoundPairingGroup[]; error?: string } | null;
  if (!response.ok || !body?.groups) throw new Error(body?.error || "Unable to save round pairings.");
  return body.groups;
};
