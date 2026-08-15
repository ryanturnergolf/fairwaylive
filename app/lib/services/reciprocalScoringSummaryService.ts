export type ForwardScoringHole = {
  holeNumber: number;
  par: number;
  selfScore: number;
  markedPlayerScore: number;
};

export type ForwardScoringSummary = {
  holes: ForwardScoringHole[];
  selfTotal: number;
  markedPlayerTotal: number;
  selfToPar: number | null;
  markedPlayerToPar: number | null;
  selfComplete: boolean;
  markedPlayerComplete: boolean;
};

const normalizeScore = (value: number | undefined) => {
  const score = Number(value);
  return Number.isFinite(score) && score > 0 ? score : 0;
};

export const buildForwardScoringSummary = ({
  holes,
  selfScores,
  markedPlayerScores,
}: {
  holes: Array<{ holeNumber: number; par: number }>;
  selfScores: number[];
  markedPlayerScores: number[];
}): ForwardScoringSummary => {
  const projectedHoles = holes.map((hole, index) => ({
    holeNumber: hole.holeNumber,
    par: hole.par,
    selfScore: normalizeScore(selfScores[index]),
    markedPlayerScore: normalizeScore(markedPlayerScores[index]),
  }));
  const selfComplete = projectedHoles.length > 0 && projectedHoles.every((hole) => hole.selfScore > 0);
  const markedPlayerComplete =
    projectedHoles.length > 0 && projectedHoles.every((hole) => hole.markedPlayerScore > 0);
  const par = projectedHoles.reduce((sum, hole) => sum + hole.par, 0);
  const selfTotal = projectedHoles.reduce((sum, hole) => sum + hole.selfScore, 0);
  const markedPlayerTotal = projectedHoles.reduce((sum, hole) => sum + hole.markedPlayerScore, 0);

  return {
    holes: projectedHoles,
    selfTotal,
    markedPlayerTotal,
    selfToPar: selfComplete ? selfTotal - par : null,
    markedPlayerToPar: markedPlayerComplete ? markedPlayerTotal - par : null,
    selfComplete,
    markedPlayerComplete,
  };
};
