"use client";

import Link from "next/link";
import { CoachBreadcrumbs, CoachHeader } from "../../components/CoachChrome";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  CreateQualifyingSessionInput,
  QualifyingGroup,
  QualifyingHolesPerDay,
  QualifyingRosterPlayer,
  QualifyingRosterType,
  QualifyingScoringMode,
} from "../../../lib/qualifyingModel";
import {
  autoBalanceQualifyingGroups,
  validateQualifyingCreation,
} from "../../../lib/services/qualifyingCreationService";
import { loadCurrentQualifyingRoster } from "../../../lib/services/rosterFoundationService";
import { buildQualifyingRoundPlan } from "../../../lib/services/qualifyingScheduleService";
import { createQualifyingSessionDraft } from "../../../lib/services/qualifyingSessionService";

type DayDraft = CreateQualifyingSessionInput["days"][number];

const steps = ["Basics", "Players", "Schedule", "Groups", "Scoring", "Review"];
const inputClass = "mt-2 w-full rounded-lg border border-[#D9D0C0] bg-white px-3 py-2 text-[#0B3D2E]";
const emptyDay = (dayNumber: number): DayDraft => ({
  dayNumber,
  playDate: "",
  holesTotal: 18,
  courseName: "",
  teeName: "",
  startingHole: 1,
});

