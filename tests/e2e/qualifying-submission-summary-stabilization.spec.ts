import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMissingRequiredMobileStatistics,
  type MobileStatisticItem,
} from "../../app/lib/services/mobileDynamicStatisticsService";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const requiredItem = (key: string, name: string): MobileStatisticItem => ({
  definitionVersionId: `version-${key}`,
  key,
  name,
  description: null,
  inputType: "bounded_number",
  configuration: { minimum: 0, maximum: 10 },
  applicability: {},
  displayOrder: 0,
  isRequired: true,
});

test("Qualifying creation pins required or optional immutable package items without changing legacy callers", () => {
  const migration = source("supabase/migrations/20260813000000_stabilize_qualifying_submission_summary.sql").toLowerCase();
  expect(migration).toContain("input_statistics_required boolean default false");
  expect(migration).toContain("item.is_required = required_state");
  expect(migration).toContain("selected.item_order - 1, required_state");
  expect(migration).toContain("input_statistic_definition_version_ids,\n    false");
  expect(migration).not.toContain("update public.statistic_package_version_items");
  expect(migration).not.toContain("update public.statistic_package_versions");

  const route = source("app/api/qualifying-sessions/route.ts");
  const wizard = source("app/coach-dashboard/qualifying-manager/new/page.tsx");
  expect(route).toContain("input_statistics_required");
  expect(wizard).toContain("Require all selected statistics before round submission");
  expect(wizard).toContain("useState(false)");
});

test("missing required statistics preserve exact package identity and authoritative back-nine labels", () => {
  const items = [requiredItem("putts", "Putts"), requiredItem("shots_100_and_in", "Shots from 100 Yards and In")];
  const missing = buildMissingRequiredMobileStatistics(
    items,
    [
      { holeNumber: 1, courseHoleNumber: 10, par: 4 },
      { holeNumber: 2, courseHoleNumber: 11, par: 5 },
    ],
    [{ putts: null, shots_100_and_in: null }, { putts: 2, shots_100_and_in: 3 }]
  );
  expect(missing).toEqual([
    expect.objectContaining({ roundPosition: 1, courseHoleNumber: 10, definitionVersionId: "version-putts", name: "Putts" }),
    expect.objectContaining({ roundPosition: 1, courseHoleNumber: 10, definitionVersionId: "version-shots_100_and_in", name: "Shots from 100 Yards and In" }),
  ]);
});

test("optional package items never create missing submission requirements", () => {
  const optional = { ...requiredItem("putts", "Putts"), isRequired: false };
  expect(buildMissingRequiredMobileStatistics(
    [optional],
    [{ holeNumber: 1, courseHoleNumber: 12, par: 4 }],
    [{ putts: null }]
  )).toEqual([]);
});

test("scorecard verification uses one marker-for-self projection and removes statistics opt-out messaging", () => {
  const scorecard = source("app/scorecard/[playerId]/page.tsx");
  const markerSummary = scorecard.slice(
    scorecard.indexOf("const reviewMarkerTotals"),
    scorecard.indexOf("const isQrScorecardRequest")
  );
  expect(markerSummary).toContain("reciprocalVerification.markerTotal");
  expect(markerSummary).not.toContain("markerScores.reduce((sum, score) => sum + score, 0)");
  expect(scorecard).toContain("buildReciprocalVerificationProjection");
  expect(scorecard).toContain("Statistics still needed");
  expect(scorecard).toContain("All required statistics are complete.");
  expect(scorecard.toLowerCase()).not.toContain("statistics opt-out");
  expect(scorecard).not.toContain("Continue and finalize round without recording statistics");
});

test("Qualifying team standings are presentation-only suppressed while individual program labels remain", () => {
  const publicLeaderboard = source("app/leaderboard/page.tsx");
  const workspaceLeaderboard = source("app/tournament/[id]/components/LiveScoringLeaderboard.tsx");
  expect(publicLeaderboard).toContain("!model.isQualifying && model.teamLeaderboard.length > 0");
  expect(publicLeaderboard).toContain("row.team");
  expect(workspaceLeaderboard).toContain("!isQualifyingTournament ?");
  expect(workspaceLeaderboard).toContain("player.team");
  expect(workspaceLeaderboard).toContain("buildTeamLeaderboard");
});
