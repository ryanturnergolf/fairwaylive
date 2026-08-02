import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { QualifyingResultsReadModel } from "../../app/lib/qualifyingModel";
import { routeValidCoachSession } from "./authSessionTestHelper";

test.beforeEach(async ({ page }) => {
  await routeValidCoachSession(page);
});

const migration = () => readFileSync(
  join(process.cwd(), "supabase/migrations/20260731000000_add_qualifying_finalization.sql"),
  "utf8"
);

const finalizedResults: QualifyingResultsReadModel = {
  qualifyingSessionId: "session-finalized",
  tournamentId: "tournament-finalized",
  sessionName: "Fall Qualifying",
  sessionStatus: "finalized",
  scoringMode: "reciprocal",
  finalizedAt: "2026-08-03T18:00:00.000Z",
  finalizedBy: "coach",
  finalizedByName: "Coach Turner",
  days: [{
    dayNumber: 1,
    playDate: "2026-08-03",
    holeCount: 18,
    players: [{
      playerId: "alex",
      playerName: "Alex Morgan",
      position: "1",
      score: 72,
      par: 72,
      toPar: 0,
      completionStatus: "complete",
      segments: [{
        roundNumber: 1,
        dayNumber: 1,
        segmentNumber: 1,
        holeCount: 18,
        score: 72,
        par: 72,
        toPar: 0,
        completionStatus: "complete",
        reviewComplete: true,
        submitted: true,
        statistics: {
          fairwaysHit: 10,
          fairwaysAvailable: 14,
          greensInRegulation: 12,
          greensAvailable: 18,
          totalPutts: 30,
          recordedHoles: 18,
        },
      }],
      statistics: {
        fairwaysHit: 10,
        fairwaysAvailable: 14,
        greensInRegulation: 12,
        greensAvailable: 18,
        totalPutts: 30,
        recordedHoles: 18,
      },
    }],
  }],
  combined: [],
  readiness: {
    expectedPlayerRoundAssignments: 1,
    playerRoundAssignments: 1,
    expectedScorecards: 1,
    scorecards: 1,
    submittedSegments: 1,
    requiredSubmittedSegments: 1,
    completedReviews: 1,
    requiredReviews: 1,
    unresolvedDiscrepancies: 0,
    ready: true,
  },
  generatedAt: "2026-08-03T18:01:00.000Z",
};
finalizedResults.combined = finalizedResults.days[0].players;

test("Q7 finalization is locked, idempotent, readiness-gated, and records no duplicate results", () => {
  const sql = migration();
  expect(sql).toContain("add column if not exists finalized_at");
  expect(sql).toContain("add column if not exists finalized_by");
  expect(sql).toContain("'finalizing', 'finalized'");
  expect(sql).toContain("pg_advisory_xact_lock");
  expect(sql).toContain("if session_row.status = 'finalized'");
  expect(sql).toContain("'reusedFinalization', true");
  expect(sql).toContain("tournament_row.finalized_at is null");
  expect(sql).toContain("player_count <> expected_count");
  expect(sql).toContain("scorecard_count <> expected_count");
  expect(sql).toContain("submitted_count <> expected_count");
  expect(sql).toContain("review_count <> expected_count");
  expect(sql).toContain("unresolved_count <> 0");
  expect(sql).toContain("set status = 'finalizing'");
  expect(sql).toContain("set status = 'finalized'");
  expect(sql).not.toContain("insert into public.tournaments");
  expect(sql).not.toContain("update public.tournaments");
  expect(sql).not.toContain("insert into public.score_entries");
  expect(sql).not.toContain("insert into public.score_hole_entries");
  expect(sql).not.toContain("insert into public.tournament_state_snapshots");
  expect(sql).not.toMatch(/create table public\.(qualifying_results|qualifying_standings)/);
});

test("Q7 coordinator delegates to certified Tournament finalization before recording Qualifying metadata", () => {
  const source = readFileSync(
    join(process.cwd(), "app/lib/services/qualifyingFinalizationService.ts"),
    "utf8"
  );
  const tournamentCall = source.indexOf("await finalizeTournamentWithValidatedReadiness({");
  const qualifyingCall = source.indexOf("/finalize`");
  expect(tournamentCall).toBeGreaterThan(0);
  expect(qualifyingCall).toBeGreaterThan(tournamentCall);
  expect(source).toContain("results.readiness.ready");
  expect(source).toContain("finalizeTournamentWithValidatedReadiness");
  expect(source).not.toContain(".from(\"tournaments\")");
  expect(source).not.toContain("finalizeTournamentAggregate");
});

test("ordinary workspace reconciliation cannot delete durable Qualifying player assignments", () => {
  const repository = readFileSync(
    join(process.cwd(), "app/lib/repositories/tournamentRepository.ts"),
    "utf8"
  );
  const service = readFileSync(
    join(process.cwd(), "app/lib/services/tournamentService.ts"),
    "utf8"
  );
  expect(repository).toContain("qualifying_session_id");
  expect(service).toContain("durableRound?.qualifying_session_id");
  expect(service.indexOf("durableRound?.qualifying_session_id")).toBeLessThan(
    service.indexOf("await reconcileTournamentPlayers", service.indexOf("export const syncTournamentPlayers"))
  );
});

test("finalized Qualifying history is permanent, read-only, and opens the existing workspace", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
      access_token: "header.payload.signature",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_at: 4102444800,
      user: { id: "coach", is_anonymous: false },
    }));
  });
  await page.route("**/api/qualifying-sessions/session-finalized/results", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(finalizedResults),
    })
  );

  await page.goto("/coach-dashboard/qualifying-manager/session-finalized");
  await expect(page.getByText("Read Only", { exact: true })).toBeVisible();
  await expect(page.getByText(/Finalized .* by Coach Turner/)).toBeVisible();
  await expect(page.getByText("Alex Morgan", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("10/14 FW · 12/18 GIR · 30 putts").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Tournament Workspace" })).toHaveAttribute(
    "href",
    "/tournament/tournament-finalized"
  );
  await expect(page.getByRole("button", { name: "Finalize Qualifying" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rotate Code" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate Pairings & Scorecards" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Provision Tournament" })).toHaveCount(0);
});

test("finalized manager cards hide access rotation and retain results/history actions", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
      access_token: "header.payload.signature",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_at: 4102444800,
      user: { id: "coach", is_anonymous: false },
    }));
  });
  await page.route("**/api/qualifying-sessions", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      sessions: [{
        session: {
          id: "session-finalized",
          tournamentId: "tournament-finalized",
          ownerId: "coach",
          name: "Fall Qualifying",
          rosterType: "men",
          scoringMode: "reciprocal",
          status: "finalized",
          selectedPlayers: [],
          groups: [],
          finalizedAt: finalizedResults.finalizedAt,
          finalizedBy: "coach",
          createdAt: null,
          updatedAt: null,
        },
        days: [],
        rounds: [],
        scorerAssignments: [],
      }],
    }),
  }));
  await page.goto("/coach-dashboard/qualifying-manager");
  await expect(page.getByText("finalized", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Results", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View History" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rotate Code" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate Pairings & Scorecards" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Provision Tournament" })).toHaveCount(0);
});
