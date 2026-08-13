import type { Course, CourseCatalog, CourseRoundProjection, CourseTotals, EventCourseHoleSnapshot, EventCourseSetupSelection, SavedCourseSetup } from "../courseModel";
import { createSavedCourseSetupRows, loadCourseCatalog, updateSavedCourseSetupRows } from "../repositories/courseRepository";

export const buildCourseSelectionFromTee = (course: Course, teeSetId: string): EventCourseSetupSelection => {
  const tee = course.teeSets.find((candidate) => candidate.id === teeSetId);
  if (!tee || tee.yardages.length !== course.holeCount) throw new Error("The selected tee set is incomplete.");
  const yardages = new Map(tee.yardages.map((hole) => [hole.holeNumber, hole.yardage]));
  return {
    courseId: course.id, courseName: course.name, teeSetId: tee.id, savedSetupId: null, setupName: tee.name,
    holes: course.holes.map((hole) => ({ ...hole, yardage: yardages.get(hole.holeNumber) ?? 0, sourceTeeSetId: tee.id })),
  };
};

export const buildCourseSelectionFromSavedSetup = (course: Course, setup: SavedCourseSetup): EventCourseSetupSelection => {
  const holes = new Map(setup.holes.map((hole) => [hole.holeNumber, hole]));
  if (setup.courseId !== course.id || holes.size !== course.holeCount) throw new Error("The saved course setup is incomplete.");
  return {
    courseId: course.id, courseName: course.name, teeSetId: setup.baseTeeSetId, savedSetupId: setup.id, setupName: setup.name,
    holes: course.holes.map((hole) => ({ ...hole, par: holes.get(hole.holeNumber)!.parOverride ?? hole.par, yardage: holes.get(hole.holeNumber)!.yardage, sourceTeeSetId: holes.get(hole.holeNumber)!.sourceTeeSetId })),
  };
};

export const validateEventCourseSelection = (selection: EventCourseSetupSelection) => {
  if (!selection.courseId || !selection.courseName.trim() || selection.holes.length < 1) throw new Error("Course setup is incomplete.");
  const numbers = new Set(selection.holes.map((hole) => hole.holeNumber));
  if (numbers.size !== selection.holes.length || selection.holes.some((hole) => !Number.isInteger(hole.yardage) || hole.yardage < 1 || !Number.isInteger(hole.par) || hole.par < 1 || hole.par > 9)) throw new Error("Every course hole requires a valid par and yardage.");
  return selection;
};

export const loadCourseManagementCatalog = (): Promise<CourseCatalog> => loadCourseCatalog();

export const saveCustomCourseSetup = async (selection: EventCourseSetupSelection, name: string) => {
  validateEventCourseSelection(selection);
  if (!name.trim()) throw new Error("Custom setup name is required.");
  const input = {
    courseId: selection.courseId, name: name.trim(), baseTeeSetId: selection.teeSetId,
    holes: selection.holes.map((hole) => ({ holeNumber: hole.holeNumber, yardage: hole.yardage, sourceTeeSetId: hole.sourceTeeSetId, parOverride: hole.par })),
  };
  return selection.savedSetupId
    ? updateSavedCourseSetupRows(selection.savedSetupId, input)
    : createSavedCourseSetupRows(input);
};

const totals = (holes: EventCourseHoleSnapshot[]): CourseTotals => ({
  yardage: holes.reduce((sum, hole) => sum + hole.yardage, 0),
  par: holes.reduce((sum, hole) => sum + hole.par, 0),
  holeCount: holes.length,
});

export const buildCourseHoleSequence = (startingHole: number, holeCount: number) =>
  Array.from({ length: Math.max(0, Math.min(18, holeCount)) }, (_, index) => ((startingHole - 1 + index) % 18) + 1);

export const buildCourseRoundProjection = (
  eventHoles: EventCourseHoleSnapshot[],
  startingHole = 1,
  holeCount = eventHoles.length
): CourseRoundProjection => {
  const byNumber = new Map(eventHoles.map((hole) => [hole.holeNumber, hole]));
  const holes = buildCourseHoleSequence(startingHole, holeCount)
    .map((holeNumber, position) => {
      const hole = byNumber.get(holeNumber);
      return hole
        ? { ...hole, position: position + 1 }
        : { holeNumber, par: 0, handicapIndex: 0, yardage: 0, sourceTeeSetId: null, position: position + 1 };
    })
    ;
  const outHoles = holes.filter((hole) => hole.holeNumber <= 9);
  const inHoles = holes.filter((hole) => hole.holeNumber >= 10);
  return {
    holes,
    out: outHoles.length ? totals(outHoles) : null,
    in: inHoles.length ? totals(inHoles) : null,
    total: totals(holes),
  };
};
