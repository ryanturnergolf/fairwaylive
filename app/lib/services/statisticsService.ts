import {
  getScoreHoleEntriesForPlayer,
  getScoreHoleEntriesForTournament,
  saveScoreHoleEntries,
  saveScoreHoleEntry,
  type GetScoreHoleEntriesForPlayerInput,
  type GetScoreHoleEntriesForTournamentInput,
  type SaveScoreHoleEntryInput,
  type ScoreHoleEntryRow,
} from "../repositories/statisticsRepository";
import { getTournamentAggregate, type TournamentAggregate } from "./tournamentService";

export type SaveHoleStatisticsInput = SaveScoreHoleEntryInput;
export type OfficialScoreResolutionChoice = "marker" | "player" | "coach_override";

export type ResolveOfficialScoreInput = {
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  holeNumber: number;
  selectedScore: number;
  choice: OfficialScoreResolutionChoice;
  officialBy: string;
  overrideReason?: string;
  sourceEntry?: ScoreHoleEntryRow | null;
};

export type SaveRoundHoleStatisticsInput = Omit<
  SaveScoreHoleEntryInput,
  "holeNumber" | "strokes" | "entrySource" | "markerForPlayerId"
> & {
  holeScores: number[];
  markerForPlayerId?: string | null;
};

export type HoleStatisticsInput = Pick<
  SaveScoreHoleEntryInput,
  "fairwayHit" | "greenInRegulation" | "putts" | "penaltyStrokes"
>;

export type StatCompleteness = {
  missingFairways: number;
  missingGir: number;
  missingPutts: number;
  missingPenalties: number;
  completionPercentage: number | null;
  isComplete: boolean;
};

export type PlayerHoleReport = {
  holeNumber: number;
  par: number;
  strokes: number | null;
  toPar: number | null;
  label: string;
};

export type PlayerParTypeReport = {
  par: 3 | 4 | 5;
  scoringAverage: number;
  toParAverage: number;
  label: string;
};

export type PlayerStretchReport = {
  roundNumber: number;
  startHole: number;
  endHole: number;
  scoringAverage: number;
  toParAverage: number;
  label: string;
};

export type TeamPlayerContributionReport = {
  playerId: string;
  playerName: string;
  countingRounds: number;
  countingRoundPercentage: number | null;
  averageFinishingPositionContribution: number | null;
  label: string;
};

export type TeamStatisticStrengthReport = {
  statistic: string;
  value: number | null;
  label: string;
};

export type TeamRoundTrendReport = {
  roundNumber: number;
  countingScore: number;
  toPar: number;
  label: string;
};

export type PlayerStatisticsReadModel = {
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string;
  holesPlayed: number;
  roundsPlayed: number;
  scoringAverage: number | null;
  totalStrokes: number;
  toPar: number;
  fairwayPercentage: number | null;
  girPercentage: number | null;
  putts: number;
  puttsPerRound: number | null;
  puttsPerGir: number | null;
  birdies: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  penaltyStrokes: number;
  bestHole: PlayerHoleReport | null;
  worstHole: PlayerHoleReport | null;
  strongestParType: PlayerParTypeReport | null;
  weakestParType: PlayerParTypeReport | null;
  hardestHole: PlayerHoleReport | null;
  bestStretch: PlayerStretchReport | null;
  worstStretch: PlayerStretchReport | null;
  completeness: StatCompleteness;
};

export type TeamStatisticsReadModel = {
  teamId: string | null;
  teamName: string;
  playerCount: number;
  holesPlayed: number;
  teamScoringAverage: number | null;
  countingScoreAverage: number | null;
  totalStrokes: number;
  toPar: number;
  fairwayPercentage: number | null;
  girPercentage: number | null;
  putts: number;
  puttsPerRound: number | null;
  penaltyStrokes: number;
  countingContributions: TeamPlayerContributionReport[];
  bestParType: PlayerParTypeReport | null;
  worstParType: PlayerParTypeReport | null;
  hardestHole: PlayerHoleReport | null;
  easiestHole: PlayerHoleReport | null;
  strongestStatistic: TeamStatisticStrengthReport | null;
  weakestStatistic: TeamStatisticStrengthReport | null;
  frontNineAverage: number | null;
  backNineAverage: number | null;
  bestRound: TeamRoundTrendReport | null;
  worstRound: TeamRoundTrendReport | null;
  teamTrend: TeamRoundTrendReport[];
  completeness: StatCompleteness;
};

export type HoleStatisticsReadModel = {
  holeNumber: number;
  par: number;
  entries: number;
  scoringAverage: number | null;
  birdieRate: number | null;
  parRate: number | null;
  bogeyRate: number | null;
};

export type TournamentStatisticsReadModel = {
  hardestHole: HoleStatisticsReadModel | null;
  easiestHole: HoleStatisticsReadModel | null;
  holeScoringAverages: HoleStatisticsReadModel[];
  par3Average: number | null;
  par4Average: number | null;
  par5Average: number | null;
  birdieRate: number | null;
  parRate: number | null;
  bogeyRate: number | null;
  completeness: StatCompleteness;
};

export type TournamentStatisticsReadModels = {
  tournamentId: string;
  sharedTournamentId: string;
  roundNumber: number | null;
  generatedAt: string;
  playerStatistics: PlayerStatisticsReadModel[];
  teamStatistics: TeamStatisticsReadModel[];
  tournamentStatistics: TournamentStatisticsReadModel;
};

export type BuildTournamentStatisticsReadModelsInput = {
  aggregate: TournamentAggregate | null;
  entries: ScoreHoleEntryRow[];
  roundNumber?: number;
  generatedAt?: string;
};

export type LoadTournamentStatisticsReadModelsInput = {
  tournamentId: string;
  roundNumber?: number;
};

type SelectedHoleEntry = ScoreHoleEntryRow & {
  par: number;
};

