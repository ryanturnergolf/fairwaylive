import type { ConfiguredTournamentRound, RoundStatus } from "../tournamentModel";

export const MIN_CONFIGURED_ROUNDS = 1;
export const MAX_CONFIGURED_ROUNDS = 10;

export const parseConfiguredRoundCount = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_CONFIGURED_ROUNDS || parsed > MAX_CONFIGURED_ROUNDS) {
    throw new Error(`Configured round count must be between ${MIN_CONFIGURED_ROUNDS} and ${MAX_CONFIGURED_ROUNDS}.`);
  }
  return parsed;
};

export const roundDisplayLabel = (roundNumber: number) => `R${roundNumber}`;

export const orderConfiguredRounds = <T extends { roundNumber: number }>(rounds: readonly T[]) =>
  [...rounds].sort((left, right) => left.roundNumber - right.roundNumber);

export const projectConfiguredTournamentRounds = (
  rounds: ReadonlyArray<{ id: string; roundNumber: number; name?: string; status?: RoundStatus }>
): ConfiguredTournamentRound[] => orderConfiguredRounds(rounds).map((round) => ({
  id: round.id,
  roundNumber: round.roundNumber,
  displayLabel: roundDisplayLabel(round.roundNumber),
  name: round.name || `Round ${round.roundNumber}`,
  status: round.status ?? "upcoming",
}));

const legacyRoundPattern = /^round-(10|[1-9])$/;

export const resolveConfiguredTournamentRound = <T extends { id: string; roundNumber: number }>(
  rounds: readonly T[],
  roundIdentity: string
): T | null => {
  const byStableId = rounds.find((round) => round.id === roundIdentity);
  if (byStableId) return byStableId;

  const legacyMatch = roundIdentity.match(legacyRoundPattern);
  if (!legacyMatch) return null;
  const roundNumber = Number(legacyMatch[1]);
  return rounds.find((round) => round.roundNumber === roundNumber) ?? null;
};

export const selectInitialOperationalRound = <T extends { id: string; roundNumber: number }>(
  rounds: readonly T[],
  legacyActiveRoundNumber?: number | null
) => {
  const ordered = orderConfiguredRounds(rounds);
  return ordered.find((round) => round.roundNumber === legacyActiveRoundNumber) ?? ordered[0] ?? null;
};

export const countQualifyingRounds = (days: ReadonlyArray<{ rounds?: readonly unknown[] }>) =>
  days.reduce((total, day) => total + (day.rounds?.length ?? 1), 0);

export const validateQualifyingRoundCount = (days: ReadonlyArray<{ rounds?: readonly unknown[] }>) =>
  parseConfiguredRoundCount(countQualifyingRounds(days));
