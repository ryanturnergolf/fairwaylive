import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateTournamentPairingArtifacts } from "../../app/lib/services/tournamentPairingService";
import { validateTournamentScorecardArtifacts } from "../../app/lib/services/tournamentScorecardGenerationService";
import { validateTournamentActivationReadiness } from "../../app/lib/services/tournamentReadinessService";

const migration = () =>
  readFileSync(
    join(process.cwd(), "supabase/migrations/20260729000000_add_qualifying_activation.sql"),
    "utf8"
  );

test("Q4 activation is transactional, locked, idempotent, and excludes gameplay writes", () => {
  const sql = migration();
  expect(sql).toContain("pg_advisory_xact_lock");
  expect(sql).toContain("create or replace function public.generate_tournament_pairings");
  expect(sql).toContain("create or replace function public.generate_tournament_scorecards");
  expect(sql).toContain("create or replace function public.activate_qualifying_session");
  expect(sql).toContain("set status = 'activating'");
  expect(sql).toContain("set status = 'active'");
  expect(sql).toContain("if session_row.status = 'active'");
  expect(sql).toContain("'reusedActivation', true");
  expect(sql).toContain("on conflict (tournament_id, round_number, player_id) do nothing");
  expect(sql).not.toContain("insert into public.score_entries");
  expect(sql).not.toContain("insert into public.score_hole_entries");
  expect(sql).not.toContain("insert into public.score_review_status");
  expect(sql).not.toContain("insert into public.tournament_state_snapshots");
  expect(sql).not.toContain("insert into public.tournament_share_tokens");
  expect(sql).not.toContain("insert into public.team_tournament_codes");
});

test("pairing and scorecard validators reject partial or duplicate engine artifacts", () => {
  const pairings = [
    {
      tournamentId: "tournament",
      roundNumber: 1,
      playerId: "alex",
      groupNumber: 1,
      markerPlayerId: "jordan",
      startingHole: 1,
    },
    {
      tournamentId: "tournament",
      roundNumber: 1,
      playerId: "jordan",
      groupNumber: 1,
      markerPlayerId: "alex",
      startingHole: 1,
    },
  ];
  expect(() => validateTournamentPairingArtifacts(pairings, 2)).not.toThrow();
  expect(() => validateTournamentPairingArtifacts(pairings.slice(0, 1), 2)).toThrow();
  expect(() => validateTournamentPairingArtifacts([pairings[0], pairings[0]], 2)).toThrow();

  const scorecards = pairings.map(({ tournamentId, roundNumber, playerId }) => ({
    tournamentId,
    roundNumber,
    playerId,
    holeCount: 18 as const,
  }));
  expect(() => validateTournamentScorecardArtifacts(scorecards, 2)).not.toThrow();
  expect(() => validateTournamentScorecardArtifacts(scorecards.slice(0, 1), 2)).toThrow();
  expect(() => validateTournamentScorecardArtifacts([scorecards[0], scorecards[0]], 2)).toThrow();
  expect(
    validateTournamentActivationReadiness({
      expectedPlayerRows: 2,
      pairingCount: 2,
      scorecardCount: 2,
    })
  ).toMatchObject({ pairingsReady: true, scorecardsReady: true });
  expect(() =>
    validateTournamentActivationReadiness({
      expectedPlayerRows: 2,
      pairingCount: 2,
      scorecardCount: 1,
    })
  ).toThrow();
});

test("coach can activate a provisioned session exactly once from the qualifying manager", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
      access_token: "header.payload.signature",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_at: 4102444800,
      user: { id: "coach", is_anonymous: false },
    }));
  });
  await page.route("**/api/qualifying-sessions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessions: [{
          session: {
            id: "11111111-1111-4111-8111-111111111111",
            tournamentId: "22222222-2222-4222-8222-222222222222",
            ownerId: "coach",
            name: "Q4 Session",
            rosterType: "men",
            scoringMode: "reciprocal",
            status: "provisioned",
            selectedPlayers: [],
            groups: [],
            createdAt: null,
            updatedAt: null,
          },
          days: [],
          rounds: [],
          scorerAssignments: [],
        }],
      }),
    })
  );
  let requests = 0;
  await page.route("**/api/qualifying-sessions/*/activate", (route) => {
    requests += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        qualifyingSessionId: "11111111-1111-4111-8111-111111111111",
        tournamentId: "22222222-2222-4222-8222-222222222222",
        status: "active",
        pairingCount: 2,
        scorecardCount: 2,
        reusedActivation: false,
        readiness: {
          playersReady: true,
          roundsReady: true,
          pairingsReady: true,
          scorecardsReady: true,
        },
      }),
    });
  });

  await page.goto("/coach-dashboard/qualifying-manager");
  const activate = page.getByRole("button", { name: "Generate Pairings & Scorecards" });
  await activate.click();
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  expect(requests).toBe(1);
  await expect(activate).toHaveCount(0);
});
