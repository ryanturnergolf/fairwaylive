import type { LegacyPairingGroup, LegacyRoundSetupState, LegacyScorecardRow } from "../tournamentModel";

export type NormalizedRoundSetup = {
  roundNumber: number;
  numberOfHoles: number;
  countingScores: number;
  startingHole: number;
  teeIntervalMinutes: number;
  defaultGroupSize: number;
  teeTime: string;
};

export type IndividualLeaderboardRow = {
  position: string;
  id: number;
  playerName: string;
  team: string;
  totalScore: number;
  toPar: string;
  through: string;
  today: string;
};

export type TeamLeaderboardRow = {
  position: string;
  teamName: string;
  totalScore: number;
  toPar: string;
  through: string;
  today: string;
};

export const normalizeTournamentRoundSetup = (
  roundSetup: LegacyRoundSetupState | null | undefined,
  defaultRoundSetup: LegacyRoundSetupState
): NormalizedRoundSetup => ({
  roundNumber: Math.max(1, Number(roundSetup?.roundNumber) || 1),
  numberOfHoles: Math.max(1, Math.min(18, Number(roundSetup?.numberOfHoles) || 18)),
  countingScores: Math.max(1, Math.min(6, Number(roundSetup?.countingScores) || 4)),
  startingHole: Math.max(1, Number(roundSetup?.startingHole) || 1),
  teeIntervalMinutes: Math.max(1, Number((roundSetup as Partial<Record<string, unknown>> | null)?.teeIntervalMinutes) || 10),
  defaultGroupSize: Math.max(1, Number((roundSetup as Partial<Record<string, unknown>> | null)?.defaultGroupSize) || 4),
  teeTime: roundSetup?.teeTime || defaultRoundSetup.teeTime,
});

export const calculateTotal = (scores: number[]) =>
  scores.reduce((total, score) => total + (Number.isFinite(score) ? score : 0), 0);

export const calculatePlayedTotal = (scores: number[]) =>
  scores.reduce((total, score) => total + (score > 0 ? score : 0), 0);

export const calculatePlayedHoles = (scores: number[]) =>
  scores.reduce((count, score) => count + (score > 0 ? 1 : 0), 0);

export const formatScoreToPar = (difference: number) => {
  if (difference === 0) {
    return "E";
  }
  return difference > 0 ? `+${difference}` : `${difference}`;
};

export const formatTotalToPar = (total: number, par = 72) => formatScoreToPar(total - par);

export const addTiePositions = <T,>(rows: T[], getScore: (row: T) => number) => {
  const scoreCounts = rows.reduce((map, row) => {
    const score = getScore(row);
    map.set(score, (map.get(score) ?? 0) + 1);
    return map;
  }, new Map<number, number>());

  return rows.map((row, index) => {
    const score = getScore(row);
    const ordinal = index + 1;
    const position = (scoreCounts.get(score) ?? 0) > 1 ? `T${ordinal}` : `${ordinal}`;

    return {
      ...row,
      position,
    };
  });
};

export const buildIndividualLeaderboard = ({
  scorecardsGenerated,
  scorecardRows,
  displayHoleCount,
}: {
  scorecardsGenerated: boolean;
  scorecardRows: LegacyScorecardRow[];
  displayHoleCount: number;
}): IndividualLeaderboardRow[] => {
  if (!scorecardsGenerated || scorecardRows.length === 0) {
    return [];
  }

  const standings = [...scorecardRows]
    .map((row) => {
      const playedHoles = calculatePlayedHoles(row.scores);
      const totalScore = calculatePlayedTotal(row.scores);
      const activePar = playedHoles * 4;
      const toPar = playedHoles > 0 ? formatScoreToPar(totalScore - activePar) : "--";
      const through = playedHoles >= displayHoleCount ? "F" : `${playedHoles}/${displayHoleCount}`;

      return {
        id: row.id,
        playerName: row.playerName,
        team: row.team,
        totalScore,
        toPar,
        through,
        today: toPar,
      };
    })
    .sort((a, b) => a.totalScore - b.totalScore || a.playerName.localeCompare(b.playerName));

  return addTiePositions(standings, (row) => row.totalScore);
};

export const buildTeamLeaderboard = ({
  scorecardsGenerated,
  scorecardRows,
  displayHoleCount,
  countingScores,
}: {
  scorecardsGenerated: boolean;
  scorecardRows: LegacyScorecardRow[];
  displayHoleCount: number;
  countingScores: number;
}): TeamLeaderboardRow[] => {
  if (!scorecardsGenerated || scorecardRows.length === 0) {
    return [];
  }

  const fullRoundPar = displayHoleCount * 4;
  const grouped = new Map<string, LegacyScorecardRow[]>();

  scorecardRows.forEach((row) => {
    const current = grouped.get(row.team) ?? [];
    current.push(row);
    grouped.set(row.team, current);
  });

  const standings = Array.from(grouped.entries())
    .map(([team, rows]) => {
      const completedRows = rows
        .map((row) => {
          const playedHoles = calculatePlayedHoles(row.scores);
          return {
            ...row,
            playedHoles,
            totalScore: calculatePlayedTotal(row.scores),
          };
        })
        .filter((row) => row.playedHoles >= displayHoleCount)
        .sort((a, b) => a.totalScore - b.totalScore || a.playerName.localeCompare(b.playerName));

      if (completedRows.length < countingScores) {
        return null;
      }

      const countedPlayers = completedRows.slice(0, countingScores);
      const totalScore = countedPlayers.reduce((total, row) => total + row.totalScore, 0);
      const toPar = formatScoreToPar(totalScore - fullRoundPar * countingScores);

      return {
        teamName: team,
        totalScore,
        toPar,
        through: "F",
        today: toPar,
      };
    })
    .filter((team): team is Omit<TeamLeaderboardRow, "position"> => Boolean(team))
    .sort((a, b) => a.totalScore - b.totalScore || a.teamName.localeCompare(b.teamName));

  return addTiePositions(standings, (row) => row.totalScore);
};

export const buildPrintablePairings = ({
  pairings,
  scorecardRows,
  normalizedRoundSetup,
}: {
  pairings: LegacyPairingGroup[];
  scorecardRows: LegacyScorecardRow[];
  normalizedRoundSetup: Pick<NormalizedRoundSetup, "defaultGroupSize" | "startingHole" | "teeTime">;
}): LegacyPairingGroup[] => {
  if (pairings.length > 0) {
    return pairings;
  }

  if (scorecardRows.length === 0) {
    return [];
  }

  const fallbackRows = [...scorecardRows].sort((a, b) => a.playerName.localeCompare(b.playerName));
  const generatedPairings: LegacyPairingGroup[] = [];

  for (let index = 0; index < fallbackRows.length; index += 4) {
    generatedPairings.push({
      groupNumber: generatedPairings.length + 1,
      teeTime: normalizedRoundSetup.teeTime || "--",
      startingHole: String(normalizedRoundSetup.startingHole),
      players: fallbackRows.slice(index, index + normalizedRoundSetup.defaultGroupSize).map((row, rowIndex) => ({
        playerId: row.id != null ? String(row.id) : `fallback-${row.playerName}-${rowIndex}`,
        playerName: row.playerName,
        teamName: row.team,
      })),
    });
  }

  return generatedPairings;
};
