import type { QualifyingSessionFoundation } from "../qualifyingModel";
import {
  getQualifyingSessionRow,
  listQualifyingDays,
  listQualifyingRoundMappings,
  listQualifyingScorerAssignments,
} from "../repositories/qualifyingRepository";

export const loadQualifyingSessionFoundation = async (
  sessionId: string
): Promise<QualifyingSessionFoundation | null> => {
  const session = await getQualifyingSessionRow(sessionId);
  if (!session) return null;

  const [days, rounds, scorerAssignments] = await Promise.all([
    listQualifyingDays(sessionId),
    listQualifyingRoundMappings(sessionId),
    session.scoringMode === "designated_scorer"
      ? listQualifyingScorerAssignments(sessionId)
      : Promise.resolve([]),
  ]);

  return {
    session,
    days,
    rounds,
    scorerAssignments,
  };
};
