import type { QualifyingDay } from "../qualifyingModel";
import {
  buildQualifyingRoundPlan,
  type PlannedQualifyingRound,
} from "./qualifyingScheduleService";

export type TournamentRoundProvisioningInput = Pick<
  QualifyingDay,
  "dayNumber" | "holesTotal"
>;

export const planTournamentRounds = (
  days: TournamentRoundProvisioningInput[]
): PlannedQualifyingRound[] => buildQualifyingRoundPlan(days);
