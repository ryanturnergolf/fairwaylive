import type {
  CreateQualifyingSessionInput,
  QualifyingGroup,
  QualifyingRosterPlayer,
  QualifyingRosterType,
} from "../qualifyingModel";
import { buildQualifyingRoundPlan } from "./qualifyingScheduleService";

export type QualifyingCreationValidation = {
  ok: boolean;
  errors: string[];
};

const rosterPlayers: Record<QualifyingRosterType, QualifyingRosterPlayer[]> = {
  men: [
    { id: "men-avery-brooks", name: "Avery Brooks", rosterType: "men", classYear: "Senior" },
    { id: "men-cam-riley", name: "Cam Riley", rosterType: "men", classYear: "Junior" },
    { id: "men-jordan-lee", name: "Jordan Lee", rosterType: "men", classYear: "Sophomore" },
    { id: "men-drew-patel", name: "Drew Patel", rosterType: "men", classYear: "Junior" },
    { id: "men-sam-carter", name: "Sam Carter", rosterType: "men", classYear: "Freshman" },
    { id: "men-noah-wilson", name: "Noah Wilson", rosterType: "men", classYear: "Senior" },
  ],
  women: [
    { id: "women-morgan-chen", name: "Morgan Chen", rosterType: "women", classYear: "Senior" },
    { id: "women-taylor-quinn", name: "Taylor Quinn", rosterType: "women", classYear: "Freshman" },
    { id: "women-riley-adams", name: "Riley Adams", rosterType: "women", classYear: "Junior" },
    { id: "women-casey-smith", name: "Casey Smith", rosterType: "women", classYear: "Sophomore" },
    { id: "women-ella-hayes", name: "Ella Hayes", rosterType: "women", classYear: "Senior" },
  ],
};

export const getQualifyingRoster = (rosterType: QualifyingRosterType) =>
  rosterPlayers[rosterType].map((player) => ({ ...player }));

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
  if (
    input.days.some(
      (day, index) =>
        day.dayNumber !== index + 1 ||
        !day.playDate ||
        ![9, 18, 27, 36].includes(day.holesTotal) ||
        !day.courseName.trim() ||
        !day.teeName.trim() ||
        !Number.isInteger(day.startingHole) ||
        day.startingHole < 1 ||
        day.startingHole > 18
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
