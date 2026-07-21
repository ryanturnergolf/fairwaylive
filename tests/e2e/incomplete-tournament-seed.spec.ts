import { expect, test } from "@playwright/test";
import {
  buildIncompleteTournamentSeed,
  INCOMPLETE_TEST_PARS,
  INCOMPLETE_TEST_PLAYER_IDS,
} from "../../app/lib/services/incompleteTournamentSeedService";
import { findInitialScorecardHoleIndex } from "../../app/lib/services/scorecardResumeService";

const buildResumeInput = () => {
  const seed = buildIncompleteTournamentSeed({ tournamentId: "resume-seed" });
  const currentPlayerId = INCOMPLETE_TEST_PLAYER_IDS[0];
  const markedPlayerId = INCOMPLETE_TEST_PLAYER_IDS[1];
  const self = seed.scoreEntries.find(
    (entry) => entry.playerId === currentPlayerId && entry.enteredByPlayerId === currentPlayerId
  )!;
  const marked = seed.scoreEntries.find(
    (entry) => entry.playerId === markedPlayerId && entry.enteredByPlayerId === currentPlayerId
  )!;
  const selfStatistics = seed.holeEntries.filter(
    (entry) => entry.playerId === currentPlayerId && entry.enteredByPlayerId === currentPlayerId
  );
  return {
    holes: INCOMPLETE_TEST_PARS.map((par, index) => ({ holeNumber: index + 1, par })),
    selfScores: [...self.holeScores],
    markedPlayerScores: [...marked.holeScores],
    statistics: INCOMPLETE_TEST_PARS.map((par, index) => {
      const entry = selfStatistics.find((item) => item.holeNumber === index + 1);
      return {
        fairwayHit: par === 3 ? null : entry?.fairwayHit ?? null,
        greenInRegulation: entry?.greenInRegulation ?? null,
        putts: entry?.putts ?? null,
      };
    }),
  };
};

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

test("resume selection uses both reciprocal scores and required current-player statistics", () => {
  const alex = buildResumeInput();
  expect(findInitialScorecardHoleIndex(alex)).toBe(17);

  const jordanSeed = buildIncompleteTournamentSeed({ tournamentId: "resume-jordan" });
  const jordanSelf = jordanSeed.scoreEntries.find(
    (entry) => entry.playerId === INCOMPLETE_TEST_PLAYER_IDS[1] && entry.enteredByPlayerId === INCOMPLETE_TEST_PLAYER_IDS[1]
  )!;
  const alexMarkedByJordan = jordanSeed.scoreEntries.find(
    (entry) => entry.playerId === INCOMPLETE_TEST_PLAYER_IDS[0] && entry.enteredByPlayerId === INCOMPLETE_TEST_PLAYER_IDS[1]
  )!;
  const jordanStatistics = jordanSeed.holeEntries.filter(
    (entry) => entry.playerId === INCOMPLETE_TEST_PLAYER_IDS[1] && entry.enteredByPlayerId === INCOMPLETE_TEST_PLAYER_IDS[1]
  );
  expect(findInitialScorecardHoleIndex({
    holes: alex.holes,
    selfScores: jordanSelf.holeScores,
    markedPlayerScores: alexMarkedByJordan.holeScores,
    statistics: alex.holes.map((hole) => {
      const entry = jordanStatistics.find((item) => item.holeNumber === hole.holeNumber);
      return {
        fairwayHit: hole.par === 3 ? null : entry?.fairwayHit ?? null,
        greenInRegulation: entry?.greenInRegulation ?? null,
        putts: entry?.putts ?? null,
      };
    }),
  })).toBe(17);
});

test("resume selection finds every required missing input and ignores par-three fairways", () => {
  const complete = buildResumeInput();
  complete.selfScores[17] = 4;
  complete.markedPlayerScores[17] = 4;
  complete.statistics[17] = { fairwayHit: true, greenInRegulation: true, putts: 2 };
  expect(findInitialScorecardHoleIndex(complete)).toBe(-1);

  const parThreeFairwayMissing = structuredClone(complete);
  parThreeFairwayMissing.statistics[2].fairwayHit = null;
  expect(findInitialScorecardHoleIndex(parThreeFairwayMissing)).toBe(-1);

  for (const mutate of [
    (input: typeof complete) => { input.selfScores[5] = 0; },
    (input: typeof complete) => { input.markedPlayerScores[5] = 0; },
    (input: typeof complete) => { input.statistics[5].greenInRegulation = null; },
    (input: typeof complete) => { input.statistics[5].putts = null; },
    (input: typeof complete) => { input.statistics[5].fairwayHit = null; },
  ]) {
    const input = structuredClone(complete);
    mutate(input);
    expect(findInitialScorecardHoleIndex(input)).toBe(5);
  }
});
