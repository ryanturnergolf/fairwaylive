import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routeValidCoachSession } from "./authSessionTestHelper";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const coachId = "89898989-8989-4898-8989-898989898989";
const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encode({ alg: "HS256" })}.${encode({ sub: coachId, role: "authenticated", exp: 4102444800 })}.signature`;

const installCoachSession = async (page: Page) => {
  await routeValidCoachSession(page);
  await page.addInitScript(({ token, userId }) => localStorage.setItem("clubhouse-hq-coach-auth", JSON.stringify({
    access_token: token, refresh_token: "team-roster-refresh", token_type: "bearer", expires_at: 4102444800,
    user: { id: userId, email: "invited@example.test", role: "authenticated", is_anonymous: false },
  })), { token: accessToken, userId: coachId });
};

test("migration stores only hashed expiring revocable single-team invitations", () => {
  const migration = source("supabase/migrations/20260910000000_add_tournament_team_roster_invitations.sql");
  expect(migration).toContain("create table public.tournament_team_roster_invitations");
  expect(migration).toContain("tournament_team_id uuid not null references public.tournament_teams(id)");
  expect(migration).toContain("token_hash text not null unique");
  expect(migration).toContain("expires_at timestamptz not null");
  expect(migration).toContain("revoked_at timestamptz");
  expect(migration).toContain("encode(digest(raw_token, 'sha256'), 'hex')");
  expect(migration).not.toMatch(/raw_token\s+text\s+not null/);
});

test("redemption binds the authenticated invited email and supports only same-coach reuse", () => {
  const migration = source("supabase/migrations/20260910000000_add_tournament_team_roster_invitations.sql");
  expect(migration).toContain("invitation_row.invited_email <> authenticated_email");
  expect(migration).toContain("invitation_row.expires_at <= now()");
  expect(migration).toContain("invitation_row.state = 'revoked'");
  expect(migration).toContain("invitation_row.state = 'redeemed' and invitation_row.invited_coach_id <> auth.uid()");
  expect(migration).toContain("set state = 'redeemed', invited_coach_id = auth.uid()");
});

test("database authority exposes only one assigned team and no event administration", () => {
  const migration = source("supabase/migrations/20260910000000_add_tournament_team_roster_invitations.sql");
  expect(migration).toContain("invitation.tournament_team_id = id");
  expect(migration).toContain("invitation.invited_coach_id = auth.uid()");
  expect(migration).toContain("permission = 'manage_roster'");
  expect(migration).toContain("jsonb_array_length(input_players) > 5");
  expect(migration).toContain("tournament_team_id = invitation_row.tournament_team_id");
  expect(migration).not.toContain("insert into public.tournament_memberships");
  expect(migration).toContain("from public, anon");
  expect(migration).not.toContain("update public.tournament_rounds");
  expect(migration).not.toContain("update public.score_entries");
});

test("invited roster mutations lock once pairing or scoring begins and cannot create individuals", () => {
  const migration = source("supabase/migrations/20260910000000_add_tournament_team_roster_invitations.sql");
  expect(migration).toContain("round_number <> 1 or group_number is not null");
  expect(migration).toContain("from public.score_entries");
  expect(migration).toContain("false,");
  expect(migration).toContain("'team-roster:' || invitation_row.tournament_team_id || ':' || slot_number");
  expect(migration).toContain("This team roster is locked after pairing or scoring begins.");
});

test("authenticated invitation redemption removes the raw token from the destination URL", async ({ page }) => {
  await installCoachSession(page);
  let redeemedToken = "";
  await page.route("**/api/tournament-team-invitations", async (route) => {
    const body = route.request().postDataJSON();
    redeemedToken = body.rawToken;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "invitation-a", tournamentId: "tournament", tournamentTeamId: "team-a", teamName: "Team A", state: "redeemed", expiresAt: "2030-01-01T00:00:00Z" }) });
  });
  await page.goto("/coach-dashboard/team-roster-invitation?token=raw-secret-token");
  await expect(page).toHaveURL(/\/coach-dashboard\/team-roster\/invitation-a$/);
  expect(redeemedToken).toBe("raw-secret-token");
  expect(page.url()).not.toContain("raw-secret-token");
});

test("assigned coach edits exactly five mobile-contained roster positions", async ({ page }) => {
  await installCoachSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const actions: string[] = [];
  await page.route("**/api/tournament-team-invitations", async (route) => {
    const body = route.request().postDataJSON(); actions.push(body.action);
    const players = body.action === "saveRoster" ? body.players : [{ playerId: "p1", playerName: "Alex One", slot: 1 }];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ invitationId: "invitation-a", tournamentId: "tournament", tournamentName: "Fall Invitational", tournamentTeamId: "team-a", teamName: "Team A", players }) });
  });
  await page.goto("/coach-dashboard/team-roster/invitation-a");
  await expect(page.getByRole("heading", { name: "Team A" })).toBeVisible();
  await expect(page.getByLabel(/Player /)).toHaveCount(5);
  await page.getByLabel("Player 2").fill("Blake Two");
  await page.getByRole("button", { name: "Save assigned roster" }).click();
  await expect(page.getByText("Roster saved.")).toBeVisible();
  expect(actions).toEqual(["loadRoster", "saveRoster"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await page.getByRole("button", { name: "Save assigned roster" }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
});
