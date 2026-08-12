import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseCatalog, SavedCourseSetup } from "../courseModel";
import { getSupabaseBrowserClient } from "../supabaseClient";

type Row = Record<string, unknown>;

const client = () => {
  const value = getSupabaseBrowserClient();
  if (!value) throw new Error("Supabase is not configured.");
  return value;
};

const rows = <T>(data: T[] | null, error: { message?: string } | null) => {
  if (error) throw error;
  return data ?? [];
};

export const loadCourseCatalogWithClient = async (supabase: SupabaseClient): Promise<CourseCatalog> => {
  const [coursesResult, holesResult, teesResult, yardagesResult, setupsResult, setupHolesResult] = await Promise.all([
    supabase.from("courses").select("*").order("name"),
    supabase.from("course_holes").select("*").order("hole_number"),
    supabase.from("course_tee_sets").select("*").order("display_order").order("name"),
    supabase.from("course_tee_hole_yardages").select("*").order("hole_number"),
    supabase.from("saved_course_setups").select("*").eq("is_archived", false).order("name"),
    supabase.from("saved_course_setup_holes").select("*").order("hole_number"),
  ]);
  const courseRows = rows(coursesResult.data as Row[] | null, coursesResult.error);
  const holeRows = rows(holesResult.data as Row[] | null, holesResult.error);
  const teeRows = rows(teesResult.data as Row[] | null, teesResult.error);
  const yardageRows = rows(yardagesResult.data as Row[] | null, yardagesResult.error);
  const setupRows = rows(setupsResult.data as Row[] | null, setupsResult.error);
  const setupHoleRows = rows(setupHolesResult.data as Row[] | null, setupHolesResult.error);
  return {
    courses: courseRows.map((course) => ({
      id: String(course.id), name: String(course.name), city: course.city ? String(course.city) : null,
      state: course.state ? String(course.state) : null, par: Number(course.par), holeCount: Number(course.hole_count),
      holes: holeRows.filter((hole) => hole.course_id === course.id).map((hole) => ({ holeNumber: Number(hole.hole_number), par: Number(hole.par), handicapIndex: Number(hole.handicap_index) })),
      teeSets: teeRows.filter((tee) => tee.course_id === course.id).map((tee) => ({
        id: String(tee.id), courseId: String(tee.course_id), name: String(tee.name), color: String(tee.color),
        rating: tee.rating == null ? null : Number(tee.rating), slope: tee.slope == null ? null : Number(tee.slope), totalYardage: Number(tee.total_yardage),
        yardages: yardageRows.filter((yardage) => yardage.tee_set_id === tee.id).map((yardage) => ({ holeNumber: Number(yardage.hole_number), yardage: Number(yardage.yardage) })),
      })),
    })),
    savedSetups: setupRows.map((setup) => ({
      id: String(setup.id), ownerId: String(setup.owner_id), courseId: String(setup.course_id), name: String(setup.name),
      baseTeeSetId: setup.base_tee_set_id ? String(setup.base_tee_set_id) : null,
      holes: setupHoleRows.filter((hole) => hole.setup_id === setup.id).map((hole) => ({ holeNumber: Number(hole.hole_number), yardage: Number(hole.yardage), sourceTeeSetId: hole.source_tee_set_id ? String(hole.source_tee_set_id) : null })),
      createdAt: String(setup.created_at), updatedAt: String(setup.updated_at),
    })),
  };
};

export const loadCourseCatalog = () => loadCourseCatalogWithClient(client());

export const createSavedCourseSetupRows = async (input: Omit<SavedCourseSetup, "id" | "ownerId" | "createdAt" | "updatedAt">) => {
  const supabase = client();
  const { data, error } = await supabase.rpc("save_course_setup", {
    input_course_id: input.courseId,
    input_name: input.name.trim(),
    input_base_tee_set_id: input.baseTeeSetId,
    input_holes: input.holes,
    input_setup_id: null,
  });
  if (error) throw error;
  return String(data);
};

export const updateSavedCourseSetupRows = async (setupId: string, input: Omit<SavedCourseSetup, "id" | "ownerId" | "createdAt" | "updatedAt">) => {
  const supabase = client();
  const { data, error } = await supabase.rpc("save_course_setup", {
    input_course_id: input.courseId,
    input_name: input.name.trim(),
    input_base_tee_set_id: input.baseTeeSetId,
    input_holes: input.holes,
    input_setup_id: setupId,
  });
  if (error) throw error;
  return String(data);
};

export const deleteUnreferencedSavedCourseSetupRows = async (setupId: string) => {
  const supabase = client();
  const { error } = await supabase.rpc("delete_unreferenced_saved_course_setup", { input_setup_id: setupId });
  if (error) throw error;
};