export default function CreateQualifyingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [rosterType, setRosterType] = useState<QualifyingRosterType>("men");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [days, setDays] = useState<DayDraft[]>([emptyDay(1)]);
  const [groups, setGroups] = useState<QualifyingGroup[]>([]);
  const [groupCount, setGroupCount] = useState(1);
  const [scoringMode, setScoringMode] = useState<QualifyingScoringMode>("reciprocal");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [rosters, setRosters] = useState<Record<QualifyingRosterType, QualifyingRosterPlayer[]>>({ men: [], women: [] });
  const [rosterSeasonName, setRosterSeasonName] = useState("");
  const [isRosterLoading, setIsRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState("");

  const roster = rosters[rosterType];
  const selectedPlayers = roster.filter((player) => selectedPlayerIds.includes(player.id));
  const input: CreateQualifyingSessionInput = { name, rosterType, selectedPlayers, days, groups, scoringMode };

  useEffect(() => {
    let cancelled = false;
    setIsRosterLoading(true);
    setRosterError("");
    void Promise.all([
      loadCurrentQualifyingRoster("men"),
      loadCurrentQualifyingRoster("women"),
    ]).then(([men, women]) => {
      if (cancelled) return;
      setRosters({ men: men.players, women: women.players });
      setRosterSeasonName(men.season?.name ?? women.season?.name ?? "");
    }).catch((loadError) => {
      if (!cancelled) setRosterError(loadError instanceof Error ? loadError.message : "Unable to load coach rosters.");
    }).finally(() => {
      if (!cancelled) setIsRosterLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const changeRoster = (nextRoster: QualifyingRosterType) => {
    setRosterType(nextRoster);
    setSelectedPlayerIds([]);
    setGroups([]);
    setError("");
  };

  const setNumberOfDays = (count: number) => {
    const nextCount = Math.max(1, Math.min(14, count || 1));
    setDays((current) =>
      Array.from({ length: nextCount }, (_, index) => current[index] ?? emptyDay(index + 1))
        .map((day, index) => ({ ...day, dayNumber: index + 1 }))
    );
  };

  const updateDay = (index: number, patch: Partial<DayDraft>) => {
    setDays((current) => current.map((day, dayIndex) => dayIndex === index ? { ...day, ...patch } : day));
  };

  const assignPlayer = (playerId: string, groupId: string) => {
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        playerIds: group.id === groupId
          ? [...new Set([...group.playerIds, playerId])]
          : group.playerIds.filter((id) => id !== playerId),
      }))
    );
  };

  const validateStep = () => {
    if (step === 0 && !name.trim()) return "Qualifying name is required.";
    if (step === 1 && selectedPlayers.length < 1) return "Select at least one player.";
    if (
      step === 2 &&
      days.some((day) => !day.playDate || !day.courseName.trim() || !day.teeName.trim() || day.startingHole < 1 || day.startingHole > 18)
    ) return "Complete every day before continuing.";
    if (step === 3) {
      if (groups.length < 1 || groups.some((group) => group.playerIds.length < 1)) return "Empty groups are not allowed.";
      const assigned = groups.flatMap((group) => group.playerIds);
      if (assigned.length !== selectedPlayers.length || new Set(assigned).size !== selectedPlayers.length) {
        return "Assign every selected player to exactly one group.";
      }
    }
    return "";
  };

  const next = () => {
    const stepError = validateStep();
    if (stepError) {
      setError(stepError);
      return;
    }
    setError("");
    setStep((current) => Math.min(5, current + 1));
  };

  const save = async () => {
    const validation = validateQualifyingCreation(input);
    if (!validation.ok) {
      setError(validation.errors[0]);
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await createQualifyingSessionDraft(input);
      router.push("/coach-dashboard/qualifying-manager?created=1");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save qualifying.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <CoachHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Qualifying", href: "/coach-dashboard/qualifying-manager" }, { label: "Create" }]} />
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Qualifying Setup</p>
            <h1 className="mt-2 text-3xl font-black">Create Qualifying</h1>
          </div>
          <Link href="/coach-dashboard/qualifying-manager" className="text-sm font-bold text-[#51635C]">Cancel</Link>
        </div>

        <ol className="mt-7 grid grid-cols-3 gap-2 md:grid-cols-6" aria-label="Creation progress">
          {steps.map((label, index) => (
            <li key={label} className={`rounded-lg px-2 py-2 text-center text-xs font-black ${index === step ? "bg-[#0B3D2E] text-white" : "bg-white text-[#51635C]"}`}>
              {index + 1}. {label}
            </li>
          ))}
        </ol>

        <section className="mt-5 rounded-lg border border-[#E8DCC8] bg-white p-5 md:p-7">
          {step === 0 && (
            <div>
              <h2 className="text-2xl font-black">Qualifying basics</h2>
              <label className="mt-5 block font-bold">Qualifying name
                <input aria-label="Qualifying name" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <fieldset className="mt-6">
                <legend className="font-bold">Roster</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {(["men", "women"] as const).map((type) => (
                    <label key={type} className="rounded-lg border border-[#D9D0C0] p-4 font-black">
                      <input type="radio" name="roster" checked={rosterType === type} onChange={() => changeRoster(type)} />{" "}
                      {type === "men" ? "Men's roster" : "Women's roster"}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-2xl font-black">Select players</h2><p className="mt-1 text-sm text-[#51635C]">{selectedPlayers.length} selected</p></div>
                <button type="button" className="rounded-lg border border-[#0B3D2E] px-4 py-2 font-black" onClick={() => setSelectedPlayerIds(selectedPlayerIds.length === roster.length ? [] : roster.map((player) => player.id))}>
                  {selectedPlayerIds.length === roster.length ? "Clear All" : "Select All"}
                </button>
              </div>
              {rosterSeasonName ? <p className="mt-2 text-sm text-[#51635C]">Season: {rosterSeasonName}</p> : null}
              {isRosterLoading ? <p className="mt-5 text-sm font-semibold text-[#51635C]">Loading roster…</p> : null}
              {rosterError ? <p role="alert" className="mt-5 text-sm font-semibold text-[#8A2E2E]">{rosterError}</p> : null}
              {!isRosterLoading && !rosterError && roster.length === 0 ? <p className="mt-5 rounded-lg bg-[#FCFAF5] p-4 text-sm text-[#51635C]">No eligible players are available on this roster for the active season.</p> : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {roster.map((player) => (
                  <label key={player.id} className="rounded-lg border border-[#D9D0C0] p-4">
                    <input type="checkbox" checked={selectedPlayerIds.includes(player.id)} onChange={(event) => setSelectedPlayerIds((current) => event.target.checked ? [...current, player.id] : current.filter((id) => id !== player.id))} />{" "}
                    <span className="font-black">{player.name}</span> <span className="text-sm text-[#51635C]">· {player.classYear}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-black">Qualifying schedule</h2>
              <label className="mt-5 block max-w-xs font-bold">Number of qualifying days
                <input aria-label="Number of qualifying days" type="number" min={1} max={14} className={inputClass} value={days.length} onChange={(event) => setNumberOfDays(Number(event.target.value))} />
              </label>
              <div className="mt-5 grid gap-4">
                {days.map((day, index) => (
                  <fieldset key={day.dayNumber} className="rounded-lg border border-[#D9D0C0] p-4">
                    <legend className="px-2 font-black">Day {day.dayNumber}</legend>
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="font-bold">Date<input aria-label={`Day ${day.dayNumber} date`} type="date" className={inputClass} value={day.playDate} onChange={(event) => updateDay(index, { playDate: event.target.value })} /></label>
                      <label className="font-bold">Holes<select aria-label={`Day ${day.dayNumber} holes`} className={inputClass} value={day.holesTotal} onChange={(event) => updateDay(index, { holesTotal: Number(event.target.value) as QualifyingHolesPerDay })}>{[9, 18, 27, 36].map((holes) => <option key={holes}>{holes}</option>)}</select></label>
                      <label className="font-bold">Starting hole<input aria-label={`Day ${day.dayNumber} starting hole`} type="number" min={1} max={18} className={inputClass} value={day.startingHole} onChange={(event) => updateDay(index, { startingHole: Number(event.target.value) })} /></label>
                      <label className="font-bold">Course<input aria-label={`Day ${day.dayNumber} course`} className={inputClass} value={day.courseName} onChange={(event) => updateDay(index, { courseName: event.target.value })} /></label>
                      <label className="font-bold">Tee<input aria-label={`Day ${day.dayNumber} tee`} className={inputClass} value={day.teeName} onChange={(event) => updateDay(index, { teeName: event.target.value })} /></label>
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-2xl font-black">Create groups</h2>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="font-bold">Number of groups<input aria-label="Number of groups" type="number" min={1} max={selectedPlayers.length} className={`${inputClass} w-28`} value={groupCount} onChange={(event) => setGroupCount(Number(event.target.value))} /></label>
                <button type="button" className="rounded-lg bg-[#0B3D2E] px-4 py-2 font-black text-white" onClick={() => setGroups(autoBalanceQualifyingGroups(selectedPlayers, groupCount))}>Auto-balance</button>
              </div>
              {groups.length === 0 ? <p className="mt-5 rounded-lg bg-[#FCFAF5] p-4 text-sm text-[#51635C]">Choose a group count and auto-balance, then adjust assignments manually.</p> : (
                <div className="mt-5 grid gap-3">
                  {selectedPlayers.map((player) => (
                    <label key={player.id} className="grid items-center gap-2 rounded-lg border border-[#D9D0C0] p-3 sm:grid-cols-2">
                      <span className="font-black">{player.name}</span>
                      <select aria-label={`${player.name} group`} className="rounded-lg border border-[#D9D0C0] px-3 py-2" value={groups.find((group) => group.playerIds.includes(player.id))?.id ?? ""} onChange={(event) => assignPlayer(player.id, event.target.value)}>
                        <option value="">Unassigned</option>
                        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <fieldset>
              <legend className="text-2xl font-black">Scoring mode</legend>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="rounded-lg border border-[#D9D0C0] p-5"><input type="radio" name="scoringMode" checked={scoringMode === "reciprocal"} onChange={() => setScoringMode("reciprocal")} /> <span className="font-black">Reciprocal</span><p className="mt-2 text-sm text-[#51635C]">Default setup. Scoring behavior is not created in Q2.</p></label>
                <label className="rounded-lg border border-[#D9D0C0] p-5"><input type="radio" name="scoringMode" checked={scoringMode === "designated_scorer"} onChange={() => setScoringMode("designated_scorer")} /> <span className="font-black">Designated Group Scorer</span><p className="mt-2 text-sm text-[#51635C]">Stores this choice only. Designated-scorer behavior is not enabled.</p></label>
              </div>
            </fieldset>
          )}

          {step === 5 && (
            <div>
              <h2 className="text-2xl font-black">Review qualifying</h2>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div><dt className="text-xs font-black uppercase text-[#B8892D]">Name</dt><dd className="mt-1 font-bold">{name}</dd></div>
                <div><dt className="text-xs font-black uppercase text-[#B8892D]">Team</dt><dd className="mt-1 font-bold">{rosterType === "men" ? "Men's roster" : "Women's roster"}</dd></div>
                <div><dt className="text-xs font-black uppercase text-[#B8892D]">Players</dt><dd className="mt-1">{selectedPlayers.map((player) => player.name).join(", ")}</dd></div>
                <div><dt className="text-xs font-black uppercase text-[#B8892D]">Scoring mode</dt><dd className="mt-1 font-bold">{scoringMode === "reciprocal" ? "Reciprocal" : "Designated Group Scorer"}</dd></div>
              </dl>
              <h3 className="mt-6 font-black">Days and hole mapping</h3>
              <div className="mt-2 grid gap-2">
                {days.map((day) => <p key={day.dayNumber} className="rounded-lg bg-[#FCFAF5] p-3">Day {day.dayNumber}: {day.playDate} · {day.holesTotal} holes · {day.courseName} · {day.teeName} · Start {day.startingHole}</p>)}
                {buildQualifyingRoundPlan(days).map((round) => <p key={round.roundNumber} className="text-sm text-[#51635C]">Round {round.roundNumber}: Day {round.qualifyingDay}, Segment {round.qualifyingSegment}, {round.holeCount} holes</p>)}
              </div>
              <h3 className="mt-6 font-black">Groups</h3>
              <div className="mt-2 grid gap-2">
                {groups.map((group) => <p key={group.id} className="rounded-lg bg-[#FCFAF5] p-3"><strong>{group.name}:</strong> {group.playerIds.map((id) => selectedPlayers.find((player) => player.id === id)?.name).filter(Boolean).join(", ")}</p>)}
              </div>
            </div>
          )}

          {error && <p role="alert" className="mt-5 rounded-lg bg-[#FFF4F1] p-3 font-bold text-[#8A2E2E]">{error}</p>}
          <div className="mt-7 flex justify-between gap-3">
            <button type="button" disabled={step === 0 || isSaving} className="rounded-lg border border-[#0B3D2E] px-5 py-2 font-black disabled:opacity-40" onClick={() => { setError(""); setStep((current) => Math.max(0, current - 1)); }}>Back</button>
            {step < 5 ? (
              <button type="button" className="rounded-lg bg-[#0B3D2E] px-5 py-2 font-black text-white" onClick={next}>Continue</button>
            ) : (
              <button type="button" disabled={isSaving} className="rounded-lg bg-[#0B3D2E] px-5 py-2 font-black text-white disabled:opacity-50" onClick={() => void save()}>{isSaving ? "Saving…" : "Save Qualifying"}</button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
