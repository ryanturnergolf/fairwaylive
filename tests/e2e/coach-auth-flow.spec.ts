import { expect, test, type Page, type Route } from "@playwright/test";

const gotoApp = (page: Page, url: string) => page.goto(url, { waitUntil: "domcontentloaded" });
const userId = "88888888-8888-4888-8888-888888888888";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "coach@example.test",
  email_confirmed_at: "2026-07-17T12:00:00.000Z",
  phone: "",
  confirmed_at: "2026-07-17T12:00:00.000Z",
  last_sign_in_at: "2026-07-17T12:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-07-17T12:00:00.000Z",
  updated_at: "2026-07-17T12:00:00.000Z",
  is_anonymous: false,
};
const encodeJwtPart = (value: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encodeJwtPart({ alg: "HS256", typ: "JWT" })}.${encodeJwtPart({
  sub: userId,
  role: "authenticated",
  exp: 4102444800,
})}.signature`;

const routeSignedOutAuth = async (route: Route) => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith("/logout")) {
    await route.fulfill({ status: 204, body: "" });
    return;
  }
  await route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ message: "User from sub claim in JWT does not exist" }),
  });
};

const routeDashboardReads = async (page: Page) => {
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
};

test("signed-out homepage Login opens a stable coach sign-in form", async ({ page }) => {
  await page.route("**/auth/v1/**", routeSignedOutAuth);
  await page.addInitScript(() => window.localStorage.clear());

  await gotoApp(page, "/");
  await page.getByRole("link", { name: "Login", exact: true }).click();

  await expect(page).toHaveURL(/\/coach-auth\?next=(?:%2F|\/)dashboard$/);
  await expect(page.getByRole("heading", { name: "Coach Sign In" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeEditable();
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/coach-auth\?next=(?:%2F|\/)dashboard$/);
  await expect(page.getByRole("heading", { name: "Coach Sign In" })).toBeVisible();
});

test("invalid credentials remain on the sign-in form with an error", async ({ page }) => {
  await page.route("**/auth/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/token")) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid login credentials",
          msg: "Invalid login credentials",
        }),
      });
      return;
    }
    await routeSignedOutAuth(route);
  });
  await gotoApp(page, "/");
  await page.evaluate(() => window.localStorage.clear());
  await gotoApp(page, "/coach-auth?next=/dashboard");
  await page.getByLabel("Email").fill("coach@example.test");
  await page.getByLabel("Password").fill("incorrect-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  await expect(page).toHaveURL(/\/coach-auth\?next=\/dashboard$/);
  await expect(page.getByRole("status")).toContainText("Invalid login credentials");
  await expect(page.getByLabel("Email")).toBeEditable();
});

test("successful login reaches a persistent dashboard and logout restores the form", async ({ page }) => {
  await routeDashboardReads(page);
  await page.route("**/auth/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/token")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: accessToken,
          token_type: "bearer",
          expires_in: 1832244800,
          expires_at: 4102444800,
          refresh_token: "coach-refresh-token",
          user,
        }),
      });
      return;
    }
    if (url.pathname.endsWith("/user")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
      return;
    }
    if (url.pathname.endsWith("/logout")) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await gotoApp(page, "/");
  await page.evaluate(() => window.localStorage.clear());
  await gotoApp(page, "/coach-auth?next=/dashboard");
  await page.getByLabel("Email").fill("coach@example.test");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Tournament Dashboard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coach Sign Out" })).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Coach Sign Out" })).toBeVisible();

  await page.getByRole("button", { name: "Coach Sign Out" }).click();
  await expect(page).toHaveURL(/\/coach-auth\?next=(?:%2F|\/)dashboard$/);
  await expect(page.getByRole("heading", { name: "Coach Sign In" })).toBeVisible();
});

const routeAuthenticatedAuth = async (page: Page) => {
  await page.route("**/auth/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/token")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: accessToken,
          token_type: "bearer",
          expires_in: 1832244800,
          expires_at: 4102444800,
          refresh_token: "coach-refresh-token",
          user,
        }),
      });
      return;
    }
    if (url.pathname.endsWith("/user")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
};

test("auth persists across homepage navigation and one seed creates and redirects to one tournament", async ({ page }) => {
  const tournamentId = "77777777-7777-4777-8777-777777777777";
  let createCount = 0;
  let snapshotCount = 0;
  await routeAuthenticatedAuth(page);
  await routeDashboardReads(page);
  await page.route("**/api/tournament-mutations", async (route) => {
    const request = route.request().postDataJSON() as {
      action: string;
      input?: Record<string, unknown>;
    };
    if (request.action === "createTournament") {
      createCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: tournamentId,
          created_by: userId,
          owner_id: userId,
          name: request.input?.name,
          course: request.input?.course,
          tournament_date: request.input?.tournamentDate,
          number_of_rounds: request.input?.numberOfRounds,
          status: request.input?.status,
          finalized_at: null,
          aggregate_version: 0,
          created_at: "2026-07-17T12:00:00.000Z",
          updated_at: "2026-07-17T12:00:00.000Z",
        }),
      });
      return;
    }
    if (request.action === "upsertTournamentStateSnapshot") {
      snapshotCount += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({ status: 400, body: JSON.stringify({ error: "Unexpected mutation" }) });
  });

  await gotoApp(page, "/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Login", exact: true }).click();
  await page.getByLabel("Email").fill("coach@example.test");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("link", { name: "Homepage", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Coach Dashboard", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Tournaments", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Coach Sign Out" })).toBeVisible();

  const seedButton = page.getByRole("button", { name: "Seed Test Tournament" });
  await seedButton.dblclick();
  await expect(page.getByRole("button", { name: "Seeding Tournament..." })).toBeDisabled();
  await expect(page).toHaveURL(new RegExp(`/tournament/${tournamentId}$`));
  expect(createCount).toBe(1);
  expect(snapshotCount).toBe(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`/tournament/${tournamentId}$`));
  await expect(page.getByText(/Test Tournament 2026-/).first()).toBeVisible();
  await gotoApp(page, "/");
  await expect(page.getByText(/Test Tournament 2026-/).first()).toBeVisible();
});

test("seed failure displays an error and remains on the dashboard", async ({ page }) => {
  await routeAuthenticatedAuth(page);
  await routeDashboardReads(page);
  await page.route("**/api/tournament-mutations", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Seed service unavailable." }),
    })
  );
  await gotoApp(page, "/coach-auth?next=/dashboard");
  await page.getByLabel("Email").fill("coach@example.test");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.getByRole("button", { name: "Seed Test Tournament" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Seed service unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Seed Test Tournament" })).toBeEnabled();
});
