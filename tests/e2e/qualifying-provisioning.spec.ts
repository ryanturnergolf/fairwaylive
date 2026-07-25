import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planTournamentRounds } from "../../app/lib/services/tournamentRoundProvisioningService";

test("round provisioning maps 9, 18, 27, and 36 holes through the shared planner", () => {
  expect(planTournamentRounds([
    { dayNumber: 1, holesTotal: 9 },
    { dayNumber: 2, holesTotal: 18 },
    { dayNumber: 3, holesTotal: 27 },
    { dayNumber: 4, holesTotal: 36 },
  ])).toMatchObject([
    { roundNumber: 1, qualifyingDay: 1, qualifyingSegment: 1, holeCount: 9 },
    { roundNumber: 2, qualifyingDay: 2, qualifyingSegment: 1, holeCount: 18 },
    { roundNumber: 3, qualifyingDay: 3, qualifyingSegment: 1, holeCount: 18 },
    { roundNumber: 4, qualifyingDay: 3, qualifyingSegment: 2, holeCount: 9 },
    { roundNumber: 5, qualifyingDay: 4, qualifyingSegment: 1, holeCount: 18 },
    { roundNumber: 6, qualifyingDay: 4, qualifyingSegment: 2, holeCount: 18 },
  ]);
});

test("Q3B provisioning is locked, transactional, idempotent, and service-composed", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260728000000_add_qualifying_tournament_provisioning.sql"
    ),
    "utf8"
  );

  expect(migration).toContain("create or replace function public.provision_qualifying_session");
  expect(migration).toContain("pg_advisory_xact_lock");
  expect(migration).toContain("public.create_tournament_idempotent");
  expect(migration).toContain("public.provision_tournament_rounds");
  expect(migration).toContain("public.sync_tournament_players_from_qualifying");
  expect(migration).toContain("'qualifying:' || session_row.id::text");
  expect(migration).toContain("if session_row.tournament_id is not null");
  expect(migration).toContain("set status = 'provisioning'");
  expect(migration).toContain("status = 'provisioned'");
  expect(migration).toContain("on conflict (tournament_id, round_number)");
  expect(migration).toContain("on conflict (tournament_id, round_number, player_id)");
  expect(migration).not.toContain("insert into public.score_entries");
  expect(migration).not.toContain("insert into public.score_hole_entries");
  expect(migration).not.toContain("insert into public.tournament_state_snapshots");
  expect(migration).not.toContain("insert into public.tournament_share_tokens");
  expect(migration).not.toContain("insert into public.qualifying_scorer_assignments");
  expect(migration).not.toContain("pairing");
  expect(migration).not.toContain("scorecard");

  const statusCastFix = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260728010000_fix_qualifying_provisioning_status_cast.sql"
    ),
    "utf8"
  );
  expect(statusCastFix).toContain("pg_get_functiondef");
  expect(statusCastFix).toContain("quote_literal('draft') || '::text'");

  const creationServiceRestore = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260728020000_restore_idempotent_tournament_creation_service.sql"
    ),
    "utf8"
  );
  expect(creationServiceRestore).toContain(
    "create or replace function public.create_tournament_idempotent"
  );
  expect(creationServiceRestore).toContain(
    "on conflict (owner_id, creation_key) do nothing"
  );
});

test("provision action uses the authenticated coordinator and exposes the existing tournament", async ({ page }) => {
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
            tournamentId: null,
            ownerId: "coach",
            name: "Q3B Draft",
            rosterType: "men",
            scoringMode: "reciprocal",
            status: "draft",
            selectedPlayers: [{ id: "player-1", name: "Player One", rosterType: "men", classYear: "" }],
            groups: [{ id: "group-1", name: "Group 1", playerIds: ["player-1"] }],
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
  let provisionRequests = 0;
  await page.route("**/api/qualifying-sessions/*/provision", (route) => {
    provisionRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        qualifyingSessionId: "11111111-1111-4111-8111-111111111111",
        tournamentId: "22222222-2222-4222-8222-222222222222",
        status: "provisioned",
        participantCount: 1,
        roundCount: 1,
        tournamentPlayerCount: 1,
        reusedTournament: false,
      }),
    });
  });

  await page.goto("/coach-dashboard/qualifying-manager");
  await page.getByRole("button", { name: "Provision Tournament" }).click();
  await expect(page.getByText("provisioned", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Tournament" })).toHaveAttribute(
    "href",
    "/tournament/22222222-2222-4222-8222-222222222222"
  );
  expect(provisionRequests).toBe(1);
});
