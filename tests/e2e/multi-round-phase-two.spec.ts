import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { buildMobileScorecardPath } from "../../app/lib/services/tournamentPageHelpers";
import {
  ScorecardRoundResolutionError,
  resolveScorecardRound,
  scorecardRoundRequestKey,
} from "../../app/lib/services/scorecardRoundResolutionService";
import {
  buildQualifyingResults,
  sumImmutableQualifyingRoundPar,
} from "../../app/lib/services/qualifyingResultsService";
import type { QualifyingRoundMapping, QualifyingSession } from "../../app/lib/qualifyingModel";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const otherTournamentId = "22222222-2222-4222-8222-222222222222";
const stableRound = (roundNumber: number, owner = tournamentId) => ({
  id: `00000000-0000-4000-8000-${String(roundNumber).padStart(12, "0")}`,
  tournamentId: owner,
  roundNumber,
});
const rounds = Array.from({ length: 10 }, (_, index) => stableRound(index + 1));

test("explicit stable R10 resolves without one-digit parsing", () => {
  const resolved = resolveScorecardRound({
    tournamentId,
    configuredRounds: rounds,
    explicitScorecardRoundId: rounds[9].id,
    operationalCurrentRoundId: rounds[0].id,
  });
  expect(resolved).toMatchObject({ scorecardRoundId: rounds[9].id, roundNumber: 10, source: "explicit" });
  expect(scorecardRoundRequestKey(tournamentId, resolved.scorecardRoundId)).toContain(rounds[9].id);
});

test("legacy round-2 resolves once to its configured durable UUID", () => {
  expect(resolveScorecardRound({
    tournamentId,
    configuredRounds: rounds,
    legacyRoundIdentity: "round-2",
  })).toMatchObject({ scorecardRoundId: rounds[1].id, roundNumber: 2, source: "legacy" });
});

test("explicit scorecard round wins over resume and operational rounds", () => {
  expect(resolveScorecardRound({
    tournamentId,
    configuredRounds: rounds,
    explicitScorecardRoundId: rounds[7].id,
    playerResumeRoundId: rounds[4].id,
    operationalCurrentRoundId: rounds[5].id,
  }).roundNumber).toBe(8);
});

test("player resume wins over operational round when no explicit assignment exists", () => {
  expect(resolveScorecardRound({
    tournamentId,
    configuredRounds: rounds,
    playerResumeRoundId: rounds[4].id,
    operationalCurrentRoundId: rounds[5].id,
  })).toMatchObject({ roundNumber: 5, source: "player_resume" });
});

test("cross-event stable round identity is rejected", () => {
  const foreignRound = {
    id: "99999999-9999-4999-8999-999999999999",
    tournamentId: otherTournamentId,
    roundNumber: 1,
  };
  expect(() => resolveScorecardRound({
    tournamentId,
    configuredRounds: [...rounds, foreignRound],
    explicitScorecardRoundId: foreignRound.id,
  })).toThrow(ScorecardRoundResolutionError);
});

test("ambiguous multi-round link fails instead of falling back to R1", () => {
  expect(() => resolveScorecardRound({ tournamentId, configuredRounds: rounds })).toThrow(
    "does not identify a round"
  );
});

test("single-round compatibility remains implicit and safe", () => {
  expect(resolveScorecardRound({ tournamentId, configuredRounds: [rounds[0]] })).toMatchObject({
    roundNumber: 1,
    source: "single_round",
  });
});

test("new mobile links carry both durable and display round identity", () => {
  const pathName = buildMobileScorecardPath({
    tournamentId,
    activeQrPairing: { groupNumber: 1, teeTime: "", startingHole: "1", players: [] },
    activeQrScoringPlayerId: "player-a",
    roundNumber: 10,
    scorecardRoundId: rounds[9].id,
  });
  const url = new URL(pathName, "https://clubhouse.test");
  expect(url.searchParams.get("roundId")).toBe(rounds[9].id);
  expect(url.searchParams.get("round")).toBe("10");
});

