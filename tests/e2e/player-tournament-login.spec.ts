import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TeamTournamentLoginResolution } from "../../app/lib/services/teamTournamentLoginService";

const teamA: TeamTournamentLoginResolution = {
  tournament: { id: "11111111-1111-4111-8111-111111111111", name: "Foundation Invitational", status: "live" },
  team: { id: "team-a", name: "Falcons", code: "BX7KM2" },
  players: [{ playerId: "player-a", playerName: "Alex Morgan", teamId: "team-a", teamName: "Falcons", roundNumber: 1, groupNumber: 4, markerPlayerId: "marker-a" }],
  pairings: [{ groupNumber: 4, teeTime: "", startingHole: "1", players: [{ playerId: "player-a", playerName: "Alex Morgan", teamName: "Falcons" }] }],
  roundNumber: 1,
  shareToken: "team-a-mobile-token",
  shareTokenExpiresAt: "2026-08-04T12:00:00.000Z",
};

const teamB: TeamTournamentLoginResolution = {
  tournament: { ...teamA.tournament },
  team: { id: "team-b", name: "Hawks", code: "Q9TRF6" },
  players: [{ playerId: "player-b", playerName: "Jordan Lee", teamId: "team-b", teamName: "Hawks", roundNumber: 1, groupNumber: 5, markerPlayerId: "marker-b" }],
  pairings: [{ groupNumber: 5, teeTime: "", startingHole: "1", players: [{ playerId: "player-b", playerName: "Jordan Lee", teamName: "Hawks" }] }],
  roundNumber: 1,
  shareToken: "team-b-mobile-token",
  shareTokenExpiresAt: "2026-08-04T12:00:00.000Z",
};

const routeTeamLookup = async (page: Page) => {
  const requests: string[] = [];
  await page.route("**/api/player-scoring-code/resolve", async (route) => {
    const code = String((route.request().postDataJSON() as { code?: string }).code ?? "");
    requests.push(code);
    if (code === teamA.team.code || code === teamB.team.code) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          eventType: "tournament",
          resolution: code === teamA.team.code ? teamA : teamB,
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Unable to access live scoring." }) });
  });
  return requests;
};

test("homepage prominently links players to universal live scoring access", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const entry = page.getByRole("link", {
    name: "PLAYERS — Enter live scoring code HERE to access your scorecard",
    exact: true,
  });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page).toHaveURL(/\/player-tournament-login$/);
  await expect(page.getByRole("heading", { name: "Player Scoring Access" })).toBeVisible();
});

test("code input normalizes lowercase, spaces, and hyphens and submits with Enter", async ({ page }) => {
  const requests = await routeTeamLookup(page);
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  const input = page.getByLabel("Live scoring code");
  await input.fill("bx7-k m2");
  await expect(input).toHaveValue("BX7KM2");
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Falcons" })).toBeVisible();
  expect(requests).toEqual(["BX7KM2"]);
});

test("Team A and Team B lookups remain isolated across Change Code", async ({ page }) => {
  await routeTeamLookup(page);
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Live scoring code").fill(teamA.team.code);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(teamA.tournament.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: teamA.team.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Alex Morgan" })).toBeVisible();
  await expect(page.getByText("Jordan Lee")).toHaveCount(0);

  await page.getByRole("button", { name: "Change Code" }).click();
  await expect(page.getByLabel("Live scoring code")).toHaveValue("");
  await expect(page.getByText("Alex Morgan")).toHaveCount(0);
  await page.getByLabel("Live scoring code").fill(teamB.team.code);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: teamB.team.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jordan Lee" })).toBeVisible();
  await expect(page.getByText("Alex Morgan")).toHaveCount(0);
});

test("invalid code remains editable, focuses correction, and retries cleanly", async ({ page }) => {
  await routeTeamLookup(page);
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  const input = page.getByLabel("Live scoring code");
  await input.fill("ZZZZZZ");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#scoring-code-error")).toHaveText("Unable to access live scoring. Check the code and try again.");
  await expect(input).toHaveValue("ZZZZZZ");
  await expect(input).toBeFocused();
  await input.fill(teamA.team.code);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Alex Morgan" })).toBeVisible();
});

test("invalid, revoked, and unavailable codes share one player-safe response", async ({ page }) => {
  await page.route("**/api/player-scoring-code/resolve", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "database connection refused" }) })
  );
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  const input = page.getByLabel("Live scoring code");
  await input.fill(teamA.team.code);
  await input.press("Enter");
  await expect(page.locator("#scoring-code-error")).toHaveText("Unable to access live scoring. Check the code and try again.");
  await expect(page.getByText("database connection refused")).toHaveCount(0);
  await expect(input).toHaveValue(teamA.team.code);
  await expect(input).toBeFocused();
});

