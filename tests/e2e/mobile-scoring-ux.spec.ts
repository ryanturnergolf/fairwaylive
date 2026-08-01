import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test.describe("Mobile scoring presentation contract", () => {
  test("scorecard remains contained with touch-sized actions on phone and desktop", async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await page.goto("http://127.0.0.1:3100/scorecard/player-1", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: "Save Hole" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      expect((await page.getByRole("button", { name: "Save Hole" }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
      expect((await page.getByRole("button", { name: "Previous Hole" }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
  });

  test("reciprocal scorecard respects device safe areas and responsive widths", () => {
    const page = source("app/scorecard/[playerId]/page.tsx");

    expect(page).toContain("pt-[env(safe-area-inset-top)]");
    expect(page).toContain("pb-[calc(7rem+env(safe-area-inset-bottom))]");
    expect(page).toContain("landscape:max-w-2xl");
    expect(page).toContain("sticky top-0 z-20");
  });

  test("hole progress and save status are exposed accessibly", () => {
    const page = source("app/scorecard/[playerId]/page.tsx");

    expect(page).toContain("Hole progress ${currentHoleIndex + 1} of ${scorecard.holes.length}");
    expect(page).toContain("transition-[width]");
    expect(page).toContain('<p role="alert" className="mt-3 rounded-2xl border border-red-300');
    expect(page).toContain('role="status"');
    expect(page).toContain('aria-live="polite"');
  });

  test("score and navigation controls preserve touch-sized targets", () => {
    const page = source("app/scorecard/[playerId]/page.tsx");

    expect(page).toContain('inputMode="numeric"');
    expect(page).toContain("min-h-12 w-full rounded-full bg-[#0B3D2E]");
    expect(page).toContain("min-h-12 rounded-full border border-[#B8892D]");
    expect(page).toContain("min-h-12 w-full rounded-full bg-[#B8892D]");
  });

  test("review and submit actions use the same accessible action sizing", () => {
    const page = source("app/scorecard/[playerId]/page.tsx");

    expect(page).toContain("min-h-12 w-full rounded-full border border-[#B8892D]");
    expect(page).toContain("min-h-12 w-full rounded-full px-6 py-4");
    expect(page).toContain("min-h-12 w-full rounded-full border border-[#E8DCC8]");
  });

  test("designated scoring receives matching responsive presentation without workflow changes", () => {
    const designated = source("app/scorecard/[playerId]/DesignatedQualifyingScorecard.tsx");

    expect(designated).toContain("env(safe-area-inset-bottom)");
    expect(designated).toContain("landscape:max-w-3xl");
    expect(designated).toContain("min-h-12 w-full rounded-full bg-[#0B3D2E]");
    expect(designated).toContain("grid grid-cols-3 gap-2 sm:grid-cols-6");
    expect(designated).toContain('role="alert"');
  });
});
