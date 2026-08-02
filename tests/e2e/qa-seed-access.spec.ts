import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  assertQaSeedAccessPolicy,
  getQaSeedAccessPolicy,
} from "../../app/lib/services/qaSeedAccessPolicy";

test("deployed QA seed tools are disabled by default and direct actions are denied", () => {
  const environment = {};
  expect(getQaSeedAccessPolicy({ environment, nodeEnvironment: "production" })).toEqual({
    enabled: false,
    requiresOperatorAllowlist: true,
    reason: "disabled",
  });
  expect(() => assertQaSeedAccessPolicy({ environment, nodeEnvironment: "production" })).toThrow(
    "Developer/QA seed tools are not available for this account."
  );
});

test("local development and the managed Playwright server retain QA seed access", () => {
  expect(getQaSeedAccessPolicy({ environment: {}, nodeEnvironment: "development" })).toMatchObject({
    enabled: true,
    reason: "local",
  });
  expect(
    getQaSeedAccessPolicy({
      environment: { PLAYWRIGHT_MANAGED_SERVER: "1" },
      nodeEnvironment: "production",
    })
  ).toMatchObject({ enabled: true, reason: "playwright" });
});

test("deployed access requires explicit enablement and an allowlisted operator", () => {
  const environment = {
    QA_SEED_TOOLS_ENABLED: "true",
    QA_SEED_OPERATOR_IDS: "operator-one, OPERATOR-TWO",
  };
  expect(getQaSeedAccessPolicy({ environment, nodeEnvironment: "production", operatorId: "operator-one" }))
    .toMatchObject({ enabled: true, reason: "operator" });
  expect(getQaSeedAccessPolicy({ environment, nodeEnvironment: "production", operatorId: "operator-two" }))
    .toMatchObject({ enabled: true, reason: "operator" });
  expect(getQaSeedAccessPolicy({ environment, nodeEnvironment: "production", operatorId: "beta-coach" }))
    .toMatchObject({ enabled: false, reason: "not-allowlisted" });
});

test("dashboard hides every seed entry point when access is unavailable and preserves normal creation", async ({ page }) => {
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
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "coach", is_anonymous: false }) })
  );
  await page.route("**/api/qa-tools/access*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: false }) })
  );
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Create Tournament" })).toBeVisible();
  await expect(page.getByText("Developer / QA", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Seed Test Tournament" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Seed Tournament (Incomplete)" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Seed Test Qualifier" })).toHaveCount(0);
});

test("each dashboard seed handler rechecks the protected action boundary", async () => {
  const source = await readFile("app/dashboard/page.tsx", "utf8");
  expect(source.match(/await requireQaSeedAccess\(\);/g)).toHaveLength(3);
  expect(source).toContain("isClientMounted && qaSeedToolsAvailable");
  expect(source).toContain("qaSeedToolsAvailable ? <section");
});