type StatAccumulator = {
  entries: SelectedHoleEntry[];
  totalStrokes: number;
  totalToPar: number;
  fairwayAttempts: number;
  fairwaysHit: number;
  girAttempts: number;
  greensInRegulation: number;
  puttAttempts: number;
  putts: number;
  girPutts: number;
  girPuttAttempts: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  penaltyStrokes: number;
  missingFairways: number;
  missingGir: number;
  missingPutts: number;
  penaltyAttempts: number;
  missingPenalties: number;
};

const defaultHolePars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4];

const getEntrySource = (playerId: string, enteredByPlayerId: string) =>
  String(playerId) === String(enteredByPlayerId) ? "self" : "marker";

const getMarkerForPlayerId = (
  playerId: string,
  enteredByPlayerId: string,
  markerForPlayerId?: string | null
) => markerForPlayerId ?? (getEntrySource(playerId, enteredByPlayerId) === "marker" ? playerId : null);

export const buildScoreHoleEntryInput = ({
  tournamentId,
  roundNumber,
  playerId,
  enteredByPlayerId,
  markerForPlayerId,
  holeNumber,
  strokes,
  fairwayHit,
  greenInRegulation,
  putts,
  penaltyStrokes,
  entryStatus,
  shareToken,
}: {
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  enteredByPlayerId: string;
  markerForPlayerId?: string | null;
  holeNumber: number;
  strokes: number;
  fairwayHit?: boolean | null;
  greenInRegulation?: boolean | null;
  putts?: number | null;
  penaltyStrokes?: number | null;
  entryStatus: string;
  shareToken?: string;
}): SaveHoleStatisticsInput => ({
  tournamentId,
  roundNumber,
  playerId,
  enteredByPlayerId,
  markerForPlayerId: getMarkerForPlayerId(playerId, enteredByPlayerId, markerForPlayerId),
  holeNumber,
  strokes,
  fairwayHit: fairwayHit ?? null,
  greenInRegulation: greenInRegulation ?? null,
  putts: putts ?? null,
  penaltyStrokes: penaltyStrokes ?? null,
  entrySource: getEntrySource(playerId, enteredByPlayerId),
  entryStatus,
  reviewStatus: "pending",
  isOfficial: false,
  officialAt: null,
  officialBy: null,
  shareToken,
});

export const saveHoleStatistics = async (
  input: SaveHoleStatisticsInput
): Promise<ScoreHoleEntryRow> => {
  return saveScoreHoleEntry(input);
};

export const resolveOfficialScore = async ({
  tournamentId,
  roundNumber,
  playerId,
  holeNumber,
  selectedScore,
  choice,
  officialBy,
  overrideReason = "",
  sourceEntry = null,
}: ResolveOfficialScoreInput): Promise<ScoreHoleEntryRow> => {
  const trimmedReason = overrideReason.trim();
  if (choice === "coach_override" && !trimmedReason) {
    throw new Error("An override reason is required.");
  }

  const reviewStatus =
    choice === "coach_override"
      ? `official_coach_override: ${trimmedReason}`
      : choice === "marker"
        ? "official_marker_accepted"
        : "official_player_accepted";

  return saveScoreHoleEntry({
    tournamentId,
    roundNumber,
    playerId,
    enteredByPlayerId: sourceEntry?.entered_by_player_id ?? (choice === "coach_override" ? "coach" : playerId),
    markerForPlayerId: sourceEntry?.marker_for_player_id ?? null,
    holeNumber,
    strokes: selectedScore,
    fairwayHit: sourceEntry?.fairway_hit ?? null,
    greenInRegulation: sourceEntry?.green_in_regulation ?? null,
    putts: sourceEntry?.putts ?? null,
    penaltyStrokes: sourceEntry?.penalty_strokes ?? null,
    entrySource: choice,
    entryStatus: "official",
    reviewStatus,
    isOfficial: true,
    officialAt: new Date().toISOString(),
    officialBy: officialBy || "Tournament Director",
  });
};

export const saveRoundHoleStatistics = async ({
  holeScores,
  markerForPlayerId,
  ...input
}: SaveRoundHoleStatisticsInput): Promise<ScoreHoleEntryRow[]> => {
  const rows = holeScores
    .map((score, index) => ({
      score: Number(score) || 0,
      holeNumber: index + 1,
    }))
    .filter(({ score }) => score > 0)
    .map(({ score, holeNumber }) =>
      buildScoreHoleEntryInput({
        ...input,
        markerForPlayerId,
        holeNumber,
        strokes: score,
      })
    );

  return saveScoreHoleEntries(rows);
};

export const loadTournamentHoleStatistics = async (
  input: GetScoreHoleEntriesForTournamentInput
): Promise<ScoreHoleEntryRow[]> => {
  return getScoreHoleEntriesForTournament(input);
};

export const loadPlayerHoleStatistics = async (
  input: GetScoreHoleEntriesForPlayerInput
): Promise<ScoreHoleEntryRow[]> => {
  return getScoreHoleEntriesForPlayer(input);
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const roundStat = (value: number | null) =>
  value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;

const rate = (count: number, total: number) => (total > 0 ? roundStat((count / total) * 100) : null);

const average = (total: number, count: number) => (count > 0 ? roundStat(total / count) : null);

const getHoleCount = (aggregate: TournamentAggregate | null) => {
  const parsed = Number(aggregate?.roundSetup?.numberOfHoles);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(18, parsed) : 18;
};

const getCountingScores = (aggregate: TournamentAggregate | null) => {
  const parsed = Number(aggregate?.roundSetup?.countingScores);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.min(6, parsed)) : 4;
};

const extractParValues = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    const directPars = value
      .map((item) => {
        if (typeof item === "number" || typeof item === "string") {
          return asPositiveInteger(item);
        }

        const record = asRecord(item);
        return asPositiveInteger(record?.par);
      })
      .filter((par): par is number => Boolean(par && par >= 3 && par <= 5));

    if (directPars.length > 0) {
      return directPars;
    }
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  for (const key of ["holes", "holePars", "pars", "courseSetup"]) {
    const pars = extractParValues(record[key]);
    if (pars.length > 0) {
      return pars;
    }
  }

  return [];
};

