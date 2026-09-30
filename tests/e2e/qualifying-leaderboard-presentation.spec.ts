import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { getGolfScoreKind } from "../../app/components/leaderboards/GolfScoreCell";
import { buildMultiRoundTournamentLeaderboard } from "../../app/lib/services/multiRoundLeaderboardService";
import { bindSnapshotRoundsToDurableMetadata } from "../../app/lib/services/shareTokenLeaderboardService";
import type { QualifyingLeaderboardRoundMetadataRow } from "../../app/lib/repositories/tournamentRepository";
import type { Tournament } from "../../app/lib/tournamentModel";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const tournament: Tournament = {
  id: "qualifying-event",
  name: "Distinct Course Qualifier",
  course: "North Course",
  settings: { operationalCurrentRoundId: "round-2" },
  rounds: [
    { id: "round-1", name: "Round 1", roundNumber: 1, status: "complete", pairings: [], leaderboard: [] },
    { id: "round-2", name: "Round 2", roundNumber: 2, status: "live", pairings: [], leaderboard: [] },
  ],
  teams: [{ id: "team-a", name: "Team A", players: ["player-a", "player-b"] }],
  players: [
    { id: "player-a", firstName: "Alex", lastName: "Ace", teamId: "team-a", isIndividual: false, statistics: {} },
    { id: "player-b", firstName: "Blair", lastName: "Birdie", teamId: "team-a", isIndividual: false, statistics: {} },
  ],
  pairings: [],
  scores: [
    { playerId: "player-a", roundId: "round-1", holeScores: [4, 4, 4], total: 12, status: "complete", enteredBy: "marker" },
    { playerId: "player-b", roundId: "round-1", holeScores: [4, 4, 4], total: 12, status: "complete", enteredBy: "marker" },
    { playerId: "player-a", roundId: "round-2", holeScores: [3, 5, 0], total: 8, status: "live", enteredBy: "marker" },
    { playerId: "player-b", roundId: "round-2", holeScores: [4, 4, 0], total: 8, status: "live", enteredBy: "marker" },
  ],
};

const projection = () => buildMultiRoundTournamentLeaderboard({
  tournament,
  operationalCurrentRoundId: "round-2",
  roundConfigurationById: {
    "round-1": { courseName: "North Course", holeNumbers: [1, 2, 3], pars: [4, 4, 4], countingScores: 1 },
    "round-2": { courseName: "South Course", holeNumbers: [10, 11, 12], pars: [3, 5, 4], countingScores: 1 },
  },
});

test("stable round UUIDs retain distinct course, hole, par, and scorecards", () => {
  const model = projection();
  const alex = model.players.find((player) => player.id === "player-a")!;
  expect(alex.rounds["round-1"]).toMatchObject({ courseName: "North Course", total: 12, through: "F" });
  expect(alex.rounds["round-1"].holes).toEqual([
    { holeNumber: 1, par: 4, score: 4 }, { holeNumber: 2, par: 4, score: 4 }, { holeNumber: 3, par: 4, score: 4 },
  ]);
  expect(alex.rounds["round-2"]).toMatchObject({ courseName: "South Course", total: 8, through: "2/3" });
  expect(alex.rounds["round-2"].holes).toEqual([
    { holeNumber: 10, par: 3, score: 3 }, { holeNumber: 11, par: 5, score: 5 }, { holeNumber: 12, par: 4, score: null },
  ]);
});

test("individual and team standings preserve cumulative totals and tied positions", () => {
  const model = projection();
  expect(model.players.map((player) => player.position)).toEqual(["T1", "T1"]);
  expect(model.players[0]).toMatchObject({ overallTotal: 20, overallToPar: "E" });
  expect(model.teams[0].rounds["round-1"]).toMatchObject({ total: 12, toPar: "E", through: "F" });
  expect(model.teams[0]).toMatchObject({ overallTotal: 12, overallToPar: "E" });
});

test("one shared score cell encodes conventional golf shapes without changing values", () => {
  expect([getGolfScoreKind(2, 4), getGolfScoreKind(3, 4), getGolfScoreKind(4, 4), getGolfScoreKind(5, 4), getGolfScoreKind(6, 4), getGolfScoreKind(null, 4)])
    .toEqual(["eagle", "birdie", "par", "bogey", "double-bogey", "unplayed"]);
  const grid = source("app/components/leaderboards/GolfScorecardGrid.tsx");
  expect(grid).toContain("<GolfScoreCell score={hole.score} par={hole.par} />");
  expect(source("app/components/leaderboards/GolfScoreCell.tsx")).toContain("aria-label");
});

