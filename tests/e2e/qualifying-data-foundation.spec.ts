import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildQualifyingRoundPlan,
  buildUniformQualifyingRoundPlan,
} from "../../app/lib/services/qualifyingScheduleService";

test("qualifying maps 9, 18, 27, and 36-hole days deterministically", () => {
  expect(buildUniformQualifyingRoundPlan(1, 9)).toEqual([
    { roundNumber: 1, name: "Day 1", holeCount: 9, qualifyingDay: 1, qualifyingSegment: 1 },
  ]);
  expect(buildUniformQualifyingRoundPlan(1, 18)).toEqual([
    { roundNumber: 1, name: "Day 1", holeCount: 18, qualifyingDay: 1, qualifyingSegment: 1 },
  ]);
  expect(buildUniformQualifyingRoundPlan(1, 27)).toEqual([
    { roundNumber: 1, name: "Day 1 - Segment 1", holeCount: 18, qualifyingDay: 1, qualifyingSegment: 1 },
    { roundNumber: 2, name: "Day 1 - Segment 2", holeCount: 9, qualifyingDay: 1, qualifyingSegment: 2 },
  ]);
  expect(buildUniformQualifyingRoundPlan(1, 36)).toEqual([
    { roundNumber: 1, name: "Day 1 - Segment 1", holeCount: 18, qualifyingDay: 1, qualifyingSegment: 1 },
    { roundNumber: 2, name: "Day 1 - Segment 2", holeCount: 18, qualifyingDay: 1, qualifyingSegment: 2 },
  ]);
});

test("multi-day qualifying receives globally stable engine round numbers", () => {
  const plan = buildQualifyingRoundPlan([
    { dayNumber: 2, holesTotal: 27 },
    { dayNumber: 1, holesTotal: 18 },
    { dayNumber: 3, holesTotal: 9 },
  ]);

  expect(plan.map((round) => [
    round.roundNumber,
    round.qualifyingDay,
    round.qualifyingSegment,
    round.holeCount,
  ])).toEqual([
    [1, 1, 1, 18],
    [2, 2, 1, 18],
    [3, 2, 2, 9],
    [4, 3, 1, 9],
  ]);
  expect(buildQualifyingRoundPlan([
    { dayNumber: 1, holesTotal: 18 },
    { dayNumber: 2, holesTotal: 27 },
    { dayNumber: 3, holesTotal: 9 },
  ])).toEqual(plan);
});

test("invalid day sequences are rejected instead of producing ambiguous mappings", () => {
  expect(() => buildQualifyingRoundPlan([])).toThrow();
  expect(() => buildQualifyingRoundPlan([
    { dayNumber: 1, holesTotal: 18 },
    { dayNumber: 1, holesTotal: 18 },
  ])).toThrow();
  expect(() => buildQualifyingRoundPlan([
    { dayNumber: 1, holesTotal: 18 },
    { dayNumber: 3, holesTotal: 18 },
  ])).toThrow();
});

test("migration is additive, constrained, and protected by RLS", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260725000000_add_qualifying_data_foundation.sql"),
    "utf8"
  );

  expect(migration).toContain("create table if not exists public.qualifying_sessions");
  expect(migration).toContain("create table if not exists public.qualifying_days");
  expect(migration).toContain("create table if not exists public.tournament_rounds");
  expect(migration).toContain("create table if not exists public.qualifying_scorer_assignments");
  expect(migration).not.toContain("qualifying_round_segments");
  expect(migration).toContain("qualifying_session_id uuid references public.qualifying_sessions");
  expect(migration).toContain("qualifying_day integer");
  expect(migration).toContain("qualifying_segment integer");
  expect(migration).toContain("unique (tournament_id, round_number)");
  expect(migration).toContain("unique (qualifying_session_id, day_number)");
  expect(migration).toContain("unique (tournament_round_id, group_number)");
  expect(migration).toContain("alter table public.qualifying_sessions enable row level security");
  expect(migration).toContain("alter table public.qualifying_days enable row level security");
  expect(migration).toContain("alter table public.tournament_rounds enable row level security");
  expect(migration).toContain("alter table public.qualifying_scorer_assignments enable row level security");
  expect(migration).toContain("public.has_tournament_role");
  expect(migration).not.toMatch(/alter table public\.(score_entries|score_hole_entries|score_review_status)/);
  expect(migration).not.toMatch(/update public\.(tournaments|tournament_players|tournament_state_snapshots)/);
});
