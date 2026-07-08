"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { getTournamentStateStorageKey } from "../../lib/tournamentStorage";
import {
  normalizeTournamentRoundSetup,
} from "../../lib/services/tournamentDerivedState";
import {
  loadTournamentReadiness,
  type TournamentReadiness,
  type TournamentReadinessChecks,
  type TournamentReadinessStatus,
} from "../../lib/services/tournamentReadinessService";
import {
  isValidPairingMutation,
  normalizePairings,
  snapshotPairings,
} from "../../lib/services/tournamentService";
import {
  buildImportedPlayers,
  generatePairings,
  generateScorecardRows,
  parseImportedPlayerCsv,
  playerImportTemplateCsv,
  relocatePairingPlayer,
  updateScorecardRows,
  upsertPlayerFromForm,
  upsertTeamFromForm,
  validatePlayerForm,
  validateTeamForm,
} from "../../lib/services/tournamentPageHelpers";
import {
  useClientMounted,
  useLatestTournamentPageState,
  useSharedScoreSynchronization,
  useTournamentMetadata,
  useTournamentPageLoading,
  useTournamentPagePersistence,
  useTournamentStoragePolling,
} from "../../lib/hooks/tournamentPageHooks";
import TeamPlayerManagement, {
  type ImportedPlayerPreview,
  type Player,
  type PlayerFormState,
  type Team,
  type TeamFormState,
} from "./components/TeamPlayerManagement";
import PairingsScorecardGeneration, {
  type AutoRepairState,
  type PairingGroup,
  type RoundSetupState,
} from "./components/PairingsScorecardGeneration";
import LiveScoringLeaderboard, { type ScorecardRow } from "./components/LiveScoringLeaderboard";
import TournamentPrintExport, {
  type ClippdExportState,
  type ScoreboardImportState,
} from "./components/TournamentPrintExport";

const tabs = ["Overview", "Teams", "Players", "Pairings", "Live Scoring", "Clippd Export"];

const defaultTeamFormState: TeamFormState = {
  schoolName: "",
  shortName: "",
  teamColor: "",
  coachName: "",
};

const defaultPlayerFormState: PlayerFormState = {
  firstName: "",
  lastName: "",
  teamId: "",
  handicap: "",
  email: "",
};

const defaultRoundSetupState: RoundSetupState = {
  roundNumber: "1",
  startingHole: "1",
  numberOfHoles: "18",
  teeTime: "7:30 AM",
  countingScores: "4",
};

const defaultClippdExportState: ClippdExportState = {
  tournamentId: "",
  tournamentKey: "",
  exportFormat: "Final Results CSV",
};

const defaultTeamColor = "#0B3D2E";

const readinessCheckLabels: Record<keyof TournamentReadinessChecks, string> = {
  tournamentExists: "Tournament metadata available",
  sharedTournamentUuidPresent: "Shared tournament UUID available",
  playersSynced: "Players synced for shared scoring",
  pairingsGenerated: "Pairings generated",
  scorecardsGenerated: "Scorecards generated",
  latestSnapshotAvailable: "Shared state snapshot available",
};

const readinessStatusStyles: Record<TournamentReadinessStatus, string> = {
  Draft: "border-[#D8C8AA] bg-[#F6F1E6] text-[#725D37]",
  Syncing: "border-[#7DA7BE] bg-[#EDF6FA] text-[#255D78]",
  Ready: "border-[#77B98E] bg-[#ECF8EF] text-[#146233]",
  Warning: "border-[#E0B14F] bg-[#FFF7E3] text-[#7A5610]",
  Error: "border-[#D9857F] bg-[#FFF0EE] text-[#8D2D24]",
};

const readinessCheckEntries = Object.entries(readinessCheckLabels) as [keyof TournamentReadinessChecks, string][];

