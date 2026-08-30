import type { ConfiguredQualifyingRound, QualifyingDay, QualifyingRoundMapping } from "../qualifyingModel";
import type { QualifyingRoundRow } from "../repositories/qualifyingRepository";
import { orderConfiguredRounds, roundDisplayLabel } from "./roundDomainService";

export const buildConfiguredQualifyingRoundProjection = ({
  days,
  qualifyingRounds,
  tournamentRounds,
}: {
  days: readonly Pick<QualifyingDay, "id" | "dayNumber">[];
  qualifyingRounds: readonly QualifyingRoundRow[];
  tournamentRounds: readonly QualifyingRoundMapping[];
}): ConfiguredQualifyingRound[] => {
  const dayNumberById = new Map(days.map((day) => [day.id, day.dayNumber]));
  const projected = qualifyingRounds.map((round) => {
    const dayNumber = dayNumberById.get(round.qualifying_day_id);
    if (!dayNumber) throw new Error("Qualifying round belongs to an unknown day.");
    const mapped = tournamentRounds.find((candidate) =>
      candidate.qualifyingDay === dayNumber && candidate.qualifyingSegment === round.round_order
    );
    return {
      qualifyingRoundId: round.id,
      tournamentRoundId: mapped?.id ?? null,
      roundNumber: mapped?.roundNumber ?? Number.MAX_SAFE_INTEGER,
      displayLabel: mapped ? roundDisplayLabel(mapped.roundNumber) : "Unmapped",
      qualifyingDay: dayNumber,
      qualifyingSegment: round.round_order,
    };
  });
  const mapped = projected.filter((round) => round.tournamentRoundId !== null);
  const unmapped = projected
    .filter((round) => round.tournamentRoundId === null)
    .sort((left, right) => left.qualifyingDay - right.qualifyingDay || left.qualifyingSegment - right.qualifyingSegment);
  return [...orderConfiguredRounds(mapped), ...unmapped];
};

export const resolvePlayerResumeRound = <T extends { tournamentRoundId: string | null; roundNumber: number }>(
  rounds: readonly T[],
  completedRoundNumbers: ReadonlySet<number>
) => orderConfiguredRounds(rounds).find((round) => !completedRoundNumbers.has(round.roundNumber)) ??
  orderConfiguredRounds(rounds).at(-1) ?? null;
