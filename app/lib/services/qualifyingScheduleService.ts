import type {
  QualifyingHolesPerDay,
  QualifyingRoundMapping,
} from "../qualifyingModel";

export type QualifyingScheduleDayInput = {
  dayNumber: number;
  holesTotal: QualifyingHolesPerDay;
};

export type PlannedQualifyingRound = Pick<
  QualifyingRoundMapping,
  "roundNumber" | "name" | "holeCount" | "qualifyingDay" | "qualifyingSegment"
>;

const segmentHoleCounts: Record<QualifyingHolesPerDay, readonly (9 | 18)[]> = {
  9: [9],
  18: [18],
  27: [18, 9],
  36: [18, 18],
};

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
  return orderedDays.flatMap((day) =>
    segmentHoleCounts[day.holesTotal].map((holeCount, segmentIndex) => {
      roundNumber += 1;
      const qualifyingSegment = segmentIndex + 1;
      return {
        roundNumber,
        name: `Day ${day.dayNumber}${segmentHoleCounts[day.holesTotal].length > 1 ? ` - Segment ${qualifyingSegment}` : ""}`,
        holeCount,
        qualifyingDay: day.dayNumber,
        qualifyingSegment,
      };
    })
  );
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
