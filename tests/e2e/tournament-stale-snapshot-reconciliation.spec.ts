import { expect, test } from "@playwright/test";
import {
  reconcileSnapshotWithDurableTournamentState,
} from "../../app/lib/services/tournamentService";
import type {
  TournamentPlayerRow,
  TournamentRoundReadRow,
  TournamentScorecardReadRow,
} from "../../app/lib/repositories/tournamentRepository";
import type { TournamentStorageEnvelope } from "../../app/lib/tournamentModel";

const tournamentId = "88888888-8888-4888-8888-888888888888";

const emptySnapshot = (): TournamentStorageEnvelope => ({
  version: 2,
  tournament: {
    id: tournamentId,
    name: "Durable Invitational",
    course: "Durable Club",
    settings: {
      rounds: 2,
      activeRoundNumber: 1,
      roundSetups: {
        "1": {
          roundNumber: "1",
          startingHole: "1",
          numberOfHoles: "18",
          teeTime: "8:00 AM",
          countingScores: "4",
        },
      },
    },
    teams: [{ id: "team-1", name: "Durable University", players: [] }],
    players: [],
    pairings: [],
    scores: [],
    rounds: [
      {
        id: "round-1",
        name: "Round 1",
        roundNumber: 1,
        status: "live",
        pairings: [],
        leaderboard: [],
      },
      {
        id: "round-2",
        name: "Round 2",
        roundNumber: 2,
        status: "upcoming",
        pairings: [],
        leaderboard: [],
      },
    ],
  },
  uiState: {
    teams: [
      {
        id: 1,
        schoolName: "Durable University",
        shortName: "DU",
        teamColor: "#0B3D2E",
        coachName: "",
      },
    ],
    players: [],
    pairings: [],
    scorecards: {
      scorecardsGenerated: false,
      scorecardRows: [],
      roundSetup: {
        roundNumber: "1",
        startingHole: "1",
        numberOfHoles: "18",
        teeTime: "8:00 AM",
        countingScores: "4",
      },
    },
    clippdExportState: {
      tournamentId: "",
      tournamentKey: "",
      exportFormat: "Final Results CSV",
    },
    scoreboardImportState: {
      tournamentId: "",
      tournamentKey: "",
      options: {
        tournamentDetails: true,
        teams: true,
        players: true,
        courseSetup: true,
        scorecards: false,
        teeTimes: false,
        startingHoles: false,
      },
    },
    autoRepairState: {
      sourceRound: "Round 1",
      targetRound: "Round 2",
      pairingOrder: "Worst to Best",
      teeTimeInterval: "8 minutes",
    },
  },
});

const playerRows = (roundNumber = 1): TournamentPlayerRow[] => [
  {
    id: `row-alex-${roundNumber}`,
    tournament_id: tournamentId,
    player_id: "player-alex",
    player_name: "Alex Morgan",
    team_id: null,
    team_name: null,
    round_number: roundNumber,
    group_number: 1,
    tee_number: 1,
    starting_hole: 1,
    marker_player_id: "player-jordan",
    is_individual: false,
    position: 1,
    status: "active",
    created_at: null,
    updated_at: null,
  },
  {
    id: `row-jordan-${roundNumber}`,
    tournament_id: tournamentId,
    player_id: "player-jordan",
    player_name: "Jordan Lee",
    team_id: null,
    team_name: null,
    round_number: roundNumber,
    group_number: 1,
    tee_number: 1,
    starting_hole: 1,
    marker_player_id: "player-alex",
    is_individual: false,
    position: 2,
    status: "active",
    created_at: null,
    updated_at: null,
  },
];

const durableRound = (
  roundNumber = 1,
  holeCount: 9 | 18 = 18
): TournamentRoundReadRow => ({
  tournament_id: tournamentId,
  round_number: roundNumber,
  hole_count: holeCount,
  qualifying_session_id: "99999999-9999-4999-8999-999999999999",
});

const durableScorecards = (
  roundNumber = 1,
  holeCount: 9 | 18 = 18
): TournamentScorecardReadRow[] =>
  playerRows(roundNumber).map((player) => ({
    tournament_id: tournamentId,
    round_number: roundNumber,
    player_id: player.player_id,
    hole_count: holeCount,
    status: "generated",
  }));

const tournament = {
  id: tournamentId,
  name: "Durable Invitational",
  date: "2026-08-01",
  course: "Durable Club",
  city: "",
  state: "",
  rounds: "2",
  scoringFormat: "Stroke Play",
  status: "Live",
};