test("custom-hole Qualifying par sums the immutable ordered hole sequence", () => {
  expect(sumImmutableQualifyingRoundPar({
    holeSequence: [4, 5, 6, 7, 8, 9, 10],
    courseHoles: [
      { holeNumber: 4, par: 3 }, { holeNumber: 5, par: 5 }, { holeNumber: 6, par: 4 },
      { holeNumber: 7, par: 3 }, { holeNumber: 8, par: 4 }, { holeNumber: 9, par: 5 },
      { holeNumber: 10, par: 3 },
    ],
  })).toBe(27);
});

test("missing immutable hole data does not fabricate par", () => {
  expect(sumImmutableQualifyingRoundPar({
    holeSequence: [1, 2],
    courseHoles: [{ holeNumber: 1, par: 5 }],
  })).toBeNull();
});

test("multi-round Qualifying totals use each round immutable par", () => {
  const session: QualifyingSession = {
    id: "q", tournamentId, ownerId: "coach", name: "Q", rosterType: "men",
    scoringMode: "designated_scorer", status: "active", selectedPlayers: [
      { id: "a", name: "A", rosterType: "men", classYear: "" },
    ], groups: [], finalizedAt: null, finalizedBy: null, createdAt: null, updatedAt: null,
  };
  const mappedRounds: QualifyingRoundMapping[] = [35, 37, 34].map((par, index) => ({
    id: rounds[index].id, tournamentId, roundNumber: index + 1, name: `R${index + 1}`,
    holeCount: 1, holeSequence: [index + 1], immutablePar: par,
    qualifyingSessionId: "q", qualifyingDay: 1, qualifyingSegment: index + 1,
    createdAt: null, updatedAt: null,
  }));
  const scoreEntries = mappedRounds.map((round) => ({
    id: `score-${round.roundNumber}`, tournament_id: tournamentId, round_number: round.roundNumber,
    player_id: "a", entered_by_player_id: "marker", hole_scores: [round.immutablePar!],
    total: round.immutablePar!, entry_status: "submitted", submitted_at: null, created_at: null, updated_at: null,
  }));
  const reviewStatuses = mappedRounds.map((round) => ({
    id: `review-${round.roundNumber}`, tournament_id: tournamentId, round_number: round.roundNumber,
    player_id: "a", self_review_complete: true, marker_review_complete: true, official_at: null,
    created_at: null, updated_at: null,
  }));
  const result = buildQualifyingResults({
    session,
    days: [{ id: "d", qualifyingSessionId: "q", dayNumber: 1, playDate: null, holesTotal: 9,
      courseName: "Course", teeName: "Tee", startingHole: 1, createdAt: null, updatedAt: null }],
    rounds: mappedRounds,
    players: mappedRounds.map((round) => ({ playerId: "a", playerName: "A", roundNumber: round.roundNumber, status: "active" })),
    scorecards: mappedRounds.map((round) => ({ playerId: "a", roundNumber: round.roundNumber, holeCount: 1 })),
    scoreEntries,
    holeEntries: [],
    reviewStatuses,
  });
  expect(result.combined[0].par).toBe(106);
});

