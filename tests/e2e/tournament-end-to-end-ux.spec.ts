import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routeValidCoachSession } from "./authSessionTestHelper";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const coachId = "89898989-8989-4898-8989-898989898989";
const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encode({ alg: "HS256" })}.${encode({ sub: coachId, role: "authenticated", exp: 4102444800 })}.signature`;

const installCoachSession = async (page: Page) => {
  await routeValidCoachSession(page);
  await page.addInitScript(({ token, userId }) => localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
    access_token: token, refresh_token: "tournament-wizard-refresh", token_type: "bearer", expires_at: 4102444800,
    user: { id: userId, email: "coach@example.test", role: "authenticated", is_anonymous: false },
  })), { token: accessToken, userId: coachId });
};

test.describe("Tournament end-to-end presentation contract", () => {
  test("dashboard remains contained with touch-sized actions on phone and desktop", async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await page.goto("http://127.0.0.1:3100/dashboard", { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("heading", { name: "Tournament Dashboard" })).toBeVisible();
      const primaryCreateAction = page.getByRole("button", { name: "Create Tournament", exact: true }).first();
      await expect(primaryCreateAction).toBeVisible();
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("body *")]
          .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
          .slice(0, 5)
          .map((element) => ({ tag: element.tagName, className: element.getAttribute("class") })),
      }));
      expect(overflow.clientWidth).toBe(viewport.width);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
      expect(overflow.elements).toEqual([]);
      expect((await primaryCreateAction.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
  });

  test("creation wizard is an accessible viewport-bounded dialog", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:3100/dashboard", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Create Tournament", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Create Tournament" });
    await expect(dialog).toBeVisible();
    await expect(page.getByText("Event Setup", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build your Tournament" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tournament Director Dashboard" })).toBeHidden();
    await expect(page.getByRole("link", { name: "Templates", exact: true })).toBeHidden();
    await expect(page.getByText("Import Teams", { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Close tournament creation dialog" })).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds?.height ?? 0).toBeLessThanOrEqual(812);
    expect(bounds?.width ?? 0).toBeLessThanOrEqual(358);
    await page.getByRole("button", { name: "Close tournament creation dialog" }).click();
    await expect(page).toHaveURL(/\/coach-dashboard\/events$/);
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
  });

  test("Tournament creation follows the shared seven-step event setup pattern", async ({ page }) => {
    await installCoachSession(page);
    let creationRequests = 0;
    await page.route("**/api/tournament-mutations", async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === "createTournament") creationRequests += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Expected test-only creation stop." }) });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:3100/dashboard#create-tournament", { waitUntil: "domcontentloaded" });

    const dialog = page.getByRole("dialog", { name: "Create Tournament" });
    await expect(dialog).toBeVisible();
    expect(creationRequests).toBe(0);
    const progress = dialog.getByRole("list", { name: "Tournament creation progress" });
    for (const [index, label] of ["Basics", "Players", "Schedule", "Groups", "Scoring", "Statistics", "Review"].entries()) {
      await expect(progress.getByText(`${index + 1}. ${label}`, { exact: true })).toBeVisible();
    }

    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog.getByText("Tournament name is required.")).toBeVisible();
    await expect(progress.getByText("1. Basics", { exact: true })).toHaveAttribute("aria-current", "step");

    await dialog.getByLabel("Tournament Name").fill("Unified Invitational");
    await dialog.getByLabel("Host School").fill("Clubhouse University");
    await dialog.getByLabel("Legacy / unlisted course name").fill("Hidden Creek");
    await dialog.getByLabel("City").fill("Bluffton");
    await dialog.getByLabel("State").fill("Ohio");
    await dialog.getByLabel("Start Date").fill("2026-09-20");
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(progress.getByText("2. Players", { exact: true })).toHaveAttribute("aria-current", "step");
    expect(creationRequests).toBe(0);
    await expect(dialog.getByText("Choose the player format")).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(progress.getByText("3. Schedule", { exact: true })).toHaveAttribute("aria-current", "step");
    expect(creationRequests).toBe(0);
    await dialog.getByLabel("Date").fill("2026-09-20");
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(progress.getByText("4. Groups", { exact: true })).toHaveAttribute("aria-current", "step");
    expect(creationRequests).toBe(0);
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(progress.getByText("5. Scoring", { exact: true })).toHaveAttribute("aria-current", "step");
    expect(creationRequests).toBe(0);
    await dialog.getByRole("button", { name: "Stroke Play" }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(progress.getByText("6. Statistics", { exact: true })).toHaveAttribute("aria-current", "step");
    expect(creationRequests).toBe(0);
    await expect(dialog.getByRole("link", { name: "Open Statistics Configuration" })).toHaveAttribute("href", "/coach-dashboard/statistics");
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(progress.getByText("7. Review", { exact: true })).toHaveAttribute("aria-current", "step");
    await expect(dialog.getByText("Unified Invitational", { exact: true })).toBeVisible();
    const createTournamentButton = dialog.getByRole("button", { name: "Create Tournament" });
    await expect(createTournamentButton).toBeVisible();
    expect(creationRequests).toBe(0);
    await createTournamentButton.click();
    await expect.poll(() => creationRequests).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("Tournament wizard preserves existing persistence and Event Workspace contracts", () => {
    const dashboard = source("app/dashboard/page.tsx");
    const events = source("app/coach-dashboard/events/page.tsx");

    expect(dashboard).toContain("createTournament({");
    expect(dashboard).toContain("getTournamentRounds(newTournament.id)");
    expect(dashboard).toContain("buildTournamentStorageEnvelope(");
    expect(events).toContain("Setup / Manage");
    expect(events).toContain("Results / Live Scoring");
    expect(events).toContain("/tournament/${encodeURIComponent(tournament.id)}");
  });

  test("dashboard distinguishes loading and empty states", () => {
    const dashboard = source("app/dashboard/page.tsx");

    expect(dashboard).toContain("Loading tournaments");
    expect(dashboard).toContain("No tournaments yet");
    expect(dashboard).toContain('role="status" aria-live="polite"');
  });

  test("the audited tournament surfaces retain their accessibility contracts", () => {
    const workspace = source("app/tournament/[id]/page.tsx");
    const sharing = source("app/tournament/[id]/components/TournamentPrintExport.tsx");
    const scorecard = source("app/scorecard/[playerId]/page.tsx");

    expect(workspace).toContain('<nav aria-label="Tournament workspace sections"');
    expect(workspace).toContain('aria-labelledby="tournament-readiness-title"');
    expect(sharing).toContain('aria-labelledby="mobile-score-entry-title"');
    expect(sharing).toContain("max-h-[calc(100dvh-2rem)]");
    expect(scorecard).toContain("pb-[calc(7rem+env(safe-area-inset-bottom))]");
    expect(scorecard).toContain('aria-live="polite"');
  });
});