const getHolePars = (aggregate: TournamentAggregate | null) => {
  const holeCount = getHoleCount(aggregate);
  const settingsPars = extractParValues(aggregate?.envelope?.tournament.settings ?? aggregate?.tournament.settings);
  const pars = settingsPars.length > 0 ? settingsPars : defaultHolePars;

  return Array.from({ length: holeCount }, (_, index) => {
    const par = pars[index] ?? defaultHolePars[index] ?? 4;
    return par >= 3 && par <= 5 ? par : 4;
  });
};

const isVerifiedEntry = (entry: ScoreHoleEntryRow) =>
  ["verified", "official"].includes(String(entry.review_status).toLowerCase()) ||
  ["verified", "official"].includes(String(entry.entry_status).toLowerCase());

const isMarkerEntry = (entry: ScoreHoleEntryRow) =>
  entry.entry_source === "marker" || String(entry.entered_by_player_id) !== String(entry.player_id);

const getEntryRank = (entry: ScoreHoleEntryRow) => {
  if (entry.is_official) {
    return 4;
  }

  if (isVerifiedEntry(entry)) {
    return 3;
  }

  if (isMarkerEntry(entry)) {
    return 2;
  }

  return 1;
};

const getEntryTimestamp = (entry: ScoreHoleEntryRow) =>
  Date.parse(entry.official_at ?? entry.updated_at ?? entry.created_at ?? "") || 0;

const selectPreferredHoleEntries = (
  entries: ScoreHoleEntryRow[],
  holePars: number[]
): SelectedHoleEntry[] => {
  const entriesByPlayerRoundHole = new Map<string, ScoreHoleEntryRow>();

  entries
    .filter((entry) => entry.strokes > 0 && entry.hole_number >= 1 && entry.hole_number <= holePars.length)
    .forEach((entry) => {
      const key = `${entry.round_number}:${entry.player_id}:${entry.hole_number}`;
      const current = entriesByPlayerRoundHole.get(key);
      if (
        !current ||
        getEntryRank(entry) > getEntryRank(current) ||
        (getEntryRank(entry) === getEntryRank(current) && getEntryTimestamp(entry) > getEntryTimestamp(current))
      ) {
        entriesByPlayerRoundHole.set(key, entry);
      }
    });

  return [...entriesByPlayerRoundHole.values()]
    .map((entry) => ({
      ...entry,
      par: holePars[entry.hole_number - 1] ?? 4,
    }))
    .sort((left, right) =>
      left.round_number - right.round_number ||
      left.player_id.localeCompare(right.player_id) ||
      left.hole_number - right.hole_number
    );
};

const createAccumulator = (): StatAccumulator => ({
  entries: [],
  totalStrokes: 0,
  totalToPar: 0,
  fairwayAttempts: 0,
  fairwaysHit: 0,
  girAttempts: 0,
  greensInRegulation: 0,
  puttAttempts: 0,
  putts: 0,
  girPutts: 0,
  girPuttAttempts: 0,
  birdies: 0,
  pars: 0,
  bogeys: 0,
  doublePlus: 0,
  penaltyStrokes: 0,
  missingFairways: 0,
  missingGir: 0,
  missingPutts: 0,
  penaltyAttempts: 0,
  missingPenalties: 0,
});

const addEntryToAccumulator = (accumulator: StatAccumulator, entry: SelectedHoleEntry) => {
  accumulator.entries.push(entry);
  accumulator.totalStrokes += entry.strokes;
  accumulator.totalToPar += entry.strokes - entry.par;

  if (entry.par !== 3) {
    if (entry.fairway_hit === null) {
      accumulator.missingFairways += 1;
    } else {
      accumulator.fairwayAttempts += 1;
      accumulator.fairwaysHit += entry.fairway_hit ? 1 : 0;
    }
  }

  if (entry.green_in_regulation === null) {
    accumulator.missingGir += 1;
  } else {
    accumulator.girAttempts += 1;
    accumulator.greensInRegulation += entry.green_in_regulation ? 1 : 0;
  }

  if (entry.putts === null) {
    accumulator.missingPutts += 1;
  } else {
    accumulator.puttAttempts += 1;
    accumulator.putts += entry.putts;
    if (entry.green_in_regulation === true) {
      accumulator.girPutts += entry.putts;
      accumulator.girPuttAttempts += 1;
    }
  }

  if (entry.penalty_strokes === null) {
    accumulator.missingPenalties += 1;
  } else {
    accumulator.penaltyAttempts += 1;
    accumulator.penaltyStrokes += entry.penalty_strokes;
  }

  const scoreToPar = entry.strokes - entry.par;
  accumulator.birdies += scoreToPar <= -1 ? 1 : 0;
  accumulator.pars += scoreToPar === 0 ? 1 : 0;
  accumulator.bogeys += scoreToPar === 1 ? 1 : 0;
  accumulator.doublePlus += scoreToPar >= 2 ? 1 : 0;
};

const getCompleteness = (accumulator: StatAccumulator): StatCompleteness => {
  const missingStats =
    accumulator.missingFairways +
    accumulator.missingGir +
    accumulator.missingPutts +
    accumulator.missingPenalties;
  const requiredStats =
    accumulator.fairwayAttempts +
    accumulator.missingFairways +
    accumulator.girAttempts +
    accumulator.missingGir +
    accumulator.puttAttempts +
    accumulator.missingPutts +
    accumulator.penaltyAttempts +
    accumulator.missingPenalties;

  return {
    missingFairways: accumulator.missingFairways,
    missingGir: accumulator.missingGir,
    missingPutts: accumulator.missingPutts,
    missingPenalties: accumulator.missingPenalties,
    completionPercentage: requiredStats > 0 ? roundStat(((requiredStats - missingStats) / requiredStats) * 100) : null,
    isComplete: requiredStats > 0 && missingStats === 0,
  };
};

const formatToPar = (value: number | null) => {
  if (value === null) {
    return "--";
  }

  if (value === 0) {
    return "E";
  }

  return value > 0 ? `+${value}` : String(value);
};

