import type { ScoreHoleEntryRow } from "../repositories/statisticsRepository";
import {
  buildTournamentStatisticsReadModels,
  loadTournamentHoleStatistics,
  type PlayerStatisticsReadModel,
  type TeamRoundTrendReport,
  type TeamStatisticsReadModel,
  type TournamentStatisticsReadModels,
} from "./statisticsService";
import {
  loadSharedTournamentAggregates,
  type TournamentAggregate,
} from "./tournamentService";

export type SeasonTournamentStatisticsSource = {
  aggregate: TournamentAggregate;
  entries: ScoreHoleEntryRow[];
};

export type SeasonPlayerRoundReport = {
  tournamentId: string;
  sharedTournamentId: string;
  tournamentName: string;
  roundNumber: number;
  totalStrokes: number;
  toPar: number;
  label: string;
};

export type PlayerSeasonStatisticsReadModel = {
  playerIdentityKey: string;
  playerId: string;
  playerName: string;
  teamIdentityKey: string | null;
  teamId: string | null;
  teamName: string;
  tournamentsPlayed: number;
  roundsPlayed: number;
  scoringAverage: number | null;
  totalStrokes: number;
  toPar: number;
  fairwayPercentage: number | null;
  girPercentage: number | null;
  puttsPerRound: number | null;
  puttsPerGir: number | null;
  birdies: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  penaltyStrokes: number;
  bestRound: SeasonPlayerRoundReport | null;
  worstRound: SeasonPlayerRoundReport | null;
  topFinish: number | null;
  averageFinish: number | null;
};

export type SeasonTeamTournamentTrendReport = {
  tournamentId: string;
  sharedTournamentId: string;
  tournamentName: string;
  finish: number | null;
  countingScore: number | null;
  countingScoreAverage: number | null;
  toPar: number;
  label: string;
};

export type TeamSeasonStatisticsReadModel = {
  teamIdentityKey: string;
  teamId: string | null;
  teamName: string;
  tournamentsPlayed: number;
  teamScoringAverage: number | null;
  countingScoreAverage: number | null;
  fairwayPercentage: number | null;
  girPercentage: number | null;
  putts: number;
  averageFinish: number | null;
  wins: number;
  top3: number;
  top5: number;
  tournamentTrend: SeasonTeamTournamentTrendReport[];
};

export type SeasonLeaderboardEntryReadModel = {
  id: string;
  name: string;
  secondaryLabel: string;
  value: number;
  displayValue: string;
};

export type SeasonLeaderboardsReadModel = {
  lowestScoringAverage: SeasonLeaderboardEntryReadModel[];
  bestFairwayPercentage: SeasonLeaderboardEntryReadModel[];
  bestGirPercentage: SeasonLeaderboardEntryReadModel[];
  fewestPutts: SeasonLeaderboardEntryReadModel[];
  mostBirdies: SeasonLeaderboardEntryReadModel[];
  bestAverageFinish: SeasonLeaderboardEntryReadModel[];
};

export type SeasonSummaryReadModel = {
  totalTournaments: number;
  completedTournaments: number;
  completedRounds: number;
  statisticsCompleteness: number | null;
  lastUpdated: string;
};

export type SeasonStatisticsReadModels = {
  seasonId: string | null;
  seasonName: string | null;
  generatedAt: string;
  playerStatistics: PlayerSeasonStatisticsReadModel[];
  teamStatistics: TeamSeasonStatisticsReadModel[];
  leaderboards: SeasonLeaderboardsReadModel;
  seasonSummary: SeasonSummaryReadModel;
  tournamentStatistics: TournamentStatisticsReadModels[];
};

export type BuildSeasonStatisticsReadModelsInput = {
  tournaments: SeasonTournamentStatisticsSource[];
  seasonId?: string | null;
  seasonName?: string | null;
  totalTournaments?: number;
  generatedAt?: string;
};

export type LoadSeasonStatisticsReadModelsInput = {
  aggregates?: TournamentAggregate[];
  seasonId?: string | null;
  seasonName?: string | null;
};

type TournamentContext = {
  aggregate: TournamentAggregate;
  readModels: TournamentStatisticsReadModels;
  roundReadModels: TournamentStatisticsReadModels[];
};

