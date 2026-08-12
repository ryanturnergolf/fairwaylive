import type { Course, CourseCatalog, EventCourseSetupSelection, SavedCourseSetup } from "../courseModel";
import { createSavedCourseSetupRows, loadCourseCatalog } from "../repositories/courseRepository";

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
    holes: course.holes.map((hole) => ({ ...hole, yardage: holes.get(hole.holeNumber)!.yardage, sourceTeeSetId: holes.get(hole.holeNumber)!.sourceTeeSetId })),
  };
};

export const validateEventCourseSelection = (selection: EventCourseSetupSelection) => {
  if (!selection.courseId || !selection.courseName.trim() || selection.holes.length < 1) throw new Error("Course setup is incomplete.");
  const numbers = new Set(selection.holes.map((hole) => hole.holeNumber));
  if (numbers.size !== selection.holes.length || selection.holes.some((hole) => !Number.isInteger(hole.yardage) || hole.yardage < 1)) throw new Error("Every course hole requires a valid yardage.");
  return selection;
};

export const loadCourseManagementCatalog = (): Promise<CourseCatalog> => loadCourseCatalog();

export const saveCustomCourseSetup = async (selection: EventCourseSetupSelection, name: string) => {
  validateEventCourseSelection(selection);
  if (!name.trim()) throw new Error("Custom setup name is required.");
  return createSavedCourseSetupRows({
    courseId: selection.courseId, name: name.trim(), baseTeeSetId: selection.teeSetId,
    holes: selection.holes.map((hole) => ({ holeNumber: hole.holeNumber, yardage: hole.yardage, sourceTeeSetId: hole.sourceTeeSetId })),
  });
};
