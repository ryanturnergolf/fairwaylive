import { expect, test } from "@playwright/test";
import type { QualifyingSession } from "../../app/lib/qualifyingModel";
import type { TournamentPlayerRow } from "../../app/lib/repositories/tournamentRepository";
import {
  buildTestQualifierDraft,
  buildTestQualifierScoringSeed,
  qaSeedTemplates,
  QA_SEED_TEST_QUALIFIER_ID,
  runQaSeedTemplate,
  type QaSeedDependencies,
} from "../../app/lib/services/qaSeedTemplateService";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const qualifyingSessionId = "22222222-2222-4222-8222-222222222222";

const buildPlayers = (): TournamentPlayerRow[] => {
  const names = ["Alex Morgan", "Jordan Lee", "Sam Carter", "Avery Brooks", "Cam Reed", "Ryan Turner"];
  return names.map((playerName, index) => {
    const groupStart = index < 3 ? 0 : 3;
    const markerIndex = groupStart + ((index - groupStart + 1) % 3);
    return {
      id: `row-${index + 1}`,
      tournament_id: tournamentId,
      player_id: `player-${index + 1}`,
      player_name: playerName,
      team_id: null,
      team_name: null,
      round_number: 1,
      group_number: index < 3 ? 1 : 2,
      tee_number: index < 3 ? 1 : 2,
      starting_hole: 1,
      marker_player_id: `player-${markerIndex + 1}`,
      is_individual: true,
      position: index + 1,
      status: "active",
      created_at: null,
      updated_at: null,
    };
  });
};

test("QA template registry exposes only the Phase 1 qualifier template", () => {
  expect(qaSeedTemplates).toEqual([
    expect.objectContaining({
      id: QA_SEED_TEST_QUALIFIER_ID,
      label: "Seed Test Qualifier",
    }),
  ]);
});

test("Seed Test Qualifier draft is a deterministic nine-hole reciprocal event", () => {
  const draft = buildTestQualifierDraft("2026-07-26T12:00:00.000Z");
  expect(draft).toMatchObject({
    name: "QA Test Qualifier 2026-07-26T12:00:00.000Z",
    rosterType: "men",
    scoringMode: "reciprocal",
  });
  expect(draft.selectedPlayers).toHaveLength(6);
  expect(draft.groups).toHaveLength(2);
  expect(draft.groups.flatMap((group) => group.playerIds)).toHaveLength(6);
  expect(new Set(draft.groups.flatMap((group) => group.playerIds)).size).toBe(6);
  expect(draft.days).toEqual([
    expect.objectContaining({
      dayNumber: 1,
      holesTotal: 9,
      startingHole: 1,
    }),
  ]);
});

test("seed payload completes holes one through eight and leaves hole nine untouched", () => {
  const players = buildPlayers();
  const seed = buildTestQualifierScoringSeed({ tournamentId, players });

  expect(seed.scoreEntries).toHaveLength(12);
  expect(
    new Set(
      seed.scoreEntries.map(
        (entry) =>
          `${entry.tournamentId}:${entry.roundNumber}:${entry.playerId}:${entry.enteredByPlayerId}`
      )
    ).size
  ).toBe(12);
  for (const entry of seed.scoreEntries) {
    expect(entry.holeScores).toHaveLength(9);
    expect(entry.holeScores.slice(0, 8).every((score) => score > 0)).toBe(true);
    expect(entry.holeScores[8]).toBe(0);
    expect(entry.entryStatus).toBe("live");
    expect(entry.submittedAt).toBeNull();
  }

  expect(seed.holeEntries).toHaveLength(96);
  expect(seed.holeEntries.some((entry) => entry.holeNumber === 9)).toBe(false);
  expect(
    new Set(
      seed.holeEntries.map(
        (entry) =>
          `${entry.tournamentId}:${entry.roundNumber}:${entry.playerId}:${entry.enteredByPlayerId}:${entry.holeNumber}`
      )
    ).size
  ).toBe(96);

  const selfStatistics = seed.holeEntries.filter(
    (entry) => entry.playerId === entry.enteredByPlayerId
  );
  const markerEntries = seed.holeEntries.filter(
    (entry) => entry.playerId !== entry.enteredByPlayerId
  );
  expect(selfStatistics).toHaveLength(48);
  expect(markerEntries).toHaveLength(48);
  expect(
    selfStatistics
      .filter((entry) => entry.holeNumber === 3 || entry.holeNumber === 7)
      .every((entry) => entry.fairwayHit === null)
  ).toBe(true);
  expect(
    selfStatistics
      .filter((entry) => entry.holeNumber !== 3 && entry.holeNumber !== 7)
      .every(
        (entry) =>
          typeof entry.fairwayHit === "boolean" &&
          typeof entry.greenInRegulation === "boolean" &&
          typeof entry.putts === "number"
      )
  ).toBe(true);
  expect(
    markerEntries.every(
      (entry) =>
        entry.fairwayHit === null &&
        entry.greenInRegulation === null &&
        entry.putts === null
    )
  ).toBe(true);
});