const formatAverageToPar = (value: number | null) => {
  if (value === null) {
    return "--";
  }

  const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value === 0) {
    return "E";
  }

  return value > 0 ? `+${formatted}` : formatted;
};

const getEntryHoleReport = (entry: SelectedHoleEntry | null): PlayerHoleReport | null => {
  if (!entry) {
    return null;
  }

  const toPar = entry.strokes - entry.par;
  return {
    holeNumber: entry.hole_number,
    par: entry.par,
    strokes: entry.strokes,
    toPar,
    label: `Hole ${entry.hole_number} (Par ${entry.par}) - ${entry.strokes} (${formatToPar(toPar)})`,
  };
};

const getAveragedHoleReport = (entries: SelectedHoleEntry[]): PlayerHoleReport | null => {
  if (entries.length === 0) {
    return null;
  }

  const firstEntry = entries[0];
  const strokes = average(entries.reduce((sum, entry) => sum + entry.strokes, 0), entries.length);
  const toPar = average(entries.reduce((sum, entry) => sum + entry.strokes - entry.par, 0), entries.length);

  return {
    holeNumber: firstEntry.hole_number,
    par: firstEntry.par,
    strokes,
    toPar,
    label: `Hole ${firstEntry.hole_number} (Par ${firstEntry.par}) - ${strokes?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "--"} avg (${formatAverageToPar(toPar)})`,
  };
};

const getBestSingleHole = (entries: SelectedHoleEntry[]) =>
  [...entries].sort((left, right) =>
    (left.strokes - left.par) - (right.strokes - right.par) ||
    left.strokes - right.strokes ||
    left.hole_number - right.hole_number
  )[0] ?? null;

const getWorstSingleHole = (entries: SelectedHoleEntry[]) =>
  [...entries].sort((left, right) =>
    (right.strokes - right.par) - (left.strokes - left.par) ||
    right.strokes - left.strokes ||
    left.hole_number - right.hole_number
  )[0] ?? null;

const buildParTypeReport = (par: number, accumulator: StatAccumulator): PlayerParTypeReport | null => {
  if (![3, 4, 5].includes(par) || accumulator.entries.length === 0) {
    return null;
  }

  const scoringAverage = average(accumulator.totalStrokes, accumulator.entries.length);
  const toParAverage = average(accumulator.totalToPar, accumulator.entries.length);

  if (scoringAverage === null || toParAverage === null) {
    return null;
  }

  return {
    par: par as 3 | 4 | 5,
    scoringAverage,
    toParAverage,
    label: `Par ${par} - ${scoringAverage.toLocaleString(undefined, { maximumFractionDigits: 2 })} avg (${formatAverageToPar(toParAverage)})`,
  };
};

const buildPlayerParTypeReports = (entries: SelectedHoleEntry[]) => {
  const parAccumulators = new Map<number, StatAccumulator>();
  entries.forEach((entry) => {
    const accumulator = parAccumulators.get(entry.par) ?? createAccumulator();
    addEntryToAccumulator(accumulator, entry);
    parAccumulators.set(entry.par, accumulator);
  });

  return [3, 4, 5]
    .map((par) => buildParTypeReport(par, parAccumulators.get(par) ?? createAccumulator()))
    .filter((report): report is PlayerParTypeReport => Boolean(report));
};

const buildPlayerHoleAverageReports = (entries: SelectedHoleEntry[]) => {
  const entriesByHole = new Map<number, SelectedHoleEntry[]>();
  entries.forEach((entry) => {
    entriesByHole.set(entry.hole_number, [...(entriesByHole.get(entry.hole_number) ?? []), entry]);
  });

  return [...entriesByHole.values()]
    .map(getAveragedHoleReport)
    .filter((report): report is PlayerHoleReport => Boolean(report));
};

const buildPlayerStretchReports = (entries: SelectedHoleEntry[]): PlayerStretchReport[] => {
  const entriesByRound = new Map<number, SelectedHoleEntry[]>();
  entries.forEach((entry) => {
    entriesByRound.set(entry.round_number, [...(entriesByRound.get(entry.round_number) ?? []), entry]);
  });

  return [...entriesByRound.entries()].flatMap(([roundNumber, roundEntries]) => {
    const sortedEntries = [...roundEntries].sort((left, right) => left.hole_number - right.hole_number);
    const stretches: PlayerStretchReport[] = [];

    for (let index = 0; index <= sortedEntries.length - 3; index += 1) {
      const stretchEntries = sortedEntries.slice(index, index + 3);
      const hasConsecutiveHoles = stretchEntries.every((entry, stretchIndex) =>
        stretchIndex === 0 || entry.hole_number === stretchEntries[stretchIndex - 1].hole_number + 1
      );

      if (!hasConsecutiveHoles) {
        continue;
      }

      const totalStrokes = stretchEntries.reduce((sum, entry) => sum + entry.strokes, 0);
      const totalToPar = stretchEntries.reduce((sum, entry) => sum + entry.strokes - entry.par, 0);
      const scoringAverage = average(totalStrokes, stretchEntries.length);
      const toParAverage = average(totalToPar, stretchEntries.length);

      if (scoringAverage === null || toParAverage === null) {
        continue;
      }

      stretches.push({
        roundNumber,
        startHole: stretchEntries[0].hole_number,
        endHole: stretchEntries[stretchEntries.length - 1].hole_number,
        scoringAverage,
        toParAverage,
        label: `Round ${roundNumber}, Holes ${stretchEntries[0].hole_number}-${stretchEntries[stretchEntries.length - 1].hole_number} - ${scoringAverage.toLocaleString(undefined, { maximumFractionDigits: 2 })} avg (${formatAverageToPar(toParAverage)})`,
      });
    }

    return stretches;
  });
};

const summarizeAccumulator = (accumulator: StatAccumulator) => ({
  fairwayPercentage: rate(accumulator.fairwaysHit, accumulator.fairwayAttempts),
  girPercentage: rate(accumulator.greensInRegulation, accumulator.girAttempts),
  putts: accumulator.putts,
  penaltyStrokes: accumulator.penaltyStrokes,
});

