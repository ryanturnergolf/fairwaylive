import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { buildCourseRoundProjection, buildCourseSelectionFromSavedSetup } from "../../app/lib/services/courseService";
import type { Course, EventCourseHoleSnapshot, SavedCourseSetup } from "../../app/lib/courseModel";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const holes: EventCourseHoleSnapshot[] = Array.from({ length: 18 }, (_, index) => ({
  holeNumber: index + 1,
  par: index % 3 === 0 ? 5 : 4,
  handicapIndex: index + 1,
  yardage: 300 + index * 10,
  sourceTeeSetId: "tee-1",
}));

test("course projection preserves back-nine labels and authoritative totals", () => {
  const projection = buildCourseRoundProjection(holes, 10, 9);
  expect(projection.holes.map((hole) => hole.holeNumber)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  expect(projection.out).toBeNull();
  expect(projection.in).toEqual({ yardage: 3870, par: 39, holeCount: 9 });
  expect(projection.total).toEqual(projection.in);
});

test("repeated front-nine projections retain independent one-through-nine labels", () => {
  expect(buildCourseRoundProjection(holes, 1, 9).holes.map((hole) => hole.holeNumber)).toEqual([1,2,3,4,5,6,7,8,9]);
  expect(buildCourseRoundProjection(holes, 1, 9).holes.map((hole) => hole.holeNumber)).toEqual([1,2,3,4,5,6,7,8,9]);
});

test("legacy projections preserve the configured sequence without fabricating course values", () => {
  const projection = buildCourseRoundProjection([], 12, 7);
  expect(projection.holes.map((hole) => hole.holeNumber)).toEqual([12,13,14,15,16,17,18]);
  expect(projection.holes.every((hole) => hole.par === 0 && hole.yardage === 0)).toBe(true);
});

test("saved custom par overrides master par while null remains backward compatible", () => {
  const course: Course = { id: "course", name: "Course", city: null, state: null, par: 72, holeCount: 2, holes: [{ holeNumber: 1, par: 4, handicapIndex: 1 }, { holeNumber: 2, par: 5, handicapIndex: 2 }], teeSets: [] };
  const setup: SavedCourseSetup = { id: "setup", ownerId: "owner", courseId: "course", name: "Custom", baseTeeSetId: null, holes: [{ holeNumber: 1, yardage: 250, sourceTeeSetId: null, parOverride: 3 }, { holeNumber: 2, yardage: 500, sourceTeeSetId: null, parOverride: null }], createdAt: "", updatedAt: "" };
  expect(buildCourseSelectionFromSavedSetup(course, setup).holes.map((hole) => hole.par)).toEqual([3, 5]);
});

test("scorecard presentations use centralized mapping and no print placeholders", () => {
  const live = source("app/tournament/[id]/components/LiveScoringLeaderboard.tsx");
  const print = source("app/tournament/[id]/components/TournamentPrintExport.tsx");
  const mobile = source("app/scorecard/[playerId]/page.tsx");
  expect(live).toContain("buildCourseHoleSequence");
  expect(print).toContain("buildCourseRoundProjection");
  expect(print).not.toContain("350 + holeNumber * 6");
  expect(print).not.toContain("const par = 4");
  expect(mobile).toContain("getDisplayHoleNumber(hole)");
});

test("QR modal keeps a scrollable body and viewport-safe action footer", () => {
  const print = source("app/tournament/[id]/components/TournamentPrintExport.tsx");
  expect(print).toContain("min-h-0 flex-1 overflow-y-auto");
  expect(print).toContain("sticky bottom-0");
  expect(print).toContain("min-h-12");
  expect(print).toContain("Download QR");
  expect(print).toContain("Open Mobile Scorecard");
  expect(print).toContain("Print Scorecard");
});

test("migration keeps program and par additions nullable and owner scoped", () => {
  const migration = source("supabase/migrations/20260812000000_stabilize_course_scorecard_snapshots.sql");
  expect(migration).toContain("add column if not exists program_name text");
  expect(migration).toContain("id = auth.uid()");
  expect(migration).toContain("add column if not exists par_override integer");
  expect(migration).toContain("participant.team_name");
  expect(migration).not.toContain("Bluffton University");
});
