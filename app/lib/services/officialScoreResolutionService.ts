import type { ScoreHoleEntryRow } from "../repositories/statisticsRepository";

export type OfficialScoreResolution = {
  playerId: string;
  holeNumber: number;
  score: number;
  resolvedAt: string | null;
  source: ScoreHoleEntryRow;
};

const isOfficialEntry = (entry: ScoreHoleEntryRow) =>
  entry.is_official || String(entry.review_status).toLowerCase().startsWith("official");

const getResolutionTimestamp = (entry: ScoreHoleEntryRow) =>
  Date.parse(entry.official_at ?? entry.updated_at ?? entry.created_at ?? "") || 0;

export const buildOfficialScoreResolutionMap = (entries: ScoreHoleEntryRow[]) => {
  const resolutions = new Map<string, OfficialScoreResolution>();

  entries.filter(isOfficialEntry).forEach((entry) => {
    const playerId = String(entry.player_id);
    const holeNumber = Number(entry.hole_number);
    const score = Number(entry.strokes);
    if (!playerId || holeNumber <= 0 || score <= 0) {
      return;
    }

    const key = `${playerId}:${holeNumber}`;
    const existing = resolutions.get(key);
    if (existing && getResolutionTimestamp(existing.source) > getResolutionTimestamp(entry)) {
      return;
    }

    resolutions.set(key, {
      playerId,
      holeNumber,
      score,
      resolvedAt: entry.official_at ?? entry.updated_at ?? entry.created_at,
      source: entry,
    });
  });

  return resolutions;
};

export const applyOfficialScoreResolutions = (
  scores: number[],
  playerId: string,
  holeCount: number,
  resolutions: Map<string, OfficialScoreResolution>
) =>
  Array.from({ length: holeCount }, (_, index) => {
    const official = resolutions.get(`${playerId}:${index + 1}`);
    return official?.score ?? (Number(scores[index]) || 0);
  });

export const resolveOfficialScoreComparison = ({
  playerId,
  selfScores,
  markerScores,
  holeCount,
  officialEntries,
}: {
  playerId: string;
  selfScores: number[];
  markerScores: number[];
  holeCount: number;
  officialEntries: ScoreHoleEntryRow[];
}) => {
  const resolutions = buildOfficialScoreResolutionMap(officialEntries);
  return {
    selfScores: applyOfficialScoreResolutions(selfScores, playerId, holeCount, resolutions),
    markerScores: applyOfficialScoreResolutions(markerScores, playerId, holeCount, resolutions),
  };
};
