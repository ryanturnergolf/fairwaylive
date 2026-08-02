import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CreateQualifyingSessionInput } from "../../app/lib/qualifyingModel";
import {
  autoBalanceQualifyingGroups,
  validateQualifyingCreation,
} from "../../app/lib/services/qualifyingCreationService";
import {
  buildQualifyingRosterPlayers,
  selectCurrentActiveRosterSeason,
} from "../../app/lib/services/rosterFoundationService";
import { routeValidCoachSession } from "./authSessionTestHelper";

test.beforeEach(async ({ page }) => {
  await routeValidCoachSession(page);
});

const coachId = "88888888-8888-4888-8888-888888888888";
const encodeJwtPart = (value: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encodeJwtPart({ alg: "HS256", typ: "JWT" })}.${encodeJwtPart({
  sub: coachId,
  role: "authenticated",
  exp: 4102444800,
})}.signature`;

const installCoachSession = (page: Page) =>
  page.addInitScript(({ token, userId }) => {
    window.localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
      access_token: token,
      refresh_token: "qualifying-refresh-token",
      token_type: "bearer",
      expires_in: 1832244800,
      expires_at: 4102444800,
      user: {
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: "coach@example.test",
        app_metadata: {},
        user_metadata: {},
        is_anonymous: false,
      },
    }));
  }, { token: accessToken, userId: coachId });

const seasonId = "22222222-2222-4222-8222-222222222222";
const menPlayerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const womenPlayerIds = [
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
];
const statisticVersions = {
  fairway_hit: "20000000-0000-4000-8000-000000000001",
  green_in_regulation: "20000000-0000-4000-8000-000000000002",
  putts: "20000000-0000-4000-8000-000000000003",
  penalty_strokes: "20000000-0000-4000-8000-000000000004",
};

const routeDurableRosters = async (page: Page) => {
  const now = "2026-08-02T12:00:00.000Z";
  const seasons = [{ id: seasonId, owner_id: coachId, name: "2026-2027", starts_on: "2026-08-01", ends_on: "2027-06-30", status: "active", created_at: now, updated_at: now }];
  const players = [
    { id: menPlayerId, owner_id: coachId, source_player_id: null, first_name: "Real", last_name: "Man", preferred_name: null, roster_type: "men", status: "active", archived_at: null, created_at: now, updated_at: now },
    { id: womenPlayerIds[0], owner_id: coachId, source_player_id: null, first_name: "Real", last_name: "Woman", preferred_name: null, roster_type: "women", status: "active", archived_at: null, created_at: now, updated_at: now },
    { id: womenPlayerIds[1], owner_id: coachId, source_player_id: null, first_name: "Incoming", last_name: "Player", preferred_name: "Preferred Player", roster_type: "women", status: "incoming", archived_at: null, created_at: now, updated_at: now },
  ];
  const memberships = players.map((player, index) => ({ id: `dddddddd-dddd-4ddd-8ddd-ddddddddddd${index}`, owner_id: coachId, season_id: seasonId, roster_player_id: player.id, status: index === 2 ? "incoming" : "active", class_year: index === 2 ? "Freshman" : "Senior", created_at: now, updated_at: now }));
  await page.route("**/rest/v1/**", (route) => {
    const table = new URL(route.request().url()).pathname.split("/").at(-1);
    if (table === "seasons") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(seasons) });
    if (table === "roster_players") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(players) });
    if (table === "season_roster_memberships") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(memberships) });
    if (table === "statistic_definitions") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(Object.entries(statisticVersions).map(([key], index) => ({
      id: `10000000-0000-4000-8000-00000000000${index + 1}`,
      owner_id: null,
      key,
      name: key,
      description: null,
      input_type: key === "putts" || key === "penalty_strokes" ? "bounded_number" : "yes_no",
      is_built_in: true,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))) });
    if (table === "statistic_definition_versions") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(Object.entries(statisticVersions).map(([key, id], index) => ({
      id,
      definition_id: `10000000-0000-4000-8000-00000000000${index + 1}`,
      owner_id: null,
      version: 1,
      name: ({ fairway_hit: "Fairway Hit", green_in_regulation: "Green in Regulation", putts: "Putts", penalty_strokes: "Penalty Strokes" } as Record<string, string>)[key],
      description: null,
      input_type: key === "putts" || key === "penalty_strokes" ? "bounded_number" : "yes_no",
      configuration: {},
      applicability: {},
      created_at: now,
    }))) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
};

const foundationResponse = (input: CreateQualifyingSessionInput) => ({
  sessions: [{
    session: {
      id: "11111111-1111-4111-8111-111111111111",
      tournamentId: null,
      ownerId: coachId,
      name: input.name,
      rosterType: input.rosterType,
      scoringMode: input.scoringMode,
      status: "draft",
      selectedPlayers: input.selectedPlayers,
      groups: input.groups,
      createdAt: "2026-07-26T12:00:00.000Z",
      updatedAt: "2026-07-26T12:00:00.000Z",
    },
    days: input.days.map((day) => ({
      id: `day-${day.dayNumber}`,
      qualifyingSessionId: "11111111-1111-4111-8111-111111111111",
      ...day,
      createdAt: "2026-07-26T12:00:00.000Z",
      updatedAt: "2026-07-26T12:00:00.000Z",
    })),
    rounds: [],
    scorerAssignments: [],
  }],
});

test("Coach Dashboard exposes Qualifying and Create Qualifying entry points", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.goto("/coach-dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Qualifying", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Create Qualifying/ })).toBeVisible();
});

test("qualifying wizard validates, configures, reviews, saves, and reloads a draft", async ({ page }) => {
  await installCoachSession(page);
  await routeDurableRosters(page);
  let savedInput: CreateQualifyingSessionInput | null = null;
  await page.route("**/api/qualifying-sessions", async (route) => {
    if (route.request().method() === "POST") {
      savedInput = route.request().postDataJSON() as CreateQualifyingSessionInput;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(savedInput ? foundationResponse(savedInput) : { sessions: [] }),
    });
  });

  await page.goto("/coach-dashboard/qualifying-manager/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("p[role='alert']")).toContainText("Qualifying name is required");

  await page.getByLabel("Qualifying name").fill("Fall Team Qualifying");
  await page.getByLabel("Women's roster").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("0 selected")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("p[role='alert']")).toContainText("Select at least one player");
  await page.getByRole("button", { name: "Select All" }).click();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Number of qualifying days").fill("2");
  await page.getByLabel("Day 1 date").fill("2026-08-01");
  await page.getByRole("button", { name: "27-hole preset" }).first().click();
  await page.getByLabel("Day 1 course").fill("North Course");
  await page.getByLabel("Day 1 tee").fill("Gold");
  await page.getByLabel("Day 2 date").fill("2026-08-02");
  await page.getByRole("button", { name: "18-hole preset" }).nth(1).click();
  await page.getByLabel("Day 2 course").fill("South Course");
  await page.getByLabel("Day 2 tee").fill("Blue");
  await page.getByLabel("Day 2 Round 1 start hole").fill("10");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("p[role='alert']")).toContainText("Empty groups");
  await page.getByLabel("Number of groups").fill("2");
  await page.getByRole("button", { name: "Auto-balance" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Designated Group Scorer").check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Record During Qualifying" })).toBeVisible();
  await expect(page.getByLabel("Fairway Hit")).toBeChecked();
  await expect(page.getByLabel("Green in Regulation")).toBeChecked();
  await expect(page.getByLabel("Putts")).toBeChecked();
  await expect(page.getByLabel("Penalty Strokes")).not.toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Review qualifying" })).toBeVisible();
  await expect(page.getByText("Fall Team Qualifying", { exact: true })).toBeVisible();
  await expect(page.getByText("Women's roster", { exact: true })).toBeVisible();
  await expect(page.getByText("Round 1: Day 1, Round 1, holes 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18")).toBeVisible();
  await expect(page.getByText("Round 2: Day 1, Round 2, holes 1, 2, 3, 4, 5, 6, 7, 8, 9")).toBeVisible();
  await expect(page.getByText("Round 3: Day 2, Day 2, holes 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9")).toBeVisible();
  await expect(page.getByText("Designated Group Scorer", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save Qualifying" }).click();
  await expect(page).toHaveURL(/\/coach-dashboard\/qualifying-manager\?created=1$/);
  await expect(page.getByRole("heading", { name: "Fall Team Qualifying" })).toBeVisible();
  await expect(page.getByText("Women's · 2 players · 2 days")).toBeVisible();

  expect(savedInput).toMatchObject({
    name: "Fall Team Qualifying",
    rosterType: "women",
    scoringMode: "designated_scorer",
  });
  expect(savedInput?.selectedPlayers).toHaveLength(2);
  expect(savedInput?.selectedPlayers.map((player) => player.rosterPlayerId).sort()).toEqual([...womenPlayerIds].sort());
  expect(savedInput?.groups).toHaveLength(2);
  expect(savedInput?.days).toHaveLength(2);
  expect(savedInput?.statisticDefinitionVersionIds).toEqual([
    statisticVersions.fairway_hit,
    statisticVersions.green_in_regulation,
    statisticVersions.putts,
  ]);
});

test("creation validation rejects duplicates, empty groups, and incomplete assignments", () => {
  const players = [
    { id: menPlayerId, rosterPlayerId: menPlayerId, name: "Real Man", rosterType: "men" as const, classYear: "Senior" },
    { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", rosterPlayerId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", name: "Second Man", rosterType: "men" as const, classYear: "Junior" },
  ];
  const valid: CreateQualifyingSessionInput = {
    name: "Men's Qualifying",
    rosterType: "men",
    scoringMode: "reciprocal",
    selectedPlayers: players,
    groups: autoBalanceQualifyingGroups(players, 1),
    days: [{
      dayNumber: 1,
      playDate: "2026-08-01",
      holesTotal: 18,
      courseName: "Home Course",
      teeName: "Blue",
      startingHole: 1,
    }],
  };
  expect(validateQualifyingCreation(valid)).toEqual({ ok: true, errors: [] });
  expect(validateQualifyingCreation({
    ...valid,
    selectedPlayers: [players[0], players[0]],
  }).errors).toContain("Duplicate players are not allowed.");
  expect(validateQualifyingCreation({
    ...valid,
    groups: [{ id: "group-1", name: "Group 1", playerIds: [] }],
  }).errors).toContain("Empty groups are not allowed.");
  expect(validateQualifyingCreation({
    ...valid,
    groups: [{ id: "group-1", name: "Group 1", playerIds: [players[0].id] }],
  }).errors).toContain("Assign every selected player to exactly one group.");
  expect(validateQualifyingCreation({
    ...valid,
    days: [{ ...valid.days[0], courseName: "" }],
  }).errors).toContain("Every qualifying day requires a date, holes, course, tee, and valid starting hole.");
});

test("qualifying roster projection selects the current active season and eligible permanent identities", () => {
  const baseSeason = { ownerId: coachId, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  const season = selectCurrentActiveRosterSeason([
    { ...baseSeason, id: "past", name: "Past", startsOn: "2025-08-01", endsOn: "2026-05-31", status: "active" },
    { ...baseSeason, id: seasonId, name: "Current", startsOn: "2026-08-01", endsOn: "2027-05-31", status: "active" },
    { ...baseSeason, id: "planned", name: "Planned", startsOn: "2026-08-01", endsOn: "2027-05-31", status: "planned" },
  ], new Date("2026-08-02T12:00:00Z"));
  expect(season?.id).toBe(seasonId);

  const basePlayer = { ownerId: coachId, sourcePlayerId: null, preferredName: null, rosterType: "men" as const, archivedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  const players = [
    { ...basePlayer, id: menPlayerId, firstName: "Eligible", lastName: "Player", status: "active" as const },
    { ...basePlayer, id: "inactive", firstName: "Inactive", lastName: "Player", status: "inactive" as const },
    { ...basePlayer, id: "archived", firstName: "Archived", lastName: "Player", status: "active" as const, archivedAt: "2026-07-01" },
  ];
  const baseMembership = { ownerId: coachId, seasonId, classYear: "Senior", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  const memberships = players.map((player) => ({ ...baseMembership, id: `membership-${player.id}`, rosterPlayerId: player.id, status: player.status }));
  expect(buildQualifyingRosterPlayers({ players, memberships, rosterType: "men" })).toEqual([{
    id: menPlayerId,
    rosterPlayerId: menPlayerId,
    name: "Eligible Player",
    rosterType: "men",
    classYear: "Senior",
  }]);
});

test("roster-link migration validates ownership, persists links, and propagates them to tournament snapshots", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260807000000_link_qualifying_participants_to_roster.sql"),
    "utf8"
  );
  expect(migration).toContain("player ->> 'rosterPlayerId'");
  expect(migration).toContain("roster_player.owner_id = coach_id");
  expect(migration).toContain("set roster_player_id = (player.player_data ->> 'rosterPlayerId')::uuid");
  expect(migration).toContain("participant.roster_player_id");
  expect(migration).toContain("roster_player_id = excluded.roster_player_id");
  expect(migration).not.toContain("security definer");
});

test("production qualifying creation service contains no hard-coded roster fixtures", () => {
  const source = readFileSync(
    join(process.cwd(), "app/lib/services/qualifyingCreationService.ts"),
    "utf8"
  );
  for (const fixtureName of ["Avery Brooks", "Cam Riley", "Jordan Lee", "Morgan", "Taylor"]) {
    expect(source).not.toContain(fixtureName);
  }
});

test("empty Qualifying Sessions page shows the creation action", async ({ page }) => {
  await installCoachSession(page);
  await page.route("**/api/qualifying-sessions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [] }) })
  );
  await page.goto("/coach-dashboard/qualifying-manager", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("No qualifying sessions yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create Qualifying" })).toHaveAttribute(
    "href",
    "/coach-dashboard/qualifying-manager/new"
  );
});

test("Q2 migration stores only session and day drafts behind owner RLS and one transaction", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260726000000_add_qualifying_coach_creation_drafts.sql"),
    "utf8"
  );
  expect(migration).toContain("alter column tournament_id drop not null");
  expect(migration).toContain("add column if not exists selected_players jsonb");
  expect(migration).toContain("add column if not exists groups jsonb");
  expect(migration).toContain("create policy \"Coaches can manage owned qualifying sessions\"");
  expect(migration).toContain("create policy \"Coaches can manage owned qualifying days\"");
  expect(migration).toContain("create or replace function public.create_qualifying_session_draft");
  expect(migration).toContain("insert into public.qualifying_sessions");
  expect(migration).toContain("insert into public.qualifying_days");
  expect(migration).not.toContain("insert into public.tournaments");
  expect(migration).not.toContain("insert into public.tournament_rounds");
  expect(migration).not.toContain("insert into public.tournament_players");
  expect(migration).not.toContain("insert into public.score_entries");
  expect(migration).not.toContain("insert into public.qualifying_scorer_assignments");
});
