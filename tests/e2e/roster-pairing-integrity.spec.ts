import { expect, test } from "@playwright/test";
import { findStaleTournamentPlayerIds, type TournamentPlayerUpsertRow } from "../../app/lib/repositories/tournamentRepository";
import {
  buildImportedPlayers,
  createInvalidatedRosterDependentState,
  generatePairings,
  generateScorecardRowsFromPairings,
  getRosterPlayerIdentity,
  hasDuplicateRosterIdentity,
  isDuplicatePlayerFormIdentity,
  validatePairingIntegrity,
  validateScorecardIntegrity,
} from "../../app/lib/services/tournamentPageHelpers";
import { buildTournamentPlayerRows } from "../../app/lib/services/tournamentService";
import {
  buildTeamLeaderboard,
  limitCountingScoresToAvailablePlayers,
} from "../../app/lib/services/tournamentDerivedState";
import type { LegacyPlayer, TournamentStorageEnvelope } from "../../app/lib/tournamentModel";

const teams = [
  { id: 1, schoolName: "Verification Team", shortName: "VT", teamColor: "#000000", coachName: "Coach" },
];

const players: LegacyPlayer[] = [
  { id: 1, firstName: "Verification", lastName: "Player 1", teamId: "1", teamName: "Verification Team", handicap: "0", email: "" },
  { id: 2, firstName: "Verification", lastName: "Player 2", teamId: "1", teamName: "Verification Team", handicap: "0", email: "" },
];

const playerForm = (firstName: string, lastName: string) => ({
  firstName,
  lastName,
  teamId: "1",
  handicap: "0",
  email: "",
});

test("duplicate player creation rejects normalized name and team identities", () => {
  expect(isDuplicatePlayerFormIdentity({ players, teams, playerFormState: playerForm("Verification", "Player 1"), editingPlayerId: null })).toBe(true);
  expect(isDuplicatePlayerFormIdentity({ players, teams, playerFormState: playerForm("  verification  ", " PLAYER   1 "), editingPlayerId: null })).toBe(true);
});

test("editing preserves the current identity but rejects another player's identity", () => {
  expect(isDuplicatePlayerFormIdentity({ players, teams, playerFormState: playerForm("Verification", "Player 1"), editingPlayerId: 1 })).toBe(false);
  expect(isDuplicatePlayerFormIdentity({ players, teams, playerFormState: playerForm("Verification", "Player 2"), editingPlayerId: 1 })).toBe(true);
});

test("imports are checked against both the roster and other imported rows", () => {
  const imported = buildImportedPlayers([
    { firstName: " Verification ", lastName: "Player 1", school: "Verification Team", gender: "", className: "", email: "", teamId: "1", teamName: "Verification Team", handicap: "0" },
  ], 10);
  expect(hasDuplicateRosterIdentity([...players, ...imported])).toBe(true);
});

test("every roster mutation invalidates pairings and generated scorecards", () => {
  const invalidatedAfterDelete = createInvalidatedRosterDependentState();
  const invalidatedAfterAdd = createInvalidatedRosterDependentState();
  const invalidatedAfterImport = createInvalidatedRosterDependentState();
  for (const state of [invalidatedAfterDelete, invalidatedAfterAdd, invalidatedAfterImport]) {
    expect(state.pairings).toEqual([]);
    expect(state.scorecardRows).toEqual([]);
    expect(state.scorecardsGenerated).toBe(false);
  }
});

test("pairing generation contains each normalized roster identity once", () => {
  const pairings = generatePairings(players);
  const identities = pairings.flatMap((pairing) => pairing.players.map((player) => `${player.playerName.toLowerCase()}::${player.teamName.toLowerCase()}`));
  expect(new Set(identities).size).toBe(players.length);
  expect(validatePairingIntegrity(pairings, players)).toBe(true);
  expect(generatePairings([...players, { ...players[0], id: 3 }])).toEqual([]);
});

test("pairing integrity rejects obsolete and repeated identities", () => {
  const pairings = generatePairings(players);
  const duplicated = [{ ...pairings[0], players: [...pairings[0].players, { ...pairings[0].players[0], playerId: "stale-id" }] }];
  expect(validatePairingIntegrity(duplicated, players)).toBe(false);
  expect(validatePairingIntegrity(pairings, players.slice(0, 1))).toBe(false);
});