test("two-round reciprocal scoring selects the assigned marker independently in each round", () => {
  const reciprocalSession: QualifyingSession = {
    id: "reciprocal", tournamentId, ownerId: "coach", name: "Q", rosterType: "men",
    scoringMode: "reciprocal", status: "active", selectedPlayers: [
      { id: "a", name: "A", rosterType: "men", classYear: "" },
      { id: "b", name: "B", rosterType: "men", classYear: "" },
    ], groups: [], finalizedAt: null, finalizedBy: null, createdAt: null, updatedAt: null,
  };
  const reciprocalRounds: QualifyingRoundMapping[] = [1, 2].map((roundNumber) => ({
    id: rounds[roundNumber - 1].id, tournamentId, roundNumber, name: `R${roundNumber}`,
    holeCount: 1, immutablePar: 4, qualifyingSessionId: "reciprocal", qualifyingDay: 1,
    qualifyingSegment: roundNumber, createdAt: null, updatedAt: null,
  }));
  const streams = [
    [1, "a", "intruder", 0], [1, "a", "a", 4], [1, "a", "b", 5], [1, "b", "b", 6], [1, "b", "a", 7],
    [2, "a", "intruder", 0], [2, "a", "a", 3], [2, "a", "b", 4], [2, "b", "b", 5], [2, "b", "a", 6],
  ] as const;
  const scoreEntries = streams.map(([roundNumber, playerId, enteredBy, score], index) => ({
    id: `s${index}`, tournament_id: tournamentId, round_number: roundNumber, player_id: playerId,
    entered_by_player_id: enteredBy, hole_scores: [score], total: score,
    entry_status: "submitted", submitted_at: null, created_at: null, updated_at: null,
  }));
  const players = reciprocalRounds.flatMap((round) => [
    { playerId: "a", playerName: "A", roundNumber: round.roundNumber, status: "active", assignedMarkerPlayerId: "b" },
    { playerId: "b", playerName: "B", roundNumber: round.roundNumber, status: "active", assignedMarkerPlayerId: "a" },
  ]);
  const reviews = players.map((player, index) => ({
    id: `r${index}`, tournament_id: tournamentId, round_number: player.roundNumber, player_id: player.playerId,
    self_review_complete: true, marker_review_complete: true, official_at: null, created_at: null, updated_at: null,
  }));
  const result = buildQualifyingResults({
    session: reciprocalSession,
    days: [{ id: "d", qualifyingSessionId: "reciprocal", dayNumber: 1, playDate: null, holesTotal: 9,
      courseName: "Course", teeName: "Tee", startingHole: 1, createdAt: null, updatedAt: null }],
    rounds: reciprocalRounds,
    players,
    scorecards: players.map((player) => ({ playerId: player.playerId, roundNumber: player.roundNumber, holeCount: 1 })),
    scoreEntries,
    holeEntries: [],
    reviewStatuses: reviews,
  });
  expect(result.combined.find((player) => player.playerId === "a")?.segments.map((segment) => segment.score)).toEqual([4, 3]);
  expect(result.combined.find((player) => player.playerId === "b")?.segments.map((segment) => segment.score)).toEqual([6, 5]);
  expect(result.combined.every((player) => player.completionStatus === "complete")).toBe(true);
});

test("mobile, Review, statistics, and designated APIs retain explicit round scoping", () => {
  const root = process.cwd();
  const mobile = fs.readFileSync(path.join(root, "app/scorecard/[playerId]/page.tsx"), "utf8");
  const designated = fs.readFileSync(path.join(root, "app/api/qualifying-designated-scorecard/route.ts"), "utf8");
  expect(mobile).toContain("scorecardRoundId");
  expect(mobile).not.toContain('resolvedPlayerIds.roundId.replace("round-", "")');
  expect(mobile).toContain("roundNumber: Number(resolvedPlayerIds.roundNumber)");
  expect(designated).toContain("tournamentRoundId && round.id !== tournamentRoundId");
  expect(designated).toContain('select("id,hole_count,name,starting_hole,hole_sequence")');
  expect(designated).toContain("Array.isArray(context.round.hole_sequence)");
  expect(designated).toContain('.eq("round_number", body.roundNumber)');
  const qualifyingWorkspace = fs.readFileSync(
    path.join(root, "app/coach-dashboard/qualifying-manager/page.tsx"),
    "utf8"
  );
  expect(qualifyingWorkspace).toContain("operationalCurrentQualifyingRoundId");
  expect(qualifyingWorkspace).toContain("handleOperationalRoundChange");
});

test("Phase 2 migration returns stable access identity and uses operational authority", () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260830000000_add_round_aware_scoring_resolution.sql"),
    "utf8"
  );
  expect(migration).toContain("'tournamentRoundId', tournament_round_id");
  expect(migration).toContain("tournament.operational_current_round_id");
  expect(migration).not.toContain("max(round_number)");
});
