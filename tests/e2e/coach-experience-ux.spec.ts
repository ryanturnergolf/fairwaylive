import { expect, test, type Page } from "@playwright/test";

const installEmptyReads = async (page: Page) => {
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/qualifying-sessions**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [] }) })
  );
};

test.beforeEach(async ({ page }) => {
  await installEmptyReads(page);
});

test("Coach Menu groups every destination by operating area", async ({ page }) => {
  await page.goto("/coach-dashboard");
  await page.getByText("Coach Menu", { exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Coach navigation" });
  for (const group of ["Team Management", "Competition", "Performance", "Configuration"]) {
    await expect(navigation.getByRole("heading", { name: group })).toBeVisible();
  }
  await expect(navigation.getByRole("link", { name: "Rosters" })).toHaveAttribute("href", "/coach-dashboard/roster");
  await expect(navigation.getByRole("link", { name: "Qualifying" })).toHaveAttribute("href", "/coach-dashboard/qualifying-manager");
  await expect(navigation.getByRole("link", { name: "Team Performance" })).toHaveAttribute("href", "/coach-dashboard/team-performance");
  await expect(navigation.getByRole("link", { name: "Statistics", exact: true })).toHaveAttribute("href", "/coach-dashboard/statistics");
});

test("breadcrumbs provide reliable back navigation without changing routes", async ({ page }) => {
  await page.goto("/coach-dashboard/roster");
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.getByRole("link", { name: "Coach Dashboard" })).toHaveAttribute("href", "/coach-dashboard");
  await expect(breadcrumb.getByText("Rosters", { exact: true })).toHaveAttribute("aria-current", "page");
  await page.goto("/coach-dashboard/qualifying-manager/new");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Qualifying" })).toHaveAttribute("href", "/coach-dashboard/qualifying-manager");
});

test("390 by 844 coach pages do not create horizontal page scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/coach-dashboard",
    "/coach-dashboard/roster",
    "/coach-dashboard/players",
    "/coach-dashboard/qualifying-manager",
    "/coach-dashboard/qualifying-manager/new",
    "/coach-dashboard/statistics",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const menu = page.getByText("Coach Menu", { exact: true });
    await expect(menu).toHaveCSS("min-height", "44px");
  }
});

test("empty, no-season, no-player, and error states are explicit", async ({ page }) => {
  await page.goto("/coach-dashboard/players");
  await expect(page.getByRole("heading", { name: "No season selected" })).toBeVisible();
  await page.goto("/coach-dashboard/roster/men");
  await expect(page.getByRole("heading", { name: "No season available" })).toBeVisible();
  await page.goto("/coach-dashboard/players/missing-player");
  await expect(page.getByRole("alert").getByText("Player not found")).toBeVisible();

  await page.unroute("**/rest/v1/**");
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Roster unavailable" }) })
  );
  await page.goto("/coach-dashboard/players");
  await expect(page.getByRole("alert").getByRole("heading", { name: "Unable to load players" })).toBeVisible();
});

test("Coach Menu and links are keyboard accessible with visible focus", async ({ page }) => {
  await page.goto("/coach-dashboard");
  const menu = page.getByText("Coach Menu", { exact: true });
  for (let index = 0; index < 10 && !(await menu.evaluate((element) => element === document.activeElement)); index += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(menu).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Coach navigation" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("navigation", { name: "Coach navigation" }).getByRole("link", { name: "Rosters" })).toBeFocused();
  const rosterLink = page.getByRole("navigation", { name: "Coach navigation" }).getByRole("link", { name: "Rosters" });
  expect(await rosterLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
});

test("scoped coach pages share the same chrome without changing feature handlers", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of [
    "app/coach-dashboard/page.tsx",
    "app/coach-dashboard/roster/RosterManager.tsx",
    "app/coach-dashboard/players/PlayersDirectory.tsx",
    "app/coach-dashboard/players/[playerId]/PlayerPerformanceProfile.tsx",
    "app/coach-dashboard/team-performance/TeamPerformanceDashboard.tsx",
    "app/coach-dashboard/qualifying-manager/page.tsx",
    "app/coach-dashboard/qualifying-manager/new/page.tsx",
    "app/coach-dashboard/statistics/StatisticsManager.tsx",
  ]) {
    expect(await readFile(file, "utf8")).toContain("<CoachHeader />");
  }
});