type PlayerAccumulator = {
  playerIdentityKey: string;
  playerId: string;
  playerName: string;
  teamIdentityKey: string | null;
  teamId: string | null;
  teamName: string;
  tournamentIds: Set<string>;
  roundsPlayed: number;
  totalStrokes: number;
  toPar: number;
  fairwayPercentageTotal: number;
  fairwayPercentageCount: number;
  girPercentageTotal: number;
  girPercentageCount: number;
  putts: number;
  puttsPerGirTotal: number;
  puttsPerGirCount: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  penaltyStrokes: number;
  rounds: SeasonPlayerRoundReport[];
  finishes: number[];
};

type TeamAccumulator = {
  teamIdentityKey: string;
  teamId: string | null;
  teamName: string;
  tournamentIds: Set<string>;
  teamScoringAverageTotal: number;
  teamScoringAverageCount: number;
  countingScoreAverageTotal: number;
  countingScoreAverageCount: number;
  fairwayPercentageTotal: number;
  fairwayPercentageCount: number;
  girPercentageTotal: number;
  girPercentageCount: number;
  putts: number;
  finishes: number[];
  trend: SeasonTeamTournamentTrendReport[];
};

const roundStat = (value: number | null) =>
  value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;

const average = (total: number, count: number) => (count > 0 ? roundStat(total / count) : null);

const formatToPar = (value: number) => {
  if (value === 0) {
    return "E";
  }

  return value > 0 ? `+${value}` : String(value);
};

const formatLeaderboardNumber = (value: number, suffix = "") =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;

const isFinalizedTournament = (aggregate: TournamentAggregate) => {
  const finalization = aggregate.envelope?.tournament.settings.finalization;
  return Boolean(
    finalization &&
      typeof finalization === "object" &&
      finalization.isFinalized &&
      finalization.finalizedAt
  );
};

const getTournamentName = (aggregate: TournamentAggregate) =>
  aggregate.tournament.name || aggregate.envelope?.tournament.name || "Tournament";

const getTournamentId = (context: TournamentContext) =>
  context.readModels.tournamentId || context.aggregate.localTournamentId || context.aggregate.tournamentId;

const getSharedTournamentId = (context: TournamentContext) =>
  context.readModels.sharedTournamentId || context.aggregate.sharedTournamentId || context.aggregate.tournamentId;

const getPlayerIdentityKey = (player: Pick<PlayerStatisticsReadModel, "playerId">) =>
  `player:${String(player.playerId)}`;

const getTeamIdentityKey = (teamId: string | null, teamName: string) =>
  teamId ? `team:${String(teamId)}` : `team-name:${teamName.toLowerCase()}`;

const getPlayerFinishReports = (readModels: TournamentStatisticsReadModels) =>
  [...readModels.playerStatistics]
    .filter((player) => player.roundsPlayed > 0)
    .sort((left, right) =>
      left.toPar - right.toPar ||
      left.totalStrokes - right.totalStrokes ||
      left.playerName.localeCompare(right.playerName)
    )
    .map((player, index) => ({
      player,
      finish: index + 1,
    }));

const getTeamCountingScore = (team: TeamStatisticsReadModel) =>
  team.teamTrend.reduce((sum, round) => sum + round.countingScore, 0);

const getTeamFinishReports = (readModels: TournamentStatisticsReadModels) =>
  [...readModels.teamStatistics]
    .filter((team) => team.teamTrend.length > 0 || team.countingScoreAverage !== null)
    .sort((left, right) => {
      const leftCountingScore = getTeamCountingScore(left);
      const rightCountingScore = getTeamCountingScore(right);
      const leftComparable = left.teamTrend.length > 0 ? leftCountingScore : left.countingScoreAverage ?? Number.MAX_SAFE_INTEGER;
      const rightComparable = right.teamTrend.length > 0 ? rightCountingScore : right.countingScoreAverage ?? Number.MAX_SAFE_INTEGER;

      return leftComparable - rightComparable || left.teamName.localeCompare(right.teamName);
    })
    .map((team, index) => ({
      team,
      finish: index + 1,
    }));

