import {
  getScoreEntriesForTournament,
  getScoreEntry,
  saveScoreEntry,
  updateReviewStatus,
  type GetScoreEntriesForTournamentInput,
  type GetScoreEntryInput,
  type SaveScoreEntryInput,
  type ScoreEntryRow,
  type ScoreReviewStatusRow,
  type UpdateReviewStatusInput,
} from "../repositories/scoreRepository";

export type SaveHoleInput = SaveScoreEntryInput;
export type SaveRoundInput = SaveScoreEntryInput;
export type LoadPlayerScoresInput = GetScoreEntryInput;
export type LoadComparisonScoresInput = GetScoreEntriesForTournamentInput;
export type CompleteReviewInput = UpdateReviewStatusInput;

export const saveHole = async (input: SaveHoleInput): Promise<ScoreEntryRow> => {
  return saveScoreEntry(input);
};

export const saveRound = async (input: SaveRoundInput): Promise<ScoreEntryRow> => {
  return saveScoreEntry(input);
};

export const loadPlayerScores = async (
  input: LoadPlayerScoresInput
): Promise<ScoreEntryRow | null> => {
  return getScoreEntry(input);
};

export const loadComparisonScores = async (
  input: LoadComparisonScoresInput
): Promise<ScoreEntryRow[]> => {
  return getScoreEntriesForTournament(input);
};

export const completeReview = async (
  input: CompleteReviewInput
): Promise<ScoreReviewStatusRow> => {
  return updateReviewStatus(input);
};
