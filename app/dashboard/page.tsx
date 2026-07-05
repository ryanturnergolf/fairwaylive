"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type FormEvent, type SetStateAction } from "react";
import { createTournament } from "../lib/services/tournamentService";
import {
  buildTournamentStorageEnvelope,
  getTournamentStateStorageKey,
  loadTournamentsFromStorage,
  saveTournamentsToStorage,
  seedTestTournament,
  type StoredTournament,
} from "../lib/tournamentStorage";

const stats = [
  ["Live Tournaments", "0"],
  ["Players", "0"],
  ["Teams", "0"],
  ["Rounds Today", "0"],
];

const formatOptions = [
  "Stroke Play",
  "Match Play",
  "Ryder Cup",
  "Stableford",
  "Scramble",
  "Best Ball",
];

const eventTypeOptions = ["Team Event", "Individual Event", "Both"];
const steps = ["Basic Information", "Format", "Round Setup", "Integrations", "Review"];

type Tournament = StoredTournament & { settings: FormState };

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

const loadTemplatesFromStorage = (): TournamentTemplate[] => {
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

const createRoundSetup = (count: number): RoundSetup[] =>
  Array.from({ length: count }, () => ({
    date: "",
    teeTime: "",
    startingHole: "1",
    holes: "18",
    teeBoxes: "White",
  }));

const defaultFormState: FormState = {
  name: "",
  hostSchool: "",
  date: "",
  course: "",
  city: "",
  state: "",
  rounds: "1",
  scoringFormat: "Stroke Play",
  eventType: "Both",
  teamSize: "5",
  countingScores: "4",
  startFormat: "Tee",
  startingHoles: "1",
  roundSetup: createRoundSetup(1),
  integrations: {
    clubhouseLiveScoring: true,
    clippdTournamentId: "",
    clippdTournamentKey: "",
  },
};

export default function DashboardPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [templates, setTemplates] = useState<TournamentTemplate[]>(() => loadTemplatesFromStorage());
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);

  useEffect(() => {
    setTournaments(loadTournamentsFromStorage() as Tournament[]);
    setIsClientMounted(true);
  }, []);

  const saveTemplates = (nextValue: SetStateAction<TournamentTemplate[]>) => {
    setTemplates((current) => {
      const nextTemplates = typeof nextValue === "function" ? nextValue(current) : nextValue;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(nextTemplates));
      }

      return nextTemplates;
    });
  };

  const saveTournaments = (nextValue: SetStateAction<Tournament[]>) => {
    setTournaments((current) => {
      const nextTournaments = typeof nextValue === "function" ? nextValue(current) : nextValue;
      saveTournamentsToStorage(nextTournaments);
      return nextTournaments;
    });
  };

  const handleSeedTestTournament = () => {
    const seededTournament = seedTestTournament();

    if (seededTournament) {
      setTournaments(loadTournamentsFromStorage() as Tournament[]);
    }
  };

  const normalizeFormState = (value: FormState): FormState => {
    const rounds = Math.max(1, Number(value.rounds) || 1);
    return {
      ...value,
      rounds: String(rounds),
      roundSetup: createRoundSetup(rounds).map((round, index) => value.roundSetup[index] ?? round),
    };
  };

  const resetForm = () => {
    setFormState(defaultFormState);
    setSelectedTemplateId("");
    setCurrentStep(1);
    setErrors({});
  };

  const openModal = () => {
    setTemplates(loadTemplatesFromStorage());
    resetForm();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const updateRoundCount = (value: string) => {
    const nextCount = Number(value) || 1;
    setFormState((current) => ({
      ...current,
      rounds: String(nextCount),
      roundSetup: createRoundSetup(nextCount).map((round, index) => current.roundSetup[index] ?? round),
    }));
  };

  const updateRoundField = (index: number, field: keyof RoundSetup, value: string) => {
    setFormState((current) => ({
      ...current,
      roundSetup: current.roundSetup.map((round, roundIndex) => (roundIndex === index ? { ...round, [field]: value } : round)),
    }));
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    const fieldName = name as keyof FormState;

    setFormState((current) => ({ ...current, [fieldName]: value }));

    if (errors[fieldName]) {
      setErrors((current) => ({ ...current, [fieldName]: undefined }));
    }
  };

  const validateStep = () => {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};

    if (currentStep === 1) {
      if (!formState.name.trim()) {
        nextErrors.name = "Tournament name is required.";
      }
      if (!formState.hostSchool.trim()) {
        nextErrors.hostSchool = "Host school is required.";
      }
      if (!formState.date.trim()) {
        nextErrors.date = "Start date is required.";
      }
      if (!formState.course.trim()) {
        nextErrors.course = "Golf course is required.";
      }
      if (!formState.city.trim()) {
        nextErrors.city = "City is required.";
      }
      if (!formState.state.trim()) {
        nextErrors.state = "State is required.";
      }
      if (!formState.rounds.trim()) {
        nextErrors.rounds = "Number of rounds is required.";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep()) {
      return;
    }
    setCurrentStep((current) => Math.min(current + 1, 5));
  };

  const handleBack = () => {
    setCurrentStep((current) => Math.max(current - 1, 1));
  };

  const handleCreateTournament = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isCreatingTournament) {
      return;
    }

    setIsCreatingTournament(true);

    const normalizedFormState = normalizeFormState(formState);
    const nextId = String(
      tournaments.reduce((maxId, tournament) => {
        const parsedId = Number(tournament.id);
        return Number.isFinite(parsedId) ? Math.max(maxId, parsedId) : maxId;
      }, 0) + 1
    );

    const createResult = await createTournament({
      fallbackId: nextId,
      name: normalizedFormState.name.trim(),
      date: normalizedFormState.date,
      course: normalizedFormState.course.trim(),
      city: normalizedFormState.city.trim(),
      state: normalizedFormState.state.trim(),
      rounds: normalizedFormState.rounds,
      scoringFormat: normalizedFormState.scoringFormat,
      status: "Upcoming",
      settings: normalizedFormState,
    });
    const newTournament = createResult.tournament as Tournament;

    const normalizedRoundCount = Number(normalizedFormState.rounds) || 1;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        getTournamentStateStorageKey(newTournament.id),
        JSON.stringify(
          buildTournamentStorageEnvelope(
            newTournament.id,
            newTournament.name,
            newTournament.course,
            {
              teams: [],
              players: [],
              pairings: [],
              scorecards: {
                scorecardsGenerated: false,
                scorecardRows: [],
                roundSetup: {
                  roundNumber: "1",
                  startingHole: normalizedFormState.startingHoles || "1",
                  numberOfHoles: normalizedFormState.roundSetup[0]?.holes || "18",
                  teeTime: normalizedFormState.roundSetup[0]?.teeTime || "7:30 AM",
                  countingScores: normalizedFormState.countingScores || "4",
                },
              },
              clippdExportState: {
                tournamentId: normalizedFormState.integrations.clippdTournamentId,
                tournamentKey: normalizedFormState.integrations.clippdTournamentKey,
                exportFormat: "Final Results CSV",
              },
              scoreboardImportState: {
                tournamentId: "",
                tournamentKey: "",
                options: {
                  tournamentDetails: true,
                  teams: true,
                  players: true,
                  courseSetup: true,
                  scorecards: false,
                  teeTimes: false,
                  startingHoles: false,
                },
              },
              autoRepairState: {
                sourceRound: "Round 1",
                targetRound: "Round 2",
                pairingOrder: "Worst to Best",
                teeTimeInterval: "8 minutes",
              },
            },
            normalizedFormState,
            normalizedRoundCount
          )
        )
      );
    }

    saveTournaments((current) => [newTournament, ...current]);
    setIsCreatingTournament(false);
    closeModal();
  };

  const handleSaveTournamentAsTemplate = (tournament: Tournament) => {
    const sourceSettings = normalizeFormState(tournament.settings ?? defaultFormState);

    saveTemplates((current) => {
      const nextId = current.reduce((maxId, template) => Math.max(maxId, template.id), 0) + 1;

      const nextTemplate: TournamentTemplate = {
        id: nextId,
        tournamentName: sourceSettings.name || tournament.name,
        numberOfRounds: sourceSettings.rounds,
        teamSize: sourceSettings.teamSize,
        countingScores: sourceSettings.countingScores,
        startFormat: sourceSettings.startFormat,
        startingHoles: sourceSettings.startingHoles,
        roundSettings: sourceSettings.roundSetup,
        liveScoringSettings: {
          ...sourceSettings.integrations,
        },
        formState: sourceSettings,
      };

      return [nextTemplate, ...current];
    });
  };

  const handleApplyTemplate = () => {
    if (!selectedTemplateId) {
      return;
    }

    const selectedTemplate = templates.find((template) => String(template.id) === selectedTemplateId);
    if (!selectedTemplate) {
      return;
    }

    const nextFormState = normalizeFormState(selectedTemplate.formState);
    setFormState(nextFormState);
    setErrors({});
  };

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8 lg:py-6">
        <Link href="/" className="flex items-center gap-3">
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
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/live">
            Live Scores
          </Link>
          <a className="transition duration-300 hover:text-[#B8892D]" href="#">
            Tournaments
          </a>
          <a className="transition duration-300 hover:text-[#B8892D]" href="#">
            Features
          </a>
          <a className="transition duration-300 hover:text-[#B8892E]" href="#">
            Pricing
          </a>
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/dashboard">
            Dashboard
          </Link>
          <a className="rounded-full bg-[#0B3D2E] px-4 py-2.5 text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5" href="#">
            Get Started
          </a>
        </nav>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8 lg:py-12">
        <div className="rounded-[36px] border border-[#E8DCC8] bg-white/90 p-8 shadow-[0_24px_80px_rgba(11,61,46,0.08)] backdrop-blur lg:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                Operations
              </p>
              <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                Tournament Dashboard
              </h2>
            </div>
            <div className="rounded-[24px] border border-[#E8DCC8] bg-[#F6F1E6] px-5 py-4 text-sm text-[#51635C] shadow-inner">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                Status
              </p>
              <p className="mt-1 font-black text-[#0B3D2E]">Ready to launch</p>
            </div>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                <p className="text-sm font-black uppercase tracking-[0.25em] text-[#51635C]">
                  {label}
                </p>
                <p className="mt-4 text-4xl font-black tracking-[-0.03em] text-[#0B3D2E]">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={openModal}
              className="rounded-full bg-[#0B3D2E] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-xl shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
            >
              Create Tournament
            </button>
            {isClientMounted ? (
              <button
                type="button"
                onClick={handleSeedTestTournament}
                className="rounded-full border border-[#B8892D] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
              >
                Seed Test Tournament
              </button>
            ) : null}
            <Link
              href="/dashboard/templates"
              className="rounded-full border border-[#B8892D] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
            >
              Templates
            </Link>
            <a className="rounded-full border border-[#B8892D] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10" href="#">
              Import Teams
            </a>
          </div>

          {!isClientMounted || tournaments.length === 0 ? (
            <div className="mt-10 rounded-[32px] border border-[#E8DCC8] bg-[#FCFAF5] p-10 text-center shadow-inner">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0B3D2E] text-2xl font-black text-[#F0C96A]">
                HQ
              </div>
              <h3 className="mt-6 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                No tournaments yet.
              </h3>
              <p className="mx-auto mt-3 max-w-xl text-lg leading-8 text-[#51635C]">
                Create your first tournament to begin scoring.
              </p>
              <button
                type="button"
                onClick={openModal}
                className="mt-8 inline-flex rounded-full bg-[#0B3D2E] px-7 py-4 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-xl shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
              >
                Create Tournament
              </button>
            </div>
          ) : (
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {tournaments.map((tournament) => (
                <div key={tournament.id} className="rounded-[32px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                        Upcoming
                      </p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                        {tournament.name}
                      </h3>
                    </div>
                    <span className="rounded-full border border-[#E8DCC8] bg-[#F6F1E6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
                      {tournament.status}
                    </span>
                  </div>

                  <div className="mt-6 space-y-3 text-sm text-[#51635C]">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Golf Course</span>
                      <span className="text-right font-black text-[#0B3D2E]">{tournament.course}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Date</span>
                      <span className="text-right font-black text-[#0B3D2E]">{tournament.date}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Rounds</span>
                      <span className="text-right font-black text-[#0B3D2E]">{tournament.rounds}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Status</span>
                      <span className="text-right font-black text-[#0B3D2E]">{tournament.status}</span>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => router.push(`/tournament/${tournament.id}`)}
                      className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                    >
                      Open Tournament
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveTournamentAsTemplate(tournament)}
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Save as Template
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.localStorage.removeItem(getTournamentStateStorageKey(tournament.id));
                        }
                        saveTournaments((current) => current.filter((item) => item.id !== tournament.id));
                      }}
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

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm sm:items-center"
          onClick={closeModal}
        >
          <div
            className="flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    New Tournament
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    Create Tournament
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <form className="min-h-0 overflow-y-auto px-7 py-7" onSubmit={handleCreateTournament}>
              <div className="mb-5 rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Create From Template</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    className="w-full rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#0B3D2E] outline-none"
                  >
                    <option value="">Select a template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={String(template.id)}>
                        {template.tournamentName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleApplyTemplate}
                    disabled={!selectedTemplateId}
                    className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Apply Template
                  </button>
                </div>
              </div>

              <div className="mb-6 rounded-[24px] border border-[#E8DCC8] bg-white/80 p-4">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.35em] text-[#51635C]">
                  <span>Step {currentStep} of 5</span>
                  <span>{steps[currentStep - 1]}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8DCC8]">
                  <div className="h-full rounded-full bg-[#0B3D2E] transition-all duration-300" style={{ width: `${(currentStep / 5) * 100}%` }} />
                </div>
              </div>

              {currentStep === 1 ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    <span>Tournament Name</span>
                    <input
                      name="name"
                      value={formState.name}
                      onChange={handleInputChange}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      placeholder="e.g. Spring Invitational"
                    />
                    {errors.name ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{errors.name}</p> : null}
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    <span>Host School</span>
                    <input
                      name="hostSchool"
                      value={formState.hostSchool}
                      onChange={handleInputChange}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      placeholder="School name"
                    />
                    {errors.hostSchool ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{errors.hostSchool}</p> : null}
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    <span>Golf Course</span>
                    <input
                      name="course"
                      value={formState.course}
                      onChange={handleInputChange}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      placeholder="Course name"
                    />
                    {errors.course ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{errors.course}</p> : null}
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    <span>City</span>
                    <input
                      name="city"
                      value={formState.city}
                      onChange={handleInputChange}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      placeholder="City"
                    />
                    {errors.city ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{errors.city}</p> : null}
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    <span>State</span>
                    <input
                      name="state"
                      value={formState.state}
                      onChange={handleInputChange}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      placeholder="State"
                    />
                    {errors.state ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{errors.state}</p> : null}
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    <span>Start Date</span>
                    <input
                      name="date"
                      type="date"
                      value={formState.date}
                      onChange={handleInputChange}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    />
                    {errors.date ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{errors.date}</p> : null}
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] sm:col-span-2">
                    <span>Number of Rounds</span>
                    <select
                      name="rounds"
                      value={formState.rounds}
                      onChange={(event) => {
                        handleInputChange(event);
                        updateRoundCount(event.target.value);
                      }}
                      className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                    {errors.rounds ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{errors.rounds}</p> : null}
                  </label>
                </div>
              ) : null}

              {currentStep === 2 ? (
                <div className="space-y-6">
                  <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Scoring Format</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {formatOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setFormState((current) => ({ ...current, scoringFormat: option }))}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.25em] transition duration-300 ${formState.scoringFormat === option ? "border-[#0B3D2E] bg-[#0B3D2E] text-[#F6F1E6]" : "border-[#E8DCC8] bg-[#FCFAF5] text-[#51635C] hover:bg-[#F6F1E6]"}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Event Type</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {eventTypeOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setFormState((current) => ({ ...current, eventType: option }))}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.25em] transition duration-300 ${formState.eventType === option ? "border-[#0B3D2E] bg-[#0B3D2E] text-[#F6F1E6]" : "border-[#E8DCC8] bg-[#FCFAF5] text-[#51635C] hover:bg-[#F6F1E6]"}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Tournament Setup</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                        <span>Team Size</span>
                        <input
                          name="teamSize"
                          type="number"
                          min="1"
                          max="12"
                          value={formState.teamSize}
                          onChange={handleInputChange}
                          className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                        <span>Counting Scores</span>
                        <input
                          name="countingScores"
                          type="number"
                          min="1"
                          max="10"
                          value={formState.countingScores}
                          onChange={handleInputChange}
                          className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                        <span>Tee or Shotgun</span>
                        <select
                          name="startFormat"
                          value={formState.startFormat}
                          onChange={handleInputChange}
                          className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                        >
                          <option value="Tee">Tee</option>
                          <option value="Shotgun">Shotgun</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                        <span>Starting Holes</span>
                        <input
                          name="startingHoles"
                          value={formState.startingHoles}
                          onChange={handleInputChange}
                          className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                          placeholder="1 or 1,10"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              {currentStep === 3 ? (
                <div className="space-y-5">
                  {formState.roundSetup.map((round, index) => (
                    <div key={`${round.date}-${index}`} className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <h4 className="text-lg font-black tracking-[-0.02em] text-[#0B3D2E]">Round {index + 1}</h4>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Setup</span>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                          <span>Date</span>
                          <input
                            type="date"
                            value={round.date}
                            onChange={(event) => updateRoundField(index, "date", event.target.value)}
                            className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                          <span>Tee Time</span>
                          <input
                            type="time"
                            value={round.teeTime}
                            onChange={(event) => updateRoundField(index, "teeTime", event.target.value)}
                            className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                          <span>Starting Hole</span>
                          <input
                            type="number"
                            min="1"
                            max="18"
                            value={round.startingHole}
                            onChange={(event) => updateRoundField(index, "startingHole", event.target.value)}
                            className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                          <span>Number of Holes</span>
                          <input
                            type="number"
                            min="1"
                            max="18"
                            value={round.holes}
                            onChange={(event) => updateRoundField(index, "holes", event.target.value)}
                            className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] md:col-span-2">
                          <span>Tee Boxes</span>
                          <input
                            value={round.teeBoxes}
                            onChange={(event) => updateRoundField(index, "teeBoxes", event.target.value)}
                            className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                            placeholder="White / Blue / Gold"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {currentStep === 4 ? (
                <div className="space-y-5">
                  <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Clubhouse HQ</p>
                        <h4 className="mt-2 text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">Live Scoring</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormState((current) => ({ ...current, integrations: { ...current.integrations, clubhouseLiveScoring: !current.integrations.clubhouseLiveScoring } }))}
                        className={`flex h-7 w-14 items-center rounded-full p-1 transition duration-300 ${formState.integrations.clubhouseLiveScoring ? "bg-[#0B3D2E]" : "bg-[#D9D0C0]"}`}
                      >
                        <span className={`h-5 w-5 rounded-full bg-white transition duration-300 ${formState.integrations.clubhouseLiveScoring ? "translate-x-7" : "translate-x-0"}`} />
                      </button>
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Clippd</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                        <span>Tournament ID</span>
                        <input
                          value={formState.integrations.clippdTournamentId}
                          onChange={(event) => setFormState((current) => ({ ...current, integrations: { ...current.integrations, clippdTournamentId: event.target.value } }))}
                          className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                          placeholder="CLIPPD-001"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                        <span>Tournament Key</span>
                        <input
                          value={formState.integrations.clippdTournamentKey}
                          onChange={(event) => setFormState((current) => ({ ...current, integrations: { ...current.integrations, clippdTournamentKey: event.target.value } }))}
                          className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                          placeholder="Enter key"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              {currentStep === 5 ? (
                <div className="space-y-5 rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Review</p>
                      <h4 className="mt-2 text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">Tournament Summary</h4>
                    </div>
                    <span className="rounded-full border border-[#E8DCC8] bg-[#F6F1E6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
                      Ready to launch
                    </span>
                  </div>
                  <div className="space-y-3 text-sm text-[#51635C]">
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Tournament</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.name || "Untitled Tournament"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Host School</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.hostSchool || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Course</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.course || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Location</span>
                      <span className="text-right font-black text-[#0B3D2E]">{[formState.city, formState.state].filter(Boolean).join(", ") || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Start Date</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.date || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Rounds</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.rounds}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Format</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.scoringFormat}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Event Type</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.eventType}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Team Size</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.teamSize}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Counting Scores</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.countingScores}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-b border-[#E8DCC8] pb-3">
                      <span className="font-semibold uppercase tracking-[0.25em]">Start Format</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.startFormat}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold uppercase tracking-[0.25em]">Starting Holes</span>
                      <span className="text-right font-black text-[#0B3D2E]">{formState.startingHoles}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="sticky bottom-0 -mx-7 -mb-7 mt-8 flex flex-col-reverse gap-3 border-t border-[#E8DCC8] bg-[#F6F1E6] px-7 py-5 sm:flex-row sm:justify-end">
                {currentStep > 1 ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                  >
                    Back
                  </button>
                ) : null}
                {currentStep < 5 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isCreatingTournament}
                    className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isCreatingTournament ? "Creating..." : "Create Tournament"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <footer className="bg-[#0B3D2E] px-6 py-10 text-[#F6F1E6] lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h3 className="text-2xl font-black">Clubhouse HQ</h3>
            <p className="mt-1 text-sm uppercase tracking-[0.35em] text-[#F0C96A]">
              College Golf Operations
            </p>
          </div>
          <p className="text-sm text-white/70">
            © 2026 Clubhouse HQ. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
