import type {
  CreateQualifyingSessionInput,
  QualifyingGroup,
  QualifyingRosterPlayer,
} from "../qualifyingModel";
import { buildQualifyingRoundPlan } from "./qualifyingScheduleService";
import { countQualifyingRounds, MAX_CONFIGURED_ROUNDS } from "./roundDomainService";

export type QualifyingCreationValidation = {
  ok: boolean;
  errors: string[];
};

export const autoBalanceQualifyingGroups = (
  players: QualifyingRosterPlayer[],
  groupCount: number
): QualifyingGroup[] => {
  if (players.length === 0) return [];
  const normalizedCount = Math.max(1, Math.min(players.length, Math.floor(groupCount) || 1));
  const groups = Array.from({ length: normalizedCount }, (_, index) => ({
    id: `group-${index + 1}`,
    name: `Group ${index + 1}`,
    playerIds: [] as string[],
  }));
  players.forEach((player, index) => {
    groups[index % normalizedCount].playerIds.push(player.id);
  });
  return groups;
};

export const orderQualifyingPlayersByGroup = (
  players: QualifyingRosterPlayer[],
  groups: QualifyingGroup[]
) => {
  const groupOrderByPlayerId = new Map(
    groups.flatMap((group, groupIndex) =>
      group.playerIds.map((playerId) => [playerId, groupIndex] as const)
    )
  );
  const originalOrderByPlayerId = new Map(players.map((player, index) => [player.id, index]));

  return [...players].sort((left, right) => {
    const leftGroup = groupOrderByPlayerId.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightGroup = groupOrderByPlayerId.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftGroup - rightGroup ||
      (originalOrderByPlayerId.get(left.id) ?? 0) - (originalOrderByPlayerId.get(right.id) ?? 0) ||
      left.id.localeCompare(right.id);
  });
};

export const validateQualifyingCreation = (
  input: CreateQualifyingSessionInput
): QualifyingCreationValidation => {
  const errors: string[] = [];
  const playerIds = input.selectedPlayers.map((player) => player.id);
  const uniquePlayerIds = new Set(playerIds);
  const assignedIds = input.groups.flatMap((group) => group.playerIds);
  const uniqueAssignedIds = new Set(assignedIds);

  if (!input.name.trim()) errors.push("Qualifying name is required.");
  if (input.selectedPlayers.length < 1) errors.push("Select at least one player.");
  if (uniquePlayerIds.size !== playerIds.length) errors.push("Duplicate players are not allowed.");
  if (input.selectedPlayers.some((player) => player.rosterType !== input.rosterType)) {
    errors.push("Selected players must belong to the chosen roster.");
  }
  if (input.days.length < 1) errors.push("Configure at least one qualifying day.");
  const configuredRoundCount = countQualifyingRounds(input.days);
  if (configuredRoundCount < 1 || configuredRoundCount > MAX_CONFIGURED_ROUNDS) {
    errors.push(`Qualifying must contain between 1 and ${MAX_CONFIGURED_ROUNDS} total configured rounds.`);
  }
  if (
    input.days.some(
      (day, index) =>
        day.dayNumber !== index + 1 ||
        !day.playDate ||
        !Number.isInteger(day.holesTotal) || day.holesTotal < 1 ||
        !day.courseName.trim() ||
        !day.teeName.trim() ||
        !Number.isInteger(day.startingHole) ||
        day.startingHole < 1 ||
        day.startingHole > 18 ||
        (day.rounds !== undefined && day.rounds.length < 1) ||
        (day.rounds ?? []).some((round, roundIndex) =>
          round.roundOrder !== roundIndex + 1 ||
          !Number.isInteger(round.holeCount) || round.holeCount < 1 || round.holeCount > 18 ||
          !Number.isInteger(round.startingHole) || round.startingHole < 1 || round.startingHole > 18
        ) ||
        (day.rounds !== undefined && day.holesTotal !== day.rounds.reduce((total, round) => total + round.holeCount, 0))
    )
  ) {
    errors.push("Every qualifying day requires a date, holes, course, tee, and valid starting hole.");
  }
  if (input.groups.length < 1 || input.groups.some((group) => group.playerIds.length < 1)) {
    errors.push("Empty groups are not allowed.");
  }
  if (
    assignedIds.length !== playerIds.length ||
    uniqueAssignedIds.size !== playerIds.length ||
    playerIds.some((playerId) => !uniqueAssignedIds.has(playerId)) ||
    assignedIds.some((playerId) => !uniquePlayerIds.has(playerId))
  ) {
    errors.push("Assign every selected player to exactly one group.");
  }
  try {
    buildQualifyingRoundPlan(input.days);
  } catch {
    errors.push("Qualifying day mapping is invalid.");
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
};
