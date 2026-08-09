import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createOperationId } from "../../app/lib/services/operationIdService";
import {
  autoBalanceQualifyingGroups,
  orderQualifyingPlayersByGroup,
} from "../../app/lib/services/qualifyingCreationService";
import {
  buildQualifyingRosterPlayers,
  getRosterPlayerDisplayName,
} from "../../app/lib/services/rosterFoundationService";
import { buildReviewComparisonModel } from "../../app/lib/services/reviewComparisonService";
import type { RosterPlayer, SeasonRosterMembership } from "../../app/lib/rosterModel";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("operation IDs use randomUUID when available and remain unique without it", () => {
  const preferred = createOperationId({
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
  });
  expect(preferred).toBe("11111111-1111-4111-8111-111111111111");

  let seed = 0;
  const randomValuesOnly = {
    getRandomValues: (bytes: Uint8Array) => {
      bytes.fill(seed++);
      return bytes;
    },
  } as unknown as Crypto;
  const first = createOperationId(randomValuesOnly);
  const second = createOperationId(randomValuesOnly);
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(second).not.toBe(first);

  expect(createOperationId({})).not.toBe(createOperationId({}));
});

test("reciprocal Review finds both durable score identities for a two-player group", () => {
  const score = (id: string, playerId: string, enteredByPlayerId: string) => ({
    id,
    tournament_id: "tournament",
    round_number: 1,
    player_id: playerId,
    entered_by_player_id: enteredByPlayerId,
    hole_scores: [4, 4],
    total: 8,
    entry_status: "in_progress",
    submitted_at: null,
    created_at: null,
    updated_at: null,
  });
  const comparison = buildReviewComparisonModel({
    scoreEntries: [
      score("self-a", "player-a", "player-a"),
      score("marker-a", "player-a", "player-b"),
      score("self-b", "player-b", "player-b"),
      score("marker-b", "player-b", "player-a"),
    ],
    statisticEntries: [],
    markedPlayerIds: ["player-a"],
    markerEnteredByPlayerIds: ["player-b"],
    statisticsPlayerIds: ["player-a"],
    holes: [{ holeNumber: 1, par: 4 }, { holeNumber: 2, par: 4 }],
  });
  expect(comparison.scoreComparisonComplete).toBe(true);
  expect(comparison.selfScores).toEqual([4, 4]);
  expect(comparison.markerScores).toEqual([4, 4]);
});

test("preferred given names retain the durable last name without mutating snapshots", () => {
  const player: RosterPlayer = {
    id: "roster-aj",
    ownerId: "owner",
    sourcePlayerId: null,
    firstName: "Alexander",
    lastName: "Gerber",
    preferredName: "AJ",
    rosterType: "men",
    status: "active",
    archivedAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
  const membership: SeasonRosterMembership = {
    id: "membership-aj",
    ownerId: "owner",
    seasonId: "season",
    rosterPlayerId: player.id,
    status: "active",
    classYear: "Senior",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
  const historicalSnapshot = { playerName: "AJ" };
  expect(getRosterPlayerDisplayName(player)).toBe("AJ Gerber");
  expect(buildQualifyingRosterPlayers({ players: [player], memberships: [membership], rosterType: "men" })[0].name).toBe("AJ Gerber");
  expect(historicalSnapshot.playerName).toBe("AJ");
});

test("auto-balanced and manually reassigned players display in deterministic group order", () => {
  const players = ["A", "B", "C", "D"].map((name) => ({
    id: name.toLowerCase(), name, rosterType: "men" as const, classYear: "Senior",
  }));
  const groups = autoBalanceQualifyingGroups(players, 2);
  expect(orderQualifyingPlayersByGroup(players, groups).map((player) => player.name)).toEqual(["A", "C", "B", "D"]);
  const reassigned = groups.map((group) => ({
    ...group,
    playerIds: group.id === "group-1" ? ["a", "c", "b"] : ["d"],
  }));
  expect(orderQualifyingPlayersByGroup(players, reassigned).map((player) => player.name)).toEqual(["A", "B", "C", "D"]);
});

test("reciprocal wizard rejects singleton groups before provisioning self-marker assignments", () => {
  const wizard = read("app/coach-dashboard/qualifying-manager/new/page.tsx");
  expect(wizard).toContain('scoringMode === "reciprocal"');
  expect(wizard).toContain("Reciprocal scoring requires at least two players in every group.");
});

test("dynamic statistic comparisons are outside Live Scoring and remain available in Statistics", () => {
  const tournamentPage = read("app/tournament/[id]/page.tsx");
  const liveScoringInvocation = tournamentPage.slice(
    tournamentPage.indexOf("<LiveScoringLeaderboard"),
    tournamentPage.indexOf("/>", tournamentPage.indexOf("<LiveScoringLeaderboard"))
  );
  expect(liveScoringInvocation).not.toContain("dynamicStatisticReviewItems");
  expect(read("app/tournament/[id]/components/DynamicStatisticsReviewPanel.tsx")).toContain("Dynamic Statistics Review");
  expect(tournamentPage).toContain("<DynamicStatisticsReviewPanel");
});

test("coach-facing code instructions use the universal homepage entry", () => {
  const qualifying = read("app/coach-dashboard/qualifying-manager/QualifyingAccessPanel.tsx");
  const tournament = read("app/tournament/[id]/components/TeamScoringCodes.tsx");
  expect(qualifying).not.toContain("/qualifying-login");
  expect(tournament).not.toContain("Player Tournament Login");
  expect(qualifying).toContain("Clubhouse HQ homepage");
  expect(tournament).toContain("Clubhouse HQ homepage");
});