test("QA orchestration delegates to certified qualifying lifecycle and persistence boundaries", async () => {
  const players = buildPlayers();
  const calls: string[] = [];
  const scoreKeys: string[] = [];
  let holeEntryCount = 0;
  let clock = 1000;
  const session: QualifyingSession = {
    id: qualifyingSessionId,
    tournamentId: null,
    ownerId: "coach",
    name: "QA Test Qualifier",
    rosterType: "men",
    scoringMode: "reciprocal",
    status: "draft",
    selectedPlayers: [],
    groups: [],
    finalizedAt: null,
    finalizedBy: null,
    createdAt: null,
    updatedAt: null,
  };
  const dependencies = {
    authorize: async () => {
      calls.push("authorize");
    },
    createDraft: async () => {
      calls.push("create");
      return session;
    },
    provision: async () => {
      calls.push("provision");
      return {
        qualifyingSessionId,
        tournamentId,
        status: "provisioned" as const,
        participantCount: 6,
        roundCount: 1,
        tournamentPlayerCount: 6,
        reusedTournament: false,
      };
    },
    activate: async () => {
      calls.push("activate");
      return {
        qualifyingSessionId,
        tournamentId,
        status: "active" as const,
        pairingCount: 6,
        scorecardCount: 6,
        reusedActivation: false,
        readiness: {
          playersReady: true,
          roundsReady: true,
          pairingsReady: true,
          scorecardsReady: true,
        },
      };
    },
    loadTournamentPlayers: async () => {
      calls.push("load-players");
      return players;
    },
    saveScore: async (entry) => {
      calls.push("save-score");
      scoreKeys.push(`${entry.playerId}:${entry.enteredByPlayerId}`);
      return {} as never;
    },
    saveHoleEntries: async (entries) => {
      calls.push("save-statistics");
      holeEntryCount = entries.length;
      return [] as never;
    },
    ensureAccessCode: async () => {
      calls.push("ensure-access");
      return { code: "QATEST" };
    },
    now: () => {
      clock += 50;
      return clock;
    },
  } satisfies QaSeedDependencies;

  const result = await runQaSeedTemplate(QA_SEED_TEST_QUALIFIER_ID, dependencies);

  expect(calls.slice(0, 5)).toEqual(["authorize", "create", "provision", "activate", "load-players"]);
  expect(calls.filter((call) => call === "save-score")).toHaveLength(12);
  expect(calls.at(-2)).toBe("save-statistics");
  expect(calls.at(-1)).toBe("ensure-access");
  expect(new Set(scoreKeys).size).toBe(12);
  expect(holeEntryCount).toBe(96);
  expect(result).toMatchObject({
    templateId: QA_SEED_TEST_QUALIFIER_ID,
    qualifyingSessionId,
    tournamentId,
    qualifyingCode: "QATEST",
    playerCount: 6,
    pairingCount: 6,
    scorecardCount: 6,
    seededHoleCount: 8,
  });
});

test("authenticated dashboard labels the QA-only seed action clearly", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "clubhouse-hq-coach-auth",
      JSON.stringify({
        access_token: "header.payload.signature",
        refresh_token: "refresh",
        token_type: "bearer",
        expires_at: 4102444800,
        user: { id: "coach", is_anonymous: false },
      })
    );
  });
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "coach", is_anonymous: false }),
    })
  );
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Developer / QA", { exact: true })).toBeVisible();
  await expect(page.getByText(/development and testing only/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Seed Test Qualifier" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Seed Test Tournament" })).toBeVisible();
});
