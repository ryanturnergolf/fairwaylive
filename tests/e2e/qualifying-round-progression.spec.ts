import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { buildMultiRoundTournamentLeaderboard } from "../../app/lib/services/multiRoundLeaderboardService";
import { buildQualifyingRoundProgressionState } from "../../app/lib/services/qualifyingRoundProgressionService";
import type { Tournament } from "../../app/lib/tournamentModel";
import type { QualifyingResultsReadModel, QualifyingSessionFoundation } from "../../app/lib/qualifyingModel";
import { selectQualifyingCompetitionScore } from "../../app/lib/services/qualifyingCompetitionScoreService";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const tournament: Tournament = {
  id: "t", name: "Qualifying", course: "Club", settings: {},
  rounds: [{ id: "t-r1", name: "Round 1", roundNumber: 1, status: "complete", pairings: [], leaderboard: [] }, { id: "t-r2", name: "Round 2", roundNumber: 2, status: "upcoming", pairings: [], leaderboard: [] }],
  teams: [{ id: "team", name: "Bluffton", players: ["aj", "colin"] }],
  players: [{ id: "aj", firstName: "AJ", lastName: "Gerber", teamId: "team", isIndividual: false, statistics: {} }, { id: "colin", firstName: "Colin", lastName: "King", teamId: "team", isIndividual: false, statistics: {} }],
  pairings: [], scores: [{ playerId: "", roundId: "round-1", holeScores: [9], total: 9, status: "complete", enteredBy: "marker" }],
};
const durable = (player_id: string, scores: number[]) => ({ id: `${player_id}-self`, tournament_id: "t", round_number: 1, player_id, entered_by_player_id: player_id, hole_scores: scores, total: scores.reduce((sum, score) => sum + score, 0), entry_status: "submitted", submitted_at: "2026-09-01", created_at: null, updated_at: null });
const configuration = { "t-r1": { holeNumbers: [1,2,3,4,5,6,7,8,9], pars: [4,4,4,4,4,4,4,4,4] }, "t-r2": { holeNumbers: [1,2,3,4,5,6,7,8,9], pars: [4,4,4,4,4,4,4,4,4] } };

test("durable scores override incompatible legacy snapshot identities", () => {
  const model = buildMultiRoundTournamentLeaderboard({ tournament, roundConfigurationById: configuration, durableScoreEntries: [durable("aj", [5,5,5,5,5,5,5,5,4]), durable("colin", [4,4,4,4,4,4,4,4,5])] });
  expect(model.players.find((row) => row.id === "aj")?.rounds["t-r1"]).toMatchObject({ total: 44, toPar: "+8", through: "F" });
  expect(model.players.find((row) => row.id === "colin")?.rounds["t-r1"]).toMatchObject({ total: 37, toPar: "+1", through: "F" });
});

test("durable expanded cards preserve exact nine-hole values and future rounds remain unstarted", () => {
  const model = buildMultiRoundTournamentLeaderboard({ tournament, roundConfigurationById: configuration, durableScoreEntries: [durable("aj", [5,5,5,5,5,5,5,5,4])] });
  expect(model.players[0].rounds["t-r1"].holes.map((hole) => hole.score)).toEqual([5,5,5,5,5,5,5,5,4]);
  expect(model.players[0].rounds["t-r2"].through).toBe("Not started");
});

test("legacy snapshot remains a fallback only when durable authority is absent", () => {
  const legacy = { ...tournament, scores: [{ playerId: "aj", roundId: "t-r1", holeScores: [4,4,4,4,4,4,4,4,4], total: 36, status: "complete", enteredBy: "marker" as const }] };
  const model = buildMultiRoundTournamentLeaderboard({ tournament: legacy, roundConfigurationById: configuration });
  expect(model.players[0].rounds["t-r1"].total).toBe(36);
});

const foundation = { session: { id: "q", operationalCurrentQualifyingRoundId: "q-r1" }, configuredRounds: [{ qualifyingRoundId: "q-r1", tournamentRoundId: "t-r1", roundNumber: 1, displayLabel: "Round 1", qualifyingDay: 1, qualifyingSegment: 1 }, { qualifyingRoundId: "q-r2", tournamentRoundId: "t-r2", roundNumber: 2, displayLabel: "Round 2", qualifyingDay: 2, qualifyingSegment: 1 }] } as QualifyingSessionFoundation;
const results = { combined: [{ segments: [{ tournamentRoundId: "t-r1", completionStatus: "complete", submitted: true, reviewComplete: true }] }, { segments: [{ tournamentRoundId: "t-r1", completionStatus: "complete", submitted: true, reviewComplete: true }] }] } as QualifyingResultsReadModel;

