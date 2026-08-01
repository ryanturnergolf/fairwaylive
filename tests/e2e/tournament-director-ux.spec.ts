import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test.describe("Tournament Director presentation contract", () => {
  test("workspace provides accessible navigation and labeled content regions", () => {
    const page = source("app/tournament/[id]/page.tsx");

    expect(page).toContain('<nav aria-label="Tournament workspace sections"');
    expect(page).toContain('aria-label="Tournament workspace sections"');
    expect(page).toContain("aria-pressed={activeTab === tab}");
    expect(page).toContain('aria-label={`${activeTab} workspace`}');
    expect(page).toContain('aria-labelledby="tournament-readiness-title"');
  });

  test("workspace shell and tabs remain contained on mobile", () => {
    const page = source("app/tournament/[id]/page.tsx");

    expect(page).toContain("px-4 py-5 sm:px-6");
    expect(page).toContain("overflow-x-auto");
    expect(page).toContain("min-h-11 shrink-0");
    expect(page).toContain("break-words text-3xl");
  });

  test("readiness distinguishes passing and open checklist states", () => {
    const page = source("app/tournament/[id]/page.tsx");

    expect(page).toContain("border-[#B9D8C3] bg-[#ECF8EF]");
    expect(page).toContain("border-[#E2D2B5] bg-[#FFF9ED]");
    expect(page).toContain('{hasPassed ? "Pass" : "Open"}');
  });

  test("director dialogs are labeled, viewport bounded, and scrollable", () => {
    const teamPlayer = source("app/tournament/[id]/components/TeamPlayerManagement.tsx");
    const pairings = source("app/tournament/[id]/components/PairingsScorecardGeneration.tsx");
    const sharing = source("app/tournament/[id]/components/TournamentPrintExport.tsx");

    for (const label of ["player-import-title", "team-editor-title", "player-editor-title"]) {
      expect(teamPlayer).toContain(`aria-labelledby="${label}"`);
    }
    expect(teamPlayer).toContain("max-h-[calc(100dvh-2rem)]");
    expect(teamPlayer).toContain("overflow-y-auto");
    expect(pairings).toContain('aria-labelledby="auto-repair-title"');
    expect(pairings).toContain("max-h-[calc(100dvh-2rem)]");
    expect(sharing).toContain('aria-labelledby="mobile-score-entry-title"');
    expect(sharing).toContain("max-h-[calc(100dvh-2rem)]");
  });

  test("scoring codes and operational sections preserve readable responsive presentation", () => {
    const codes = source("app/tournament/[id]/components/TeamScoringCodes.tsx");
    const pairings = source("app/tournament/[id]/components/PairingsScorecardGeneration.tsx");
    const live = source("app/tournament/[id]/components/LiveScoringLeaderboard.tsx");

    expect(codes).toContain("select-all break-all font-mono");
    expect(codes).toContain('aria-labelledby="team-scoring-codes-title"');
    expect(pairings).toContain('aria-labelledby="pairings-title"');
    expect(pairings).toContain('aria-labelledby="scorecard-generation-title"');
    expect(live).toContain('aria-label="Tournament live scoring workspace"');
  });
});