const getPlayerName = (aggregate: TournamentAggregate | null, playerId: string) => {
  const player = aggregate?.players.find((item) => String(item.id) === String(playerId));
  if (player) {
    return `${player.firstName} ${player.lastName}`.trim() || playerId;
  }

  return aggregate?.tournamentPlayers.find((row) => String(row.player_id) === String(playerId))?.player_name || playerId;
};

const getPlayerTeam = (aggregate: TournamentAggregate | null, playerId: string) => {
  const player = aggregate?.players.find((item) => String(item.id) === String(playerId));
  const tournamentPlayer = aggregate?.tournamentPlayers.find((row) => String(row.player_id) === String(playerId));
  const team = player ? aggregate?.teams.find((item) => String(item.id) === String(player.teamId)) : null;

  return {
    teamId: player?.teamId || tournamentPlayer?.team_id || null,
    teamName:
      team?.name ||
      tournamentPlayer?.team_name ||
      (typeof player?.statistics.teamName === "string" ? player.statistics.teamName : null) ||
      "Unassigned",
  };
};

const countCompletedRounds = (entries: SelectedHoleEntry[], holeCount: number) => {
  const holesByRound = new Map<number, Set<number>>();
  entries.forEach((entry) => {
    const current = holesByRound.get(entry.round_number) ?? new Set<number>();
    current.add(entry.hole_number);
    holesByRound.set(entry.round_number, current);
  });

  return [...holesByRound.values()].filter((holes) => holes.size >= holeCount).length;
};

const getCompletedRoundTotals = (entries: SelectedHoleEntry[], holeCount: number) => {
  const rounds = new Map<number, SelectedHoleEntry[]>();
  entries.forEach((entry) => {
    rounds.set(entry.round_number, [...(rounds.get(entry.round_number) ?? []), entry]);
  });

  return [...rounds.entries()]
    .map(([roundNumber, roundEntries]) => {
      const uniqueHoles = new Set(roundEntries.map((entry) => entry.hole_number));
      if (uniqueHoles.size < holeCount) {
        return null;
      }

      return {
        roundNumber,
        total: roundEntries.reduce((sum, entry) => sum + entry.strokes, 0),
      };
    })
    .filter((round): round is { roundNumber: number; total: number } => Boolean(round));
};

type CompletedPlayerRound = {
  playerId: string;
  roundNumber: number;
  total: number;
  toPar: number;
  entries: SelectedHoleEntry[];
};

type TeamRoundCalculation = {
  roundNumber: number;
  countingPlayers: CompletedPlayerRound[];
  countingScore: number;
  toPar: number;
};

const getCompletedPlayerRounds = (entries: SelectedHoleEntry[], holeCount: number): CompletedPlayerRound[] => {
  const rounds = new Map<string, SelectedHoleEntry[]>();
  entries.forEach((entry) => {
    const key = `${entry.player_id}:${entry.round_number}`;
    rounds.set(key, [...(rounds.get(key) ?? []), entry]);
  });

  return [...rounds.values()]
    .map((roundEntries) => {
      const uniqueHoles = new Set(roundEntries.map((entry) => entry.hole_number));
      if (uniqueHoles.size < holeCount) {
        return null;
      }

      const sortedEntries = [...roundEntries].sort((left, right) => left.hole_number - right.hole_number);
      return {
        playerId: sortedEntries[0].player_id,
        roundNumber: sortedEntries[0].round_number,
        total: sortedEntries.reduce((sum, entry) => sum + entry.strokes, 0),
        toPar: sortedEntries.reduce((sum, entry) => sum + entry.strokes - entry.par, 0),
        entries: sortedEntries,
      };
    })
    .filter((round): round is CompletedPlayerRound => Boolean(round));
};

const buildTeamRoundCalculations = (
  playerRounds: CompletedPlayerRound[],
  countingScores: number
): TeamRoundCalculation[] => {
  const rounds = new Map<number, CompletedPlayerRound[]>();
  playerRounds.forEach((round) => {
    rounds.set(round.roundNumber, [...(rounds.get(round.roundNumber) ?? []), round]);
  });

  return [...rounds.entries()]
    .filter(([, roundsForNumber]) => roundsForNumber.length >= countingScores)
    .map(([roundNumber, roundsForNumber]) => {
      const countingPlayers = [...roundsForNumber]
        .sort((left, right) => left.total - right.total || left.playerId.localeCompare(right.playerId))
        .slice(0, countingScores);

      return {
        roundNumber,
        countingPlayers,
        countingScore: countingPlayers.reduce((sum, round) => sum + round.total, 0),
        toPar: countingPlayers.reduce((sum, round) => sum + round.toPar, 0),
      };
    })
    .sort((left, right) => left.roundNumber - right.roundNumber);
};

const buildTeamRoundTrendReport = (round: TeamRoundCalculation): TeamRoundTrendReport => ({
  roundNumber: round.roundNumber,
  countingScore: round.countingScore,
  toPar: round.toPar,
  label: `Round ${round.roundNumber} - ${round.countingScore} (${formatToPar(round.toPar)})`,
});