test("expired and revoked universal codes do not reveal an event type", async ({ page }) => {
  await page.route("**/api/player-scoring-code/resolve", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "event-specific internal reason" }),
    })
  );
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  const input = page.getByLabel("Live scoring code");

  for (const code of ["EXP234", "RVK234"]) {
    await input.fill(code);
    await input.press("Enter");
    await expect(page.locator("#scoring-code-error")).toHaveText(
      "Unable to access live scoring. Check the code and try again."
    );
    await expect(page.getByText("event-specific internal reason")).toHaveCount(0);
  }
});

test("universal resolver preserves rate limits and rejects cross-event ambiguity", () => {
  const resolver = readFileSync(
    join(process.cwd(), "app/lib/services/playerScoringCodeServerService.ts"),
    "utf8"
  );
  const route = readFileSync(
    join(process.cwd(), "app/api/player-scoring-code/resolve/route.ts"),
    "utf8"
  );

  expect(resolver).toContain('resolve_team_tournament_code_rate_limited');
  expect(resolver).toContain('resolve_qualifying_access_code_rate_limited');
  expect(resolver).toContain("await Promise.all");
  expect(resolver).toContain("resolved.length === 1");
  expect(resolver).not.toContain("console.");
  expect(route).toContain("genericFailure");
  expect(route).not.toContain("team scoring code");
  expect(route).not.toContain("qualifying code");
});

test("loading disables duplicate submissions", async ({ page }) => {
  let requestCount = 0;
  let releaseLookup!: () => void;
  const lookupPending = new Promise<void>((resolve) => { releaseLookup = resolve; });
  await page.route("**/api/player-scoring-code/resolve", async (route) => {
    requestCount += 1;
    await lookupPending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ eventType: "tournament", resolution: teamA }),
    });
  });
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Live scoring code").fill(teamA.team.code);
  await page.getByRole("button", { name: "Continue" }).click();
  const loading = page.getByRole("button", { name: "Finding Your Event..." });
  await expect(loading).toBeDisabled();
  await page.getByLabel("Live scoring code").press("Enter");
  expect(requestCount).toBe(1);
  releaseLookup();
  await expect(page.getByRole("button", { name: "Alex Morgan" })).toBeVisible();
  expect(requestCount).toBe(1);
});

test("player selection routes to the existing scoped scorecard without code or internal tournament identity", async ({ page }) => {
  await routeTeamLookup(page);
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Live scoring code").fill(teamA.team.code);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Alex Morgan" }).click();
  await expect(page).toHaveURL(/\/scorecard\/player-a\?pairing=4&round=1&shareToken=team-a-mobile-token$/);
  expect(page.url()).not.toContain(teamA.team.code);
  expect(page.url()).not.toContain(teamA.tournament.id);
});

test("mobile viewport keeps code and player controls touch-friendly without horizontal scrolling", async ({ page }) => {
  await routeTeamLookup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Live scoring code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toHaveCSS("min-height", "56px");
  await page.getByLabel("Live scoring code").fill(teamA.team.code);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Alex Morgan" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("qualifying code resolves isolated players and uses the existing exchange route", async ({ page }) => {
  await page.route("**/api/player-scoring-code/resolve", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      eventType: "qualifying",
      resolution: {
        qualifyingSessionId: "session-a",
        qualifyingName: "Fall Qualifying",
        scoringMode: "reciprocal",
        players: [
          { playerId: "alex", playerName: "Alex Morgan" },
          { playerId: "jordan", playerName: "Jordan Lee" },
        ],
      },
    }),
  }));
  await page.route("**/api/qualifying-access/exchange", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      playerId: "alex",
      roundNumber: 2,
      groupNumber: 1,
      markerPlayerId: "jordan",
      startingHole: 1,
      shareToken: "qualified-token",
    }),
  }));

  await page.goto("/player-tournament-login");
  await page.getByLabel("Live scoring code").fill("abc-234");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Fall Qualifying")).toBeVisible();
  await expect(page.getByRole("button", { name: "Alex Morgan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jordan Lee" })).toBeVisible();
  await page.getByRole("button", { name: "Alex Morgan" }).click();
  await expect(page).toHaveURL(/\/scorecard\/alex\?pairing=1&round=2&shareToken=qualified-token/);
});
