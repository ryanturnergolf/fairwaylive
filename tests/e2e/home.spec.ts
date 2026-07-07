import { expect, test } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Clubhouse HQ", level: 1 })).toBeVisible();
});

test("remote shared tournament appears on dashboard without localStorage", async ({ page }) => {
  await page.route("**/rest/v1/tournaments**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "99999999-9999-4999-8999-999999999999",
          created_by: null,
          name: "Remote Phone Invitational",
          course: "Shared Links Golf Club",
          tournament_date: "2026-07-05",
          number_of_rounds: 1,
          status: "upcoming",
          created_at: null,
          updated_at: null,
        },
      ]),
    });
  });

  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Remote Phone Invitational" })).toBeVisible();
  await expect(page.getByText("Shared Links Golf Club")).toBeVisible();
});

test("localStorage tournaments still appear on dashboard", async ({ page }) => {
  await page.route("**/rest/v1/tournaments**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "clubhouse-hq-tournaments",
      JSON.stringify([
        {
          id: "local-dashboard-tournament",
          name: "Local Storage Classic",
          course: "Browser Hills",
          date: "2026-07-06",
          city: "Westfield",
          state: "OH",
          rounds: "1",
          scoringFormat: "Stroke Play",
          status: "Upcoming",
          settings: {},
        },
      ])
    );
  });
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Local Storage Classic" })).toBeVisible();
  await expect(page.getByText("Browser Hills")).toBeVisible();
});