const buildTeamContributionReports = (
  aggregate: TournamentAggregate | null,
  playerRounds: CompletedPlayerRound[],
  teamRoundCalculations: TeamRoundCalculation[]
): TeamPlayerContributionReport[] => {
  const countingRoundsByPlayer = new Map<string, number>();
  const finishingPositionsByPlayer = new Map<string, number[]>();
  const totalCountingSlots = teamRoundCalculations.reduce((sum, round) => sum + round.countingPlayers.length, 0);

  teamRoundCalculations.forEach((round) => {
    round.countingPlayers.forEach((playerRound) => {
      countingRoundsByPlayer.set(playerRound.playerId, (countingRoundsByPlayer.get(playerRound.playerId) ?? 0) + 1);
    });
  });

  const completedRoundsByNumber = new Map<number, CompletedPlayerRound[]>();
  playerRounds.forEach((round) => {
    completedRoundsByNumber.set(round.roundNumber, [...(completedRoundsByNumber.get(round.roundNumber) ?? []), round]);
  });

  completedRoundsByNumber.forEach((roundsForNumber) => {
    [...roundsForNumber]
      .sort((left, right) => left.total - right.total || left.playerId.localeCompare(right.playerId))
      .forEach((playerRound, index) => {
        finishingPositionsByPlayer.set(playerRound.playerId, [
          ...(finishingPositionsByPlayer.get(playerRound.playerId) ?? []),
          index + 1,
        ]);
      });
  });

  const playerIds = new Set([
    ...playerRounds.map((round) => round.playerId),
    ...teamRoundCalculations.flatMap((round) => round.countingPlayers.map((playerRound) => playerRound.playerId)),
  ]);

  return [...playerIds]
    .map((playerId) => {
      const countingRounds = countingRoundsByPlayer.get(playerId) ?? 0;
      const finishingPositions = finishingPositionsByPlayer.get(playerId) ?? [];
      const countingRoundPercentage = rate(countingRounds, totalCountingSlots);
      const averageFinishingPositionContribution = average(
        finishingPositions.reduce((sum, position) => sum + position, 0),
        finishingPositions.length
      );

      return {
        playerId,
        playerName: getPlayerName(aggregate, playerId),
        countingRounds,
        countingRoundPercentage,
        averageFinishingPositionContribution,
        label: `${getPlayerName(aggregate, playerId)} - ${countingRounds} counting (${countingRoundPercentage ?? 0}%)`,
      };
    })
    .sort((left, right) =>
      right.countingRounds - left.countingRounds ||
      (left.averageFinishingPositionContribution ?? Number.MAX_SAFE_INTEGER) -
        (right.averageFinishingPositionContribution ?? Number.MAX_SAFE_INTEGER) ||
      left.playerName.localeCompare(right.playerName)
    );
};

const getTeamNineAverage = (playerRounds: CompletedPlayerRound[], startHole: number, endHole: number) => {
  const totals = playerRounds
    .map((round) => {
      const segmentEntries = round.entries.filter((entry) => entry.hole_number >= startHole && entry.hole_number <= endHole);
      const expectedHoleCount = endHole - startHole + 1;
      return segmentEntries.length >= expectedHoleCount
        ? segmentEntries.reduce((sum, entry) => sum + entry.strokes, 0)
        : null;
    })
    .filter((total): total is number => total !== null);

  return average(totals.reduce((sum, total) => sum + total, 0), totals.length);
};

const buildTeamStatisticReport = (statistic: string, value: number | null, suffix = ""): TeamStatisticStrengthReport | null =>
  value === null
    ? null
    : {
        statistic,
        value,
        label: `${statistic} - ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`,
      };

type TeamStatisticCandidate = {
  key: "fairways" | "gir" | "puttsPerRound" | "penalties";
  report: TeamStatisticStrengthReport;
  value: number;
  higherIsBetter: boolean;
};

const getTeamStatisticCandidates = (team: TeamStatisticsReadModel): TeamStatisticCandidate[] =>
  [
    {
      key: "fairways" as const,
      report: buildTeamStatisticReport("Fairway %", team.fairwayPercentage, "%"),
      value: team.fairwayPercentage,
      higherIsBetter: true,
    },
    {
      key: "gir" as const,
      report: buildTeamStatisticReport("GIR %", team.girPercentage, "%"),
      value: team.girPercentage,
      higherIsBetter: true,
    },
    {
      key: "puttsPerRound" as const,
      report: buildTeamStatisticReport("Putts per Round", team.puttsPerRound),
      value: team.puttsPerRound,
      higherIsBetter: false,
    },
    {
      key: "penalties" as const,
      report: buildTeamStatisticReport("Penalty Strokes", team.penaltyStrokes),
      value: team.penaltyStrokes,
      higherIsBetter: false,
    },
  ]
    .filter((candidate): candidate is TeamStatisticCandidate => candidate.report !== null && candidate.value !== null);

const getTeamStatisticRank = (candidate: TeamStatisticCandidate, allTeams: TeamStatisticsReadModel[]) => {
  const comparableValues = allTeams
    .flatMap((team) => getTeamStatisticCandidates(team).filter((item) => item.key === candidate.key))
    .map((item) => item.value);

  return comparableValues.filter((value) =>
    candidate.higherIsBetter ? value > candidate.value : value < candidate.value
  ).length + 1;
};

const buildPlayerStatistics = (
  aggregate: TournamentAggregate | null,
  selectedEntries: SelectedHoleEntry[],
  holeCount: number
): PlayerStatisticsReadModel[] => {
  const entriesByPlayer = new Map<string, StatAccumulator>();
  selectedEntries.forEach((entry) => {
    const accumulator = entriesByPlayer.get(entry.player_id) ?? createAccumulator();
    addEntryToAccumulator(accumulator, entry);
    entriesByPlayer.set(entry.player_id, accumulator);
  });

  return [...entriesByPlayer.entries()]
    .map(([playerId, accumulator]) => {
      const team = getPlayerTeam(aggregate, playerId);
      const roundsPlayed = countCompletedRounds(accumulator.entries, holeCount);
      const roundsWithEntries = new Set(accumulator.entries.map((entry) => entry.round_number)).size;
      const puttRoundCount = roundsPlayed > 0 ? roundsPlayed : roundsWithEntries;
      const parTypeReports = buildPlayerParTypeReports(accumulator.entries);
      const strongestParType = [...parTypeReports].sort((left, right) =>
        left.toParAverage - right.toParAverage || left.par - right.par
      )[0] ?? null;
      const weakestParType = [...parTypeReports].sort((left, right) =>
        right.toParAverage - left.toParAverage || left.par - right.par
      )[0] ?? null;
      const holeAverageReports = buildPlayerHoleAverageReports(accumulator.entries);
      const hardestHole = [...holeAverageReports].sort((left, right) =>
        (right.toPar ?? 0) - (left.toPar ?? 0) || left.holeNumber - right.holeNumber
      )[0] ?? null;
      const stretchReports = buildPlayerStretchReports(accumulator.entries);
      const bestStretch = [...stretchReports].sort((left, right) =>
        left.toParAverage - right.toParAverage ||
        left.roundNumber - right.roundNumber ||
        left.startHole - right.startHole
      )[0] ?? null;
      const worstStretch = [...stretchReports].sort((left, right) =>
        right.toParAverage - left.toParAverage ||
        left.roundNumber - right.roundNumber ||
        left.startHole - right.startHole
      )[0] ?? null;
      return {
        playerId,
        playerName: getPlayerName(aggregate, playerId),
        teamId: team.teamId,
        teamName: team.teamName,
        holesPlayed: accumulator.entries.length,
        roundsPlayed,
        scoringAverage: average(accumulator.totalStrokes, accumulator.entries.length),
        totalStrokes: accumulator.totalStrokes,
        toPar: accumulator.totalToPar,
        ...summarizeAccumulator(accumulator),
        puttsPerRound: average(accumulator.putts, puttRoundCount),
        puttsPerGir: average(accumulator.girPutts, accumulator.girPuttAttempts),
        birdies: accumulator.birdies,
        pars: accumulator.pars,
        bogeys: accumulator.bogeys,
        doublePlus: accumulator.doublePlus,
        bestHole: getEntryHoleReport(getBestSingleHole(accumulator.entries)),
        worstHole: getEntryHoleReport(getWorstSingleHole(accumulator.entries)),
        strongestParType,
        weakestParType,
        hardestHole,
        bestStretch,
        worstStretch,
        completeness: getCompleteness(accumulator),
      };
    })
    .sort((left, right) => left.playerName.localeCompare(right.playerName));
};