test("coach progression readiness comes from canonical result segments", () => {
  expect(buildQualifyingRoundProgressionState(foundation, results)).toMatchObject({ completeScorecards: 2, requiredScorecards: 2, ready: true, isFinalRound: false });
});

test("incomplete canonical Review disables progression", () => {
  const incomplete = structuredClone(results);
  incomplete.combined[1].segments[0].reviewComplete = false;
  expect(buildQualifyingRoundProgressionState(foundation, incomplete)?.ready).toBe(false);
});

test("coach UI no longer calls the unsafe one-pointer repository mutation", () => {
  const page = source("app/coach-dashboard/qualifying-manager/page.tsx");
  expect(page).toContain("advanceQualifyingOperationalRound");
  expect(page).not.toContain("setQualifyingOperationalRound");
});

test("player access requires explicit same-day round selection through bounded RPCs", () => {
  const migration = source("supabase/migrations/20260902000000_add_qualifying_round_progression.sql");
  expect(migration).toContain("qualifying_day_id = operational_round.qualifying_day_id");
  expect(migration).toContain("input_qualifying_round_id");
  expect(migration).toContain("grant execute on function public.exchange_qualifying_player_round_access");
  expect(migration).toContain("revoke all on function public.advance_qualifying_operational_round");
  expect(migration).toContain("record_qualifying_access_failure");
  expect(migration).toContain("qualifying-access-rate-code:");
  expect(migration).toContain("revoke all on function private.record_qualifying_access_failure");
});

test("round picker and summary CTA preserve explicit Qualifying round identity", () => {
  expect(source("app/components/PlayerScoringCodeEntry.tsx")).toContain("Choose a Round");
  expect(source("app/lib/services/qualifyingAccessService.ts")).toContain('searchParams.set("qualifyingRoundId"');
  expect(source("app/scorecard/[playerId]/page.tsx")).toContain("The next round will become available when your coach advances");
});

test("canonical reciprocal leaderboard authority does not prefer an in-progress marker over submitted self", () => {
  const self = { ...durable("aj", [4,4,4,4,4,4,4,4,4]), id: "self", entered_by_player_id: "aj" };
  const marker = { ...durable("aj", [5,5,0,0,0,0,0,0,0]), id: "marker", entered_by_player_id: "colin", entry_status: "in_progress" };
  const result = selectQualifyingCompetitionScore({ playerId: "aj", scoringMode: "reciprocal", scoreEntries: [marker, self], holeCount: 9 });
  expect(result?.holeScores).toEqual([4,4,4,4,4,4,4,4,4]);
});

test("canonical reciprocal authority remains incomplete when self is incomplete even if marker submitted", () => {
  const self = { ...durable("aj", [4,4,0,0,0,0,0,0,0]), id: "self", entered_by_player_id: "aj", entry_status: "in_progress" };
  const marker = { ...durable("aj", [5,5,5,5,5,5,5,5,5]), entered_by_player_id: "colin" };
  const result = selectQualifyingCompetitionScore({ playerId: "aj", scoringMode: "reciprocal", scoreEntries: [marker, self], holeCount: 9 });
  expect(result?.holeScores).toEqual([4,4,0,0,0,0,0,0,0]);
});

test("designated scorer is canonical and official hole resolution is applied", () => {
  const designated = { ...durable("aj", [5,5,5,5,5,5,5,5,5]), entered_by_player_id: "aj-marker" };
  const official = [{ id: "o", tournament_id: "t", round_number: 1, player_id: "aj", entered_by_player_id: "coach", marker_for_player_id: null, hole_number: 3, strokes: 4, fairway_hit: null, green_in_regulation: null, putts: null, penalty_strokes: null, entry_source: "review", entry_status: "official", review_status: "official", is_official: true, official_at: "2026-09-02", official_by: "coach", created_at: null, updated_at: null }];
  const result = selectQualifyingCompetitionScore({ playerId: "aj", scoringMode: "designated_scorer", scoreEntries: [designated], officialEntries: official, holeCount: 9, assignedScorerPlayerId: "aj-marker" });
  expect(result?.holeScores).toEqual([5,5,4,5,5,5,5,5,5]);
});

test("coach readiness loads independently of the Results panel", () => {
  const page = source("app/coach-dashboard/qualifying-manager/page.tsx");
  const migration = source("supabase/migrations/20260902000000_add_qualifying_round_progression.sql");
  expect(page).toContain("loadQualifyingRoundProgressionState");
  expect(page).not.toContain("Open Results to load canonical round readiness");
  expect(migration).toContain("private.qualifying_round_readiness");
  expect(migration).toContain("readiness := private.qualifying_round_readiness");
});