const getRoundNumbers = (aggregate: TournamentAggregate, entries: ScoreHoleEntryRow[]) => {
  const entryRoundNumbers = new Set(entries.map((entry) => entry.round_number).filter((roundNumber) => roundNumber > 0));
  const aggregateRoundNumbers = aggregate.rounds
    .map((round, index) => round.roundNumber || index + 1)
    .filter((roundNumber) => roundNumber > 0);

  return [...new Set([...entryRoundNumbers, ...aggregateRoundNumbers])].sort((left, right) => left - right);
};

const buildTournamentContexts = (
  sources: SeasonTournamentStatisticsSource[],
  generatedAt: string
): TournamentContext[] =>
  sources
    .filter((source) => isFinalizedTournament(source.aggregate))
    .map(({ aggregate, entries }) => {
      const readModels = buildTournamentStatisticsReadModels({
        aggregate,
        entries,
        generatedAt,
      });
      const roundReadModels = getRoundNumbers(aggregate, entries).map((roundNumber) =>
        buildTournamentStatisticsReadModels({
          aggregate,
          entries,
          roundNumber,
          generatedAt,
        })
      );

      return {
        aggregate,
        readModels,
        roundReadModels,
      };
    });

const buildRoundReportsByPlayer = (context: TournamentContext) => {
  const reportsByPlayer = new Map<string, SeasonPlayerRoundReport[]>();
  const tournamentName = getTournamentName(context.aggregate);
  const tournamentId = getTournamentId(context);
  const sharedTournamentId = getSharedTournamentId(context);

  context.roundReadModels.forEach((roundReadModels) => {
    const roundNumber = roundReadModels.roundNumber;
    if (roundNumber === null) {
      return;
    }

    roundReadModels.playerStatistics
      .filter((player) => player.roundsPlayed > 0)
      .forEach((player) => {
        const report: SeasonPlayerRoundReport = {
          tournamentId,
          sharedTournamentId,
          tournamentName,
          roundNumber,
          totalStrokes: player.totalStrokes,
          toPar: player.toPar,
          label: `${tournamentName} Round ${roundNumber} - ${player.totalStrokes} (${formatToPar(player.toPar)})`,
        };

        reportsByPlayer.set(player.playerId, [...(reportsByPlayer.get(player.playerId) ?? []), report]);
      });
  });

  return reportsByPlayer;
};

const getOrCreatePlayerAccumulator = (
  accumulators: Map<string, PlayerAccumulator>,
  player: PlayerStatisticsReadModel
) => {
  const playerIdentityKey = getPlayerIdentityKey(player);
  const existing = accumulators.get(playerIdentityKey);
  if (existing) {
    return existing;
  }

  const accumulator: PlayerAccumulator = {
    playerIdentityKey,
    playerId: player.playerId,
    playerName: player.playerName,
    teamIdentityKey: getTeamIdentityKey(player.teamId, player.teamName),
    teamId: player.teamId,
    teamName: player.teamName,
    tournamentIds: new Set<string>(),
    roundsPlayed: 0,
    totalStrokes: 0,
    toPar: 0,
    fairwayPercentageTotal: 0,
    fairwayPercentageCount: 0,
    girPercentageTotal: 0,
    girPercentageCount: 0,
    putts: 0,
    puttsPerGirTotal: 0,
    puttsPerGirCount: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doublePlus: 0,
    penaltyStrokes: 0,
    rounds: [],
    finishes: [],
  };

  accumulators.set(playerIdentityKey, accumulator);
  return accumulator;
};

const addPlayerTournament = (
  accumulator: PlayerAccumulator,
  player: PlayerStatisticsReadModel,
  tournamentId: string,
  roundReports: SeasonPlayerRoundReport[],
  finish: number | null
) => {
  accumulator.tournamentIds.add(tournamentId);
  accumulator.roundsPlayed += player.roundsPlayed;
  accumulator.totalStrokes += player.totalStrokes;
  accumulator.toPar += player.toPar;
  accumulator.putts += player.putts;
  accumulator.birdies += player.birdies;
  accumulator.pars += player.pars;
  accumulator.bogeys += player.bogeys;
  accumulator.doublePlus += player.doublePlus;
  accumulator.penaltyStrokes += player.penaltyStrokes;
  accumulator.rounds.push(...roundReports);

  if (player.fairwayPercentage !== null) {
    accumulator.fairwayPercentageTotal += player.fairwayPercentage;
    accumulator.fairwayPercentageCount += 1;
  }

  if (player.girPercentage !== null) {
    accumulator.girPercentageTotal += player.girPercentage;
    accumulator.girPercentageCount += 1;
  }

  if (player.puttsPerGir !== null) {
    accumulator.puttsPerGirTotal += player.puttsPerGir;
    accumulator.puttsPerGirCount += 1;
  }

  if (finish !== null) {
    accumulator.finishes.push(finish);
  }
};

