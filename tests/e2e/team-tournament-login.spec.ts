import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

test("team login token exchange is private, team-scoped, active-only, and concurrency-safe", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260723000000_bound_team_login_share_tokens.sql"),
    "utf8"
  );

  expect(migration).toContain("create schema if not exists private");
  expect(migration).toContain("primary key (tournament_id, team_id)");
  expect(migration).toContain("references public.team_tournament_codes(tournament_id, team_id)");
  expect(migration).toContain("pg_advisory_xact_lock");
  expect(migration).toContain("token.purpose = 'mobile_scoring'");
  expect(migration).toContain("token.revoked_at is null");
  expect(migration).toContain("token.expires_at > now()");
  expect(migration).toContain("set revoked_at = coalesce(revoked_at, now())");
  expect(migration).not.toContain("update public.team_tournament_codes");
});

test("public team login resolution is protected by a concurrent sliding-window rate limit", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260724000000_rate_limit_team_tournament_login.sql"),
    "utf8"
  );
  const route = readFileSync(
    join(process.cwd(), "app/api/team-tournament-login/resolve/route.ts"),
    "utf8"
  );

  expect(migration).toContain("private.team_tournament_login_attempts");
  expect(migration).toContain("attempted_at > window_started_at");
  expect(migration).toContain("interval '60 seconds'");
  expect(migration).toContain("ip_attempt_count >= 30");
  expect(migration).toContain("code_attempt_count >= 12");
  expect(migration).toContain("pg_advisory_xact_lock");
  expect(migration).toContain("'team-login:ip:' || input_ip_hash");
  expect(migration).toContain("'team-login:code:' || code_key_hash");
  expect(migration).toContain("code_key_hash text := encode(digest");
  expect(migration).toContain("revoke execute on function public.resolve_team_tournament_code(text) from anon, authenticated");
  expect(migration).toContain("return public.resolve_team_tournament_code(normalized_code)");
  expect(route).toContain('supabase.rpc("resolve_team_tournament_code_rate_limited"');
  expect(route).toContain('createHash("sha256")');
  expect(route).not.toContain("input_code_hash");
  expect(route).toContain('request.headers.get("x-real-ip")');
  expect(route).toContain('request.headers.get("x-forwarded-for")');
  expect(route).not.toContain("console.");
});

test("repeated team resolutions can reuse one token while other teams remain isolated", async () => {
  const originalFetch = global.fetch;
  const teamBResolution: TeamTournamentLoginResolution = {
    ...resolution,
    team: { id: "team-b", name: "Hawks", code: "Q9TRF6" },
    players: [{
      playerId: "player-c",
      playerName: "Casey Smith",
      teamId: "team-b",
      teamName: "Hawks",
      roundNumber: 1,
      groupNumber: 6,
      markerPlayerId: "player-a",
    }],
    pairings: [{
      groupNumber: 6,
      teeTime: "",
      startingHole: "1",
      players: [{ playerId: "player-c", playerName: "Casey Smith", teamName: "Hawks" }],
    }],
    shareToken: "team-b-issued-mobile-token",
  };
  const otherTournamentResolution: TeamTournamentLoginResolution = {
    ...resolution,
    tournament: { id: "22222222-2222-4222-8222-222222222222", name: "Other Invitational", status: "live" },
    team: { ...resolution.team, code: "H6WPC2" },
    shareToken: "other-tournament-team-a-token",
  };
  let requestCount = 0;
  global.fetch = async (_input, init) => {
    requestCount += 1;
    const code = String((JSON.parse(String(init?.body)) as { code: string }).code);
    const body = code === resolution.team.code
      ? resolution
      : code === teamBResolution.team.code
        ? teamBResolution
        : otherTournamentResolution;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const repeated = await Promise.all(
      Array.from({ length: 10 }, () => resolveTeamTournamentCode(resolution.team.code))
    );
    const returnedTokens = repeated.map((result) => result.ok ? result.resolution.shareToken : "");
    expect(new Set(returnedTokens)).toEqual(new Set([resolution.shareToken]));

    const teamBResult = await resolveTeamTournamentCode(teamBResolution.team.code);
    expect(teamBResult.ok).toBe(true);
    if (!teamBResult.ok) return;
    expect(teamBResult.resolution.shareToken).not.toBe(resolution.shareToken);
    expect(teamBResult.resolution.players.every((player) => player.teamId === "team-b")).toBe(true);

    const otherTournamentResult = await resolveTeamTournamentCode(otherTournamentResolution.team.code);
    expect(otherTournamentResult.ok).toBe(true);
    if (!otherTournamentResult.ok) return;
    expect(otherTournamentResult.resolution.shareToken).not.toBe(resolution.shareToken);
    expect(otherTournamentResult.resolution.tournament.id).not.toBe(resolution.tournament.id);
    expect(requestCount).toBe(12);
  } finally {
    global.fetch = originalFetch;
  }
});
