import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTeamLeaderboard } from "../../app/lib/services/tournamentDerivedState";
import { buildTournamentPlayerRows } from "../../app/lib/services/tournamentService";
import {
  addNextTournamentTeam,
  createDefaultTournamentTeams,
  removeTournamentTeam,
  tournamentTeamRosterSlotCount,
} from "../../app/lib/services/tournamentTeamService";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Team A starts with five UI-only roster positions and team labels never renumber", () => {
  let teams = createDefaultTournamentTeams();
  expect(teams.map((team) => team.label)).toEqual(["Team A"]);
  expect(tournamentTeamRosterSlotCount).toBe(5);

  teams = addNextTournamentTeam(addNextTournamentTeam(addNextTournamentTeam(teams)));
  expect(teams.map((team) => team.label)).toEqual(["Team A", "Team B", "Team C", "Team D"]);
  teams = removeTournamentTeam(teams, "team-a");
  expect(teams.map((team) => team.label)).toEqual(["Team B", "Team C", "Team D"]);
  teams = removeTournamentTeam(teams, "team-c");
  expect(teams.map((team) => team.label)).toEqual(["Team B", "Team D"]);
  expect(addNextTournamentTeam(teams).at(-1)?.label).toBe("Team E");
});

test("independent individuals remain on the individual board and never contribute to team totals", () => {
  const rows = [
    { id: 1, playerName: "Team Player", team: "Team A", isIndividual: false, scores: Array(9).fill(4) },
    { id: 2, playerName: "Independent Player", team: "Individuals", isIndividual: true, scores: Array(9).fill(2) },
  ];
  const teams = buildTeamLeaderboard({
    scorecardsGenerated: true,
    scorecardRows: rows,
    displayHoleCount: 9,
    countingScores: 1,
  });
  expect(teams.map((team) => team.teamName)).toEqual(["Team A"]);
  expect(teams[0]?.totalScore).toBe(36);
});

test("new individual player writes carry no legacy or durable team assignment", () => {
  const rows = buildTournamentPlayerRows({
    version: 2,
    tournament: {
      id: "tournament-id",
      name: "Independent Invitational",
      course: "Hidden Creek",
      hostSchool: "Clubhouse University",
      city: "Bluffton",
      state: "Ohio",
      tournamentDate: "2026-09-20",
      numberOfRounds: 1,
      teams: [{ id: "team-a", name: "Team A", players: [] }],
      players: [{
        id: "individual-player",
        firstName: "Independent",
        lastName: "Player",
        teamId: "team-a",
        isIndividual: true,
      }],
      rounds: [],
      pairings: [],
      scorecards: [],
      status: "draft",
    },
  }, new Map([["team-a", "11111111-1111-4111-8111-111111111111"]]));

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    player_id: "individual-player",
    team_id: null,
    team_name: null,
    is_individual: true,
  });
  expect(rows[0]).not.toHaveProperty("tournament_team_id");
});

test("migration adds stable team authority, legacy backfill, RLS, and individual safeguards", () => {
  const migration = source("supabase/migrations/20260909000000_add_durable_tournament_teams.sql");
  expect(migration).toContain("create table public.tournament_teams");
  expect(migration).toContain("id uuid primary key default gen_random_uuid()");
  expect(migration).toContain("unique (tournament_id, client_key)");
  expect(migration).toContain("add column tournament_team_id uuid references public.tournament_teams(id) on delete set null");
  expect(migration).toContain("insert into public.tournament_teams");
  expect(migration).toContain("where not is_individual");
  expect(migration).toContain("disable trigger reject_finalized_tournament_players_write");
  expect(migration).toContain("enable trigger reject_finalized_tournament_players_write");
  expect(migration).toContain("check (not is_individual or tournament_team_id is null)");
  expect(migration).toContain("alter table public.tournament_teams enable row level security");
  expect(migration).toContain("and not public.is_tournament_finalized(tournament_id)");
  expect(migration).not.toContain("create table public.tournament_roster_slots");
});

test("Tournament Players step manages stable team drafts and remains contained on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard#create-tournament", { waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog", { name: "Create Tournament" });
  await dialog.getByLabel("Tournament Name").fill("Team Authority Test");
  await dialog.getByLabel("Host School").fill("Clubhouse University");
  await dialog.getByLabel("Legacy / unlisted course name").fill("Hidden Creek");
  await dialog.getByLabel("City").fill("Bluffton");
  await dialog.getByLabel("State").fill("Ohio");
  await dialog.getByLabel("Start Date").fill("2026-09-20");
  await dialog.getByRole("button", { name: "Next" }).click();

  await expect(dialog.getByRole("region", { name: "Team A" })).toBeVisible();
  await expect(dialog.getByRole("list", { name: "Team A roster slots" }).getByRole("listitem")).toHaveCount(5);
  await dialog.getByRole("button", { name: "Add Team" }).click();
  await dialog.getByRole("button", { name: "Add Team" }).click();
  await dialog.getByRole("button", { name: "Add Team" }).click();
  await expect(dialog.getByRole("region", { name: "Team D" })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete Team A" }).click();
  await expect(dialog.getByRole("region", { name: "Team A" })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "Team B" })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete Team C" }).click();
  await expect(dialog.getByRole("region", { name: "Team D" })).toBeVisible();
  await dialog.getByRole("button", { name: "Add Individuals" }).click();
  await expect(dialog.getByRole("region", { name: "Individuals" })).toContainText("never count toward a team total");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
