import { expect, test } from "@playwright/test";
import {
  buildIncompleteTournamentSeed,
  INCOMPLETE_TEST_PLAYER_IDS,
} from "../../app/lib/services/incompleteTournamentSeedService";

test("incomplete seed fixture is deterministic, reciprocal, and leaves only hole 18 empty", () => {
  const seed = buildIncompleteTournamentSeed({ tournamentId: "seed-one" });
  const repeated = buildIncompleteTournamentSeed({ tournamentId: "seed-one" });

  expect(seed).toEqual(repeated);
  expect(seed.envelope.tournament.players.map((player) => player.id)).toEqual([...INCOMPLETE_TEST_PLAYER_IDS]);
  expect(seed.envelope.tournament.pairings).toHaveLength(1);
  expect(seed.envelope.uiState.scorecards.scorecardsGenerated).toBe(true);
  expect(seed.envelope.uiState.scorecards.scorecardRows).toHaveLength(2);
  expect(seed.scoreEntries).toHaveLength(4);
  expect(seed.holeEntries).toHaveLength(68);

  for (const playerId of INCOMPLETE_TEST_PLAYER_IDS) {
    const self = seed.scoreEntries.find(
      (entry) => entry.playerId === playerId && entry.enteredByPlayerId === playerId
    );
    const marker = seed.scoreEntries.find(
      (entry) => entry.playerId === playerId && entry.enteredByPlayerId !== playerId
    );
    expect(self?.holeScores.slice(0, 17).every((score) => score > 0)).toBe(true);
    expect(marker?.holeScores.slice(0, 17).every((score) => score > 0)).toBe(true);
    expect(self?.holeScores[17]).toBe(0);
    expect(marker?.holeScores[17]).toBe(0);
  }

  expect(seed.holeEntries.some((entry) => entry.holeNumber === 18)).toBe(false);
  const parThreeRows = seed.holeEntries.filter(
    (entry) => entry.playerId === entry.enteredByPlayerId && [3, 7, 12, 16].includes(entry.holeNumber)
  );
  expect(parThreeRows.every((entry) => entry.fairwayHit === null)).toBe(true);
});

test("repeated incomplete seed creation retains deterministic data under distinct tournament identities", () => {
  const first = buildIncompleteTournamentSeed({ tournamentId: "seed-one" });
  const second = buildIncompleteTournamentSeed({ tournamentId: "seed-two" });

  expect(first.tournament.id).not.toBe(second.tournament.id);
  expect(first.scoreEntries.every((entry) => entry.tournamentId === "seed-one")).toBe(true);
  expect(second.scoreEntries.every((entry) => entry.tournamentId === "seed-two")).toBe(true);
  expect(first.holeEntries.every((entry) => entry.tournamentId === "seed-one")).toBe(true);
  expect(second.holeEntries.every((entry) => entry.tournamentId === "seed-two")).toBe(true);
});