const buildTeamStatistics = (
  aggregate: TournamentAggregate | null,
  selectedEntries: SelectedHoleEntry[],
  holeCount: number
): TeamStatisticsReadModel[] => {
  const countingScores = getCountingScores(aggregate);
  const entriesByTeam = new Map<string, { teamId: string | null; teamName: string; accumulator: StatAccumulator }>();
  const playerIdsByTeam = new Map<string, Set<string>>();
  const entriesByPlayer = new Map<string, SelectedHoleEntry[]>();

  selectedEntries.forEach((entry) => {
    const team = getPlayerTeam(aggregate, entry.player_id);
    const teamKey = team.teamId ?? team.teamName;
    const current = entriesByTeam.get(teamKey) ?? {
      teamId: team.teamId,
      teamName: team.teamName,
      accumulator: createAccumulator(),
    };
    addEntryToAccumulator(current.accumulator, entry);
    entriesByTeam.set(teamKey, current);

    const playerIds = playerIdsByTeam.get(teamKey) ?? new Set<string>();
    playerIds.add(entry.player_id);
    playerIdsByTeam.set(teamKey, playerIds);

    entriesByPlayer.set(entry.player_id, [...(entriesByPlayer.get(entry.player_id) ?? []), entry]);
  });

  const completedPlayerRoundsByTeam = new Map<string, CompletedPlayerRound[]>();
  entriesByPlayer.forEach((playerEntries, playerId) => {
    const team = getPlayerTeam(aggregate, playerId);
    const teamKey = team.teamId ?? team.teamName;
    completedPlayerRoundsByTeam.set(teamKey, [
      ...(completedPlayerRoundsByTeam.get(teamKey) ?? []),
      ...getCompletedPlayerRounds(playerEntries, holeCount),
    ]);
  });

  const teamReadModels = [...entriesByTeam.entries()]
    .map(([teamKey, team]) => {
      const completedPlayerRounds = completedPlayerRoundsByTeam.get(teamKey) ?? [];
      const teamRoundCalculations = buildTeamRoundCalculations(completedPlayerRounds, countingScores);
      const completedRoundTotals = completedPlayerRounds.map((round) => round.total);
      const countingRoundReports = teamRoundCalculations.map(buildTeamRoundTrendReport);
      const parTypeReports = buildPlayerParTypeReports(team.accumulator.entries);
      const bestParType = [...parTypeReports].sort((left, right) =>
        left.toParAverage - right.toParAverage || left.par - right.par
      )[0] ?? null;
      const worstParType = [...parTypeReports].sort((left, right) =>
        right.toParAverage - left.toParAverage || left.par - right.par
      )[0] ?? null;
      const holeAverageReports = buildPlayerHoleAverageReports(team.accumulator.entries);
      const hardestHole = [...holeAverageReports].sort((left, right) =>
        (right.toPar ?? 0) - (left.toPar ?? 0) || left.holeNumber - right.holeNumber
      )[0] ?? null;
      const easiestHole = [...holeAverageReports].sort((left, right) =>
        (left.toPar ?? 0) - (right.toPar ?? 0) || left.holeNumber - right.holeNumber
      )[0] ?? null;
      const roundsWithEntries = new Set(team.accumulator.entries.map((entry) => `${entry.round_number}:${entry.player_id}`)).size;
      const puttRoundCount = completedPlayerRounds.length > 0 ? completedPlayerRounds.length : roundsWithEntries;
      const bestRound = [...countingRoundReports].sort((left, right) =>
        left.toPar - right.toPar || left.countingScore - right.countingScore || left.roundNumber - right.roundNumber
      )[0] ?? null;
      const worstRound = [...countingRoundReports].sort((left, right) =>
        right.toPar - left.toPar || right.countingScore - left.countingScore || left.roundNumber - right.roundNumber
      )[0] ?? null;

      return {
        teamId: team.teamId,
        teamName: team.teamName,
        playerCount: playerIdsByTeam.get(teamKey)?.size ?? 0,
        holesPlayed: team.accumulator.entries.length,
        teamScoringAverage: average(
          completedRoundTotals.reduce((sum, total) => sum + total, 0),
          completedRoundTotals.length
        ),
        countingScoreAverage: average(
          teamRoundCalculations.reduce((sum, round) => sum + round.countingScore, 0),
          teamRoundCalculations.length
        ),
        totalStrokes: team.accumulator.totalStrokes,
        toPar: team.accumulator.totalToPar,
        ...summarizeAccumulator(team.accumulator),
        puttsPerRound: average(team.accumulator.putts, puttRoundCount),
        penaltyStrokes: team.accumulator.penaltyStrokes,
        countingContributions: buildTeamContributionReports(aggregate, completedPlayerRounds, teamRoundCalculations),
        bestParType,
        worstParType,
        hardestHole,
        easiestHole,
        strongestStatistic: null,
        weakestStatistic: null,
        frontNineAverage: getTeamNineAverage(completedPlayerRounds, 1, Math.min(9, holeCount)),
        backNineAverage: holeCount > 9 ? getTeamNineAverage(completedPlayerRounds, 10, holeCount) : null,
        bestRound,
        worstRound,
        teamTrend: countingRoundReports,
        completeness: getCompleteness(team.accumulator),
      };
    });

  return teamReadModels
    .map((team) => {
      const rankedCandidates = getTeamStatisticCandidates(team)
        .map((candidate) => ({
          ...candidate,
          rank: getTeamStatisticRank(candidate, teamReadModels),
        }));
      const strongestStatistic = [...rankedCandidates].sort((left, right) =>
        left.rank - right.rank || left.report.statistic.localeCompare(right.report.statistic)
      )[0]?.report ?? null;
      const weakestStatistic = [...rankedCandidates].sort((left, right) =>
        right.rank - left.rank || left.report.statistic.localeCompare(right.report.statistic)
      )[0]?.report ?? null;

      return {
        ...team,
        strongestStatistic,
        weakestStatistic,
      };
    })
    .sort((left, right) => left.teamName.localeCompare(right.teamName));
};

