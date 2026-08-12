"use client";

import { useEffect, useMemo, useState } from "react";
import type { CourseCatalog, EventCourseSetupSelection } from "../lib/courseModel";
import {
  buildCourseSelectionFromSavedSetup,
  buildCourseSelectionFromTee,
  loadCourseManagementCatalog,
  saveCustomCourseSetup,
} from "../lib/services/courseService";

type Props = {
  labelPrefix?: string;
  value: EventCourseSetupSelection | null;
  onChange: (value: EventCourseSetupSelection | null) => void;
  onCourseNameChange?: (name: string) => void;
  onSetupNameChange?: (name: string) => void;
};

const inputClass = "w-full rounded-lg border border-[#D9D0C0] bg-white px-3 py-2 text-sm text-[#0B3D2E]";

export default function CourseSetupEditor({ labelPrefix = "Event", value, onChange, onCourseNameChange, onSetupNameChange }: Props) {
  const [catalog, setCatalog] = useState<CourseCatalog>({ courses: [], savedSetups: [] });
  const [error, setError] = useState("");
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCourseManagementCatalog().then(setCatalog).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load courses."));
  }, []);

  const course = catalog.courses.find((candidate) => candidate.id === value?.courseId) ?? null;
  const options = useMemo(() => course ? [
    ...course.teeSets.map((tee) => ({ id: `tee:${tee.id}`, label: `${tee.name} — ${tee.totalYardage.toLocaleString()} yards` })),
    ...catalog.savedSetups.filter((setup) => setup.courseId === course.id).map((setup) => ({ id: `saved:${setup.id}`, label: `${setup.name} — Saved setup` })),
  ] : [], [catalog.savedSetups, course]);
  const standard = course?.teeSets.find((tee) => tee.id === value?.teeSetId);
  const standardYardages = new Map(standard?.yardages.map((hole) => [hole.holeNumber, hole.yardage]) ?? []);
  const differs = Boolean(value && standard && value.holes.some((hole) => hole.yardage !== standardYardages.get(hole.holeNumber)));

  const chooseCourse = (courseId: string) => {
    const selected = catalog.courses.find((candidate) => candidate.id === courseId);
    if (!selected?.teeSets[0]) return onChange(null);
    const next = buildCourseSelectionFromTee(selected, selected.teeSets[0].id);
    onChange(next); onCourseNameChange?.(next.courseName); onSetupNameChange?.(next.setupName);
  };
  const chooseSetup = (key: string) => {
    if (!course) return;
    const [kind, id] = key.split(":");
    const next = kind === "tee"
      ? buildCourseSelectionFromTee(course, id)
      : buildCourseSelectionFromSavedSetup(course, catalog.savedSetups.find((setup) => setup.id === id)!);
    onChange(next); onSetupNameChange?.(next.setupName);
  };
  const updateHole = (holeNumber: number, yardage: number, sourceTeeSetId: string | null) => {
    if (!value || !Number.isFinite(yardage)) return;
    onChange({ ...value, savedSetupId: null, holes: value.holes.map((hole) => hole.holeNumber === holeNumber ? { ...hole, yardage, sourceTeeSetId } : hole) });
  };
  const save = async () => {
    if (!value) return;
    setSaving(true); setError("");
    try {
      const id = await saveCustomCourseSetup(value, customName);
      const next = { ...value, savedSetupId: id, setupName: customName.trim() };
      onChange(next); onSetupNameChange?.(next.setupName); setCustomName("");
      setCatalog(await loadCourseManagementCatalog());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save setup."); }
    finally { setSaving(false); }
  };

  return <section className="space-y-4 rounded-xl border border-[#D9D0C0] bg-[#FCFAF5] p-4" aria-label={`${labelPrefix} catalog configuration`}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-bold">Course<select aria-label={`${labelPrefix} catalog course`} className={`mt-1 ${inputClass}`} value={value?.courseId ?? ""} onChange={(event) => chooseCourse(event.target.value)}><option value="">Select a catalog course</option>{catalog.courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm font-bold">Tee / Setup<select aria-label={`${labelPrefix} catalog setup`} className={`mt-1 ${inputClass}`} disabled={!course} value={value?.savedSetupId ? `saved:${value.savedSetupId}` : value?.teeSetId ? `tee:${value.teeSetId}` : ""} onChange={(event) => chooseSetup(event.target.value)}><option value="">Select tee or setup</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    </div>
    {error ? <p role="alert" className="text-sm font-bold text-[#9B2C2C]">{error}</p> : null}
    {course && value ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr><th className="p-2">Hole</th><th className="p-2">Par</th><th className="p-2">Standard</th><th className="p-2">Use another tee</th><th className="p-2">Event Yardage</th></tr></thead><tbody>{value.holes.map((hole) => <tr key={hole.holeNumber} className="border-t border-[#E8DCC8]"><td className="p-2 font-black">{hole.holeNumber}</td><td className="p-2">{hole.par}</td><td className="p-2">{standardYardages.get(hole.holeNumber) ?? "—"}</td><td className="p-2"><select aria-label={`Hole ${hole.holeNumber} source tee`} className={inputClass} value={hole.sourceTeeSetId ?? "custom"} onChange={(event) => { const tee = course.teeSets.find((item) => item.id === event.target.value); const yardage = tee?.yardages.find((item) => item.holeNumber === hole.holeNumber)?.yardage; if (yardage) updateHole(hole.holeNumber, yardage, tee!.id); else updateHole(hole.holeNumber, hole.yardage, null); }}><option value="custom">Custom</option>{course.teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name}: {tee.yardages.find((item) => item.holeNumber === hole.holeNumber)?.yardage}</option>)}</select></td><td className="p-2"><input aria-label={`Hole ${hole.holeNumber} event yardage`} className={inputClass} type="number" min="1" value={hole.yardage} onChange={(event) => updateHole(hole.holeNumber, Number(event.target.value), null)} /></td></tr>)}</tbody></table></div> : null}
    {differs && value ? <div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Custom setup name" className={inputClass} placeholder="Custom setup name" value={customName} onChange={(event) => setCustomName(event.target.value)} /><button type="button" disabled={saving || !customName.trim()} className="min-h-11 rounded-lg bg-[#0B3D2E] px-4 font-black text-white disabled:opacity-50" onClick={save}>{saving ? "Saving…" : "Save as Custom Setup"}</button></div> : null}
  </section>;
}
