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

export type SaveHoleStatisticsInput = SaveScoreHoleEntryInput;

export type SaveRoundHoleStatisticsInput = Omit<
  SaveScoreHoleEntryInput,
  "holeNumber" | "strokes" | "entrySource" | "markerForPlayerId"
> & {
  holeScores: number[];
  markerForPlayerId?: string | null;
};

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
  entryStatus,
}: {
  tournamentId: string;
  roundNumber: number;
  playerId: string;
  enteredByPlayerId: string;
  markerForPlayerId?: string | null;
  holeNumber: number;
  strokes: number;
  entryStatus: string;
}): SaveHoleStatisticsInput => ({
  tournamentId,
  roundNumber,
  playerId,
  enteredByPlayerId,
  markerForPlayerId: getMarkerForPlayerId(playerId, enteredByPlayerId, markerForPlayerId),
  holeNumber,
  strokes,
  fairwayHit: null,
  greenInRegulation: null,
  putts: null,
  penaltyStrokes: null,
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
