export type CourseHole = {
  holeNumber: number;
  par: number;
  handicapIndex: number;
};

export type CourseTeeHoleYardage = {
  holeNumber: number;
  yardage: number;
};

export type CourseTeeSet = {
  id: string;
  courseId: string;
  name: string;
  color: string;
  rating: number | null;
  slope: number | null;
  totalYardage: number;
  yardages: CourseTeeHoleYardage[];
};

export type Course = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  par: number;
  holeCount: number;
  holes: CourseHole[];
  teeSets: CourseTeeSet[];
};

export type SavedCourseSetupHole = CourseTeeHoleYardage & {
  sourceTeeSetId: string | null;
  parOverride: number | null;
};

export type SavedCourseSetup = {
  id: string;
  ownerId: string;
  courseId: string;
  name: string;
  baseTeeSetId: string | null;
  holes: SavedCourseSetupHole[];
  createdAt: string;
  updatedAt: string;
};

export type EventCourseHoleSnapshot = {
  holeNumber: number;
  par: number;
  handicapIndex: number;
  yardage: number;
  sourceTeeSetId: string | null;
};

export type EventCourseSetupSelection = {
  courseId: string;
  courseName: string;
  teeSetId: string | null;
  savedSetupId: string | null;
  setupName: string;
  holes: EventCourseHoleSnapshot[];
};

export type CourseCatalog = {
  courses: Course[];
  savedSetups: SavedCourseSetup[];
};

export type CourseHoleProjection = EventCourseHoleSnapshot & {
  position: number;
};

export type CourseTotals = {
  yardage: number;
  par: number;
  holeCount: number;
};

export type CourseRoundProjection = {
  holes: CourseHoleProjection[];
  out: CourseTotals | null;
  in: CourseTotals | null;
  total: CourseTotals;
};
