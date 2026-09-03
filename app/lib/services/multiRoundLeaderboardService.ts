import type { Tournament } from "../tournamentModel";
import { formatScoreToPar } from "./tournamentDerivedState";
import { orderConfiguredRounds, roundDisplayLabel } from "./roundDomainService";
import type { GolfScorecardHole } from "../../components/leaderboards/GolfScorecardGrid";
import type { ScoreEntryRow } from "../repositories/scoreRepository";
import type { ScoreHoleEntryRow } from "../repositories/statisticsRepository";
import { selectQualifyingCompetitionScore } from "./qualifyingCompetitionScoreService";

export type RoundLeaderboardSummary = {
  roundId: string;
  roundNumber: number;
  total: number | null;
  toPar: string;
  through: string;
  holes: GolfScorecardHole[];
};

export type MultiRoundPlayerLeaderboardRow = {
  id: string;
  position: string;
  playerName: string;
  teamId: string;
  teamName: string;
  overallTotal: number | null;
  overallToPar: string;
  overallToParValue: number | null;
  rounds: Record<string, RoundLeaderboardSummary>;
};

export type MultiRoundTeamLeaderboardRow = {
  id: string;
  position: string;
  teamName: string;
  overallTotal: number | null;
  overallToPar: string;
  overallToParValue: number | null;
  rounds: Record<string, RoundLeaderboardSummary>;
  players: MultiRoundPlayerLeaderboardRow[];
};

export type MultiRoundTournamentLeaderboardProjection = {
  rounds: Array<{ id: string; roundNumber: number; label: string }>;
  operationalCurrentRoundId: string;
  players: MultiRoundPlayerLeaderboardRow[];
  teams: MultiRoundTeamLeaderboardRow[];
};

type RoundConfiguration = { holeNumbers?: number[]; pars?: Array<number | null>; countingScores?: number };

