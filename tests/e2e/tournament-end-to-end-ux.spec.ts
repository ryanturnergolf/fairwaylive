import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

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
    await expect(page.getByRole("button", { name: "Close tournament creation dialog" })).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds?.height ?? 0).toBeLessThanOrEqual(812);
    expect(bounds?.width ?? 0).toBeLessThanOrEqual(358);
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
