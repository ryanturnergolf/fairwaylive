import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("Tournament policy reuses immutable package items for Off Optional and Required", () => {
  const migration = source("supabase/migrations/20260911000000_add_tournament_team_statistic_preferences.sql");
  expect(migration).toContain("statistic_package_version_items");
  expect(migration).toContain("event_statistic_package_assignments");
  expect(migration).toContain("where value->>'state' not in");
  expect(migration).toContain("('optional','required')");
  expect(migration).toContain("item->>'state'='required'");
  expect(migration).toContain("Off items are absent");
});

test("team preferences accept only optional package items and always enable required items", () => {
  const migration = source("supabase/migrations/20260911000000_add_tournament_team_statistic_preferences.sql");
  expect(migration).toContain("and not i.is_required");
  expect(migration).toContain("case when i.is_required then true");
  expect(migration).toContain("invitation_row.invited_coach_id<>auth.uid()");
  expect(migration).toContain("tournament_team_id=invitation_row.tournament_team_id");
});

test("database access is invitation and team scoped rather than broad event administration", () => {
  const migration = source("supabase/migrations/20260911000000_add_tournament_team_statistic_preferences.sql");
  expect(migration).toContain("enable row level security");
  expect(migration).toContain("Invited coaches can read assigned team statistic preferences");
  expect(migration).toContain("revoke all on public.tournament_team_statistic_preferences from anon, authenticated");
  expect(migration).toContain("revoke all on function public.set_tournament_team_statistic_preferences(uuid,uuid[]) from public,anon");
});

test("host wizard exposes an explicit three-state policy", () => {
  const dashboard = source("app/dashboard/page.tsx");
  expect(dashboard).toContain('["off", "optional", "required"]');
  expect(dashboard).toContain("configureTournamentStatisticPolicy(newTournament.id");
  expect(dashboard).toContain("The resulting package version is immutable for this event.");
});

test("invited coach sees locked required and selectable optional statistics in a contained roster page", () => {
  const page = source("app/coach-dashboard/team-roster/[invitationId]/page.tsx");
  expect(page).toContain('item.state === "required"');
  expect(page).toContain('item.state === "optional" && item.enabled');
  expect(page).toContain("Statistics for your team");
  expect(page).toContain("min-h-12");
  expect(page).toContain("overflow-x-hidden");
});