const buildPlayerSeasonStatistics = (contexts: TournamentContext[]): PlayerSeasonStatisticsReadModel[] => {
  const accumulators = new Map<string, PlayerAccumulator>();

  contexts.forEach((context) => {
    const tournamentId = getTournamentId(context);
    const roundReportsByPlayer = buildRoundReportsByPlayer(context);
    const finishesByPlayer = new Map(
      getPlayerFinishReports(context.readModels).map(({ player, finish }) => [player.playerId, finish])
    );

    context.readModels.playerStatistics.forEach((player) => {
      const accumulator = getOrCreatePlayerAccumulator(accumulators, player);
      addPlayerTournament(
        accumulator,
        player,
        tournamentId,
        roundReportsByPlayer.get(player.playerId) ?? [],
        finishesByPlayer.get(player.playerId) ?? null
      );
    });
  });

  return [...accumulators.values()]
    .map((accumulator) => {
      const bestRound = [...accumulator.rounds].sort((left, right) =>
        left.toPar - right.toPar ||
        left.totalStrokes - right.totalStrokes ||
        left.tournamentName.localeCompare(right.tournamentName)
      )[0] ?? null;
      const worstRound = [...accumulator.rounds].sort((left, right) =>
        right.toPar - left.toPar ||
        right.totalStrokes - left.totalStrokes ||
        left.tournamentName.localeCompare(right.tournamentName)
      )[0] ?? null;

      return {
        playerIdentityKey: accumulator.playerIdentityKey,
        playerId: accumulator.playerId,
        playerName: accumulator.playerName,
        teamIdentityKey: accumulator.teamIdentityKey,
        teamId: accumulator.teamId,
        teamName: accumulator.teamName,
        tournamentsPlayed: accumulator.tournamentIds.size,
        roundsPlayed: accumulator.roundsPlayed,
        scoringAverage: average(accumulator.totalStrokes, accumulator.roundsPlayed),
        totalStrokes: accumulator.totalStrokes,
        toPar: accumulator.toPar,
        fairwayPercentage: average(accumulator.fairwayPercentageTotal, accumulator.fairwayPercentageCount),
        girPercentage: average(accumulator.girPercentageTotal, accumulator.girPercentageCount),
        puttsPerRound: average(accumulator.putts, accumulator.roundsPlayed),
        puttsPerGir: average(accumulator.puttsPerGirTotal, accumulator.puttsPerGirCount),
        birdies: accumulator.birdies,
        pars: accumulator.pars,
        bogeys: accumulator.bogeys,
        doublePlus: accumulator.doublePlus,
        penaltyStrokes: accumulator.penaltyStrokes,
        bestRound,
        worstRound,
        topFinish: accumulator.finishes.length > 0 ? Math.min(...accumulator.finishes) : null,
        averageFinish: average(
          accumulator.finishes.reduce((sum, finish) => sum + finish, 0),
          accumulator.finishes.length
        ),
      };
    })
    .sort((left, right) => left.playerName.localeCompare(right.playerName));
};

const getOrCreateTeamAccumulator = (
  accumulators: Map<string, TeamAccumulator>,
  team: TeamStatisticsReadModel
) => {
  const teamIdentityKey = getTeamIdentityKey(team.teamId, team.teamName);
  const existing = accumulators.get(teamIdentityKey);
  if (existing) {
    return existing;
  }

  const accumulator: TeamAccumulator = {
    teamIdentityKey,
    teamId: team.teamId,
    teamName: team.teamName,
    tournamentIds: new Set<string>(),
    teamScoringAverageTotal: 0,
    teamScoringAverageCount: 0,
    countingScoreAverageTotal: 0,
    countingScoreAverageCount: 0,
    fairwayPercentageTotal: 0,
    fairwayPercentageCount: 0,
    girPercentageTotal: 0,
    girPercentageCount: 0,
    putts: 0,
    finishes: [],
    trend: [],
  };

  accumulators.set(teamIdentityKey, accumulator);
  return accumulator;
};

