import type {
  QualifyingHolesPerDay,
  QualifyingRoundDefinition,
  QualifyingRoundMapping,
} from "../qualifyingModel";

export type QualifyingScheduleDayInput = {
  dayNumber: number;
  holesTotal: QualifyingHolesPerDay;
  rounds?: QualifyingRoundDefinition[];
};

export type PlannedQualifyingRound = Pick<
  QualifyingRoundMapping,
  "roundNumber" | "name" | "holeCount" | "startingHole" | "endingHole" | "holeSequence" | "qualifyingDay" | "qualifyingSegment"
>;

const segmentHoleCounts: Record<number, readonly number[]> = {
  9: [9],
  18: [18],
  27: [18, 9],
  36: [18, 18],
};

export const buildHoleSequence = (startingHole: number, holeCount: number) =>
  Array.from({ length: holeCount }, (_, index) => ((startingHole - 1 + index) % 18) + 1);

export const buildQualifyingPresetRounds = (holes: 9 | 18 | 27 | 36): QualifyingRoundDefinition[] =>
  segmentHoleCounts[holes].map((holeCount, index) => ({
    roundOrder: index + 1,
    startingHole: 1,
    holeCount,
    displayName: segmentHoleCounts[holes].length > 1 ? `Round ${index + 1}` : "",
  }));

export const buildQualifyingRoundPlan = (
  days: QualifyingScheduleDayInput[]
): PlannedQualifyingRound[] => {
  const orderedDays = [...days].sort((left, right) => left.dayNumber - right.dayNumber);
  const uniqueDays = new Set(orderedDays.map((day) => day.dayNumber));

  if (
    orderedDays.length === 0 ||
    uniqueDays.size !== orderedDays.length ||
    orderedDays.some((day, index) => day.dayNumber !== index + 1)
  ) {
    throw new Error("Qualifying days must be a non-empty, contiguous sequence starting at Day 1.");
  }

  let roundNumber = 0;
  return orderedDays.flatMap((day) => {
    const hasExplicitRounds = Boolean(day.rounds?.length);
    const configuredRounds = day.rounds?.length
      ? [...day.rounds].sort((left, right) => left.roundOrder - right.roundOrder)
      : buildQualifyingPresetRounds(day.holesTotal as 9 | 18 | 27 | 36);
    if (configuredRounds.some((round, index) => round.roundOrder !== index + 1 || round.holeCount < 1 || round.holeCount > 18 || round.startingHole < 1 || round.startingHole > 18)) {
      throw new Error("Qualifying rounds must be contiguous and contain between 1 and 18 holes.");
    }
    return configuredRounds.map((configuredRound, segmentIndex) => {
      roundNumber += 1;
      const qualifyingSegment = segmentIndex + 1;
      const holeSequence = buildHoleSequence(configuredRound.startingHole, configuredRound.holeCount);
      const legacyRound = {
        roundNumber,
        name: hasExplicitRounds
          ? configuredRound.displayName.trim() || `Day ${day.dayNumber}${configuredRounds.length > 1 ? ` - Round ${qualifyingSegment}` : ""}`
          : `Day ${day.dayNumber}${configuredRounds.length > 1 ? ` - Segment ${qualifyingSegment}` : ""}`,
        holeCount: configuredRound.holeCount,
        qualifyingDay: day.dayNumber,
        qualifyingSegment,
      };
      return hasExplicitRounds ? {
        ...legacyRound,
        startingHole: configuredRound.startingHole,
        endingHole: holeSequence.at(-1) ?? configuredRound.startingHole,
        holeSequence,
      } : legacyRound;
    });
  });
};

export const buildUniformQualifyingRoundPlan = (
  numberOfDays: number,
  holesPerDay: QualifyingHolesPerDay
) => {
  if (!Number.isInteger(numberOfDays) || numberOfDays < 1) {
    throw new Error("Qualifying must contain at least one day.");
  }

  return buildQualifyingRoundPlan(
    Array.from({ length: numberOfDays }, (_, index) => ({
      dayNumber: index + 1,
      holesTotal: holesPerDay,
    }))
  );
};
