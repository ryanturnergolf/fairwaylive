import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { buildCoachOnboardingReadModel } from "../../app/lib/services/coachOnboardingService";
import { buildTournamentReadiness } from "../../app/lib/services/tournamentReadinessService";

const installCoach = async (page: Page, preference?: "active" | "dismissed") => {
  await page.addInitScript(() => window.localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
    access_token: "header.payload.signature", refresh_token: "refresh", token_type: "bearer", expires_at: 4102444800,
    user: { id: "coach", is_anonymous: false },
  })));
  await page.route("**/auth/v1/user", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "coach", user_metadata: body.data }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      id: "coach", is_anonymous: false,
      user_metadata: preference ? { clubhouse_hq_coach_onboarding: { state: preference, updatedAt: "2026-08-01T00:00:00.000Z" } } : {},
    }) });
  });
  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
};

test("first-time coach sees concise onboarding and can dismiss then resume it", async ({ page }) => {
  await installCoach(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/coach-dashboard");
  await expect(page.getByRole("heading", { name: "Your first event, step by step" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Coach onboarding steps" }).getByRole("listitem")).toHaveCount(9);
  await page.getByRole("button", { name: "Dismiss guide" }).click();
  await expect(page.getByRole("heading", { name: "Your first event, step by step" })).toHaveCount(0);
  await page.getByRole("button", { name: "Resume setup guide" }).click();
  await expect(page.getByRole("heading", { name: "Your first event, step by step" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("dismissed guidance stays non-intrusive for returning coaches", async ({ page }) => {
  await installCoach(page, "dismissed");
  await page.goto("/coach-dashboard");
  await expect(page.getByRole("heading", { name: "Your first event, step by step" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume setup guide" })).toBeVisible();
});

test("experienced coaches are not shown onboarding unless they explicitly resume", () => {
  const context = { tournamentCount: 3, finalizedTournamentCount: 1, rosterPlayerCount: 8, readiness: null, tournamentHref: "/dashboard" };
  expect(buildCoachOnboardingReadModel(context, null).visible).toBe(false);
  expect(buildCoachOnboardingReadModel(context, { state: "active", updatedAt: "2026-08-01T00:00:00.000Z" }).visible).toBe(true);
});

test("share checklist projects the existing readiness result without recalculating it", () => {
  const readiness = buildTournamentReadiness({ tournamentId: "event" });
  const model = buildCoachOnboardingReadModel({ tournamentCount: 1, finalizedTournamentCount: 0, rosterPlayerCount: 6, readiness, tournamentHref: "/tournament/event" }, null);
  expect(model.readinessChecks.map(({ id, complete }) => [id, complete])).toEqual([
    ["ready-players", readiness.checks.playersSynced],
    ["ready-pairings", readiness.checks.pairingsGenerated],
    ["ready-scorecards", readiness.checks.scorecardsGenerated],
    ["ready-share", readiness.isSafeToShare],
  ]);
});

test("onboarding persistence is Supabase-backed and normal coach routes remain unchanged", async () => {
  const repository = await readFile("app/lib/repositories/coachOnboardingRepository.ts", "utf8");
  const service = await readFile("app/lib/services/coachOnboardingService.ts", "utf8");
  expect(repository).toContain("supabase.auth.updateUser");
  expect(repository).not.toContain("localStorage");
  expect(service).toContain('href: "/coach-dashboard/roster"');
  expect(service).toContain('href: "/coach-dashboard/statistics"');
  expect(service).toContain('href: "/dashboard"');
  expect(service).toContain("readiness.checks");
});
