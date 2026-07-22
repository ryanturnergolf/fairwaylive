import { expect, test } from "@playwright/test";
import {
  buildTeamCodeAssignments,
  generateTeamTournamentCode,
  normalizeTeamTournamentCode,
  resolveTeamPlayerScorecardPath,
  resolveTeamTournamentCode,
  type TeamTournamentLoginResolution,
} from "../../app/lib/services/teamTournamentLoginService";
import { buildMobileScorecardPath } from "../../app/lib/services/tournamentPageHelpers";

const resolution: TeamTournamentLoginResolution = {
  tournament: { id: "11111111-1111-4111-8111-111111111111", name: "Foundation Invitational", status: "live" },
  team: { id: "team-a", name: "Falcons", code: "BX7KM2" },
  players: [
    {
      playerId: "player-a",
      playerName: "Alex Morgan",
      teamId: "team-a",
      teamName: "Falcons",
      roundNumber: 1,
      groupNumber: 4,
      markerPlayerId: "player-c",
    },
    {
      playerId: "player-b",
      playerName: "Jordan Lee",
      teamId: "team-a",
      teamName: "Falcons",
      roundNumber: 1,
      groupNumber: 5,
      markerPlayerId: "player-d",
    },
  ],
  pairings: [
    {
      groupNumber: 4,
      teeTime: "",
      startingHole: "1",
      players: [{ playerId: "player-a", playerName: "Alex Morgan", teamName: "Falcons" }],
    },
    {
      groupNumber: 5,
      teeTime: "",
      startingHole: "1",
      players: [{ playerId: "player-b", playerName: "Jordan Lee", teamName: "Falcons" }],
    },
  ],
  roundNumber: 1,
  shareToken: "team-code-issued-mobile-token",
  shareTokenExpiresAt: "2026-08-04T12:00:00.000Z",
};

test("team codes are deterministic, uppercase, unambiguous, and collision-safe within an assignment batch", () => {
  const first = generateTeamTournamentCode(resolution.tournament.id, "team-a");
  expect(generateTeamTournamentCode(resolution.tournament.id, "team-a")).toBe(first);
  expect(first).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
  expect(first).not.toMatch(/[O0I1L]/);

  const assignments = buildTeamCodeAssignments({
    tournamentId: resolution.tournament.id,
    teams: [{ id: "team-a", name: "Falcons" }, { id: "team-b", name: "Hawks" }],
    reservedCodes: [first],
  });
  expect(new Set(assignments.map((assignment) => assignment.code)).size).toBe(2);
  expect(assignments[0].code).not.toBe(first);
  expect(buildTeamCodeAssignments({
    tournamentId: resolution.tournament.id,
    teams: [{ id: "team-a", name: "Falcons" }, { id: "team-b", name: "Hawks" }],
    reservedCodes: [first],
  })).toEqual(assignments);
});

test("valid team code resolves one tournament and exposes only that team's players", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_input, init) => {
    expect(JSON.parse(String(init?.body))).toEqual({ code: "BX7KM2" });
    return new Response(JSON.stringify(resolution), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await resolveTeamTournamentCode(" bx7-km2 ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolution.tournament).toEqual(resolution.tournament);
    expect(result.resolution.team).toEqual(resolution.team);
    expect(result.resolution.players.map((player) => player.playerId)).toEqual(["player-a", "player-b"]);
    expect(result.resolution.players.some((player) => player.teamId !== "team-a")).toBe(false);
    expect(result.resolution.pairings.flatMap((pairing) => pairing.players).some((player) => player.teamName !== "Falcons")).toBe(false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("invalid team code returns a clean invalid-code result", async () => {
  expect(normalizeTeamTournamentCode(" o0i1l ")).toBe("O0I1L");
  await expect(resolveTeamTournamentCode("O0I1L")).resolves.toEqual({
    ok: false,
    reason: "invalid_code",
    message: "That Team Tournament Code is invalid.",
  });
});

test("team selection and QR generation resolve the identical scorecard destination", () => {
  const teamCodePath = resolveTeamPlayerScorecardPath(resolution, "player-a");
  const qrPath = buildMobileScorecardPath({
    shareToken: resolution.shareToken,
    activeQrPairing: resolution.pairings[0],
    activeQrScoringPlayerId: "player-a",
    roundNumber: 1,
  });
  expect(teamCodePath).toBe(qrPath);
  expect(teamCodePath).toBe("/scorecard/player-a?pairing=4&round=1&shareToken=team-code-issued-mobile-token");
  expect(resolveTeamPlayerScorecardPath(resolution, "other-team-player")).toBe("");
});