test("leaderboard tables expose Individual and Team views with mobile containment", () => {
  const component = source("app/components/leaderboards/MultiRoundTournamentLeaderboard.tsx");
  for (const heading of ["Pos", "Total", "Thru", "Today", "Total Strokes"]) expect(component).toContain(`>${heading}<`);
  expect(component).toContain('showingTeams ? "Team" : "Player"');
  expect(component).toContain('aria-label="Leaderboard view"');
  expect(component).toContain('option === "individual" ? "Individual" : "Team"');
  expect(component).toContain("overflow-x-auto");
  expect(component).toContain("courseName");
  expect(source("app/coach-dashboard/qualifying-manager/QualifyingLeaderboardPanel.tsx")).not.toContain("hideTeams />");
});

test("public metadata is resolved through a read-only share-token authority", () => {
  const service = source("app/lib/services/shareTokenLeaderboardService.ts");
  const migration = source("supabase/migrations/20260928000000_add_share_token_qualifying_round_metadata.sql");
  expect(service).toContain("bindSnapshotRoundsToDurableMetadata");
  expect(service).toContain("metadataByRoundId.get(round.id)");
  expect(service).toContain("metadata?.course_hole_snapshot");
  expect(migration).toContain("public.has_valid_share_token");
  expect(migration).toContain("day.course_hole_snapshot");
  expect(migration).not.toMatch(/insert|update|delete/i);
});

test("legacy snapshot round keys bind to durable R1, R2, and R3 metadata authority", () => {
  const legacyTournament: Tournament = {
    ...tournament,
    settings: { operationalCurrentRoundId: "round-2", selectedRoundId: "round-1" },
    rounds: [
      ...tournament.rounds,
      { id: "round-3", name: "Round 3", roundNumber: 3, status: "upcoming", pairings: [], leaderboard: [] },
    ],
    pairings: [{ id: "pairing-r2", roundId: "round-2", groupNumber: 1, teeTime: "", startingHole: "1", players: [] }],
  };
  const metadata = [
    { tournament_round_id: "stable-r1", round_number: 1, course_name: "North Course", starting_hole: 1, hole_sequence: [1, 2, 3], course_hole_snapshot: [] },
    { tournament_round_id: "stable-r2", round_number: 2, course_name: "South Course", starting_hole: 10, hole_sequence: [10, 11, 12], course_hole_snapshot: [] },
    { tournament_round_id: "stable-r3", round_number: 3, course_name: "West Course", starting_hole: 4, hole_sequence: [4, 5, 6], course_hole_snapshot: [] },
  ] satisfies QualifyingLeaderboardRoundMetadataRow[];

  const bound = bindSnapshotRoundsToDurableMetadata(legacyTournament, metadata);

  expect(bound.rounds.map((round) => round.id)).toEqual(["stable-r1", "stable-r2", "stable-r3"]);
  expect(bound.settings).toMatchObject({ operationalCurrentRoundId: "stable-r2", selectedRoundId: "stable-r1" });
  expect(bound.scores.map((score) => score.roundId)).toEqual(["stable-r1", "stable-r1", "stable-r2", "stable-r2"]);
  expect(bound.pairings[0].roundId).toBe("stable-r2");
});

test("durable round binding keeps distinct course, hole, and par cards across R1 to R2 to R1", () => {
  const metadata = [
    { tournament_round_id: "stable-r1", round_number: 1, course_name: "North Course", starting_hole: 1, hole_sequence: [1, 2, 3], course_hole_snapshot: [] },
    { tournament_round_id: "stable-r2", round_number: 2, course_name: "South Course", starting_hole: 10, hole_sequence: [10, 11, 12], course_hole_snapshot: [] },
  ] satisfies QualifyingLeaderboardRoundMetadataRow[];
  const bound = bindSnapshotRoundsToDurableMetadata(tournament, metadata);
  const model = buildMultiRoundTournamentLeaderboard({
    tournament: bound,
    operationalCurrentRoundId: bound.settings.operationalCurrentRoundId,
    roundConfigurationById: {
      "stable-r1": { courseName: "North Course", holeNumbers: [1, 2, 3], pars: [4, 4, 4], countingScores: 1 },
      "stable-r2": { courseName: "South Course", holeNumbers: [10, 11, 12], pars: [3, 5, 4], countingScores: 1 },
    },
  });
  const alex = model.players.find((player) => player.id === "player-a")!;
  const selectedCards = ["stable-r1", "stable-r2", "stable-r1"].map((roundId) => alex.rounds[roundId]);

  expect(selectedCards.map((round) => round.courseName)).toEqual(["North Course", "South Course", "North Course"]);
  expect(selectedCards.map((round) => round.holes.map((hole) => [hole.holeNumber, hole.par]))).toEqual([
    [[1, 4], [2, 4], [3, 4]],
    [[10, 3], [11, 5], [12, 4]],
    [[1, 4], [2, 4], [3, 4]],
  ]);
});

test("Coach Portal and public leaderboard share the same share-token round metadata projection", () => {
  const panel = source("app/coach-dashboard/qualifying-manager/QualifyingLeaderboardPanel.tsx");
  const publicPage = source("app/leaderboard/page.tsx");
  expect(panel).toContain("loadShareTokenLeaderboard");
  expect(publicPage).toContain("loadShareTokenLeaderboard");
});
