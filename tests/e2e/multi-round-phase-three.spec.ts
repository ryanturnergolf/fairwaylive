import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { buildMultiRoundTournamentLeaderboard } from "../../app/lib/services/multiRoundLeaderboardService";
import { getLeaderboardFavoritesKey, partitionLeaderboardFavorites } from "../../app/lib/services/leaderboardFavoritesService";
import type { Tournament } from "../../app/lib/tournamentModel";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const tournamentFixture = (roundCount = 10): Tournament => ({
  id: "event-a",
  name: "Ten Round Invitational",
  course: "Round Authority Club",
  settings: { operationalCurrentRoundId: "stable-r3" },
  rounds: Array.from({ length: roundCount }, (_, index) => ({ id: `stable-r${index + 1}`, name: `Round ${index + 1}`, roundNumber: index + 1, status: index < 2 ? "complete" : "upcoming", pairings: [], leaderboard: [] })),
  teams: [{ id: "team-a", name: "Bluffton", players: ["a", "b"] }, { id: "team-b", name: "Visitors", players: ["c"] }],
  players: [
    { id: "a", firstName: "AJ", lastName: "Gerber", teamId: "team-a", isIndividual: false, statistics: {} },
    { id: "b", firstName: "Colin", lastName: "King", teamId: "team-a", isIndividual: false, statistics: {} },
    { id: "c", firstName: "Evan", lastName: "Kindred", teamId: "team-b", isIndividual: false, statistics: {} },
  ],
  pairings: [],
  scores: [
    { playerId: "a", roundId: "stable-r1", holeScores: [4, 4, 4], total: 12, status: "complete", enteredBy: "marker" },
    { playerId: "a", roundId: "stable-r2", holeScores: [5, 5, 5], total: 15, status: "complete", enteredBy: "marker" },
    { playerId: "a", roundId: "stable-r10", holeScores: [3, 0, 0], total: 3, status: "live", enteredBy: "marker" },
    { playerId: "b", roundId: "stable-r1", holeScores: [5, 5, 5], total: 15, status: "complete", enteredBy: "marker" },
    { playerId: "b", roundId: "stable-r2", holeScores: [4, 4, 4], total: 12, status: "complete", enteredBy: "marker" },
    { playerId: "c", roundId: "stable-r1", holeScores: [6, 6, 6], total: 18, status: "complete", enteredBy: "marker" },
    { playerId: "c", roundId: "stable-r2", holeScores: [6, 6, 6], total: 18, status: "complete", enteredBy: "marker" },
  ],
});

const configurations = (roundCount = 10) => Object.fromEntries(Array.from({ length: roundCount }, (_, index) => [`stable-r${index + 1}`, { holeNumbers: [4, 5, 6], pars: [3, 4, 5], countingScores: 1 }]));

const routePublicFixture = async (page: Page) => {
  const tournament = tournamentFixture();
  const eventId = "99999999-9999-4999-8999-999999999999";
  tournament.id = eventId;
  tournament.settings = {
    operationalCurrentRoundId: "stable-r3",
    roundSetups: Object.fromEntries(tournament.rounds.map((round) => [String(round.roundNumber), { roundNumber: String(round.roundNumber), startingHole: "4", numberOfHoles: "3", countingScores: "1", teeTime: "8:00 AM" }])),
    courseSetup: { holes: Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: [3, 4, 5][index % 3], yardage: 300 + index })) },
  };
  const envelope = {
    version: 2,
    tournament,
    uiState: {
      teams: [], players: [], pairings: [],
      scorecards: { scorecardsGenerated: true, scorecardRows: tournament.players.map((player, index) => ({ id: index + 1, playerName: `${player.firstName} ${player.lastName}`, team: tournament.teams.find((team) => team.id === player.teamId)?.name ?? "", scores: tournament.scores.find((score) => score.playerId === player.id && score.roundId === "stable-r1")?.holeScores ?? [0, 0, 0] })), roundSetup: { roundNumber: "1", startingHole: "4", numberOfHoles: "3", countingScores: "1", teeTime: "8:00 AM" } },
      clippdExportState: {}, scoreboardImportState: {}, autoRepairState: {},
    },
  };
  await page.route("**/api/share-tokens/resolve", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tournamentId: eventId, purpose: "live_leaderboard", expiresAt: "2026-09-30T00:00:00Z" }) }));
  await page.route("**/rest/v1/tournaments?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: eventId, name: tournament.name, course: tournament.course, number_of_rounds: 10, status: "live", course_hole_snapshot: (tournament.settings as { courseSetup: { holes: unknown[] } }).courseSetup.holes, operational_current_round_id: "stable-r3", updated_at: "2026-08-30T12:00:00Z" }) }));
  await page.route("**/rest/v1/tournament_state_snapshots**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tournament_id: eventId, local_tournament_id: eventId, schema_version: 2, state_snapshot: envelope, aggregate_version: 1, created_at: null, updated_at: "2026-08-30T12:00:00Z" }) }));
  await page.route("**/rest/v1/tournament_players**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(tournament.players.map((player, index) => ({ tournament_id: eventId, player_id: player.id, player_name: `${player.firstName} ${player.lastName}`, team_id: player.teamId, team_name: tournament.teams.find((team) => team.id === player.teamId)?.name, round_number: 1, group_number: 1, tee_number: 1, starting_hole: 4, marker_player_id: tournament.players[(index + 1) % tournament.players.length].id, is_individual: false, position: index + 1, status: "active" }))) }));
  await page.route("**/rest/v1/score_entries**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/rest/v1/rpc/is_qualifying_backing_tournament", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "false" }));
};

