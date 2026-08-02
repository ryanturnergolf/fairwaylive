import { saveScoreEntry, type SaveScoreEntryInput } from "../repositories/scoreRepository";
import {
  saveScoreHoleEntries,
  type SaveScoreHoleEntryInput,
} from "../repositories/statisticsRepository";
import {
  buildTournamentStorageEnvelope,
  type StoredTournament,
} from "../tournamentStorage";
import type { TournamentStorageEnvelope } from "../tournamentModel";
import { requireQaSeedAccess } from "./qaSeedAccessService";
import { syncTournamentPlayers, syncTournamentStateSnapshot } from "./tournamentService";

export const INCOMPLETE_TEST_TOURNAMENT_NAME = "Incomplete Test Tournament";
export const INCOMPLETE_TEST_PLAYER_IDS = ["incomplete-player-a", "incomplete-player-b"] as const;
export const INCOMPLETE_TEST_PARS = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4] as const;

const playerSeeds = [
  { id: INCOMPLETE_TEST_PLAYER_IDS[0], firstName: "Alex", lastName: "Morgan", teamId: "incomplete-team-a", teamName: "Test Team A" },
  { id: INCOMPLETE_TEST_PLAYER_IDS[1], firstName: "Jordan", lastName: "Lee", teamId: "incomplete-team-b", teamName: "Test Team B" },
] as const;

const buildScores = (offset: number) =>
  INCOMPLETE_TEST_PARS.map((par, index) => (index === 17 ? 0 : Math.max(1, par + ((index + offset) % 3) - 1)));

export type IncompleteTournamentSeed = {
  tournament: StoredTournament;
  envelope: TournamentStorageEnvelope;
  scoreEntries: SaveScoreEntryInput[];
  holeEntries: SaveScoreHoleEntryInput[];
};

