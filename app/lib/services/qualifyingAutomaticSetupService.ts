import type { QualifyingScoringMode } from "../qualifyingModel";
import { activateQualifyingSession } from "./qualifyingActivationService";
import { provisionQualifyingSession } from "./qualifyingProvisioningService";

export const completeAutomaticQualifyingSetup = async (
  qualifyingSessionId: string,
  scoringMode: QualifyingScoringMode
) => {
  const provisioned = await provisionQualifyingSession(qualifyingSessionId);
  if (scoringMode === "designated_scorer") {
    return { tournamentId: provisioned.tournamentId, status: provisioned.status };
  }
  const activated = await activateQualifyingSession(qualifyingSessionId);
  return { tournamentId: activated.tournamentId, status: activated.status };
};
