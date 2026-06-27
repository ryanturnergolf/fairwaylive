"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent, type SetStateAction } from "react";

type RoundSetup = {
  date: string;
  teeTime: string;
  startingHole: string;
  holes: string;
  teeBoxes: string;
};

type FormState = {
  name: string;
  hostSchool: string;
  date: string;
  course: string;
  city: string;
  state: string;
  rounds: string;
  scoringFormat: string;
  eventType: string;
  teamSize: string;
  countingScores: string;
  startFormat: "Tee" | "Shotgun";
  startingHoles: string;
  roundSetup: RoundSetup[];
  integrations: {
    clubhouseLiveScoring: boolean;
    clippdTournamentId: string;
    clippdTournamentKey: string;
  };
};

type TournamentTemplate = {
  id: number;
  tournamentName: string;
  numberOfRounds: string;
  teamSize: string;
  countingScores: string;
  startFormat: "Tee" | "Shotgun";
  startingHoles: string;
  roundSettings: RoundSetup[];
  liveScoringSettings: {
    clubhouseLiveScoring: boolean;
    clippdTournamentId: string;
    clippdTournamentKey: string;
  };
  formState: FormState;
};

const TEMPLATE_STORAGE_KEY = "clubhouse-hq-tournament-templates";

const createRoundSetup = (count: number): RoundSetup[] =>
  Array.from({ length: count }, () => ({
    date: "",
    teeTime: "",
    startingHole: "1",
    holes: "18",
    teeBoxes: "White",
  }));

const defaultBlankTemplateForm = {
  tournamentName: "",
  numberOfRounds: "1",
  teamSize: "5",
  countingScores: "4",
  startFormat: "Tee" as "Tee" | "Shotgun",
  startingHoles: "1",
  liveScoringEnabled: true,
};

const buildFormStateFromTemplate = (template: {
  tournamentName: string;
  numberOfRounds: string;
  teamSize: string;
  countingScores: string;
  startFormat: "Tee" | "Shotgun";
  startingHoles: string;
  liveScoringEnabled: boolean;
}): FormState => {
  const rounds = Math.max(1, Number(template.numberOfRounds) || 1);

  return {
    name: template.tournamentName,
    hostSchool: "",
    date: "",
    course: "",
    city: "",
    state: "",
    rounds: String(rounds),
    scoringFormat: "Stroke Play",
    eventType: "Both",
    teamSize: template.teamSize,
    countingScores: template.countingScores,
    startFormat: template.startFormat,
    startingHoles: template.startingHoles,
    roundSetup: createRoundSetup(rounds),
    integrations: {
      clubhouseLiveScoring: template.liveScoringEnabled,
      clippdTournamentId: "",
      clippdTournamentKey: "",
    },
  };
};

const loadTemplates = (): TournamentTemplate[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed) ? (parsed as TournamentTemplate[]) : [];
  } catch {
    return [];
  }
};

