import { expect, test } from "@playwright/test";

const tournamentId = "e2e-tournament";
const baseUrl = "http://127.0.0.1:3100";
const tournamentsStorageKey = "clubhouse-hq-tournaments";
const tournamentStorageKey = `clubhouse-hq-tournament-${tournamentId}`;
const emptyHoleScores = Array.from({ length: 18 }, () => 0);

const storedTournament = {
  id: tournamentId,
  name: "E2E Persistence Invitational",
  course: "Playwright National",
  date: "2026-07-03",
  city: "Westfield",
  state: "OH",
  rounds: "1",
  scoringFormat: "Stroke Play",
  status: "Test",
  settings: {
    date: "2026-07-03",
    city: "Westfield",
    state: "OH",
    scoringFormat: "Stroke Play",
    status: "Test",
    rounds: 1,
  },
};

const uiState = {
  teams: [
    {
      id: 1,
      schoolName: "E2E University",
      shortName: "E2E",
      teamColor: "#0B3D2E",
      coachName: "Coach Test",
    },
  ],
  players: [
    {
      id: 1,
      firstName: "Ava",
      lastName: "Green",
      teamId: "team-1",
      teamName: "E2E University",
      handicap: "0",
      email: "ava.green@example.edu",
    },
    {
      id: 2,
      firstName: "Ben",
      lastName: "Marker",
      teamId: "team-1",
      teamName: "E2E University",
      handicap: "0",
      email: "ben.marker@example.edu",
    },
  ],
  pairings: [
    {
      groupNumber: 1,
      teeTime: "8:00 AM",
      startingHole: "1",
      players: [
        {
          playerId: "1",
          playerName: "Ava Green",
          teamName: "E2E University",
        },
        {
          playerId: "2",
          playerName: "Ben Marker",
          teamName: "E2E University",
        },
      ],
    },
  ],
  scorecards: {
    scorecardsGenerated: true,
    scorecardRows: [
      {
        id: 1,
        playerName: "Ava Green",
        team: "E2E University",
        scores: emptyHoleScores,
      },
      {
        id: 2,
        playerName: "Ben Marker",
        team: "E2E University",
        scores: emptyHoleScores,
      },
    ],
    roundSetup: {
      roundNumber: "1",
      startingHole: "1",
      numberOfHoles: "18",
      teeTime: "8:00 AM",
      countingScores: "1",
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
};

const tournamentEnvelope = {
  version: 2,
  tournament: {
    id: tournamentId,
    name: storedTournament.name,
    course: storedTournament.course,
    settings: storedTournament.settings,
    teams: [
      {
        id: "team-1",
        name: "E2E University",
        players: ["1", "2"],
      },
    ],
    players: [
      {
        id: "1",
        firstName: "Ava",
        lastName: "Green",
        teamId: "team-1",
        isIndividual: false,
        statistics: {
          teamName: "E2E University",
          email: "ava.green@example.edu",
        },
      },
      {
        id: "2",
        firstName: "Ben",
        lastName: "Marker",
        teamId: "team-1",
        isIndividual: false,
        statistics: {
          teamName: "E2E University",
          email: "ben.marker@example.edu",
        },
      },
    ],
    pairings: [
      {
        id: "pairing-1",
        roundId: "round-1",
        groupNumber: 1,
        teeTime: "8:00 AM",
        startingHole: "1",
        players: uiState.pairings[0].players,
      },
    ],
    scores: [],
    rounds: [
      {
        id: "round-1",
        name: "Round 1",
        roundNumber: 1,
        status: "upcoming",
        pairings: ["pairing-1"],
        leaderboard: [],
      },
    ],
  },
  uiState,
};

test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: baseUrl,
        localStorage: [
          {
            name: tournamentsStorageKey,
            value: JSON.stringify([storedTournament]),
          },
          {
            name: tournamentStorageKey,
            value: JSON.stringify(tournamentEnvelope),
          },
        ],
      },
    ],
  },
});

test("mobile scorecard saves scores and reloads them from localStorage", async ({ page }) => {
  await page.goto(`${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await expect(page).toHaveURL(`${baseUrl}/scorecard/1?tournamentId=${tournamentId}&pairing=1`);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), tournamentsStorageKey))
    .toContain(storedTournament.name);
  await expect(page.getByText("Mobile Scorecard")).toBeVisible();
  await expect(page.getByRole("heading", { name: storedTournament.name })).toBeVisible();

  const saveHoleButton = page.getByRole("button", { name: "Save Hole" });
  await expect(saveHoleButton).toBeDisabled();

  await page.getByLabel("Ava Green's Score").fill("4");
  await expect(saveHoleButton).toBeEnabled();
  await page.getByLabel("Ben Marker's Score").fill("5");
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("5");
  await saveHoleButton.click();

  await expect(page.getByText("Hole 2")).toBeVisible();

  await page.reload();

  await expect(page.getByText("Hole 2")).toBeVisible();
  await page.getByRole("button", { name: "Previous Hole" }).click();
  await expect(page.getByText("Hole 1")).toBeVisible();
  await expect(page.getByLabel("Ava Green's Score")).toHaveValue("4");
  await expect(page.getByLabel("Ben Marker's Score")).toHaveValue("5");
});
