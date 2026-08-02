import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { betaSupportFallback, resolveBetaSupportContact } from "../../app/lib/services/betaSupportService";

test("Coach Menu exposes an accessible Help and Support entry point", async ({ page }) => {
  await page.goto("/coach-dashboard");
  await page.getByText("Coach Menu", { exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Coach navigation" });
  await expect(navigation.getByRole("link", { name: "Help & Support" })).toHaveAttribute("href", "/coach-dashboard/help");
});

test("Help and Support presents the certified workflow and accessible support contact", async ({ page }) => {
  await page.goto("/coach-dashboard/help");
  await expect(page.getByRole("heading", { level: 1, name: "Help & Support" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Event workflow" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Common troubleshooting" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contact beta support" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Coach Dashboard" })).toHaveAttribute("href", "/coach-dashboard");
});

test("Help page remains usable at the certified mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/coach-dashboard/help");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("link", { name: "Return to Dashboard" })).toHaveCSS("min-height", "44px");
});

test("Support contact uses a safe fallback and accepts only public email or HTTPS configuration", () => {
  expect(resolveBetaSupportContact()).toEqual({ label: betaSupportFallback, href: null, configured: false });
  expect(resolveBetaSupportContact("support@example.org")).toMatchObject({ href: "mailto:support@example.org", configured: true });
  expect(resolveBetaSupportContact("https://support.example.org/intake")).toMatchObject({ configured: true });
  expect(resolveBetaSupportContact("http://support.example.org")).toEqual({ label: betaSupportFallback, href: null, configured: false });
});

test("Support UX does not introduce operational workflow mutations", async () => {
  const pageSource = await readFile("app/coach-dashboard/help/page.tsx", "utf8");
  const chromeSource = await readFile("app/coach-dashboard/components/CoachChrome.tsx", "utf8");
  expect(pageSource).not.toMatch(/fetch\(|\.from\(|\.insert\(|\.update\(|\.delete\(|localStorage|repositories\//);
  expect(pageSource).toContain('", "/dashboard"]');
  expect(pageSource).toContain('", "/coach-dashboard/roster"]');
  expect(chromeSource).toContain('["Help & Support", "/coach-dashboard/help"]');
});