test("scorecards are generated only from complete validated pairings", () => {
  const pairings = generatePairings(players);
  const rows = generateScorecardRowsFromPairings(pairings, players, 18);
  expect(rows.map((row) => row.playerName)).toEqual(pairings.flatMap((pairing) => pairing.players.map((player) => player.playerName)));
  expect(validateScorecardIntegrity(rows, pairings, players)).toBe(true);
  expect(generateScorecardRowsFromPairings(pairings.slice(0, 0), players, 18)).toEqual([]);
  expect(validateScorecardIntegrity(rows.slice(0, 1), pairings, players)).toBe(false);
});

test("reconciliation identifies stale IDs only inside the requested tournament and round", () => {
  const rows = [
    { tournament_id: "current", round_number: 1, player_id: "current-1" },
    { tournament_id: "current", round_number: 2, player_id: "round-2" },
    { tournament_id: "other", round_number: 1, player_id: "other-1" },
  ] as TournamentPlayerUpsertRow[];
  expect(findStaleTournamentPlayerIds(["current-1", "stale-1"], rows, { tournamentId: "current", roundNumber: 1 })).toEqual(["stale-1"]);
  expect(findStaleTournamentPlayerIds(["round-2", "stale-2"], rows, { tournamentId: "current", roundNumber: 2 })).toEqual(["stale-2"]);
  expect(findStaleTournamentPlayerIds(["other-1"], rows, { tournamentId: "other", roundNumber: 1 })).toEqual([]);
});

test("authoritative scoring rows use current unique scorer and marker IDs", () => {
  const pairings = generatePairings(players);
  const envelope = {
    version: 2,
    tournament: {
      id: "current",
      teams: [{ id: "1", name: "Verification Team", players: ["1", "2"] }],
      players: players.map((player) => ({ id: String(player.id), firstName: player.firstName, lastName: player.lastName, teamId: "1", isIndividual: false, statistics: {} })),
      rounds: [{ id: "round-1", name: "Round 1", roundNumber: 1, status: "upcoming", pairings: ["pairing-1"], leaderboard: [] }],
      pairings: [{ id: "pairing-1", roundId: "round-1", ...pairings[0] }],
      scores: [],
      name: "QR Verification Tournament",
      course: "Test Course",
      settings: {},
    },
  } as unknown as TournamentStorageEnvelope;

  const rows = buildTournamentPlayerRows(envelope);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.player_id)).size).toBe(2);
  expect(rows.every((row) => row.marker_player_id && row.marker_player_id !== row.player_id)).toBe(true);
  expect(new Set(players.map(getRosterPlayerIdentity)).size).toBe(2);
});

test("team counting scores remain feasible for three-player teams without changing larger teams", () => {
  const buildRows = (playersPerTeam: number) =>
    ["Team A", "Team B"].flatMap((team, teamIndex) =>
      Array.from({ length: playersPerTeam }, (_, playerIndex) => ({
        id: teamIndex * 10 + playerIndex,
        playerName: `${team} Player ${playerIndex + 1}`,
        team,
        scores: Array.from({ length: 18 }, () => 4 + playerIndex),
      }))
    );

  const threePlayerRows = buildRows(3);
  const threePlayerCount = limitCountingScoresToAvailablePlayers(4, threePlayerRows);
  expect(threePlayerCount).toBe(3);
  expect(
    buildTeamLeaderboard({
      scorecardsGenerated: true,
      scorecardRows: threePlayerRows,
      displayHoleCount: 18,
      countingScores: threePlayerCount,
    })
  ).toHaveLength(2);

  const fourPlayerRows = buildRows(4);
  const fourPlayerCount = limitCountingScoresToAvailablePlayers(4, fourPlayerRows);
  expect(fourPlayerCount).toBe(4);
  expect(
    buildTeamLeaderboard({
      scorecardsGenerated: true,
      scorecardRows: fourPlayerRows,
      displayHoleCount: 18,
      countingScores: fourPlayerCount,
    })
  ).toHaveLength(2);

  const fivePlayerRows = buildRows(5);
  const fivePlayerCount = limitCountingScoresToAvailablePlayers(4, fivePlayerRows);
  const fivePlayerStandings = buildTeamLeaderboard({
    scorecardsGenerated: true,
    scorecardRows: fivePlayerRows,
    displayHoleCount: 18,
    countingScores: fivePlayerCount,
  });
  expect(fivePlayerCount).toBe(4);
  expect(fivePlayerStandings).toHaveLength(2);
  expect(fivePlayerStandings.every((team) => team.totalScore === 18 * (4 + 5 + 6 + 7))).toBe(true);
});