const buildTournamentStatistics = (
  selectedEntries: SelectedHoleEntry[],
  holePars: number[]
): TournamentStatisticsReadModel => {
  const tournamentAccumulator = createAccumulator();
  const holeAccumulators = new Map<number, StatAccumulator>();
  const parAccumulators = new Map<number, StatAccumulator>();

  selectedEntries.forEach((entry) => {
    addEntryToAccumulator(tournamentAccumulator, entry);

    const holeAccumulator = holeAccumulators.get(entry.hole_number) ?? createAccumulator();
    addEntryToAccumulator(holeAccumulator, entry);
    holeAccumulators.set(entry.hole_number, holeAccumulator);

    const parAccumulator = parAccumulators.get(entry.par) ?? createAccumulator();
    addEntryToAccumulator(parAccumulator, entry);
    parAccumulators.set(entry.par, parAccumulator);
  });

  const holeScoringAverages = holePars.map((par, index): HoleStatisticsReadModel => {
    const holeNumber = index + 1;
    const accumulator = holeAccumulators.get(holeNumber) ?? createAccumulator();
    const entries = accumulator.entries.length;

    return {
      holeNumber,
      par,
      entries,
      scoringAverage: average(accumulator.totalStrokes, entries),
      birdieRate: rate(accumulator.birdies, entries),
      parRate: rate(accumulator.pars, entries),
      bogeyRate: rate(accumulator.bogeys, entries),
    };
  });

  const holesWithScores = holeScoringAverages.filter((hole) => hole.scoringAverage !== null);
  const hardestHole = [...holesWithScores].sort((left, right) =>
    (right.scoringAverage ?? 0) - (left.scoringAverage ?? 0) || left.holeNumber - right.holeNumber
  )[0] ?? null;
  const easiestHole = [...holesWithScores].sort((left, right) =>
    (left.scoringAverage ?? 0) - (right.scoringAverage ?? 0) || left.holeNumber - right.holeNumber
  )[0] ?? null;
  const totalEntries = tournamentAccumulator.entries.length;

  return {
    hardestHole,
    easiestHole,
    holeScoringAverages,
    par3Average: average(parAccumulators.get(3)?.totalStrokes ?? 0, parAccumulators.get(3)?.entries.length ?? 0),
    par4Average: average(parAccumulators.get(4)?.totalStrokes ?? 0, parAccumulators.get(4)?.entries.length ?? 0),
    par5Average: average(parAccumulators.get(5)?.totalStrokes ?? 0, parAccumulators.get(5)?.entries.length ?? 0),
    birdieRate: rate(tournamentAccumulator.birdies, totalEntries),
    parRate: rate(tournamentAccumulator.pars, totalEntries),
    bogeyRate: rate(tournamentAccumulator.bogeys, totalEntries),
    completeness: getCompleteness(tournamentAccumulator),
  };
};

export const buildTournamentStatisticsReadModels = ({
  aggregate,
  entries,
  roundNumber,
  generatedAt = new Date().toISOString(),
}: BuildTournamentStatisticsReadModelsInput): TournamentStatisticsReadModels => {
  const holePars = getHolePars(aggregate);
  const selectedEntries = selectPreferredHoleEntries(
    typeof roundNumber === "number" ? entries.filter((entry) => entry.round_number === roundNumber) : entries,
    holePars
  );

  return {
    tournamentId: aggregate?.localTournamentId || aggregate?.tournamentId || entries[0]?.tournament_id || "",
    sharedTournamentId: aggregate?.sharedTournamentId || entries[0]?.tournament_id || "",
    roundNumber: typeof roundNumber === "number" ? roundNumber : null,
    generatedAt,
    playerStatistics: buildPlayerStatistics(aggregate, selectedEntries, holePars.length),
    teamStatistics: buildTeamStatistics(aggregate, selectedEntries, holePars.length),
    tournamentStatistics: buildTournamentStatistics(selectedEntries, holePars),
  };
};

export const loadTournamentStatisticsReadModels = async ({
  tournamentId,
  roundNumber,
}: LoadTournamentStatisticsReadModelsInput): Promise<TournamentStatisticsReadModels> => {
  const [aggregate, entries] = await Promise.all([
    getTournamentAggregate(tournamentId),
    loadTournamentHoleStatistics({ tournamentId, roundNumber }),
  ]);

  return buildTournamentStatisticsReadModels({
    aggregate,
    entries,
    roundNumber,
  });
};
