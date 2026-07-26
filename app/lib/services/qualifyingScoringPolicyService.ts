import type {
  QualifyingGroup,
  QualifyingRoundMapping,
  QualifyingScorerAssignment,
} from "../qualifyingModel";

export type DesignatedScorerPolicy = {
  mode: "designated_scorer";
  roundId: string;
  roundNumber: number;
  groupNumber: number;
  scorerPlayerId: string;
  groupPlayerIds: string[];
};

export const buildDesignatedScorerPolicies = ({
  groups,
  rounds,
  assignments,
}: {
  groups: QualifyingGroup[];
  rounds: QualifyingRoundMapping[];
  assignments: QualifyingScorerAssignment[];
}): DesignatedScorerPolicy[] => {
  const policies = rounds.flatMap((round) =>
    groups.map((group, index) => {
      const groupNumber = index + 1;
      const assignment = assignments.find(
        (candidate) =>
          candidate.tournamentRoundId === round.id &&
          candidate.groupNumber === groupNumber
      );
      if (!assignment) {
        throw new Error(`Round ${round.roundNumber}, Group ${groupNumber} needs a designated scorer.`);
      }
      if (!group.playerIds.includes(assignment.scorerPlayerId)) {
        throw new Error(`The designated scorer for Group ${groupNumber} must belong to that group.`);
      }
      return {
        mode: "designated_scorer" as const,
        roundId: round.id,
        roundNumber: round.roundNumber,
        groupNumber,
        scorerPlayerId: assignment.scorerPlayerId,
        groupPlayerIds: [...group.playerIds],
      };
    })
  );
  const keys = new Set(policies.map((policy) => `${policy.roundId}:${policy.groupNumber}`));
  if (keys.size !== policies.length) throw new Error("Duplicate designated scorer assignments are not allowed.");
  return policies;
};

export const canChangeDesignatedAssignments = ({
  status,
  scoreRowCount,
}: {
  status: string;
  scoreRowCount: number;
}) => ["provisioned"].includes(status) && scoreRowCount === 0;

export const buildDesignatedScoreIdentity = (
  golferPlayerId: string,
  scorerPlayerId: string
) => ({
  playerId: golferPlayerId,
  enteredByPlayerId: scorerPlayerId,
});

export const buildPersonalStatisticsIdentity = (playerId: string) => ({
  playerId,
  enteredByPlayerId: playerId,
});

type PolicyScore = {
  round_number: number;
  player_id: string | number;
  entered_by_player_id: string | number;
  hole_scores: number[];
  entry_status: string;
};
type PolicyReview = {
  round_number: number;
  player_id: string | number;
  self_review_complete: boolean;
  marker_review_complete: boolean;
};

export const resolveQualifyingPolicyReadiness = ({
  mode,
  expectedCount,
  scoreEntries,
  reviews,
  designatedScorerByPlayerRound = new Map(),
  unresolvedDiscrepancies,
}: {
  mode: "reciprocal" | "designated_scorer";
  expectedCount: number;
  scoreEntries: PolicyScore[];
  reviews: PolicyReview[];
  designatedScorerByPlayerRound?: Map<string, string>;
  unresolvedDiscrepancies: number;
}) => {
  const submitted = (entry: PolicyScore | undefined) =>
    Boolean(entry && ["submitted", "verified", "official"].includes(entry.entry_status));
  const submittedSegments = mode === "reciprocal"
    ? scoreEntries.filter((entry) =>
        String(entry.player_id) === String(entry.entered_by_player_id) && submitted(entry)
      ).length
    : [...designatedScorerByPlayerRound.entries()].filter(([key, scorerId]) => {
        const [roundNumber, playerId] = key.split(":");
        const row = scoreEntries.find((entry) =>
          entry.round_number === Number(roundNumber) &&
          String(entry.player_id) === playerId &&
          String(entry.entered_by_player_id) === scorerId
        );
        return submitted(row) && row!.hole_scores.length > 0 && row!.hole_scores.every((score) => score > 0);
      }).length;
  const completedReviews = reviews.filter((review) =>
    mode === "designated_scorer"
      ? review.self_review_complete
      : review.self_review_complete && review.marker_review_complete
  ).length;
  return {
    submittedSegments,
    completedReviews,
    ready: expectedCount > 0 &&
      designatedScorerByPlayerRound.size === (mode === "designated_scorer" ? expectedCount : 0) &&
      submittedSegments === expectedCount &&
      completedReviews === expectedCount &&
      unresolvedDiscrepancies === 0,
  };
};
