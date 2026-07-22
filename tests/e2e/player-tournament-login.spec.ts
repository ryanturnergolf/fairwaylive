import { expect, test, type Page } from "@playwright/test";
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
  await page.route("**/api/team-tournament-login/resolve", async (route) => {
    const code = String((route.request().postDataJSON() as { code?: string }).code ?? "");
    requests.push(code);
    if (code === teamA.team.code || code === teamB.team.code) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(code === teamA.team.code ? teamA : teamB) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Invalid Team Tournament Code." }) });
  });
  return requests;
};

test("homepage prominently links signed-out players to Player Tournament Login", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const entry = page.getByRole("link", { name: "Player Tournament Login", exact: true });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page).toHaveURL(/\/player-tournament-login$/);
  await expect(page.getByRole("heading", { name: "Player Tournament Login" })).toBeVisible();
});

test("code input normalizes lowercase, spaces, and hyphens and submits with Enter", async ({ page }) => {
  const requests = await routeTeamLookup(page);
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  const input = page.getByLabel("Team scoring code");
  await input.fill("bx7-k m2");
  await expect(input).toHaveValue("BX7KM2");
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Falcons" })).toBeVisible();
  expect(requests).toEqual(["BX7KM2"]);
});

test("Team A and Team B lookups remain isolated across Change Code", async ({ page }) => {
  await routeTeamLookup(page);
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Team scoring code").fill(teamA.team.code);
  await page.getByRole("button", { name: "Find My Team" }).click();
  await expect(page.getByText(teamA.tournament.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: teamA.team.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Alex Morgan" })).toBeVisible();
  await expect(page.getByText("Jordan Lee")).toHaveCount(0);

  await page.getByRole("button", { name: "Change Code" }).click();
  await expect(page.getByLabel("Team scoring code")).toHaveValue("");
  await expect(page.getByText("Alex Morgan")).toHaveCount(0);
  await page.getByLabel("Team scoring code").fill(teamB.team.code);
  await page.getByRole("button", { name: "Find My Team" }).click();
  await expect(page.getByRole("heading", { name: teamB.team.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jordan Lee" })).toBeVisible();
  await expect(page.getByText("Alex Morgan")).toHaveCount(0);
});

test("invalid code remains editable, focuses correction, and retries cleanly", async ({ page }) => {
  await routeTeamLookup(page);
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  const input = page.getByLabel("Team scoring code");
  await input.fill("ZZZZZZ");
  await page.getByRole("button", { name: "Find My Team" }).click();
  await expect(page.locator("#team-code-error")).toHaveText("That team scoring code is invalid. Check the code and try again.");
  await expect(input).toHaveValue("ZZZZZZ");
  await expect(input).toBeFocused();
  await input.fill(teamA.team.code);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Alex Morgan" })).toBeVisible();
});

test("service errors display a distinct retryable state without leaking implementation details", async ({ page }) => {
  await page.route("**/api/team-tournament-login/resolve", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "database connection refused" }) })
  );
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  const input = page.getByLabel("Team scoring code");
  await input.fill(teamA.team.code);
  await input.press("Enter");
  await expect(page.locator("#team-code-error")).toHaveText("Player Tournament Login is temporarily unavailable. Please try again.");
  await expect(page.getByText("database connection refused")).toHaveCount(0);
  await expect(input).toHaveValue(teamA.team.code);
  await expect(input).toBeFocused();
});

test("loading disables duplicate submissions", async ({ page }) => {
  let requestCount = 0;
  let releaseLookup!: () => void;
  const lookupPending = new Promise<void>((resolve) => { releaseLookup = resolve; });
  await page.route("**/api/team-tournament-login/resolve", async (route) => {
    requestCount += 1;
    await lookupPending;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(teamA) });
  });
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Team scoring code").fill(teamA.team.code);
  await page.getByRole("button", { name: "Find My Team" }).click();
  const loading = page.getByRole("button", { name: "Finding Your Team..." });
  await expect(loading).toBeDisabled();
  await page.getByLabel("Team scoring code").press("Enter");
  expect(requestCount).toBe(1);
  releaseLookup();
  await expect(page.getByRole("button", { name: "Alex Morgan" })).toBeVisible();
  expect(requestCount).toBe(1);
});

test("player selection routes to the existing scoped scorecard without code or internal tournament identity", async ({ page }) => {
  await routeTeamLookup(page);
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Team scoring code").fill(teamA.team.code);
  await page.getByRole("button", { name: "Find My Team" }).click();
  await page.getByRole("button", { name: "Alex Morgan" }).click();
  await expect(page).toHaveURL(/\/scorecard\/player-a\?pairing=4&round=1&shareToken=team-a-mobile-token$/);
  expect(page.url()).not.toContain(teamA.team.code);
  expect(page.url()).not.toContain(teamA.tournament.id);
});

test("mobile viewport keeps code and player controls touch-friendly without horizontal scrolling", async ({ page }) => {
  await routeTeamLookup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/player-tournament-login", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Team scoring code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find My Team" })).toHaveCSS("min-height", "56px");
  await page.getByLabel("Team scoring code").fill(teamA.team.code);
  await page.getByRole("button", { name: "Find My Team" }).click();
  await expect(page.getByRole("button", { name: "Alex Morgan" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
