import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { QualifyingResultsReadModel, QualifyingRosterPlayer, QualifyingRoundPairingGroup } from "../../app/lib/qualifyingModel";
import { buildQualifyingPairingsByScore, normalizeQualifyingManualPairings } from "../../app/lib/services/qualifyingPairingService";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const players: QualifyingRosterPlayer[] = ["a", "b", "c", "d", "e", "f"].map((id, index) => ({
  id, name: `Player ${id.toUpperCase()}`, rosterType: "men", classYear: "", rosterPlayerId: `roster-${index}`,
}));
const segment = (roundNumber: number, score: number, toPar: number) => ({
  tournamentRoundId: `round-${roundNumber}`, roundNumber, dayNumber: roundNumber, segmentNumber: 1,
  holeCount: 9, holeNumbers: [1,2,3,4,5,6,7,8,9], holePars: Array(9).fill(4), holeScores: Array(9).fill(score / 9), markerHoleScores: [],
  through: "F", score, par: 36, toPar, completionStatus: "complete" as const, reviewComplete: true, submitted: true,
  statistics: { fairwaysHit: 0, fairwaysAvailable: 0, greensInRegulation: 0, greensAvailable: 0, totalPutts: 0, recordedHoles: 0 },
});
const results = (scores: Array<[number, number][]>): QualifyingResultsReadModel => ({
  qualifyingSessionId: "session", tournamentId: "tournament", sessionName: "Qualifier", sessionStatus: "active", scoringMode: "reciprocal",
  finalizedAt: null, finalizedBy: null, finalizedByName: null, days: [], readiness: {} as QualifyingResultsReadModel["readiness"], generatedAt: "2026-09-27",
  combined: players.map((player, playerIndex) => ({
    playerId: player.id, playerName: player.name, position: null, score: null, par: null, toPar: null, completionStatus: "complete",
    segments: scores[playerIndex].map(([score, toPar], index) => segment(index + 1, score, toPar)),
    statistics: { fairwaysHit: 0, fairwaysAvailable: 0, greensInRegulation: 0, greensAvailable: 0, totalPutts: 0, recordedHoles: 0 },
  })),
});

test("R2 re-pairing uses canonical R1 standings and preserves configured group sizes", () => {
  const groups = buildQualifyingPairingsByScore({
    players,
    results: results([[[39,3]], [[35,-1]], [[37,1]], [[36,0]], [[40,4]], [[38,2]]]),
    targetRoundNumber: 2,
    groupSizes: [3,3],
    startingHoles: [1,10],
  });
  expect(groups.map((group) => group.players.map((player) => player.playerId))).toEqual([["b","d","c"], ["f","a","e"]]);
  expect(groups.map((group) => group.startingHole)).toEqual([1,10]);
  expect(groups.flatMap((group) => group.players).every((player) => player.markerPlayerId)).toBe(true);
});

test("R3 re-pairing uses cumulative R1 plus R2 standings", () => {
  const groups = buildQualifyingPairingsByScore({
    players,
    results: results([
      [[36,0],[45,9]], [[40,4],[36,0]], [[39,3],[35,-1]],
      [[38,2],[38,2]], [[37,1],[42,6]], [[41,5],[35,-1]],
    ]),
    targetRoundNumber: 3, groupSizes: [3,3], startingHoles: [1,10],
  });
  expect(groups.map((group) => group.players.map((player) => player.playerId))).toEqual([["c","b","d"], ["f","e","a"]]);
});

test("ties use stable roster order and never randomize", () => {
  const first = buildQualifyingPairingsByScore({ players, results: results(players.map(() => [[36,0]])), targetRoundNumber: 2, groupSizes: [3,3], startingHoles: [1,1] });
  const second = buildQualifyingPairingsByScore({ players, results: results(players.map(() => [[36,0]])), targetRoundNumber: 2, groupSizes: [3,3], startingHoles: [1,1] });
  expect(first).toEqual(second);
  expect(first.flatMap((group) => group.players.map((player) => player.playerId))).toEqual(players.map((player) => player.id));
});

test("manual moves and order changes rebuild reciprocal markers only for the selected round", () => {
  const draft: QualifyingRoundPairingGroup[] = [
    { roundNumber: 2, groupNumber: 1, startingHole: 1, players: [players[1], players[2], players[0]].map((player, index) => ({ playerId: player.id, playerName: player.name, position: index + 1, markerPlayerId: null })) },
    { roundNumber: 2, groupNumber: 2, startingHole: 10, players: [players[3], players[4], players[5]].map((player, index) => ({ playerId: player.id, playerName: player.name, position: index + 1, markerPlayerId: null })) },
  ];
  const saved = normalizeQualifyingManualPairings(2, draft, players.map((player) => player.id));
  expect(saved.every((group) => group.roundNumber === 2)).toBe(true);
  expect(saved[0].players.map((player) => [player.playerId, player.markerPlayerId])).toEqual([["b","c"],["c","a"],["a","b"]]);
  expect(saved[1].players.map((player) => player.position)).toEqual([1,2,3]);
});

test("re-pairing refuses incomplete preceding-round standings", () => {
  const incomplete = results(players.map(() => [[36,0]]));
  incomplete.combined[0].segments[0].submitted = false;
  expect(() => buildQualifyingPairingsByScore({ players, results: incomplete, targetRoundNumber: 2, groupSizes: [3,3], startingHoles: [1,1] }))
    .toThrow("Every player must submit R1");
});

test("round-scoped mutation protects history and updates the durable player pairing authority", () => {
  const route = source("app/api/qualifying-sessions/[id]/pairings/route.ts");
  expect(route).toContain('.from("tournament_players")');
  expect(route).toContain('.eq("round_number", roundNumber)');
  expect(route).toContain('.in("entry_status", ["submitted", "verified", "official"])');
  expect(route).toContain("Submitted round pairings cannot be replaced");
  expect(route).toContain('onConflict: "tournament_id,round_number,player_id"');
  expect(route).not.toContain('.from("qualifying_groups").insert');
});

test("workspace offers round-specific score re-pairing and manual editing", () => {
  const component = source("app/coach-dashboard/qualifying-manager/QualifyingPairingsPanel.tsx");
  const page = source("app/coach-dashboard/qualifying-manager/page.tsx");
  expect(component).toContain("Round to edit");
  expect(component).toContain("Re-pair by Score");
  expect(component).toContain("Edit Manually");
  expect(component).toContain("Add Group");
  expect(component).toContain("Save Manual Pairings");
  expect(component).toContain("Earlier-round groups and scores will not change");
  expect(page).toContain("<QualifyingPairingsPanel");
});

test("session hydration exposes exact-round durable groups to player and coach views", () => {
  const route = source("app/api/qualifying-sessions/route.ts");
  const scorecard = source("app/lib/services/tournamentService.ts");
  expect(route).toContain('.select("tournament_id,player_id,player_name,round_number,group_number,starting_hole,marker_player_id,position")');
  expect(route).toContain("roundPairings: sessionRoundPairings");
  expect(scorecard).toContain("row.round_number === roundNumber && row.group_number !== null");
  expect(scorecard).toContain("markerPlayerId: String(row.marker_player_id)");
});