test("durable Tournament Engine collections enrich an empty cached snapshot", () => {
  const reconciled = reconcileSnapshotWithDurableTournamentState({
    envelope: emptySnapshot(),
    tournament,
    roundNumber: 1,
    playerRows: playerRows(),
    durableRound: durableRound(),
    durableScorecards: durableScorecards(),
  });

  expect(reconciled?.tournament.players.map((player) => player.id)).toEqual([
    "player-alex",
    "player-jordan",
  ]);
  expect(reconciled?.tournament.teams).toEqual([
    {
      id: "team-1",
      name: "Durable University",
      players: ["player-alex", "player-jordan"],
    },
  ]);
  expect(reconciled?.uiState.players).toHaveLength(2);
  expect(reconciled?.uiState.pairings[0]?.players.map((player) => player.playerId)).toEqual([
    "player-alex",
    "player-jordan",
  ]);
  expect(reconciled?.uiState.scorecards.scorecardsGenerated).toBe(true);
  expect(reconciled?.uiState.scorecards.scorecardRows).toHaveLength(2);
});

test("complete snapshot presentation and saved scores remain unchanged", () => {
  const first = reconcileSnapshotWithDurableTournamentState({
    envelope: emptySnapshot(),
    tournament,
    roundNumber: 1,
    playerRows: playerRows(),
    durableRound: durableRound(),
    durableScorecards: durableScorecards(),
  });
  if (!first) throw new Error("Expected a reconciled snapshot.");
  first.uiState.scorecards.scorecardRows[0].scores[0] = 3;

  const second = reconcileSnapshotWithDurableTournamentState({
    envelope: first,
    tournament,
    roundNumber: 1,
    playerRows: playerRows(),
    durableRound: durableRound(),
    durableScorecards: durableScorecards(),
  });

  expect(second).toBe(first);
  expect(second?.uiState.scorecards.scorecardRows[0].scores[0]).toBe(3);
});

test("legacy snapshot IDs remain complete when durable identities match by name and team", () => {
  const snapshot = emptySnapshot();
  snapshot.tournament.players = [
    {
      id: "1",
      firstName: "Alex",
      lastName: "Morgan",
      teamId: "team-1",
      isIndividual: false,
      statistics: { teamName: "Durable University" },
    },
    {
      id: "2",
      firstName: "Jordan",
      lastName: "Lee",
      teamId: "team-1",
      isIndividual: false,
      statistics: { teamName: "Durable University" },
    },
  ];
  snapshot.tournament.pairings = [
    {
      id: "pairing-1",
      roundId: "round-1",
      groupNumber: 1,
      teeTime: "8:00 AM",
      startingHole: "1",
      players: [
        {
          playerId: "player-alex",
          playerName: "Alex Morgan",
          teamName: "Durable University",
        },
        {
          playerId: "player-jordan",
          playerName: "Jordan Lee",
          teamName: "Durable University",
        },
      ],
    },
  ];
  snapshot.uiState.players = [
    {
      id: 1,
      firstName: "Alex",
      lastName: "Morgan",
      teamId: "team-1",
      teamName: "Durable University",
      handicap: "0",
      email: "",
    },
    {
      id: 2,
      firstName: "Jordan",
      lastName: "Lee",
      teamId: "team-1",
      teamName: "Durable University",
      handicap: "0",
      email: "",
    },
  ];
  snapshot.uiState.pairings = [
    {
      groupNumber: 1,
      teeTime: "8:00 AM",
      startingHole: "1",
      players: snapshot.tournament.pairings[0].players,
    },
  ];
  snapshot.uiState.scorecards.scorecardsGenerated = true;
  snapshot.uiState.scorecards.scorecardRows = [
    {
      id: 1,
      playerName: "Alex Morgan",
      team: "Durable University",
      scores: Array.from({ length: 18 }, () => 0),
    },
    {
      id: 2,
      playerName: "Jordan Lee",
      team: "Durable University",
      scores: Array.from({ length: 18 }, () => 0),
    },
  ];
  const rows = playerRows().map((row) => ({
    ...row,
    team_name: "Durable University",
  }));

  const reconciled = reconcileSnapshotWithDurableTournamentState({
    envelope: snapshot,
    tournament,
    roundNumber: 1,
    playerRows: rows,
    durableRound: null,
    durableScorecards: [],
  });

  expect(reconciled).toBe(snapshot);
  expect(reconciled?.uiState.scorecards.scorecardsGenerated).toBe(true);
});

test("durable round metadata fills a stale snapshot missing the active segment setup", () => {
  const reconciled = reconcileSnapshotWithDurableTournamentState({
    envelope: emptySnapshot(),
    tournament,
    roundNumber: 2,
    playerRows: playerRows(2),
    durableRound: durableRound(2, 9),
    durableScorecards: durableScorecards(2, 9),
  });

  expect(reconciled?.tournament.settings.activeRoundNumber).toBe(2);
  expect(reconciled?.tournament.settings.roundSetups?.["2"]?.numberOfHoles).toBe("9");
  expect(reconciled?.uiState.scorecards.roundSetup).toMatchObject({
    roundNumber: "2",
    numberOfHoles: "9",
  });
  expect(reconciled?.uiState.scorecards.scorecardRows[0].scores).toHaveLength(9);
});