const addTeamTournament = (
  accumulator: TeamAccumulator,
  team: TeamStatisticsReadModel,
  context: TournamentContext,
  finish: number | null
) => {
  const tournamentId = getTournamentId(context);
  const tournamentName = getTournamentName(context.aggregate);
  const countingScore = team.teamTrend.length > 0 ? getTeamCountingScore(team) : null;

  accumulator.tournamentIds.add(tournamentId);
  accumulator.putts += team.putts;

  if (team.fairwayPercentage !== null) {
    accumulator.fairwayPercentageTotal += team.fairwayPercentage;
    accumulator.fairwayPercentageCount += 1;
  }

  if (team.girPercentage !== null) {
    accumulator.girPercentageTotal += team.girPercentage;
    accumulator.girPercentageCount += 1;
  }

  if (team.teamScoringAverage !== null) {
    accumulator.teamScoringAverageTotal += team.teamScoringAverage;
    accumulator.teamScoringAverageCount += 1;
  }

  if (team.countingScoreAverage !== null) {
    accumulator.countingScoreAverageTotal += team.countingScoreAverage;
    accumulator.countingScoreAverageCount += 1;
  }

  if (finish !== null) {
    accumulator.finishes.push(finish);
  }

  accumulator.trend.push({
    tournamentId,
    sharedTournamentId: getSharedTournamentId(context),
    tournamentName,
    finish,
    countingScore,
    countingScoreAverage: team.countingScoreAverage,
    toPar: team.teamTrend.reduce((sum: number, round: TeamRoundTrendReport) => sum + round.toPar, 0),
    label: `${tournamentName} - ${finish === null ? "No finish" : `Finish ${finish}`}`,
  });
};

const buildTeamSeasonStatistics = (contexts: TournamentContext[]): TeamSeasonStatisticsReadModel[] => {
  const accumulators = new Map<string, TeamAccumulator>();

  contexts.forEach((context) => {
    const finishesByTeam = new Map(
      getTeamFinishReports(context.readModels).map(({ team, finish }) => [
        getTeamIdentityKey(team.teamId, team.teamName),
        finish,
      ])
    );

    context.readModels.teamStatistics.forEach((team) => {
      const accumulator = getOrCreateTeamAccumulator(accumulators, team);
      addTeamTournament(accumulator, team, context, finishesByTeam.get(accumulator.teamIdentityKey) ?? null);
    });
  });

  return [...accumulators.values()]
    .map((accumulator) => ({
      teamIdentityKey: accumulator.teamIdentityKey,
      teamId: accumulator.teamId,
      teamName: accumulator.teamName,
      tournamentsPlayed: accumulator.tournamentIds.size,
      teamScoringAverage: average(accumulator.teamScoringAverageTotal, accumulator.teamScoringAverageCount),
      countingScoreAverage: average(accumulator.countingScoreAverageTotal, accumulator.countingScoreAverageCount),
      fairwayPercentage: average(accumulator.fairwayPercentageTotal, accumulator.fairwayPercentageCount),
      girPercentage: average(accumulator.girPercentageTotal, accumulator.girPercentageCount),
      putts: accumulator.putts,
      averageFinish: average(
        accumulator.finishes.reduce((sum, finish) => sum + finish, 0),
        accumulator.finishes.length
      ),
      wins: accumulator.finishes.filter((finish) => finish === 1).length,
      top3: accumulator.finishes.filter((finish) => finish <= 3).length,
      top5: accumulator.finishes.filter((finish) => finish <= 5).length,
      tournamentTrend: accumulator.trend.sort((left, right) =>
        left.tournamentName.localeCompare(right.tournamentName)
      ),
    }))
    .sort((left, right) => left.teamName.localeCompare(right.teamName));
};