const formatReadinessCheckedAt = (checkedAt: string) => {
  const checkedDate = new Date(checkedAt);

  if (Number.isNaN(checkedDate.getTime())) {
    return "Not checked yet";
  }

  return checkedDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

type TournamentMeta = {
  id: string;
  name: string;
  date: string;
  course: string;
  city: string;
  state: string;
  rounds: string;
  scoringFormat: string;
  status: string;
  settings: unknown;
};

const createFallbackTournamentMeta = (tournamentId: string): TournamentMeta => ({
  id: tournamentId,
  name: "Tournament",
  date: "",
  course: "",
  city: "",
  state: "",
  rounds: "1",
  scoringFormat: "Stroke Play",
  status: "Upcoming",
  settings: null,
});

export default function TournamentPage() {
  const params = useParams();
  const tournamentId = useMemo(() => {
    const rawId = params?.id;
    if (typeof rawId === "string") {
      return rawId;
    }
    if (Array.isArray(rawId) && rawId.length > 0) {
      return rawId[0];
    }
    return "";
  }, [params]);

  const storageKey = useMemo(() => (tournamentId ? getTournamentStateStorageKey(tournamentId) : ""), [tournamentId]);
  const [activeTab, setActiveTab] = useState("Overview");
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFormState, setTeamFormState] = useState<TeamFormState>(defaultTeamFormState);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [teamErrors, setTeamErrors] = useState<Partial<Record<keyof TeamFormState, string>>>({});
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerFormState, setPlayerFormState] = useState<PlayerFormState>(defaultPlayerFormState);
  const [isPlayerImportModalOpen, setIsPlayerImportModalOpen] = useState(false);
  const [playerImportFileName, setPlayerImportFileName] = useState("");
  const [playerImportRows, setPlayerImportRows] = useState<ImportedPlayerPreview[]>([]);
  const [playerImportError, setPlayerImportError] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
  const [playerErrors, setPlayerErrors] = useState<Partial<Record<keyof PlayerFormState, string>>>({});
  const [roundSetup, setRoundSetup] = useState<RoundSetupState>(defaultRoundSetupState);
  const [scorecardsGenerated, setScorecardsGenerated] = useState(false);
  const [scorecardRows, setScorecardRows] = useState<ScorecardRow[]>([]);
  const [pairings, setPairings] = useState<PairingGroup[]>([]);
  const [pairingsMessage, setPairingsMessage] = useState("");
  const previousValidPairingsRef = useRef<PairingGroup[] | null>(null);
  const [clippdExportState, setClippdExportState] = useState<ClippdExportState>(defaultClippdExportState);
  const [scoreboardImportState, setScoreboardImportState] = useState<ScoreboardImportState>({
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
  });
  const [isAutoRepairModalOpen, setIsAutoRepairModalOpen] = useState(false);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [tournamentMeta, setTournamentMeta] = useState<TournamentMeta>(() => createFallbackTournamentMeta(""));
  const [sharedTournamentId, setSharedTournamentId] = useState("");
  const [tournamentReadiness, setTournamentReadiness] = useState<TournamentReadiness | null>(null);
  const [isReadinessRefreshing, setIsReadinessRefreshing] = useState(false);
  const [autoRepairState, setAutoRepairState] = useState<AutoRepairState>({
    sourceRound: "Round 1",
    targetRound: "Round 2",
    pairingOrder: "Worst to Best",
    teeTimeInterval: "8 minutes",
  });
  const normalizedRoundSetup = normalizeTournamentRoundSetup(roundSetup, defaultRoundSetupState);
  const latestState = useMemo(
    () => ({
      teams,
      players,
      pairings,
      scorecardsGenerated,
      scorecardRows,
      roundSetup,
      clippdExportState,
      scoreboardImportState,
      autoRepairState,
    }),
    [
      autoRepairState,
      clippdExportState,
      pairings,
      players,
      roundSetup,
      scoreboardImportState,
      scorecardRows,
      scorecardsGenerated,
      teams,
    ]
  );
  const latestStateRef = useLatestTournamentPageState(latestState);

  const tournament = isClientMounted ? tournamentMeta : createFallbackTournamentMeta(tournamentId);

  useClientMounted(setIsClientMounted);
  useTournamentMetadata({
    isClientMounted,
    tournamentId,
    createFallbackTournamentMeta,
    setTournamentMeta,
    setSharedTournamentId,
  });
  const { hasLoadedFromStorageRef, hydrationPendingRef } = useTournamentPageLoading({
    tournamentId,
    storageKey,
    setTournamentMeta,
    setSharedTournamentId,
    setTeams,
    setPlayers,
    setPairings,
    setScorecardsGenerated,
    setScorecardRows,
    setRoundSetup,
    setClippdExportState,
    setScoreboardImportState,
    setAutoRepairState,
  });
  useTournamentPagePersistence({
    tournamentId,
    storageKey,
    sharedTournamentId,
    tournament,
    state: latestState,
    setSharedTournamentId,
    hasLoadedFromStorageRef,
    hydrationPendingRef,
  });
  useTournamentStoragePolling({
    tournamentId,
    storageKey,
    latestStateRef,
    defaultRoundSetupState,
    setTeams,
    setPlayers,
    setPairings,
    setScorecardsGenerated,
    setScorecardRows,
    setRoundSetup,
    setClippdExportState,
    setScoreboardImportState,
    setAutoRepairState,
  });
  useSharedScoreSynchronization({
    isClientMounted,
    tournamentId,
    sharedTournamentId,
    scorecardsGenerated,
    scorecardRowsLength: scorecardRows.length,
    roundNumber: roundSetup.roundNumber,
    setScorecardRows,
  });

  const refreshTournamentReadiness = useCallback(async () => {
    if (!isClientMounted || !tournamentId) {
      return null;
    }

    setIsReadinessRefreshing(true);
    try {
      const readiness = await loadTournamentReadiness(tournamentId, sharedTournamentId);
      setTournamentReadiness(readiness);
      return readiness;
    } finally {
      setIsReadinessRefreshing(false);
    }
  }, [isClientMounted, sharedTournamentId, tournamentId]);

  useEffect(() => {
    void refreshTournamentReadiness();
  }, [
    refreshTournamentReadiness,
    isClientMounted,
    pairings.length,
    players.length,
    scorecardRows.length,
    scorecardsGenerated,
    sharedTournamentId,
    tournamentId,
  ]);

  const readinessOpenItems = tournamentReadiness?.reasons.filter((reason) => reason.severity !== "pass") ?? [];
  const readinessBlockingReasons = tournamentReadiness?.reasons.filter((reason) => reason.severity === "error" || reason.severity === "warning") ?? [];

  const resetTeamForm = () => {
    setTeamFormState(defaultTeamFormState);
    setTeamErrors({});
    setEditingTeamId(null);
  };

  const openPlayerImportModal = () => {
    setPlayerImportError("");
    setPlayerImportRows([]);
    setPlayerImportFileName("");
    setIsPlayerImportModalOpen(true);
  };

  const closePlayerImportModal = () => {
    setIsPlayerImportModalOpen(false);
    setPlayerImportError("");
    setPlayerImportRows([]);
    setPlayerImportFileName("");
  };

  const handlePlayerImportTemplateDownload = () => {
    const template = playerImportTemplateCsv();
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "clubhouse-hq-player-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePlayerImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setPlayerImportFileName(file.name);
    setPlayerImportError("");

    try {
      const text = await file.text();
      const rows = parseImportedPlayerCsv(text, teams);
      setPlayerImportRows(rows);
    } catch (error) {
      setPlayerImportRows([]);
      setPlayerImportError(error instanceof Error ? error.message : "Unable to parse the CSV file.");
    }
  };

  const handlePlayerImportConfirm = () => {
    if (playerImportRows.length === 0) {
      return;
    }

    const importedPlayers = buildImportedPlayers(playerImportRows, Date.now());

    setPlayers((current) => [...importedPlayers, ...current]);
    closePlayerImportModal();
  };

  const openAddTeamModal = () => {
    resetTeamForm();
    setIsTeamModalOpen(true);
  };

  const openEditTeamModal = (team: Team) => {
    setTeamFormState({
      schoolName: team.schoolName,
      shortName: team.shortName,
      teamColor: team.teamColor,
      coachName: team.coachName,
    });
    setEditingTeamId(team.id);
    setTeamErrors({});
    setIsTeamModalOpen(true);
  };

  const closeTeamModal = () => {
    setIsTeamModalOpen(false);
    resetTeamForm();
  };

  const handleTeamInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const fieldName = name as keyof TeamFormState;

    setTeamFormState((current) => ({ ...current, [fieldName]: value }));

    if (teamErrors[fieldName]) {
      setTeamErrors((current) => ({ ...current, [fieldName]: undefined }));
    }
  };

  const handleTeamSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateTeamForm(teamFormState);
    setTeamErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setTeams((current) =>
      upsertTeamFromForm({
        teams: current,
        teamFormState,
        editingTeamId,
        defaultTeamColor,
        nextTeamId: Date.now(),
      })
    );

    closeTeamModal();
  };

  const resetPlayerForm = () => {
    setPlayerFormState(defaultPlayerFormState);
    setPlayerErrors({});
    setEditingPlayerId(null);
  };

  const openAddPlayerModal = () => {
    const initialTeamId = teams.length > 0 ? String(teams[0].id) : "";
    setPlayerFormState({ ...defaultPlayerFormState, teamId: initialTeamId });
    setPlayerErrors({});
    setEditingPlayerId(null);
    setIsPlayerModalOpen(true);
  };

  const openEditPlayerModal = (player: Player) => {
    setPlayerFormState({
      firstName: player.firstName,
      lastName: player.lastName,
      teamId: player.teamId,
      handicap: player.handicap,
      email: player.email,
    });
    setEditingPlayerId(player.id);
    setPlayerErrors({});
    setIsPlayerModalOpen(true);
  };

  const closePlayerModal = () => {
    setIsPlayerModalOpen(false);
    resetPlayerForm();
  };

  const handlePlayerInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    const fieldName = name as keyof PlayerFormState;

    setPlayerFormState((current) => ({ ...current, [fieldName]: value }));

    if (playerErrors[fieldName]) {
      setPlayerErrors((current) => ({ ...current, [fieldName]: undefined }));
    }
  };

  const handlePlayerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validatePlayerForm(playerFormState);
    setPlayerErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setPlayers((current) =>
      upsertPlayerFromForm({
        players: current,
        teams,
        playerFormState,
        editingPlayerId,
        nextPlayerId: Date.now(),
      })
    );

    closePlayerModal();
  };

  const handleRoundSetupChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setRoundSetup((current) => ({ ...current, [name]: value }));
  };

  const handleScoreInputChange = (rowId: number, holeIndex: number, value: string) => {
    setScorecardRows((current) => updateScorecardRows(current, rowId, holeIndex, value));
  };

  const handleGeneratePairings = () => {
    if (players.length === 0) {
      setPairings([]);
      setPairingsMessage("Add players before generating pairings.");
      return;
    }

    setPairings(generatePairings(players));
    setPairingsMessage("");
  };

  const commitPairingMutation = (mutator: (current: PairingGroup[]) => PairingGroup[]) => {
    setPairings((current) => {
      const baselinePairings = previousValidPairingsRef.current ?? snapshotPairings(current);
      const nextPairings = mutator(snapshotPairings(current));
      const normalizedPairings = normalizePairings(nextPairings);

      if (!isValidPairingMutation(normalizedPairings, baselinePairings)) {
        return snapshotPairings(baselinePairings);
      }

      previousValidPairingsRef.current = snapshotPairings(normalizedPairings);
      return normalizedPairings;
    });
    setPairingsMessage("");
  };

  const movePairingPlayer = (
    sourcePairingIndex: number,
    sourcePlayerIndex: number,
    targetPairingIndex: number,
    targetPlayerIndex: number
  ) => {
    commitPairingMutation((current) =>
      relocatePairingPlayer({
        pairings: current,
        sourcePairingIndex,
        sourcePlayerIndex,
        targetPairingIndex,
        targetPlayerIndex,
      })
    );
  };

  const movePlayerWithinPairing = (pairingIndex: number, playerIndex: number, direction: -1 | 1) => {
    movePairingPlayer(pairingIndex, playerIndex, pairingIndex, playerIndex + direction);
  };

  const movePlayerBetweenPairings = (pairingIndex: number, playerIndex: number, direction: -1 | 1) => {
    const targetPairingIndex = pairingIndex + direction;

    if (targetPairingIndex < 0 || targetPairingIndex >= pairings.length) {
      return;
    }

    movePairingPlayer(
      pairingIndex,
      playerIndex,
      targetPairingIndex,
      pairings[targetPairingIndex].players.length
    );
  };

  const generateScorecards = () => {
    setScorecardsGenerated(true);
    setScorecardRows(generateScorecardRows(players, normalizedRoundSetup.numberOfHoles));
  };

  const handleAutoRepairInputChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = event.target;
    setAutoRepairState((current) => ({ ...current, [name]: value }));
  };

  const openAutoRepairModal = () => {
    setIsAutoRepairModalOpen(true);
  };

  const closeAutoRepairModal = () => {
    setIsAutoRepairModalOpen(false);
  };

  const handleAutoRepairSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    closeAutoRepairModal();
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

      <section className="mx-auto max-w-7xl px-6 py-6 lg:px-8 lg:py-10">
        <div className="overflow-hidden rounded-[36px] border border-[#E8DCC8] bg-white/90 shadow-[0_24px_80px_rgba(11,61,46,0.08)] backdrop-blur">
          <div className="bg-[#0B3D2E] px-8 py-8 text-[#F6F1E6] lg:px-10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                  Tournament Details
                </p>
                <h2 className="mt-2 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                  {tournament.name}
                </h2>
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#F6F1E6]/80">
                Status: Upcoming
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <div className="rounded-[24px] border border-white/10 bg-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#F0C96A]">Golf Course</p>
                <p className="mt-2 font-black text-[#F6F1E6]">{tournament.course}</p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#F0C96A]">Date</p>
                <p className="mt-2 font-black text-[#F6F1E6]">{tournament.date}</p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#F0C96A]">Rounds</p>
                <p className="mt-2 font-black text-[#F6F1E6]">{tournament.rounds}</p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#F0C96A]">Location</p>
                <p className="mt-2 font-black text-[#F6F1E6]">{tournament.city}, {tournament.state}</p>
              </div>
            </div>
          </div>

          <div className="border-b border-[#E8DCC8] bg-[#FCFAF5] px-6 py-4 lg:px-10">
            <div className="flex flex-wrap gap-3">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.3em] transition duration-300 ${
                    activeTab === tab
                      ? "bg-[#0B3D2E] text-[#F6F1E6]"
                      : "bg-transparent text-[#51635C] hover:bg-[#E8DCC8]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <section className="mt-4 rounded-[24px] border border-[#E8DCC8] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                      Tournament Readiness
                    </p>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] ${tournamentReadiness ? readinessStatusStyles[tournamentReadiness.status] : readinessStatusStyles.Syncing}`}>
                      {tournamentReadiness?.status ?? "Syncing"}
                    </span>
                    {tournamentReadiness?.isSafeToShare ? (
                      <span className="rounded-full border border-[#77B98E] bg-[#ECF8EF] px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-[#146233]">
                        Ready for Mobile Scoring
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#51635C]">
                    Last checked: {tournamentReadiness ? formatReadinessCheckedAt(tournamentReadiness.checkedAt) : "Checking..."}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#51635C]">
                    {tournamentReadiness?.isSafeToShare
                      ? "Shared tournament data is ready for coaches and players to use on mobile scorecards."
                      : readinessOpenItems.length > 0
                        ? `Remaining: ${readinessOpenItems.map((reason) => reason.message).join(" ")}`
                        : "Checking tournament data before mobile scoring is shared."}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:w-[560px]">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#0B3D2E]/65">
                      Checklist
                    </p>
                    <div className="mt-2 grid gap-2">
                      {readinessCheckEntries.map(([checkKey, label]) => {
                        const hasPassed = Boolean(tournamentReadiness?.checks[checkKey]);

                        return (
                          <div key={checkKey} className="flex items-center justify-between gap-3 rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2">
                            <span className="text-xs font-bold text-[#0B3D2E]">{label}</span>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${hasPassed ? "bg-[#ECF8EF] text-[#146233]" : "bg-[#F6F1E6] text-[#725D37]"}`}>
                              {hasPassed ? "Pass" : "Open"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#0B3D2E]/65">
                      Blocking Reasons
                    </p>
                    <div className="mt-2 space-y-2">
                      {readinessBlockingReasons.length > 0 ? (
                        readinessBlockingReasons.map((reason) => (
                          <div key={reason.code} className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2">
                            <p className="text-xs font-bold leading-5 text-[#51635C]">
                              {reason.message}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2">
                          <p className="text-xs font-bold leading-5 text-[#51635C]">
                            {tournamentReadiness?.isSafeToShare
                              ? "No blockers found."
                              : "No hard blockers found. Complete the open checklist items before sharing."}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="px-6 py-8 lg:px-10 lg:py-10">
            {activeTab === "Teams" || activeTab === "Players" ? (
              <TeamPlayerManagement
                activeTab={activeTab}
                teams={teams}
                players={players}
                isTeamModalOpen={isTeamModalOpen}
                editingTeamId={editingTeamId}
                teamFormState={teamFormState}
                teamErrors={teamErrors}
                isPlayerModalOpen={isPlayerModalOpen}
                editingPlayerId={editingPlayerId}
                playerFormState={playerFormState}
                playerErrors={playerErrors}
                isPlayerImportModalOpen={isPlayerImportModalOpen}
                playerImportRows={playerImportRows}
                playerImportError={playerImportError}
                playerImportFileName={playerImportFileName}
                onOpenAddTeamModal={openAddTeamModal}
                onOpenEditTeamModal={openEditTeamModal}
                onDeleteTeam={(teamId) => setTeams((current) => current.filter((item) => item.id !== teamId))}
                onCloseTeamModal={closeTeamModal}
                onTeamInputChange={handleTeamInputChange}
                onTeamSubmit={handleTeamSubmit}
                onOpenPlayerImportModal={openPlayerImportModal}
                onOpenAddPlayerModal={openAddPlayerModal}
                onOpenEditPlayerModal={openEditPlayerModal}
                onDeletePlayer={(playerId) => setPlayers((current) => current.filter((item) => item.id !== playerId))}
                onClosePlayerModal={closePlayerModal}
                onPlayerInputChange={handlePlayerInputChange}
                onPlayerSubmit={handlePlayerSubmit}
                onClosePlayerImportModal={closePlayerImportModal}
                onPlayerImportTemplateDownload={handlePlayerImportTemplateDownload}
                onPlayerImportFileChange={handlePlayerImportFileChange}
                onPlayerImportConfirm={handlePlayerImportConfirm}
              />
            ) : activeTab === "Pairings" ? (
              <PairingsScorecardGeneration
                activeTab="Pairings"
                pairings={pairings}
                pairingsMessage={pairingsMessage}
                isAutoRepairModalOpen={isAutoRepairModalOpen}
                autoRepairState={autoRepairState}
                onGeneratePairings={handleGeneratePairings}
                onOpenAutoRepairModal={openAutoRepairModal}
                onCloseAutoRepairModal={closeAutoRepairModal}
                onAutoRepairInputChange={handleAutoRepairInputChange}
                onAutoRepairSubmit={handleAutoRepairSubmit}
                onMovePlayerWithinPairing={movePlayerWithinPairing}
                onMovePlayerBetweenPairings={movePlayerBetweenPairings}
              />
            ) : activeTab === "Live Scoring" || activeTab === "Clippd Export" ? (
              <TournamentPrintExport
                activeTab={activeTab}
                tournamentId={tournamentId}
                sharedTournamentId={sharedTournamentId}
                tournament={tournament}
                normalizedRoundSetup={normalizedRoundSetup}
                pairings={pairings}
                scorecardRows={scorecardRows}
                clippdExportState={clippdExportState}
                setClippdExportState={setClippdExportState}
                scoreboardImportState={scoreboardImportState}
                setScoreboardImportState={setScoreboardImportState}
                tournamentReadiness={tournamentReadiness}
                readinessCheckEntries={readinessCheckEntries}
                readinessBlockingReasons={readinessBlockingReasons}
                onRefreshReadiness={refreshTournamentReadiness}
                isReadinessRefreshing={isReadinessRefreshing}
              >
                {({ onPrintTournamentScorecards, onOpenQrModal, onOpenPrintScorecardModal }) =>
                  activeTab === "Live Scoring" ? (
                    <LiveScoringLeaderboard
                      normalizedRoundSetup={normalizedRoundSetup}
                      scorecardsGenerated={scorecardsGenerated}
                      scorecardRows={scorecardRows}
                      onPrintTournamentScorecards={onPrintTournamentScorecards}
                      onGenerateScorecards={generateScorecards}
                      onRoundSetupChange={handleRoundSetupChange}
                      onScoreInputChange={handleScoreInputChange}
                      onOpenQrModal={onOpenQrModal}
                      onOpenPrintScorecardModal={onOpenPrintScorecardModal}
                    />
                  ) : null
                }
              </TournamentPrintExport>
            ) : (
              <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 shadow-inner">
                <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                  {activeTab}
                </p>
                <h3 className="mt-3 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                  {activeTab === "Overview"
                    ? "Tournament overview coming soon."
                    : "Live scoring view coming soon."}
                </h3>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-[#51635C]">
                  This screen is a UI-only placeholder for the selected section. The existing Clubhouse HQ visual language is preserved for the next phase.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

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
