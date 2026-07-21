export type ResumeHole = {
  holeNumber: number;
  par: number;
};

export type ResumeHoleStatistics = {
  fairwayHit: boolean | null;
  greenInRegulation: boolean | null;
  putts: number | null;
};

export const findInitialScorecardHoleIndex = ({
  holes,
  selfScores,
  markedPlayerScores,
  statistics,
}: {
  holes: ResumeHole[];
  selfScores: number[];
  markedPlayerScores: number[];
  statistics: ResumeHoleStatistics[];
}) =>
  holes.findIndex((hole, index) => {
    const holeStatistics = statistics[index];
    return (
      Number(selfScores[index]) <= 0 ||
      Number(markedPlayerScores[index]) <= 0 ||
      holeStatistics?.greenInRegulation === null ||
      holeStatistics?.greenInRegulation === undefined ||
      holeStatistics?.putts === null ||
      holeStatistics?.putts === undefined ||
      (hole.par !== 3 &&
        (holeStatistics?.fairwayHit === null || holeStatistics?.fairwayHit === undefined))
    );
  });