const buildSeasonSummary = (
  totalTournaments: number,
  contexts: TournamentContext[],
  lastUpdated: string
): SeasonSummaryReadModel => {
  const completedRounds = contexts.reduce(
    (sum, context) =>
      sum + context.roundReadModels.filter((readModels) =>
        readModels.playerStatistics.some((player) => player.roundsPlayed > 0)
      ).length,
    0
  );
  const completenessValues = contexts
    .map((context) => context.readModels.tournamentStatistics.completeness.completionPercentage)
    .filter((value): value is number => value !== null);

  return {
    totalTournaments,
    completedTournaments: contexts.length,
    completedRounds,
    statisticsCompleteness: average(
      completenessValues.reduce((sum, value) => sum + value, 0),
      completenessValues.length
    ),
    lastUpdated,
  };
};

const buildPlayerLeaderboard = (
  players: PlayerSeasonStatisticsReadModel[],
  getValue: (player: PlayerSeasonStatisticsReadModel) => number | null,
  direction: "asc" | "desc",
  formatValue: (value: number) => string = formatLeaderboardNumber
): SeasonLeaderboardEntryReadModel[] =>
  players
    .map((player) => ({
      player,
      value: getValue(player),
    }))
    .filter((entry): entry is { player: PlayerSeasonStatisticsReadModel; value: number } => entry.value !== null)
    .sort((left, right) => {
      const valueComparison = direction === "asc" ? left.value - right.value : right.value - left.value;
      return valueComparison || left.player.playerName.localeCompare(right.player.playerName);
    })
    .slice(0, 5)
    .map(({ player, value }) => ({
      id: player.playerIdentityKey,
      name: player.playerName,
      secondaryLabel: player.teamName,
      value,
      displayValue: formatValue(value),
    }));

const buildSeasonLeaderboards = (
  players: PlayerSeasonStatisticsReadModel[]
): SeasonLeaderboardsReadModel => ({
  lowestScoringAverage: buildPlayerLeaderboard(players, (player) => player.scoringAverage, "asc"),
  bestFairwayPercentage: buildPlayerLeaderboard(
    players,
    (player) => player.fairwayPercentage,
    "desc",
    (value) => formatLeaderboardNumber(value, "%")
  ),
  bestGirPercentage: buildPlayerLeaderboard(
    players,
    (player) => player.girPercentage,
    "desc",
    (value) => formatLeaderboardNumber(value, "%")
  ),
  fewestPutts: buildPlayerLeaderboard(players, (player) => player.puttsPerRound, "asc"),
  mostBirdies: buildPlayerLeaderboard(players, (player) => player.birdies, "desc", (value) =>
    formatLeaderboardNumber(value)
  ),
  bestAverageFinish: buildPlayerLeaderboard(players, (player) => player.averageFinish, "asc"),
});

export const buildSeasonStatisticsReadModels = ({
  tournaments,
  seasonId = null,
  seasonName = null,
  totalTournaments = tournaments.length,
  generatedAt = new Date().toISOString(),
}: BuildSeasonStatisticsReadModelsInput): SeasonStatisticsReadModels => {
  const contexts = buildTournamentContexts(tournaments, generatedAt);
  const playerStatistics = buildPlayerSeasonStatistics(contexts);

  return {
    seasonId,
    seasonName,
    generatedAt,
    playerStatistics,
    teamStatistics: buildTeamSeasonStatistics(contexts),
    leaderboards: buildSeasonLeaderboards(playerStatistics),
    seasonSummary: buildSeasonSummary(totalTournaments, contexts, generatedAt),
    tournamentStatistics: contexts.map((context) => context.readModels),
  };
};

export const loadSeasonStatisticsReadModels = async ({
  aggregates,
  seasonId = null,
  seasonName = null,
}: LoadSeasonStatisticsReadModelsInput = {}): Promise<SeasonStatisticsReadModels> => {
  const tournamentAggregates = aggregates ?? await loadSharedTournamentAggregates();
  const finalizedAggregates = tournamentAggregates.filter(isFinalizedTournament);
  const tournamentSources = await Promise.all(
    finalizedAggregates.map(async (aggregate) => ({
      aggregate,
      entries: await loadTournamentHoleStatistics({
        tournamentId: aggregate.sharedTournamentId || aggregate.tournamentId,
      }),
    }))
  );

  return buildSeasonStatisticsReadModels({
    tournaments: tournamentSources,
    seasonId,
    seasonName,
    totalTournaments: tournamentAggregates.length,
  });
};
