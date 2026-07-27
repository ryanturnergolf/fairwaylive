import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateQualifyingCode,
  normalizeQualifyingCode,
} from "../../app/lib/services/qualifyingAccessService";

test("qualifying codes are deterministic, normalized, and omit ambiguous characters", () => {
  const first = generateQualifyingCode("session-a", 0);
  expect(first).toHaveLength(6);
  expect(first).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
  expect(generateQualifyingCode("session-a", 0)).toBe(first);
  expect(generateQualifyingCode("session-a", 1)).not.toBe(first);
  expect(normalizeQualifyingCode(` ${first.slice(0, 3)}-${first.slice(3).toLowerCase()} `)).toBe(first);
});

test("Q5 migration isolates sessions, rate limits access, and bounds player tokens", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260730000000_add_qualifying_access.sql"),
    "utf8"
  );
  expect(sql).toContain("create table public.qualifying_access_codes");
  expect(sql).toContain("code_hash text not null unique");
  expect(sql).toContain("enable row level security");
  expect(sql).toContain("private.qualifying_access_attempts");
  expect(sql).toContain("resolve_qualifying_access_code_rate_limited");
  expect(sql).toContain("exchange_qualifying_player_access");
  expect(sql).toContain("pg_advisory_xact_lock");
  expect(sql).toContain("primary key (qualifying_session_id, player_id, round_number)");
  expect(sql).toContain("public.tournament_share_tokens");
  expect(sql).toContain("token.purpose = 'mobile_scoring'");
  expect(sql).toContain("score.entry_status = 'submitted'");
  expect(sql).not.toContain("create table public.qualifying_share");
  expect(sql).not.toContain("insert into public.score_entries");
  expect(sql).not.toContain("insert into public.score_hole_entries");
  expect(sql).not.toContain("insert into public.score_review_status");
  const cryptoPathFix = readFileSync(
    join(process.cwd(), "supabase/migrations/20260730010000_fix_qualifying_access_crypto_path.sql"),
    "utf8"
  );
  expect(cryptoPathFix).toContain("set search_path = public, private, extensions");
});

test("qualifying access counts only failed resolutions toward IP and code limits", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260802000000_count_only_failed_qualifying_access_attempts.sql"
    ),
    "utf8"
  );
  const normalizedSql = sql.replace(/\s+/g, " ");
  const successfulResolution = normalizedSql.slice(
    normalizedSql.indexOf("if session_row.id is null then"),
    normalizedSql.indexOf("end; $$;")
  );

  expect(sql).toContain("count(*) >= 20");
  expect(sql).toContain("count(*) >= 10");
  expect(sql).toContain("where ip_hash = input_ip_hash");
  expect(sql).toContain("where code_hash = input_code_hash");
  expect(sql.match(/insert into private\.qualifying_access_attempts/g)).toHaveLength(2);
  expect(successfulResolution).toContain("if session_row.id is null then insert into");
  expect(successfulResolution).toContain("return jsonb_build_object");
  expect(
    successfulResolution.slice(successfulResolution.indexOf("return jsonb_build_object"))
  ).not.toContain("insert into private.qualifying_access_attempts");
});

test("qualifying failure limits serialize both scopes and clear legacy successful attempts", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260802000000_count_only_failed_qualifying_access_attempts.sql"
    ),
    "utf8"
  );

  expect(sql).toContain("least(ip_lock_key, code_lock_key)");
  expect(sql).toContain("greatest(ip_lock_key, code_lock_key)");
  expect(sql).toContain("delete from private.qualifying_access_attempts attempt");
  expect(sql).toContain("code.active = true");
  expect(sql).toContain("session.status = 'active'");
  expect(sql).toContain(
    "grant execute on function public.resolve_qualifying_access_code_rate_limited(text, text) to anon, authenticated"
  );
});

test("valid reciprocal qualifying resolves isolated players and routes to certified scorecard", async ({ page }) => {
  await page.route("**/api/qualifying-access/resolve", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      qualifyingSessionId: "session-a",
      qualifyingName: "Fall Qualifying",
      scoringMode: "reciprocal",
      players: [
        { playerId: "alex", playerName: "Alex Morgan" },
        { playerId: "jordan", playerName: "Jordan Lee" },
      ],
    }),
  }));
  await page.route("**/api/qualifying-access/exchange", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      playerId: "alex",
      roundNumber: 2,
      groupNumber: 1,
      markerPlayerId: "jordan",
      startingHole: 1,
      shareToken: "qualified-token",
    }),
  }));
  await page.goto("/qualifying-login");
  await page.getByLabel("Qualifying code").fill("ABC-234");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Fall Qualifying" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Alex Morgan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jordan Lee" })).toBeVisible();
  await page.getByRole("button", { name: "Alex Morgan" }).click();
  await expect(page).toHaveURL(/\/scorecard\/alex\?pairing=1&round=2&shareToken=qualified-token/);
});

test("invalid codes stay generic and designated scorer sessions are blocked", async ({ page }) => {
  await page.route("**/api/qualifying-access/resolve", async (route) => {
    const body = route.request().postDataJSON() as { code: string };
    if (body.code === "ABC234") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          qualifyingSessionId: "session-b",
          qualifyingName: "Designated Qualifying",
          scoringMode: "designated_scorer",
          blockedReason: "designated_scorer_unavailable",
          players: [],
        }),
      });
    }
    return route.fulfill({ status: 404, body: JSON.stringify({ error: "Unable to resolve qualifying code." }) });
  });
  await page.goto("/qualifying-login");
  await page.getByLabel("Qualifying code").fill("ZZZ999");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("p[role='alert']")).toContainText("Unable to resolve qualifying code");
  await page.getByLabel("Qualifying code").fill("ABC234");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Designated scorer access is not available yet.")).toBeVisible();
  await expect(page.locator('a[href^="/scorecard/"]')).toHaveCount(0);
});