test("R1 through R10 are generated and numerically ordered from durable rounds", () => {
  const model = buildMultiRoundTournamentLeaderboard({ tournament: tournamentFixture(), roundConfigurationById: configurations(), operationalCurrentRoundId: "stable-r3" });
  expect(model.rounds.map((round) => round.label)).toEqual(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"]);
  expect(model.rounds.at(-1)).toMatchObject({ id: "stable-r10", roundNumber: 10 });
});

test("operational current round is the presentation default without changing configured order", () => {
  const model = buildMultiRoundTournamentLeaderboard({ tournament: tournamentFixture(), roundConfigurationById: configurations(), operationalCurrentRoundId: "stable-r3" });
  expect(model.operationalCurrentRoundId).toBe("stable-r3");
  expect(model.rounds[0].id).toBe("stable-r1");
});

test("overall position is cumulative and independent of selected-round summaries", () => {
  const model = buildMultiRoundTournamentLeaderboard({ tournament: tournamentFixture(), roundConfigurationById: configurations() });
  const aj = model.players.find((player) => player.id === "a")!;
  expect(aj.position).toBe("T1");
  expect(aj.overallTotal).toBe(30);
  expect(aj.rounds["stable-r1"].total).toBe(12);
  expect(aj.rounds["stable-r2"].total).toBe(15);
  expect(aj.rounds["stable-r10"]).toMatchObject({ total: 3, through: "1/3" });
  expect(aj.position).toBe("T1");
});

test("future configured rounds remain present and explicitly Not started", () => {
  const model = buildMultiRoundTournamentLeaderboard({ tournament: tournamentFixture(), roundConfigurationById: configurations() });
  expect(model.players[0].rounds["stable-r7"]).toMatchObject({ total: null, toPar: "—", through: "Not started" });
});

test("custom immutable hole sequence and par remain attached to each round", () => {
  const model = buildMultiRoundTournamentLeaderboard({ tournament: tournamentFixture(), roundConfigurationById: configurations() });
  expect(model.players[0].rounds["stable-r1"].holes).toEqual([
    { holeNumber: 4, par: 3, score: 4 }, { holeNumber: 5, par: 4, score: 4 }, { holeNumber: 6, par: 5, score: 4 },
  ]);
  expect(model.players[0].rounds["stable-r1"].toPar).toBe("E");
});

test("team expansion projection batches all team players without per-player requests", () => {
  const model = buildMultiRoundTournamentLeaderboard({ tournament: tournamentFixture(), roundConfigurationById: configurations() });
  expect(model.teams.find((team) => team.id === "team-a")?.players.map((player) => player.id)).toEqual(["a", "b"]);
  expect(source("app/components/leaderboards/MultiRoundTournamentLeaderboard.tsx")).not.toContain("fetch(");
});

test("single-round projection remains clean and preserves one stable round", () => {
  const model = buildMultiRoundTournamentLeaderboard({ tournament: tournamentFixture(1), roundConfigurationById: configurations(1), operationalCurrentRoundId: "stable-r1" });
  expect(model.rounds).toEqual([{ id: "stable-r1", roundNumber: 1, label: "R1" }]);
  expect(source("app/components/leaderboards/RoundSelector.tsx")).toContain("rounds.length <= 1");
});

test("favorite namespaces isolate event, entity type, and public surface", () => {
  expect(getLeaderboardFavoritesKey("tournament-team", "event-a")).toBe("clubhouse-hq:leaderboard-favorites:v1:tournament-team:event-a");
  expect(getLeaderboardFavoritesKey("tournament-player", "event-a")).not.toBe(getLeaderboardFavoritesKey("tournament-team", "event-a"));
  expect(getLeaderboardFavoritesKey("qualifying-player", "event-b")).not.toBe(getLeaderboardFavoritesKey("qualifying-player", "event-a"));
});

test("favorites move visually without duplication or changing official rank", () => {
  const rows = [{ id: "a", position: "17" }, { id: "b", position: "1" }];
  const result = partitionLeaderboardFavorites(rows, new Set(["a"]));
  expect(result.favorites).toEqual([{ id: "a", position: "17" }]);
  expect(result.standings).toEqual([{ id: "b", position: "1" }]);
});

test("shared controls are accessible, touch-friendly, and independently keyed", () => {
  const selector = source("app/components/leaderboards/RoundSelector.tsx");
  const favorite = source("app/components/leaderboards/FavoriteStar.tsx");
  const leaderboard = source("app/components/leaderboards/MultiRoundTournamentLeaderboard.tsx");
  expect(selector).toContain('role="tablist"');
  expect(selector).toContain("min-h-12");
  expect(selector).toContain("overflow-x-auto");
  expect(favorite).toContain("event.stopPropagation()");
  expect(favorite).toContain("aria-pressed");
  expect(leaderboard).toContain("teamRounds");
  expect(leaderboard).toContain("playerRounds");
});

test("polling keeps child selection and expansion state while stale responses are rejected", () => {
  const publicPage = source("app/leaderboard/page.tsx");
  expect(publicPage).toContain("requestSequence");
  expect(publicPage).toContain("requestId === requestSequence.current");
  expect(publicPage).toContain("window.setInterval");
  expect(publicPage).not.toContain("setModel(null)");
});

test("Qualifying projection carries exact round, hole, par, score, and through identity", () => {
  const service = source("app/lib/services/qualifyingResultsService.ts");
  const component = source("app/components/leaderboards/MultiRoundQualifyingLeaderboard.tsx");
  expect(service).toContain("tournamentRoundId: round.id");
  expect(service).toContain("round.immutableHolePars?.[index]");
  expect(service).not.toContain("holeCount * 4");
  expect(component).toContain("segment.tournamentRoundId === globalRoundId");
  expect(component).toContain("expandedRounds");
});

test("Phase 3 is presentation-only and introduces no migration or scoring writes", () => {
  const componentSources = [
    "app/components/leaderboards/MultiRoundTournamentLeaderboard.tsx",
    "app/components/leaderboards/MultiRoundQualifyingLeaderboard.tsx",
    "app/components/leaderboards/RoundSelector.tsx",
  ].map(source).join("\n");
  expect(componentSources).not.toContain("score-mutations");
  expect(componentSources).not.toContain("tournament-mutations");
  expect(componentSources).not.toContain("setTournamentOperationalRound");
});

test("public mobile leaderboard selects R10, expands independently, and persists favorites", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routePublicFixture(page);
  await page.goto("/leaderboard?shareToken=phase-three-token&round=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "R3" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "R10" }).click();
  await expect(page.locator("[data-selected-round='R10']")).toBeVisible();
  const teamButton = page.getByRole("button", { name: "▸ Bluffton", exact: true });
  await teamButton.click();
  const teamExpansion = page.getByLabel("Bluffton expanded round");
  await teamExpansion.getByRole("tab", { name: "R2" }).click();
  await expect(teamExpansion.getByRole("tab", { name: "R2" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Add Bluffton to favorites" }).click();
  await expect(page.locator('button[aria-expanded="true"]').filter({ hasText: "Bluffton" })).toBeVisible();
  await expect(page.locator("[data-selected-round='R10']")).toBeVisible();
  await page.locator('button[aria-expanded="false"]').filter({ hasText: "AJ Gerber" }).click();
  const expansion = page.getByLabel("AJ Gerber scorecard round");
  await expansion.getByRole("tab", { name: "R2" }).click();
  await expect(expansion.getByRole("tab", { name: "R2" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-selected-round='R10']")).toBeVisible();
  await page.getByRole("button", { name: "Add AJ Gerber to favorites" }).click();
  await expect(page.getByRole("heading", { name: "★ Favorites" })).toHaveCount(2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Remove AJ Gerber from favorites" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
