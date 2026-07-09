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
};

export type PlayerStatisticsReadModel = {
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string;
  holesPlayed: number;
  roundsPlayed: number;
  scoringAverage: number | null;
  fairwayPercentage: number | null;
  girPercentage: number | null;
  putts: number;
  puttsPerGir: number | null;
  birdies: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  penaltyStrokes: number;
  completeness: StatCompleteness;
};

export type TeamStatisticsReadModel = {
  teamId: string | null;
  teamName: string;
  playerCount: number;
  holesPlayed: number;
  teamScoringAverage: number | null;
  countingScoreAverage: number | null;
  fairwayPercentage: number | null;
  girPercentage: number | null;
  putts: number;
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
});

export const saveHoleStatistics = async (
  input: SaveHoleStatisticsInput
): Promise<ScoreHoleEntryRow> => {
  return saveScoreHoleEntry(input);
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
  missingPenalties: 0,
});

const addEntryToAccumulator = (accumulator: StatAccumulator, entry: SelectedHoleEntry) => {
  accumulator.entries.push(entry);
  accumulator.totalStrokes += entry.strokes;

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
    accumulator.penaltyStrokes += entry.penalty_strokes;
  }

  const scoreToPar = entry.strokes - entry.par;
  accumulator.birdies += scoreToPar <= -1 ? 1 : 0;
  accumulator.pars += scoreToPar === 0 ? 1 : 0;
  accumulator.bogeys += scoreToPar === 1 ? 1 : 0;
  accumulator.doublePlus += scoreToPar >= 2 ? 1 : 0;
};

const getCompleteness = (accumulator: StatAccumulator): StatCompleteness => ({
  missingFairways: accumulator.missingFairways,
  missingGir: accumulator.missingGir,
  missingPutts: accumulator.missingPutts,
  missingPenalties: accumulator.missingPenalties,
});

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
      return {
        playerId,
        playerName: getPlayerName(aggregate, playerId),
        teamId: team.teamId,
        teamName: team.teamName,
        holesPlayed: accumulator.entries.length,
        roundsPlayed: countCompletedRounds(accumulator.entries, holeCount),
        scoringAverage: average(accumulator.totalStrokes, accumulator.entries.length),
        ...summarizeAccumulator(accumulator),
        puttsPerGir: average(accumulator.girPutts, accumulator.girPuttAttempts),
        birdies: accumulator.birdies,
        pars: accumulator.pars,
        bogeys: accumulator.bogeys,
        doublePlus: accumulator.doublePlus,
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
  const completedTotalsByTeamRound = new Map<string, number[]>();
  const playerIdsByTeam = new Map<string, Set<string>>();

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
  });

  const entriesByPlayer = new Map<string, SelectedHoleEntry[]>();
  selectedEntries.forEach((entry) => {
    entriesByPlayer.set(entry.player_id, [...(entriesByPlayer.get(entry.player_id) ?? []), entry]);
  });

  entriesByPlayer.forEach((playerEntries, playerId) => {
    const team = getPlayerTeam(aggregate, playerId);
    const teamKey = team.teamId ?? team.teamName;
    getCompletedRoundTotals(playerEntries, holeCount).forEach((roundTotal) => {
      const key = `${teamKey}:${roundTotal.roundNumber}`;
      completedTotalsByTeamRound.set(key, [...(completedTotalsByTeamRound.get(key) ?? []), roundTotal.total]);
    });
  });

  return [...entriesByTeam.entries()]
    .map(([teamKey, team]) => {
      const completedRoundsForTeam = [...completedTotalsByTeamRound.entries()]
        .filter(([key]) => key.startsWith(`${teamKey}:`));
      const completedRoundTotals = completedRoundsForTeam
        .flatMap(([, totals]) => totals);
      const countingRoundTotals = completedRoundsForTeam
        .map(([, totals]) => totals)
        .filter((totals) => totals.length >= countingScores)
        .map((totals) =>
          [...totals]
            .sort((left, right) => left - right)
            .slice(0, countingScores)
            .reduce((sum, total) => sum + total, 0)
        );

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
          countingRoundTotals.reduce((sum, total) => sum + total, 0),
          countingRoundTotals.length
        ),
        ...summarizeAccumulator(team.accumulator),
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