export const buildIncompleteTournamentSeed = ({
  tournamentId,
  tournamentName = INCOMPLETE_TEST_TOURNAMENT_NAME,
}: {
  tournamentId: string;
  tournamentName?: string;
}): IncompleteTournamentSeed => {
  const playerScores = new Map(playerSeeds.map((player, index) => [player.id, buildScores(index)]));
  const teams = playerSeeds.map((player) => ({ id: player.teamId, name: player.teamName, players: [player.id] }));
  const players = playerSeeds.map((player) => ({
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    teamId: player.teamId,
    isIndividual: false,
    statistics: { teamName: player.teamName, handicap: "0", email: `${player.id}@example.test` },
  }));
  const pairingPlayers = playerSeeds.map((player) => ({
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    teamName: player.teamName,
  }));
  const tournament = {
    id: tournamentId,
    name: tournamentName,
    course: "Westfield Golf Club",
    date: "2026-07-20",
    city: "Westfield",
    state: "OH",
    rounds: "1",
    scoringFormat: "Stroke Play",
    status: "Test",
    settings: {
      date: "2026-07-20",
      city: "Westfield",
      state: "OH",
      rounds: 1,
      scoringFormat: "Stroke Play",
      status: "Test",
    },
  } satisfies StoredTournament;
  const uiState = {
    teams: playerSeeds.map((player, index) => ({
      id: index + 1,
      schoolName: player.teamName,
      shortName: `T${index + 1}`,
      teamColor: "#0B3D2E",
      coachName: "Test Coach",
    })),
    players: playerSeeds.map((player, index) => ({
      id: index + 1,
      firstName: player.firstName,
      lastName: player.lastName,
      teamId: player.teamId,
      teamName: player.teamName,
      handicap: "0",
      email: `${player.id}@example.test`,
    })),
    pairings: [{ groupNumber: 1, teeTime: "8:00 AM", startingHole: "1", players: pairingPlayers }],
    scorecards: {
      scorecardsGenerated: true,
      scorecardRows: playerSeeds.map((player, index) => ({
        id: index + 1,
        playerName: `${player.firstName} ${player.lastName}`,
        team: player.teamName,
        scores: [...(playerScores.get(player.id) ?? [])],
      })),
      roundSetup: { roundNumber: "1", startingHole: "1", numberOfHoles: "18", teeTime: "8:00 AM", countingScores: "2" },
    },
    clippdExportState: { tournamentId: "", tournamentKey: "", exportFormat: "Final Results CSV" },
    scoreboardImportState: {
      tournamentId: "",
      tournamentKey: "",
      options: { tournamentDetails: true, teams: true, players: true, courseSetup: true, scorecards: false, teeTimes: false, startingHoles: false },
    },
    autoRepairState: { sourceRound: "Round 1", targetRound: "Round 2", pairingOrder: "Worst to Best", teeTimeInterval: "8 minutes" },
  };
  const envelope = buildTournamentStorageEnvelope(
    tournamentId,
    tournamentName,
    tournament.course,
    uiState,
    tournament.settings,
    1
  );

  envelope.tournament.teams = teams;
  envelope.tournament.players = players;
  envelope.tournament.pairings = [{
    id: "incomplete-pairing-1",
    roundId: "round-1",
    groupNumber: 1,
    teeTime: "8:00 AM",
    startingHole: "1",
    players: pairingPlayers,
  }];
  envelope.tournament.rounds[0].pairings = ["incomplete-pairing-1"];
  envelope.tournament.scores = playerSeeds.flatMap((player, index) => {
    const marker = playerSeeds[(index + 1) % playerSeeds.length];
    const selfScores = playerScores.get(player.id) ?? [];
    const markedScores = playerScores.get(marker.id) ?? [];
    return [
      { playerId: player.id, roundId: "round-1", holeScores: [...selfScores], total: selfScores.reduce((sum, score) => sum + score, 0), status: "live" as const, enteredBy: "self" as const },
      { playerId: marker.id, roundId: "round-1", holeScores: [...markedScores], total: markedScores.reduce((sum, score) => sum + score, 0), status: "live" as const, enteredBy: "marker" as const },
    ];
  });

  const scoreEntries = playerSeeds.flatMap((scorer, scorerIndex) => {
    const marked = playerSeeds[(scorerIndex + 1) % playerSeeds.length];
    return [scorer, marked].map((scoreOwner) => {
      const holeScores = [...(playerScores.get(scoreOwner.id) ?? [])];
      return {
        tournamentId,
        roundNumber: 1,
        playerId: scoreOwner.id,
        enteredByPlayerId: scorer.id,
        holeScores,
        total: holeScores.reduce((sum, score) => sum + score, 0),
        entryStatus: "live",
        submittedAt: null,
      };
    });
  });
  const holeEntries = playerSeeds.flatMap((scorer, scorerIndex) => {
    const marked = playerSeeds[(scorerIndex + 1) % playerSeeds.length];
    return Array.from({ length: 17 }, (_, index) => index + 1).flatMap((holeNumber) => {
      const par = INCOMPLETE_TEST_PARS[holeNumber - 1];
      const selfScore = playerScores.get(scorer.id)?.[holeNumber - 1] ?? par;
      const markerScore = playerScores.get(marked.id)?.[holeNumber - 1] ?? par;
      return [
        {
          tournamentId,
          roundNumber: 1,
          playerId: scorer.id,
          enteredByPlayerId: scorer.id,
          markerForPlayerId: null,
          holeNumber,
          strokes: selfScore,
          fairwayHit: par === 3 ? null : (holeNumber + scorerIndex) % 2 === 0,
          greenInRegulation: (holeNumber + scorerIndex) % 3 !== 0,
          putts: 1 + ((holeNumber + scorerIndex) % 2),
          penaltyStrokes: null,
          entrySource: "self",
          entryStatus: "live",
        },
        {
          tournamentId,
          roundNumber: 1,
          playerId: marked.id,
          enteredByPlayerId: scorer.id,
          markerForPlayerId: marked.id,
          holeNumber,
          strokes: markerScore,
          fairwayHit: null,
          greenInRegulation: null,
          putts: null,
          penaltyStrokes: null,
          entrySource: "marker",
          entryStatus: "live",
        },
      ];
    });
  });

  return { tournament, envelope, scoreEntries, holeEntries };
};

export const persistIncompleteTournamentSeed = async (seed: IncompleteTournamentSeed) => {
  await requireQaSeedAccess();
  await syncTournamentPlayers(seed.envelope, 1);
  const snapshotSaved = await syncTournamentStateSnapshot({
    tournamentId: seed.tournament.id,
    localTournamentId: seed.tournament.id,
    envelope: seed.envelope,
  });
  if (!snapshotSaved) throw new Error("The tournament was created, but its incomplete test data could not be saved.");
  await Promise.all(seed.scoreEntries.map((entry) => saveScoreEntry(entry)));
  await saveScoreHoleEntries(seed.holeEntries);
};
