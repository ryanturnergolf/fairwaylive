import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Course } from "../../app/lib/courseModel";
import {
  buildCourseSelectionFromSavedSetup,
  buildCourseSelectionFromTee,
  validateEventCourseSelection,
} from "../../app/lib/services/courseService";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260811000000_add_course_management_foundation.sql"), "utf8");
const cleanupMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260811010000_allow_unreferenced_course_setup_cleanup.sql"), "utf8");
const teeArrays = [
  [395,200,380,485,465,170,400,515,365,490,410,435,410,415,140,530,365,240],
  [370,180,355,470,390,145,345,500,350,475,380,385,390,400,130,505,350,190],
  [310,130,295,400,300,135,330,440,310,405,330,370,360,340,120,445,295,160],
  [285,110,255,380,290,100,305,415,280,375,290,300,280,320,70,410,260,135],
  [295,520,518,192,350,375,428,388,190,350,415,480,500,177,420,530,168,320],
  [275,502,472,168,325,356,404,353,175,335,370,440,455,165,392,505,150,306],
  [255,475,450,152,291,340,368,330,165,320,320,413,410,153,380,485,138,290],
  [240,445,425,138,270,302,335,310,152,305,285,380,370,137,310,465,128,270],
  [215,422,335,119,216,240,301,263,131,230,240,315,325,125,265,375,118,255],
];
const totals = [6810, 6310, 5475, 4860, 6616, 6148, 5735, 5267, 4490];

test("course migration seeds both courses, all tees, pars, handicaps, and exact yardages", () => {
  expect(migration).toContain("Hidden Creek Golf Club");
  expect(migration).toContain("Bluffton Golf Club");
  expect(migration).toContain("array[4,3,4,5,4,3,4,5,4,5,4,4,4,4,3,5,4,3]");
  expect(migration).toContain("array[10,6,14,8,2,18,16,4,12,13,7,3,11,1,17,9,15,5]");
  expect(migration).toContain("array[4,5,5,3,4,4,4,4,3,4,4,4,5,3,4,5,3,4]");
  expect(migration).toContain("array[18,14,16,12,6,10,2,4,8,17,3,1,9,7,5,13,11,15]");
  teeArrays.forEach((yardages, index) => {
    expect(yardages).toHaveLength(18);
    expect(yardages.reduce((sum, value) => sum + value, 0)).toBe(totals[index]);
    expect(migration).toContain(`array[${yardages.join(",")}]`);
  });
  expect(migration.match(/22222222-2222-4222-8222-22222222220[1-5]/g)).not.toBeNull();
});

test("tee, mixed-tee, and saved selections create independent event snapshots", () => {
  const course: Course = {
    id: "course", name: "Bluffton Golf Club", city: "Bluffton", state: "Ohio", par: 72, holeCount: 2,
    holes: [{ holeNumber: 1, par: 4, handicapIndex: 18 }, { holeNumber: 2, par: 5, handicapIndex: 14 }],
    teeSets: [
      { id: "white", courseId: "course", name: "White", color: "White", rating: 69, slope: 118, totalYardage: 777, yardages: [{ holeNumber: 1, yardage: 275 }, { holeNumber: 2, yardage: 502 }] },
      { id: "red", courseId: "course", name: "Red", color: "Red", rating: 61.6, slope: 99, totalYardage: 637, yardages: [{ holeNumber: 1, yardage: 215 }, { holeNumber: 2, yardage: 422 }] },
    ],
  };
  const standard = buildCourseSelectionFromTee(course, "white");
  expect(standard.holes.map((hole) => hole.yardage)).toEqual([275, 502]);
  const mixed = { ...standard, holes: standard.holes.map((hole) => hole.holeNumber === 1 ? { ...hole, yardage: 215, sourceTeeSetId: "red" } : { ...hole, yardage: 490, sourceTeeSetId: null }) };
  expect(validateEventCourseSelection(mixed).holes.map((hole) => hole.yardage)).toEqual([215, 490]);
  const saved = buildCourseSelectionFromSavedSetup(course, { id: "saved", ownerId: "coach", courseId: "course", name: "Women’s Tournament Tees", baseTeeSetId: "white", createdAt: "now", updatedAt: "now", holes: mixed.holes.map((hole) => ({ holeNumber: hole.holeNumber, yardage: hole.yardage, sourceTeeSetId: hole.sourceTeeSetId })) });
  const eventSnapshot = structuredClone(saved);
  saved.holes[0].yardage = 240;
  expect(eventSnapshot.holes[0].yardage).toBe(215);
});

test("migration keeps saved setups owner-scoped and event snapshots backward compatible", () => {
  expect(migration).toContain("course_hole_snapshot jsonb not null default '[]'::jsonb");
  expect(migration).toContain("Coaches read own saved setups");
  expect(migration).toContain("owner_id=public.current_coach_id()");
  expect(cleanupMigration).toContain('Coaches delete own unreferenced saved setups');
  expect(cleanupMigration).toContain("tournament.saved_course_setup_id = saved_course_setups.id");
  expect(cleanupMigration).toContain("day.saved_course_setup_id = saved_course_setups.id");
  expect(cleanupMigration).toContain("delete_unreferenced_saved_course_setup");
  expect(cleanupMigration).toContain("security invoker");
  expect(cleanupMigration).toContain("save_course_setup");
  expect(cleanupMigration).toContain("jsonb_array_length(input_holes) <> expected_holes");
  expect(migration).toContain("apply_qualifying_course_snapshots");
  expect(migration).toContain("snapshot_qualifying_course_to_tournament");
  expect(migration).toContain("on delete restrict");
});

test("Tournament and Qualifying creation use the shared course editor while retaining legacy paths", () => {
  const dashboard = readFileSync(join(process.cwd(), "app/dashboard/page.tsx"), "utf8");
  const qualifying = readFileSync(join(process.cwd(), "app/coach-dashboard/qualifying-manager/new/page.tsx"), "utf8");
  const scorecard = readFileSync(join(process.cwd(), "app/scorecard/[playerId]/page.tsx"), "utf8");
  const designatedScorecard = readFileSync(join(process.cwd(), "app/scorecard/[playerId]/DesignatedQualifyingScorecard.tsx"), "utf8");
  expect(dashboard).toContain('<CourseSetupEditor');
  expect(qualifying).toContain('<CourseSetupEditor');
  expect(dashboard).toContain("Legacy / unlisted course name");
  expect(qualifying).toContain("Legacy / unlisted course");
  expect(scorecard).toContain("sharedState?.courseHoles ?? localCourseSetup?.holes");
  expect(designatedScorecard).toContain("courseHole.yardage");
});
