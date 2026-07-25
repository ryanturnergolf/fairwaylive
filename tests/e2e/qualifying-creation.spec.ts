import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CreateQualifyingSessionInput } from "../../app/lib/qualifyingModel";
import {
  autoBalanceQualifyingGroups,
  getQualifyingRoster,
  validateQualifyingCreation,
} from "../../app/lib/services/qualifyingCreationService";

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
  await expect(page.getByText("5 selected")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Number of qualifying days").fill("2");
  await page.getByLabel("Day 1 date").fill("2026-08-01");
  await page.getByLabel("Day 1 holes").selectOption("27");
  await page.getByLabel("Day 1 course").fill("North Course");
  await page.getByLabel("Day 1 tee").fill("Gold");
  await page.getByLabel("Day 1 starting hole").fill("1");
  await page.getByLabel("Day 2 date").fill("2026-08-02");
  await page.getByLabel("Day 2 holes").selectOption("18");
  await page.getByLabel("Day 2 course").fill("South Course");
  await page.getByLabel("Day 2 tee").fill("Blue");
  await page.getByLabel("Day 2 starting hole").fill("10");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("p[role='alert']")).toContainText("Empty groups");
  await page.getByLabel("Number of groups").fill("2");
  await page.getByRole("button", { name: "Auto-balance" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Designated Group Scorer").check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Review qualifying" })).toBeVisible();
  await expect(page.getByText("Fall Team Qualifying", { exact: true })).toBeVisible();
  await expect(page.getByText("Women's roster", { exact: true })).toBeVisible();
  await expect(page.getByText("Round 1: Day 1, Segment 1, 18 holes")).toBeVisible();
  await expect(page.getByText("Round 2: Day 1, Segment 2, 9 holes")).toBeVisible();
  await expect(page.getByText("Round 3: Day 2, Segment 1, 18 holes")).toBeVisible();
  await expect(page.getByText("Designated Group Scorer", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save Qualifying" }).click();
  await expect(page).toHaveURL(/\/coach-dashboard\/qualifying-manager\?created=1$/);
  await expect(page.getByRole("heading", { name: "Fall Team Qualifying" })).toBeVisible();
  await expect(page.getByText("Women's · 5 players · 2 days")).toBeVisible();

  expect(savedInput).toMatchObject({
    name: "Fall Team Qualifying",
    rosterType: "women",
    scoringMode: "designated_scorer",
  });
  expect(savedInput?.selectedPlayers).toHaveLength(5);
  expect(savedInput?.groups).toHaveLength(2);
  expect(savedInput?.days).toHaveLength(2);
});

test("creation validation rejects duplicates, empty groups, and incomplete assignments", () => {
  const players = getQualifyingRoster("men").slice(0, 2);
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