const rank = <T,>(rows: T[], score: (row: T) => number | null) => {
  const ranked = rows.filter((row) => score(row) !== null).sort((a, b) => Number(score(a)) - Number(score(b)));
  const first = new Map<number, number>();
  const counts = new Map<number, number>();
  ranked.forEach((row, index) => {
    const value = Number(score(row));
    if (!first.has(value)) first.set(value, index + 1);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return new Map(ranked.map((row) => {
    const value = Number(score(row));
    const ordinal = first.get(value) ?? 0;
    return [row, (counts.get(value) ?? 0) > 1 ? `T${ordinal}` : String(ordinal)];
  }));
};

const scoreForPlayerRound = (
  tournament: Tournament,
  playerId: string,
  roundId: string,
  roundNumber: number,
  durableScoreEntries: ScoreEntryRow[],
  officialEntries: ScoreHoleEntryRow[],
  scoringMode: "reciprocal" | "designated_scorer"
) => {
  const durableRows = durableScoreEntries.filter(
    (score) => String(score.player_id) === playerId && Number(score.round_number) === roundNumber
  );
  const selected = selectQualifyingCompetitionScore({
    playerId,
    scoringMode,
    scoreEntries: durableRows,
    officialEntries: officialEntries.filter((entry) => Number(entry.round_number) === roundNumber),
    holeCount: Math.max(...durableRows.map((entry) => entry.hole_scores.length), 0),
  });
  if (selected) return { holeScores: selected.holeScores };
  const rows = tournament.scores.filter((score) => score.playerId === playerId && score.roundId === roundId);
  return rows.find((score) => score.enteredBy === "marker") ?? rows.find((score) => score.enteredBy === "self") ?? null;
};

const buildRoundSummary = (
  roundId: string,
  roundNumber: number,
  scores: number[],
  configuration: RoundConfiguration = {}
): RoundLeaderboardSummary => {
  const holeCount = Math.max(configuration.holeNumbers?.length ?? 0, configuration.pars?.length ?? 0, scores.length);
  const holes = Array.from({ length: holeCount }, (_, index) => ({
    holeNumber: configuration.holeNumbers?.[index] ?? index + 1,
    par: configuration.pars?.[index] ?? null,
    score: Number(scores[index]) > 0 ? Number(scores[index]) : null,
  }));
  const played = holes.filter((hole) => hole.score !== null);
  const total = played.length > 0 ? played.reduce((sum, hole) => sum + Number(hole.score), 0) : null;
  const playedPars = played.map((hole) => hole.par);
  const toPar = total !== null && playedPars.every((par) => par !== null)
    ? formatScoreToPar(total - playedPars.reduce<number>((sum, par) => sum + Number(par), 0))
    : "—";
  return {
    roundId,
    roundNumber,
    total,
    toPar,
    through: played.length === 0 ? "Not started" : played.length === holes.length ? "F" : `${played.length}/${holes.length}`,
    holes,
  };
};

export const buildMultiRoundTournamentLeaderboard = ({
  tournament,
  roundConfigurationById = {},
  operationalCurrentRoundId,
  durableScoreEntries = [],
  officialEntries = [],
  scoringMode = "reciprocal",
}: {
  tournament: Tournament;
  roundConfigurationById?: Record<string, RoundConfiguration>;
  operationalCurrentRoundId?: string | null;
  durableScoreEntries?: ScoreEntryRow[];
  officialEntries?: ScoreHoleEntryRow[];
  scoringMode?: "reciprocal" | "designated_scorer";
}): MultiRoundTournamentLeaderboardProjection => {
  const rounds = orderConfiguredRounds(tournament.rounds).map((round) => ({
    id: round.id,
    roundNumber: round.roundNumber,
    label: roundDisplayLabel(round.roundNumber),
  }));
  const teamById = new Map(tournament.teams.map((team) => [team.id, team]));
  const players = tournament.players.map((player): MultiRoundPlayerLeaderboardRow => {
    const summaries = Object.fromEntries(rounds.map((round) => {
      const score = scoreForPlayerRound(
        tournament,
        player.id,
        round.id,
        round.roundNumber,
        durableScoreEntries,
        officialEntries,
        scoringMode
      );
      return [round.id, buildRoundSummary(round.id, round.roundNumber, score?.holeScores ?? [], roundConfigurationById[round.id])];
    }));
    const started = Object.values(summaries).filter((summary) => summary.total !== null);
    const overallTotal = started.length > 0 ? started.reduce((sum, summary) => sum + Number(summary.total), 0) : null;
    const parKnown = started.length > 0 && started.every((summary) => summary.holes.filter((hole) => hole.score !== null).every((hole) => hole.par !== null));
    const overallPar = parKnown ? started.reduce((sum, summary) => sum + summary.holes.filter((hole) => hole.score !== null).reduce((roundSum, hole) => roundSum + Number(hole.par), 0), 0) : null;
    const team = teamById.get(player.teamId);
    const overallToParValue = overallTotal !== null && overallPar !== null ? overallTotal - overallPar : null;
    return {
      id: player.id,
      position: "—",
      playerName: `${player.firstName} ${player.lastName}`.trim(),
      teamId: player.teamId,
      teamName: team?.name ?? "Individual",
      overallTotal,
      overallToPar: overallToParValue !== null ? formatScoreToPar(overallToParValue) : "—",
      overallToParValue,
      rounds: summaries,
    };
  });
  const playerPositions = rank(players, (player) => player.overallToParValue ?? player.overallTotal);
  players.forEach((player) => { player.position = playerPositions.get(player) ?? "—"; });

  const teams = tournament.teams.map((team): MultiRoundTeamLeaderboardRow => {
    const teamPlayers = players.filter((player) => player.teamId === team.id);
    const summaries = Object.fromEntries(rounds.map((round) => {
      const complete = teamPlayers.map((player) => player.rounds[round.id]).filter((summary) => summary.through === "F" && summary.total !== null);
      const count = Math.max(1, roundConfigurationById[round.id]?.countingScores ?? 4);
      const counted = complete.sort((a, b) => Number(a.total) - Number(b.total)).slice(0, count);
      if (counted.length < Math.min(count, teamPlayers.length)) return [round.id, buildRoundSummary(round.id, round.roundNumber, [], roundConfigurationById[round.id])];
      const total = counted.reduce((sum, summary) => sum + Number(summary.total), 0);
      const parKnown = counted.every((summary) => summary.holes.every((hole) => hole.par !== null));
      const par = parKnown ? counted.reduce((sum, summary) => sum + summary.holes.reduce((holeSum, hole) => holeSum + Number(hole.par), 0), 0) : null;
      return [round.id, { ...buildRoundSummary(round.id, round.roundNumber, [], roundConfigurationById[round.id]), total, toPar: par === null ? "—" : formatScoreToPar(total - par), through: "F" }];
    }));
    const started = Object.values(summaries).filter((summary) => summary.total !== null);
    const overallTotal = started.length > 0 ? started.reduce((sum, summary) => sum + Number(summary.total), 0) : null;
    const toParValues = started.map((summary) => summary.toPar === "E" ? 0 : /^[-+]\d+$/.test(summary.toPar) ? Number(summary.toPar) : null);
    const overallToParValue = toParValues.length === started.length && toParValues.every((value) => value !== null)
      ? toParValues.reduce<number>((sum, value) => sum + Number(value), 0)
      : null;
    return { id: team.id, position: "—", teamName: team.name, overallTotal, overallToPar: overallToParValue === null ? "—" : formatScoreToPar(overallToParValue), overallToParValue, rounds: summaries, players: teamPlayers };
  });
  const teamPositions = rank(teams, (team) => team.overallToParValue ?? team.overallTotal);
  teams.forEach((team) => { team.position = teamPositions.get(team) ?? "—"; });
  return {
    rounds,
    operationalCurrentRoundId: rounds.some((round) => round.id === operationalCurrentRoundId) ? String(operationalCurrentRoundId) : rounds[0]?.id ?? "",
    players,
    teams,
  };
};