export default function TournamentTemplatesPage() {
  const [templates, setTemplates] = useState<TournamentTemplate[]>(() => loadTemplates());
  const [blankTemplateForm, setBlankTemplateForm] = useState(defaultBlankTemplateForm);

  const saveTemplates = (nextValue: SetStateAction<TournamentTemplate[]>) => {
    setTemplates((current) => {
      const nextTemplates = typeof nextValue === "function" ? nextValue(current) : nextValue;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(nextTemplates));
      }

      return nextTemplates;
    });
  };

  const handleBlankTemplateInput = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = event.target as HTMLInputElement;

    setBlankTemplateForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleCreateBlankTemplate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formState = buildFormStateFromTemplate(blankTemplateForm);

    saveTemplates((current) => {
      const nextId = current.reduce((maxId, template) => Math.max(maxId, template.id), 0) + 1;

      const nextTemplate: TournamentTemplate = {
        id: nextId,
        tournamentName: blankTemplateForm.tournamentName.trim() || "New Template",
        numberOfRounds: formState.rounds,
        teamSize: formState.teamSize,
        countingScores: formState.countingScores,
        startFormat: formState.startFormat,
        startingHoles: formState.startingHoles,
        roundSettings: formState.roundSetup,
        liveScoringSettings: {
          ...formState.integrations,
        },
        formState,
      };

      return [nextTemplate, ...current];
    });
    setBlankTemplateForm(defaultBlankTemplateForm);
  };

  const handleDuplicateTemplate = (template: TournamentTemplate) => {
    saveTemplates((current) => {
      const nextId = current.reduce((maxId, existingTemplate) => Math.max(maxId, existingTemplate.id), 0) + 1;
      const duplicatedTemplate: TournamentTemplate = {
        ...template,
        id: nextId,
        tournamentName: `${template.tournamentName} Copy`,
      };

      return [duplicatedTemplate, ...current];
    });
  };

  const handleDeleteTemplate = (templateId: number) => {
    saveTemplates((current) => current.filter((template) => template.id !== templateId));
  };

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8 lg:py-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-sm font-black tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15">
            HQ
          </div>
          <div>
            <h1 className="text-lg font-black tracking-[-0.02em]">Clubhouse HQ</h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">
              College Golf Operations
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#0B3D2E]/75 md:flex">
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/dashboard">
            Dashboard
          </Link>
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/live">
            Live Scores
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8 lg:py-12">
        <div className="rounded-[36px] border border-[#E8DCC8] bg-white/90 p-8 shadow-[0_24px_80px_rgba(11,61,46,0.08)] backdrop-blur lg:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">Operations</p>
              <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] sm:text-5xl">Tournament Templates</h2>
            </div>
            <Link
              href="/dashboard"
              className="rounded-full border border-[#B8892D] px-6 py-3 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
            >
              Back to Dashboard
            </Link>
          </div>

          <form className="mt-10 rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]" onSubmit={handleCreateBlankTemplate}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">Create New Blank Template</p>
              <button
                type="submit"
                className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
              >
                Save Template
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] md:col-span-2">
                <span>Tournament Name</span>
                <input
                  name="tournamentName"
                  value={blankTemplateForm.tournamentName}
                  onChange={handleBlankTemplateInput}
                  className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                  placeholder="e.g. Fall Classic Template"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                <span>Number of Rounds</span>
                <input
                  name="numberOfRounds"
                  type="number"
                  min="1"
                  max="4"
                  value={blankTemplateForm.numberOfRounds}
                  onChange={handleBlankTemplateInput}
                  className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                <span>Team Size</span>
                <input
                  name="teamSize"
                  type="number"
                  min="1"
                  max="12"
                  value={blankTemplateForm.teamSize}
                  onChange={handleBlankTemplateInput}
                  className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                <span>Counting Scores</span>
                <input
                  name="countingScores"
                  type="number"
                  min="1"
                  max="10"
                  value={blankTemplateForm.countingScores}
                  onChange={handleBlankTemplateInput}
                  className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                <span>Tee or Shotgun</span>
                <select
                  name="startFormat"
                  value={blankTemplateForm.startFormat}
                  onChange={handleBlankTemplateInput}
                  className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                >
                  <option value="Tee">Tee</option>
                  <option value="Shotgun">Shotgun</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                <span>Starting Holes</span>
                <input
                  name="startingHoles"
                  value={blankTemplateForm.startingHoles}
                  onChange={handleBlankTemplateInput}
                  className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                  placeholder="1 or 1,10"
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] md:col-span-2">
                <input
                  name="liveScoringEnabled"
                  type="checkbox"
                  checked={blankTemplateForm.liveScoringEnabled}
                  onChange={handleBlankTemplateInput}
                  className="h-4 w-4 rounded border-[#E8DCC8]"
                />
                <span>Live Scoring Enabled</span>
              </label>
            </div>
          </form>

          {templates.length === 0 ? (
            <div className="mt-8 rounded-[32px] border border-[#E8DCC8] bg-[#FCFAF5] p-10 text-center shadow-inner">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0B3D2E] text-2xl font-black text-[#F0C96A]">HQ</div>
              <h3 className="mt-6 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">No templates yet.</h3>
              <p className="mx-auto mt-3 max-w-xl text-lg leading-8 text-[#51635C]">
                Save an existing tournament as a template or create a new blank template above.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {templates.map((template) => (
                <div key={template.id} className="rounded-[32px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Template</p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">{template.tournamentName}</h3>
                    </div>
                    <span className="rounded-full border border-[#E8DCC8] bg-[#F6F1E6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
                      {template.startFormat}
                    </span>
                  </div>

                  <div className="mt-6 space-y-3 text-sm text-[#51635C]">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Rounds</span>
                      <span className="text-right font-black text-[#0B3D2E]">{template.numberOfRounds}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Team Size</span>
                      <span className="text-right font-black text-[#0B3D2E]">{template.teamSize}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Counting Scores</span>
                      <span className="text-right font-black text-[#0B3D2E]">{template.countingScores}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Starting Holes</span>
                      <span className="text-right font-black text-[#0B3D2E]">{template.startingHoles}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Live Scoring</span>
                      <span className="text-right font-black text-[#0B3D2E]">{template.liveScoringSettings.clubhouseLiveScoring ? "Enabled" : "Disabled"}</span>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => handleDuplicateTemplate(template)}
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
