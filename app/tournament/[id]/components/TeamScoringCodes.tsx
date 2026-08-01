"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTeamTournamentCodeAssignment,
  loadTeamTournamentCodes,
  regenerateTeamTournamentCode,
  type TeamCodeAssignment,
} from "../../../lib/services/teamTournamentLoginService";

type TeamItem = { id: string | number; name?: string; schoolName?: string; shortName?: string };

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Copy failed");
};

export default function TeamScoringCodes({
  tournamentId,
  tournamentName,
  teams,
}: {
  tournamentId: string;
  tournamentName: string;
  teams: TeamItem[];
}) {
  const orderedTeams = useMemo(() => teams.map((team) => ({
    id: String(team.id),
    name: team.name || team.schoolName || team.shortName || "Unnamed Team",
  })), [teams]);
  const [assignments, setAssignments] = useState<TeamCodeAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyTeamId, setBusyTeamId] = useState("");
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<TeamCodeAssignment | null>(null);

  const refresh = useCallback(async () => {
    if (!tournamentId) return;
    setIsLoading(true);
    setError("");
    try {
      const result = await loadTeamTournamentCodes(tournamentId);
      setAssignments(result.assignments);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Team codes are temporarily unavailable.");
    } finally {
      setIsLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const assignmentsByTeam = useMemo(() => new Map(assignments.map((item) => [item.teamId, item])), [assignments]);

  const updateAssignment = (assignment: TeamCodeAssignment) => {
    setAssignments((current) => [...current.filter((item) => item.teamId !== assignment.teamId), assignment]);
  };

  const handleCopy = async (assignment: TeamCodeAssignment) => {
    try {
      await copyText(assignment.code);
      setFeedback((current) => ({ ...current, [assignment.teamId]: "Code copied" }));
    } catch {
      setFeedback((current) => ({ ...current, [assignment.teamId]: "Copy failed. Select the code and copy it manually." }));
    }
  };

  const handleGenerate = async (team: { id: string; name: string }) => {
    setBusyTeamId(team.id);
    setFeedback((current) => ({ ...current, [team.id]: "" }));
    try {
      const result = await createTeamTournamentCodeAssignment({ tournamentId, teamId: team.id, teamName: team.name });
      updateAssignment(result.assignment);
      setFeedback((current) => ({ ...current, [team.id]: "Code generated" }));
    } catch (generateError) {
      setFeedback((current) => ({ ...current, [team.id]: generateError instanceof Error ? generateError.message : "Code generation failed." }));
    } finally {
      setBusyTeamId("");
    }
  };

  const handleRegenerate = async () => {
    if (!confirming) return;
    const previous = confirming;
    setConfirming(null);
    setBusyTeamId(previous.teamId);
    try {
      const result = await regenerateTeamTournamentCode({ tournamentId, teamId: previous.teamId });
      updateAssignment(result.assignment);
      setFeedback((current) => ({ ...current, [previous.teamId]: "New code active. The previous code is now invalid." }));
    } catch (regenerateError) {
      setFeedback((current) => ({ ...current, [previous.teamId]: regenerateError instanceof Error ? regenerateError.message : "Code regeneration failed." }));
    } finally {
      setBusyTeamId("");
    }
  };

  return (
    <section aria-labelledby="team-scoring-codes-title" className="mb-6 rounded-[24px] border border-[#E8DCC8] bg-[#FCFAF5] p-5 shadow-[0_18px_45px_rgba(11,61,46,0.06)] sm:rounded-[28px] sm:p-6 print:shadow-none">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:hidden">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-[#B8892D]">Player Access</p>
          <h3 id="team-scoring-codes-title" className="mt-2 text-2xl font-black text-[#0B3D2E]">Team Scoring Codes</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#51635C]">Give each team its code for guest access to the existing mobile scorecard.</p>
        </div>
        <button type="button" onClick={() => window.print()} disabled={assignments.length === 0} className="rounded-full border border-[#B8892D] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[#0B3D2E] disabled:opacity-50">Print Team Codes</button>
      </div>

      <div className="hidden print:block print:text-black">
        <h1 className="text-3xl font-black">Clubhouse HQ</h1>
        <h2 className="mt-2 text-2xl font-bold">{tournamentName}</h2>
        <p className="mt-2 text-sm">Printed {new Date().toLocaleString()}</p>
        <p className="mt-4">Go to Clubhouse HQ, choose Player Tournament Login, enter your team code, then select your name.</p>
      </div>

      {isLoading ? <p role="status" className="mt-6 text-sm font-bold text-[#51635C]">Loading team scoring codes...</p> : null}
      {error ? <div role="alert" className="mt-6 rounded-2xl border border-[#D9857F] bg-[#FFF0EE] p-4 text-sm font-bold text-[#8D2D24]">{error} <button type="button" onClick={() => void refresh()} className="ml-2 underline">Retry</button></div> : null}
      {!isLoading && !error && orderedTeams.length === 0 ? <p className="mt-6 rounded-2xl border border-[#E8DCC8] p-4 text-sm font-bold text-[#51635C]">No participating teams are available yet.</p> : null}

      {!isLoading && !error ? <div className="mt-6 grid gap-4 md:grid-cols-2 print:block">
        {orderedTeams.map((team) => {
          const assignment = assignmentsByTeam.get(team.id);
          return <article key={team.id} className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm print:mb-6 print:break-inside-avoid print:border-black print:shadow-none">
            <p className="font-black text-[#0B3D2E] print:text-black">{team.name}</p>
            <p aria-label={`${team.name} team scoring code`} className="mt-3 select-all break-all font-mono text-2xl font-black tracking-[0.18em] text-[#0B3D2E] sm:text-3xl sm:tracking-[0.22em] print:text-5xl print:text-black">{assignment?.code || "Not generated"}</p>
            <p className="mt-3 hidden text-sm print:block">Go to Clubhouse HQ, choose Player Tournament Login, enter your team code, then select your name.</p>
            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              {assignment ? <>
                <button type="button" onClick={() => void handleCopy(assignment)} className="rounded-full border border-[#B8892D] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#0B3D2E]">Copy Code</button>
                <button type="button" onClick={() => setConfirming(assignment)} disabled={busyTeamId === team.id} className="rounded-full bg-[#0B3D2E] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-50">{busyTeamId === team.id ? "Regenerating..." : "Regenerate Code"}</button>
              </> : <button type="button" onClick={() => void handleGenerate(team)} disabled={busyTeamId === team.id} className="rounded-full bg-[#0B3D2E] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-50">{busyTeamId === team.id ? "Generating..." : "Generate Code"}</button>}
            </div>
            {feedback[team.id] ? <p role="status" className="mt-3 text-xs font-bold text-[#51635C] print:hidden">{feedback[team.id]}</p> : null}
          </article>;
        })}
      </div> : null}

      {confirming ? <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[#0B3D2E]/70 px-4 py-4 sm:items-center print:hidden" role="dialog" aria-modal="true" aria-labelledby="regenerate-code-title">
        <div className="my-auto w-full max-w-lg rounded-[28px] bg-[#F6F1E6] p-5 shadow-2xl sm:p-7">
          <h4 id="regenerate-code-title" className="text-2xl font-black text-[#0B3D2E]">Regenerate {confirming.teamName}&apos;s code?</h4>
          <p className="mt-4 leading-7 text-[#51635C]">The old code will stop working immediately. Players using it will need the new code. Already-open scorecards remain governed by their existing scoped share token.</p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setConfirming(null)} className="rounded-full border border-[#B8892D] px-5 py-3 text-sm font-black text-[#0B3D2E]">Cancel</button>
            <button type="button" onClick={() => void handleRegenerate()} className="rounded-full bg-[#8D2D24] px-5 py-3 text-sm font-black text-white">Regenerate Code</button>
          </div>
        </div>
      </div> : null}
    </section>
  );
}
