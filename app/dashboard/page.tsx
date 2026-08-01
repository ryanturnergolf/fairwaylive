"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type SetStateAction } from "react";
import { getSupabaseBrowserClient } from "../lib/supabaseClient";
import {
  loadDirectorDashboardReadModel,
  loadDirectorTournamentSummary,
  type DirectorDashboardReadModel,
  type DirectorGroupStatusValue,
  type DirectorReviewSeverity,
} from "../lib/services/tournamentDirectorDashboardService";
import {
  finalizeTournament,
  loadTournamentFinalizationStatus,
  shouldRefreshTournamentFinalizationStatus,
  type TournamentFinalizationStatus,
} from "../lib/services/tournamentFinalizationService";
import {
  createTournament,
  loadTournamentList,
  syncTournamentStateSnapshot,
} from "../lib/services/tournamentService";
import {
  buildIncompleteTournamentSeed,
  INCOMPLETE_TEST_TOURNAMENT_NAME,
  persistIncompleteTournamentSeed,
} from "../lib/services/incompleteTournamentSeedService";
import {
  qaSeedTemplates,
  QA_SEED_TEST_QUALIFIER_ID,
  runQaSeedTemplate,
  type QaSeedTemplateResult,
} from "../lib/services/qaSeedTemplateService";
import {
  buildTournamentStorageEnvelope,
  getTournamentStateStorageKey,
  loadTournamentStorageEnvelope,
  loadTournamentsFromStorage,
  saveTournamentStorageEnvelope,
  saveTournamentsToStorage,
  seedTestTournament,
  TEST_TOURNAMENT_ID,
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
const creationKeyStoragePrefix = "clubhouse-hq-tournament-creation-key:";

const acquireTournamentCreationKey = (scope: string) => {
  const storageKey = `${creationKeyStoragePrefix}${scope}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const key = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${crypto.getRandomValues(new Uint32Array(2)).join("-")}`;
  window.sessionStorage.setItem(storageKey, key);
  return key;
};

const releaseTournamentCreationKey = (scope: string, key: string) => {
  const storageKey = `${creationKeyStoragePrefix}${scope}`;
  if (window.sessionStorage.getItem(storageKey) === key) window.sessionStorage.removeItem(storageKey);
};

const emptyDirectorReadModel: DirectorDashboardReadModel = {
  generatedAt: "",
  tournaments: [],
};

type TournamentFinalizationStatusById = Record<string, TournamentFinalizationStatus>;

const directorReadinessStyles: Record<string, string> = {
  Ready: "border-[#0B3D2E] bg-[#0B3D2E] text-[#F6F1E6]",
  Warning: "border-[#B8892D] bg-[#F0C96A]/35 text-[#0B3D2E]",
  Syncing: "border-[#B8892D] bg-[#F6F1E6] text-[#0B3D2E]",
  Draft: "border-[#E8DCC8] bg-white text-[#51635C]",
  Error: "border-[#8A2E2E] bg-[#8A2E2E] text-white",
};

const directorGroupStatusStyles: Record<DirectorGroupStatusValue, string> = {
  Waiting: "border-[#E8DCC8] bg-white text-[#51635C]",
  Playing: "border-[#2E6F76] bg-[#E6F3F1] text-[#0B3D2E]",
  Finished: "border-[#0B3D2E] bg-[#0B3D2E] text-[#F6F1E6]",
  "Needs Review": "border-[#B8892D] bg-[#F0C96A]/35 text-[#0B3D2E]",
  Stalled: "border-[#8A2E2E] bg-[#8A2E2E] text-white",
};

const directorReviewSeverityStyles: Record<DirectorReviewSeverity, string> = {
  Warning: "border-[#B8892D] bg-[#F0C96A]/35 text-[#0B3D2E]",
  Critical: "border-[#8A2E2E] bg-[#8A2E2E] text-white",
};

const finalizationStatusStyles = {
  eligible: "border-[#0B3D2E] bg-[#E6F3F1] text-[#0B3D2E]",
  blocked: "border-[#8A2E2E] bg-[#FFF4F1] text-[#8A2E2E]",
};

const configuredDirectorStalledTimeoutMinutes = Number(process.env.NEXT_PUBLIC_DIRECTOR_STALLED_TIMEOUT_MINUTES);
const directorStalledTimeoutMinutes =
  Number.isFinite(configuredDirectorStalledTimeoutMinutes) && configuredDirectorStalledTimeoutMinutes > 0
    ? configuredDirectorStalledTimeoutMinutes
    : 20;

const formatDirectorTimestamp = (value: string | null) => {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

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
  const [directorReadModel, setDirectorReadModel] = useState<DirectorDashboardReadModel>(emptyDirectorReadModel);
  const [finalizationStatuses, setFinalizationStatuses] = useState<TournamentFinalizationStatusById>({});
  const [templates, setTemplates] = useState<TournamentTemplate[]>(() => loadTemplatesFromStorage());
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [creationError, setCreationError] = useState("");
  const [isCoachAuthenticated, setIsCoachAuthenticated] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSeedingTournament, setIsSeedingTournament] = useState(false);
  const [isSeedingIncompleteTournament, setIsSeedingIncompleteTournament] = useState(false);
  const [activeQaSeedTemplateId, setActiveQaSeedTemplateId] = useState("");
  const [qaSeedResult, setQaSeedResult] = useState<QaSeedTemplateResult | null>(null);
  const [seedError, setSeedError] = useState("");
  const seedInFlightRef = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      setIsCoachAuthenticated(Boolean(data.session && !data.session.user.is_anonymous));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsCoachAuthenticated(Boolean(session && !session.user.is_anonymous));
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleCoachSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setIsCoachAuthenticated(false);
    setIsSigningOut(false);
    router.replace("/coach-auth?next=/dashboard");
    router.refresh();
  };

  const refreshDirectorReadModel = (sourceTournaments: Tournament[]) =>
    loadDirectorDashboardReadModel(sourceTournaments, {
      stalledTimeoutMinutes: directorStalledTimeoutMinutes,
    }).then((readModel) => {
      setDirectorReadModel(readModel);

      void Promise.all(
        readModel.tournaments.map(async (summary) => {
          const localTournament = sourceTournaments.find((tournament) => tournament.id === summary.tournamentId) ?? null;
          const status = await loadTournamentFinalizationStatus({
            tournamentId: summary.tournamentId,
            sharedTournamentId: summary.sharedTournamentId,
            localTournament,
          });

          return [summary.tournamentId || summary.sharedTournamentId, status] as const;
        })
      )
        .then((entries) => {
          setFinalizationStatuses(Object.fromEntries(entries));
        })
        .catch((error) => {
          console.warn("[TournamentFinalizationService] Unable to load tournament finalization status.", error);
        });
    }).catch((error) => {
      console.warn("[DirectorDashboardService] Unable to load director dashboard read model.", error);
    });

  const handleFinalizeTournament = async (summaryTournamentId: string, summarySharedTournamentId: string) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Finalize this tournament? Scores, roster, and pairings will become read-only.");
      if (!confirmed) {
        return;
      }
    }

    const result = await finalizeTournament({
      tournamentId: summaryTournamentId,
      sharedTournamentId: summarySharedTournamentId,
    });

    setFinalizationStatuses((current) => ({
      ...current,
      [summaryTournamentId || summarySharedTournamentId]: result.status,
    }));

    if (result.finalized) {
      setTournaments((current) =>
        current.map((tournament) =>
          tournament.id === summaryTournamentId
            ? {
                ...tournament,
                status: "Finalized",
              }
            : tournament
        )
      );
    }
  };

  useEffect(() => {
    let isCancelled = false;
    const localTournaments = loadTournamentsFromStorage() as Tournament[];
    setTournaments(localTournaments);
    setIsClientMounted(true);
    void refreshDirectorReadModel(localTournaments);

    void loadTournamentList(localTournaments, (tournament) => ({
      ...tournament,
      settings: defaultFormState,
    }))
      .then((loadedTournaments) => {
        if (!isCancelled) {
          setTournaments(loadedTournaments);
          void refreshDirectorReadModel(loadedTournaments);
        }
      })
      .catch((error) => {
        console.warn("[TournamentService] Unable to load shared tournament aggregates.", error);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isClientMounted) {
      return;
    }

    let refreshInFlight = false;
    const intervalId = window.setInterval(() => {
      if (refreshInFlight) {
        return;
      }

      const candidate = directorReadModel.tournaments
        .filter((summary) => {
          const status = finalizationStatuses[summary.tournamentId || summary.sharedTournamentId];
          return shouldRefreshTournamentFinalizationStatus(summary, status);
        })
        .sort((left, right) =>
          String(right.lastSnapshotAt ?? "").localeCompare(String(left.lastSnapshotAt ?? ""))
        )[0];

      if (!candidate) {
        return;
      }

      const localTournament = tournaments.find((tournament) => tournament.id === candidate.tournamentId) ?? null;
      refreshInFlight = true;
      void loadDirectorTournamentSummary({
        tournamentId: candidate.tournamentId,
        sharedTournamentId: candidate.sharedTournamentId,
        localTournament,
        stalledTimeoutMinutes: directorStalledTimeoutMinutes,
      })
        .then(async (summary) => {
          setDirectorReadModel((current) => ({
            generatedAt: new Date().toISOString(),
            tournaments: current.tournaments.map((item) =>
              (item.tournamentId || item.sharedTournamentId) === (summary.tournamentId || summary.sharedTournamentId)
                ? summary
                : item
            ),
          }));

          const status = await loadTournamentFinalizationStatus({
            tournamentId: summary.tournamentId,
            sharedTournamentId: summary.sharedTournamentId,
            localTournament,
          });
          setFinalizationStatuses((current) => ({
            ...current,
            [summary.tournamentId || summary.sharedTournamentId]: status,
          }));
        })
        .catch((error) => {
          console.warn("[DirectorDashboardService] Unable to refresh active tournament summary.", error);
        })
        .finally(() => {
          refreshInFlight = false;
        });
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [directorReadModel.tournaments, finalizationStatuses, isClientMounted, tournaments]);

  useEffect(() => {
    if (!isClientMounted) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshDirectorReadModel(tournaments);
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isClientMounted, tournaments]);

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

  const handleSeedTestTournament = async () => {
    if (seedInFlightRef.current) return;

    seedInFlightRef.current = true;
    setIsSeedingTournament(true);
    setSeedError("");

    const creationScope = "complete-seed";
    const idempotencyKey = acquireTournamentCreationKey(creationScope);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      if (!data.session || data.session.user.is_anonymous) {
        throw new Error("Coach authentication is required before seeding a tournament.");
      }

      const localSeed = seedTestTournament();
      const localEnvelope = loadTournamentStorageEnvelope(TEST_TOURNAMENT_ID);
      if (!localSeed || !localEnvelope) {
        throw new Error("Unable to prepare the test tournament.");
      }

      const tournamentName = `Test Tournament ${new Date().toISOString()}`;
      const createResult = await createTournament({
        fallbackId: TEST_TOURNAMENT_ID,
        name: tournamentName,
        date: localSeed.date,
        course: localSeed.course,
        city: localSeed.city,
        state: localSeed.state,
        rounds: localSeed.rounds,
        scoringFormat: localSeed.scoringFormat,
        status: "Upcoming",
        settings: localSeed.settings,
        idempotencyKey,
      });
      if (createResult.source !== "supabase") {
        throw createResult.error instanceof Error
          ? createResult.error
          : new Error("Supabase tournament creation failed.");
      }

      const tournament = createResult.tournament as Tournament;
      const envelope = {
        ...localEnvelope,
        tournament: {
          ...localEnvelope.tournament,
          id: tournament.id,
          name: tournament.name,
        },
      };
      const snapshotSaved = await syncTournamentStateSnapshot({
        tournamentId: tournament.id,
        localTournamentId: tournament.id,
        envelope,
      });
      if (!snapshotSaved) {
        throw new Error("The tournament was created, but its seeded tournament data could not be saved.");
      }

      saveTournamentStorageEnvelope(tournament.id, envelope);
      const nextTournaments = [
        tournament,
        ...(loadTournamentsFromStorage() as Tournament[]).filter(
          (item) => item.id !== TEST_TOURNAMENT_ID && item.id !== tournament.id
        ),
      ];
      saveTournamentsToStorage(nextTournaments);
      window.localStorage.removeItem(getTournamentStateStorageKey(TEST_TOURNAMENT_ID));
      setTournaments(nextTournaments);
      releaseTournamentCreationKey(creationScope, idempotencyKey);
      router.push(`/tournament/${tournament.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tournament seeding failed.";
      setSeedError(message);
      const withoutLocalSeed = loadTournamentsFromStorage().filter(
        (tournament) => tournament.id !== TEST_TOURNAMENT_ID
      );
      saveTournamentsToStorage(withoutLocalSeed);
      window.localStorage.removeItem(getTournamentStateStorageKey(TEST_TOURNAMENT_ID));
    } finally {
      seedInFlightRef.current = false;
      setIsSeedingTournament(false);
    }
  };

  const handleSeedIncompleteTournament = async () => {
    if (seedInFlightRef.current) return;

    seedInFlightRef.current = true;
    setIsSeedingIncompleteTournament(true);
    setSeedError("");

    const creationScope = "incomplete-seed";
    const idempotencyKey = acquireTournamentCreationKey(creationScope);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      if (!data.session || data.session.user.is_anonymous) {
        throw new Error("Coach authentication is required before seeding a tournament.");
      }

      const tournamentName = `${INCOMPLETE_TEST_TOURNAMENT_NAME} ${new Date().toISOString()}`;
      const createResult = await createTournament({
        fallbackId: "incomplete-test-tournament",
        name: tournamentName,
        date: "2026-07-20",
        course: "Westfield Golf Club",
        city: "Westfield",
        state: "OH",
        rounds: "1",
        scoringFormat: "Stroke Play",
        status: "Upcoming",
        settings: { rounds: 1, status: "Test" },
        idempotencyKey,
      });
      if (createResult.source !== "supabase") {
        throw createResult.error instanceof Error
          ? createResult.error
          : new Error("Supabase tournament creation failed.");
      }

      const tournament = createResult.tournament as Tournament;
      const seed = buildIncompleteTournamentSeed({ tournamentId: tournament.id, tournamentName: tournament.name });
      await persistIncompleteTournamentSeed(seed);
      saveTournamentStorageEnvelope(tournament.id, seed.envelope);
      const nextTournaments = [
        tournament,
        ...(loadTournamentsFromStorage() as Tournament[]).filter((item) => item.id !== tournament.id),
      ];
      saveTournamentsToStorage(nextTournaments);
      setTournaments(nextTournaments);
      releaseTournamentCreationKey(creationScope, idempotencyKey);
      router.push(`/tournament/${tournament.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to seed the incomplete tournament.";
      setSeedError(message);
      if (/authentication|required|session/i.test(message)) router.push("/coach-auth?next=/dashboard");
    } finally {
      seedInFlightRef.current = false;
      setIsSeedingIncompleteTournament(false);
    }
  };

  const handleQaSeedTemplate = async (templateId: string) => {
    if (seedInFlightRef.current) return;
    seedInFlightRef.current = true;
    setActiveQaSeedTemplateId(templateId);
    setQaSeedResult(null);
    setSeedError("");
    try {
      const result = await runQaSeedTemplate(templateId);
      setQaSeedResult(result);
      router.push(`/tournament/${result.tournamentId}`);
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : "Unable to create QA test data.");
    } finally {
      seedInFlightRef.current = false;
      setActiveQaSeedTemplateId("");
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
    setCreationError("");

    const normalizedFormState = normalizeFormState(formState);
    const nextId = String(
      tournaments.reduce((maxId, tournament) => {
        const parsedId = Number(tournament.id);
        return Number.isFinite(parsedId) ? Math.max(maxId, parsedId) : maxId;
      }, 0) + 1
    );

    let createResult;
    const creationScope = "manual";
    const idempotencyKey = acquireTournamentCreationKey(creationScope);
    try {
      createResult = await createTournament({
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
      idempotencyKey,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tournament creation failed.";
      setCreationError(message);
      setIsCreatingTournament(false);
      if (/authentication|required|session/i.test(message)) {
        router.push("/coach-auth?next=/dashboard");
      }
      return;
    }
    if (createResult.source !== "supabase") {
      const message = createResult.error instanceof Error
        ? createResult.error.message
        : "Supabase tournament creation failed.";
      setCreationError(message);
      setIsCreatingTournament(false);
      if (/authentication|required|session/i.test(message)) {
        router.push("/coach-auth?next=/dashboard");
      }
      return;
    }
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
    releaseTournamentCreationKey(creationScope, idempotencyKey);
    void refreshDirectorReadModel([newTournament, ...tournaments]);
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
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
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

        <nav className="hidden items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0B3D2E]/75 xl:flex">
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/">
            Homepage
          </Link>
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/live">
            Live Scores
          </Link>
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/dashboard">
            Tournaments
          </Link>
          <a className="transition duration-300 hover:text-[#B8892D]" href="#director">
            Director
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
          {isCoachAuthenticated ? (
            <button
              type="button"
              onClick={() => void handleCoachSignOut()}
              disabled={isSigningOut}
              className="transition duration-300 hover:text-[#B8892D] disabled:opacity-60"
            >
              {isSigningOut ? "Signing Out" : "Coach Sign Out"}
            </button>
          ) : (
            <Link className="transition duration-300 hover:text-[#B8892D]" href="/coach-auth?next=/dashboard">
              Coach Sign In
            </Link>
          )}
          <a className="rounded-full bg-[#0B3D2E] px-4 py-2.5 text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5" href="#">
            Get Started
          </a>
        </nav>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-12">
        <div className="rounded-[24px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_24px_80px_rgba(11,61,46,0.08)] backdrop-blur sm:rounded-[36px] sm:p-8 lg:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                Operations
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] sm:text-5xl">
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
                onClick={() => void handleSeedTestTournament()}
                disabled={isSeedingTournament}
                className="rounded-full border border-[#B8892D] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSeedingTournament ? "Seeding Tournament..." : "Seed Test Tournament"}
              </button>
            ) : null}
            {isClientMounted ? (
              <button
                type="button"
                onClick={() => void handleSeedIncompleteTournament()}
                disabled={isSeedingTournament || isSeedingIncompleteTournament}
                className="rounded-full border border-[#B8892D] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSeedingIncompleteTournament ? "Seeding Incomplete Tournament..." : "Seed Tournament (Incomplete)"}
              </button>
            ) : null}
            <Link
              href="/dashboard/templates"
              className="rounded-full border border-[#B8892D] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
            >
              Templates
            </Link>
            <Link
              href="/dashboard/season-statistics"
              className="rounded-full border border-[#B8892D] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
            >
              Season Statistics
            </Link>
            <a className="rounded-full border border-[#B8892D] px-7 py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10" href="#">
              Import Teams
            </a>
          </div>
          {seedError ? (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">
              {seedError}
            </p>
          ) : null}

          <section className="mt-10 rounded-[32px] border border-dashed border-[#B8892D] bg-[#FFF9E8] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.05)] lg:p-8">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
              Developer / QA
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
              Reusable test-data templates
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#51635C]">
              Development and testing only. These templates create real authenticated data through the same production services used by coaches and players.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {qaSeedTemplates.map((template) => (
                <article key={template.id} className="rounded-2xl border border-[#E8DCC8] bg-white p-5">
                  <h4 className="font-black">{template.label}</h4>
                  <p className="mt-2 text-sm leading-6 text-[#51635C]">{template.description}</p>
                  <button
                    type="button"
                    disabled={Boolean(activeQaSeedTemplateId)}
                    onClick={() => void handleQaSeedTemplate(template.id)}
                    className="mt-4 min-h-12 w-full rounded-full bg-[#0B3D2E] px-5 py-3 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
                  >
                    {activeQaSeedTemplateId === template.id
                      ? "Seeding Test Qualifier..."
                      : template.label}
                  </button>
                </article>
              ))}
            </div>
            {qaSeedResult?.templateId === QA_SEED_TEST_QUALIFIER_ID ? (
              <p className="mt-4 rounded-2xl border border-[#77B98E] bg-[#ECF8EF] p-4 text-sm font-bold text-[#146233]">
                Test qualifier ready in {(qaSeedResult.durationMs / 1000).toFixed(1)} seconds.
              </p>
            ) : null}
          </section>

          <section id="director" className="mt-10 rounded-[32px] border border-[#D6E0D8] bg-[#F8FBF8] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.05)] lg:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#2E6F76]">
                  Director
                </p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                  Tournament Director Dashboard
                </h3>
              </div>
              <div className="rounded-full border border-[#D6E0D8] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#51635C]">
                Updated {directorReadModel.generatedAt ? formatDirectorTimestamp(directorReadModel.generatedAt) : "after load"}
              </div>
            </div>

            {directorReadModel.tournaments.length === 0 ? (
              <div className="mt-6 rounded-[24px] border border-[#D6E0D8] bg-white p-6 text-sm font-semibold text-[#51635C]">
                Director awareness will appear here after a tournament is created or loaded.
              </div>
            ) : (
              <div className="mt-6 grid gap-5">
                {directorReadModel.tournaments.map((summary) => {
                  const directorMetrics = [
                    ["Total groups", summary.totalGroups],
                    ["Groups started", summary.groupsStarted],
                    ["Groups finished", summary.groupsFinished],
                    ["Groups in progress", summary.groupsInProgress],
                  ];
                  const directorTimes = [
                    ["Last score received", formatDirectorTimestamp(summary.lastScoreReceivedAt)],
                    ["Last snapshot time", formatDirectorTimestamp(summary.lastSnapshotAt)],
                    ["Last player sync time", formatDirectorTimestamp(summary.lastPlayerSyncAt)],
                  ];
                  const finalizationStatus = finalizationStatuses[summary.tournamentId || summary.sharedTournamentId];

                  return (
                    <article key={`${summary.tournamentId}-${summary.sharedTournamentId}`} className="rounded-[24px] border border-[#D6E0D8] bg-white p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                            Director view
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[#51635C]">
                            {summary.tournamentName}
                          </p>
                          <p className="mt-2 w-fit rounded-full border border-[#D6E0D8] bg-[#F8FBF8] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#2E6F76]">
                            Active {summary.activeRoundName}
                          </p>
                        </div>
                        <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${directorReadinessStyles[summary.readiness.status]}`}>
                          Readiness {summary.readiness.status}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {directorMetrics.map(([label, value]) => (
                          <div key={label} className="rounded-[18px] border border-[#E2E9E3] bg-[#F8FBF8] p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
                              {label}
                            </p>
                            <p className="mt-2 text-3xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 grid gap-3 lg:grid-cols-3">
                        {directorTimes.map(([label, value]) => (
                          <div key={label} className="rounded-[18px] border border-[#E2E9E3] bg-[#FCFAF5] p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
                              {label}
                            </p>
                            <p className="mt-2 text-sm font-black text-[#0B3D2E]">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 rounded-[20px] border border-[#D6E0D8] bg-[#F8FBF8] p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${finalizationStatus?.finalizationRecord || finalizationStatus?.eligible ? finalizationStatusStyles.eligible : finalizationStatusStyles.blocked}`}>
                              {finalizationStatus?.finalizationRecord
                                ? "Tournament Finalized"
                                : finalizationStatus?.eligible
                                  ? "Ready to finalize"
                                  : "Not ready to finalize"}
                            </span>
                            {!finalizationStatus?.eligible && !finalizationStatus?.finalizationRecord ? (
                              <p className="mt-3 text-sm font-semibold text-[#51635C]">
                                Tournament scoring and verification must be completed before finalization.
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleFinalizeTournament(summary.tournamentId, summary.sharedTournamentId)}
                            disabled={!finalizationStatus?.eligible || Boolean(finalizationStatus?.finalizationRecord)}
                            className="min-h-11 rounded-full bg-[#0B3D2E] px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                          >
                            {finalizationStatus?.finalizationRecord ? "Tournament Finalized" : "Finalize Tournament"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 rounded-[20px] border border-[#D6E0D8] bg-[#F8FBF8] p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#2E6F76]">
                          Score Verification
                        </p>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {summary.scoreVerification.map((score) => (
                            <div key={score.playerId} className="rounded-[16px] border border-[#D6E0D8] bg-white p-3">
                              <p className="font-black text-[#0B3D2E]">{score.playerName}</p>
                              <p className="mt-1 text-sm font-semibold text-[#51635C]">
                                Scorer {score.scorerTotal ?? "--"} · Marker {score.markerTotal ?? "--"} · {score.matchStatus}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-6 rounded-[20px] border border-[#E3D4B7] bg-[#FCFAF5] p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                              Review Queue
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#51635C]">
                              Groups with score conflicts, missing entries, incomplete holes, or finished rounds awaiting verification.
                            </p>
                          </div>
                          <span className="w-fit rounded-full border border-[#E3D4B7] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">
                            {summary.reviewQueue.length} open
                          </span>
                        </div>

                        {summary.reviewQueue.length === 0 ? (
                          <div className="mt-4 rounded-[16px] border border-[#E8DCC8] bg-white p-4 text-sm font-semibold text-[#51635C]">
                            No groups need review.
                          </div>
                        ) : (
                          <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full border-separate border-spacing-y-2 text-left">
                              <thead className="text-[10px] font-black uppercase tracking-[0.24em] text-[#51635C]">
                                <tr>
                                  <th className="px-3 py-2">Group</th>
                                  <th className="px-3 py-2">Players</th>
                                  <th className="px-3 py-2">Current Hole</th>
                                  <th className="px-3 py-2">Reasons</th>
                                  <th className="px-3 py-2">Score Verification</th>
                                  <th className="px-3 py-2">Severity</th>
                                </tr>
                              </thead>
                              <tbody className="text-sm">
                                {summary.reviewQueue.map((item) => (
                                  <tr
                                    key={item.id}
                                    tabIndex={0}
                                    onClick={() => router.push(item.reviewHref)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        router.push(item.reviewHref);
                                      }
                                    }}
                                    className="cursor-pointer bg-white outline-none transition duration-200 hover:bg-[#FFF8EA] focus:bg-[#FFF8EA]"
                                    aria-label={`Open review location for ${item.groupName}`}
                                  >
                                    <td className="rounded-l-[16px] border-y border-l border-[#E8DCC8] px-3 py-3 font-black text-[#0B3D2E]">
                                      {item.groupName}
                                    </td>
                                    <td className="border-y border-[#E8DCC8] px-3 py-3 text-[#51635C]">
                                      {item.players.length > 0
                                        ? item.players.map((player) => player.playerName).join(", ")
                                        : "Players not assigned"}
                                    </td>
                                    <td className="border-y border-[#E8DCC8] px-3 py-3 font-black text-[#0B3D2E]">
                                      {item.currentHole}
                                    </td>
                                    <td className="border-y border-[#E8DCC8] px-3 py-3 text-[#51635C]">
                                      {item.reasons.join(", ")}
                                    </td>
                                    <td className="border-y border-[#E8DCC8] px-3 py-3 text-[#51635C]">
                                      <div className="space-y-2">
                                        {item.scoreVerification.map((score) => (
                                          <div key={score.playerId}>
                                            <p className="font-black text-[#0B3D2E]">{score.playerName}</p>
                                            <p className="text-xs">
                                              Scorer {score.scorerTotal ?? "--"} · Marker {score.markerTotal ?? "--"} · {score.matchStatus}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="rounded-r-[16px] border-y border-r border-[#E8DCC8] px-3 py-3">
                                      <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${directorReviewSeverityStyles[item.severity]}`}>
                                        {item.severity}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div className="mt-6 rounded-[20px] border border-[#D6E0D8] bg-[#F8FBF8] p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#2E6F76]">
                              Group Status
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#51635C]">
                              Stalled after {directorStalledTimeoutMinutes} minutes without a score update.
                            </p>
                          </div>
                          <span className="w-fit rounded-full border border-[#D6E0D8] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">
                            {summary.groups.length} groups
                          </span>
                        </div>

                        {summary.groups.length === 0 ? (
                          <div className="mt-4 rounded-[16px] border border-[#E2E9E3] bg-white p-4 text-sm font-semibold text-[#51635C]">
                            No groups are available yet.
                          </div>
                        ) : (
                          <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full border-separate border-spacing-y-2 text-left">
                              <thead className="text-[10px] font-black uppercase tracking-[0.24em] text-[#51635C]">
                                <tr>
                                  <th className="px-3 py-2">Group</th>
                                  <th className="px-3 py-2">Players</th>
                                  <th className="px-3 py-2">Current Hole</th>
                                  <th className="px-3 py-2">Status</th>
                                  <th className="px-3 py-2">Last Score Update</th>
                                </tr>
                              </thead>
                              <tbody className="text-sm">
                                {summary.groups.map((group) => (
                                  <tr key={`${summary.tournamentId}-${group.groupNumber}`} className={group.isStalled ? "bg-[#FFF4F1]" : "bg-white"}>
                                    <td className="rounded-l-[16px] border-y border-l border-[#E2E9E3] px-3 py-3 font-black text-[#0B3D2E]">
                                      {group.groupName}
                                    </td>
                                    <td className="border-y border-[#E2E9E3] px-3 py-3 text-[#51635C]">
                                      {group.players.length > 0
                                        ? group.players.map((player) => player.playerName).join(", ")
                                        : "Players not assigned"}
                                    </td>
                                    <td className="border-y border-[#E2E9E3] px-3 py-3 font-black text-[#0B3D2E]">
                                      {group.currentHole}
                                    </td>
                                    <td className="border-y border-[#E2E9E3] px-3 py-3">
                                      <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${directorGroupStatusStyles[group.status]}`}>
                                        {group.status}
                                      </span>
                                    </td>
                                    <td className="rounded-r-[16px] border-y border-r border-[#E2E9E3] px-3 py-3 font-semibold text-[#51635C]">
                                      {formatDirectorTimestamp(group.lastScoreUpdateAt)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {!isClientMounted ? (
            <div role="status" aria-live="polite" className="mt-10 rounded-[24px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center shadow-inner sm:rounded-[32px] sm:p-10">
              <div className="mx-auto h-2 w-32 overflow-hidden rounded-full bg-[#E8DCC8]">
                <div className="h-full w-2/3 rounded-full bg-[#B8892D]" />
              </div>
              <h3 className="mt-5 text-xl font-black tracking-[-0.02em] text-[#0B3D2E]">Loading tournaments</h3>
              <p className="mt-2 text-sm font-semibold text-[#51635C]">Restoring the tournament catalog and Director status.</p>
            </div>
          ) : tournaments.length === 0 ? (
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
                <article key={tournament.id} className="rounded-[24px] border border-[#E8DCC8] bg-[#FCFAF5] p-5 shadow-[0_18px_45px_rgba(11,61,46,0.06)] sm:rounded-[32px] sm:p-8">
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
                      className="min-h-12 rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                    >
                      Open Tournament
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveTournamentAsTemplate(tournament)}
                      className="min-h-12 rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Save as Template
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.localStorage.removeItem(getTournamentStateStorageKey(tournament.id));
                        }
                        const nextTournaments = tournaments.filter((item) => item.id !== tournament.id);
                        saveTournaments(nextTournaments);
                        void refreshDirectorReadModel(nextTournaments);
                      }}
                      className="min-h-12 rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0B3D2E]/70 px-4 py-4 backdrop-blur-sm sm:items-center sm:py-6"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-tournament-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[32px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    New Tournament
                  </p>
                  <h3 id="create-tournament-title" className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    Create Tournament
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Close tournament creation dialog"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <form className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7 sm:py-7" onSubmit={handleCreateTournament}>
              {creationError ? <p role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{creationError}</p> : null}
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

              <div className="sticky bottom-0 -mx-5 -mb-5 mt-8 flex flex-col-reverse gap-3 border-t border-[#E8DCC8] bg-[#F6F1E6] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 sm:-mx-7 sm:-mb-7 sm:flex-row sm:justify-end sm:px-7">
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
