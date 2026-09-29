import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { getGolfScoreKind } from "../../app/components/leaderboards/GolfScoreCell";
import { buildMultiRoundTournamentLeaderboard } from "../../app/lib/services/multiRoundLeaderboardService";
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
  expect(service).toContain("metadataByRoundId.get(round.id)");
  expect(service).toContain("metadata?.course_hole_snapshot");
  expect(migration).toContain("public.has_valid_share_token");
  expect(migration).toContain("day.course_hole_snapshot");
  expect(migration).not.toMatch(/insert|update|delete/i);
});
