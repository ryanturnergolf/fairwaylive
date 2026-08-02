import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildHoleSequence,
  buildQualifyingPresetRounds,
  buildQualifyingRoundPlan,
} from "../../app/lib/services/qualifyingScheduleService";
import { validateQualifyingCreation } from "../../app/lib/services/qualifyingCreationService";

test("custom 5-hole and 7-hole rounds retain independent course-hole sequences", () => {
  expect(buildQualifyingRoundPlan([{ dayNumber: 1, holesTotal: 12, rounds: [
    { roundOrder: 1, startingHole: 12, holeCount: 5, displayName: "Opening Five" },
    { roundOrder: 2, startingHole: 3, holeCount: 7, displayName: "Closing Seven" },
  ] }])).toEqual([
    { roundNumber: 1, name: "Opening Five", holeCount: 5, startingHole: 12, endingHole: 16, holeSequence: [12,13,14,15,16], qualifyingDay: 1, qualifyingSegment: 1 },
    { roundNumber: 2, name: "Closing Seven", holeCount: 7, startingHole: 3, endingHole: 9, holeSequence: [3,4,5,6,7,8,9], qualifyingDay: 1, qualifyingSegment: 2 },
  ]);
});

test("back nine and repeated front nines are distinct ordered rounds", () => {
  const rounds = buildQualifyingRoundPlan([{ dayNumber: 1, holesTotal: 27, rounds: [
    { roundOrder: 1, startingHole: 10, holeCount: 9, displayName: "Back Nine" },
    { roundOrder: 2, startingHole: 1, holeCount: 9, displayName: "Front Nine One" },
    { roundOrder: 3, startingHole: 1, holeCount: 9, displayName: "Front Nine Two" },
  ] }]);
  expect(rounds.map((round) => [round.roundNumber, round.startingHole, round.endingHole])).toEqual([[1,10,18],[2,1,9],[3,1,9]]);
  expect(rounds[1].holeSequence).toEqual(rounds[2].holeSequence);
});

test("27 and 36 presets create multiple legal golf rounds", () => {
  expect(buildQualifyingPresetRounds(27).map((round) => round.holeCount)).toEqual([18, 9]);
  expect(buildQualifyingPresetRounds(36).map((round) => round.holeCount)).toEqual([18, 18]);
  expect(buildHoleSequence(17, 5)).toEqual([17, 18, 1, 2, 3]);
});

test("multiple days assign one global scoring round number in day order", () => {
  const plan = buildQualifyingRoundPlan([
    { dayNumber: 1, holesTotal: 18, rounds: buildQualifyingPresetRounds(18) },
    { dayNumber: 2, holesTotal: 18, rounds: [
      { roundOrder: 1, startingHole: 1, holeCount: 9, displayName: "Morning" },
      { roundOrder: 2, startingHole: 10, holeCount: 9, displayName: "Afternoon" },
    ] },
  ]);
  expect(plan.map((round) => [round.roundNumber, round.qualifyingDay, round.qualifyingSegment])).toEqual([[1,1,1],[2,2,1],[3,2,2]]);
});

test("validation accepts custom rounds and rejects oversized or inconsistent schedules", () => {
  const base = { name: "Flexible", rosterType: "men" as const, scoringMode: "reciprocal" as const,
    selectedPlayers: [{ id: "p1", name: "Player", rosterType: "men" as const, classYear: "Senior" }],
    groups: [{ id: "g1", name: "Group 1", playerIds: ["p1"] }],
  };
  const day = { dayNumber: 1, playDate: "2026-08-10", holesTotal: 5, courseName: "Course", teeName: "Blue", startingHole: 12,
    rounds: [{ roundOrder: 1, startingHole: 12, holeCount: 5, displayName: "Five" }] };
  expect(validateQualifyingCreation({ ...base, days: [day] }).ok).toBe(true);
  expect(validateQualifyingCreation({ ...base, days: [{ ...day, holesTotal: 19, rounds: [{ ...day.rounds[0], holeCount: 19 }] }] }).ok).toBe(false);
  expect(validateQualifyingCreation({ ...base, days: [{ ...day, holesTotal: 6 }] }).ok).toBe(false);
});

test("migration is additive, owner-scoped, backward compatible, and preserves scoring identities", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260808000000_add_flexible_qualifying_rounds.sql"), "utf8");
  expect(sql).toContain("create table public.qualifying_rounds");
  expect(sql).toContain("hole_count between 1 and 18");
  expect(sql).toContain("create or replace function public.create_qualifying_session_draft_flexible");
  expect(sql).toContain("not exists (select 1 from public.qualifying_rounds");
  expect(sql).toContain("current_coach_id()");
  expect(sql).not.toContain("alter table public.score_entries");
  expect(sql).not.toContain("alter table public.score_hole_entries");
  expect(sql).not.toContain("alter table public.score_review_status");
});
