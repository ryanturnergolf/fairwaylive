"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { getTournamentStateStorageKey } from "../../lib/tournamentStorage";
import { buildAppUrl, buildCurrentBrowserUrl } from "../../lib/appUrl";
import {
  buildIndividualLeaderboard,
  buildPrintablePairings,
  buildTeamLeaderboard,
  calculateTotal,
  formatTotalToPar,
  normalizeTournamentRoundSetup,
} from "../../lib/services/tournamentDerivedState";
import {
  isValidPairingMutation,
  normalizePairings,
  snapshotPairings,
} from "../../lib/services/tournamentService";
import {
  buildImportedPlayers,
  buildMobileScorecardPath,
  generatePairings,
  generateScorecardRows,
  pairingExistsForPlayer,
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
  useBodyOverflowLock,
  useClientMounted,
  useLatestTournamentPageState,
  useQrCodeDataUrl,
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

const tabs = ["Overview", "Teams", "Players", "Pairings", "Live Scoring", "Clippd Export"];

type ScorecardRow = {
  id: number;
  playerName: string;
  team: string;
  scores: number[];
};

type ClippdExportState = {
  tournamentId: string;
  tournamentKey: string;
  exportFormat: string;
};

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
  const [isScoreboardImportModalOpen, setIsScoreboardImportModalOpen] = useState(false);
  const [scoreboardImportState, setScoreboardImportState] = useState({
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
  const [activeQrPlayer, setActiveQrPlayer] = useState<ScorecardRow | null>(null);
  const [activePrintPlayer, setActivePrintPlayer] = useState<ScorecardRow | null>(null);
  const [activeQrCodeDataUrl, setActiveQrCodeDataUrl] = useState("");
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [tournamentMeta, setTournamentMeta] = useState<TournamentMeta>(() => createFallbackTournamentMeta(""));
  const [sharedTournamentId, setSharedTournamentId] = useState("");
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

  const activeQrPairing = useMemo(() => {
    if (!activeQrPlayer) {
      return null;
    }

    return pairingExistsForPlayer(pairings, activeQrPlayer.playerName) ?? null;
  }, [activeQrPlayer, pairings]);
  const activeQrScoringPlayerId = useMemo(() => {
    if (!activeQrPairing || !activeQrPlayer) {
      return "";
    }

    return (
      activeQrPairing.players.find(
        (player) => player.playerName === activeQrPlayer.playerName && player.teamName === activeQrPlayer.team
      )?.playerId || String(activeQrPlayer.id)
    );
  }, [activeQrPairing, activeQrPlayer]);

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

  const displayHoleCount = normalizedRoundSetup.numberOfHoles;
  const countingScores = normalizedRoundSetup.countingScores;

  const handleClippdInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setClippdExportState((current) => ({ ...current, [name]: value }));
  };

  const handleClippdSave = () => {
    setClippdExportState((current) => ({ ...current }));
  };

  const handleClippdGenerate = () => {
    setClippdExportState((current) => ({ ...current }));
  };

  const handleScoreboardImportInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = event.target;

    if (type === "checkbox") {
      setScoreboardImportState((current) => ({
        ...current,
        options: {
          ...current.options,
          [name]: checked,
        },
      }));
      return;
    }

    setScoreboardImportState((current) => ({ ...current, [name]: value }));
  };

  const openScoreboardImportModal = () => {
    setIsScoreboardImportModalOpen(true);
  };

  const closeScoreboardImportModal = () => {
    setIsScoreboardImportModalOpen(false);
  };

  const handleScoreboardImportSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    closeScoreboardImportModal();
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

  const openQrModal = (player: ScorecardRow) => {
    setActiveQrCodeDataUrl("");
    setActiveQrPlayer(player);
  };

  const closeQrModal = () => {
    setActiveQrCodeDataUrl("");
    setActiveQrPlayer(null);
  };

  const openPrintScorecardModal = (player: ScorecardRow) => {
    setActivePrintPlayer(player);
  };

  const closePrintScorecardModal = () => {
    setActivePrintPlayer(null);
  };

  const handlePrintScorecard = () => {
    window.print();
  };

  const handlePrintTournamentScorecards = () => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.classList.add("printing-batch-scorecards");

    try {
      window.print();
    } finally {
      document.body.classList.remove("printing-batch-scorecards");
    }
  };

  const mobileScorecardUrl = "/scorecard/test";

  const browserMobileScorecardPath = useMemo(() => {
    return buildMobileScorecardPath({ tournamentId, activeQrPairing, activeQrScoringPlayerId });
  }, [activeQrPairing, activeQrScoringPlayerId, tournamentId]);

  const qrMobileScorecardPath = useMemo(() => {
    return buildMobileScorecardPath({ tournamentId: sharedTournamentId, activeQrPairing, activeQrScoringPlayerId });
  }, [activeQrPairing, activeQrScoringPlayerId, sharedTournamentId]);

  const resolvedMobileScorecardUrl = useMemo(() => buildAppUrl(qrMobileScorecardPath), [qrMobileScorecardPath]);
  const browserMobileScorecardUrl = useMemo(() => buildCurrentBrowserUrl(browserMobileScorecardPath), [browserMobileScorecardPath]);
  const isQrMobileScorecardReady = Boolean(sharedTournamentId && activeQrPairing && activeQrScoringPlayerId);

  useBodyOverflowLock(Boolean(activeQrPlayer));
  useQrCodeDataUrl({
    shouldGenerate: Boolean(activeQrPlayer && isQrMobileScorecardReady),
    resolvedMobileScorecardUrl,
    setActiveQrCodeDataUrl,
  });

  const handlePrintFromQrModal = () => {
    if (!activeQrPlayer) {
      return;
    }

    closeQrModal();
    openPrintScorecardModal(activeQrPlayer);
  };

  const individualLeaderboard = useMemo(
    () => buildIndividualLeaderboard({ scorecardsGenerated, scorecardRows, displayHoleCount }),
    [displayHoleCount, scorecardRows, scorecardsGenerated]
  );

  const teamLeaderboard = useMemo(
    () => buildTeamLeaderboard({ scorecardsGenerated, scorecardRows, displayHoleCount, countingScores }),
    [countingScores, displayHoleCount, scorecardRows, scorecardsGenerated]
  );

  const printablePairings = useMemo(
    () => buildPrintablePairings({ pairings, scorecardRows, normalizedRoundSetup }),
    [normalizedRoundSetup, pairings, scorecardRows]
  );

  const safeScorecardRows = Array.isArray(scorecardRows) ? scorecardRows : [];

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
            ) : activeTab === "Live Scoring" ? (
              <div className="space-y-6">
                <PairingsScorecardGeneration
                  activeTab="Live Scoring"
                  normalizedRoundSetup={normalizedRoundSetup}
                  scorecardsGenerated={scorecardsGenerated}
                  onPrintTournamentScorecards={handlePrintTournamentScorecards}
                  onGenerateScorecards={generateScorecards}
                  onRoundSetupChange={handleRoundSetupChange}
                />
                {scorecardsGenerated ? (
                  scorecardRows.length > 0 ? (
                    <div className="space-y-6">
                      <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                              Live Leaderboard
                            </p>
                            <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                              Individual Standings
                            </h4>
                          </div>
                          <div className="rounded-full border border-[#E8DCC8] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                            Updated Live
                          </div>
                        </div>

                        <div className="mt-6 overflow-x-auto">
                          <table className="min-w-full border-separate border-spacing-0">
                            <thead className="bg-[#F6F1E6] text-left text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                              <tr>
                                <th className="px-4 py-4">Position</th>
                                <th className="px-4 py-4">Player</th>
                                <th className="px-4 py-4">Team</th>
                                <th className="px-4 py-4 text-center">Total Score</th>
                                <th className="px-4 py-4 text-center">To Par</th>
                                <th className="px-4 py-4 text-center">Through</th>
                                <th className="px-4 py-4 text-center">Today</th>
                              </tr>
                            </thead>
                            <tbody>
                              {individualLeaderboard.map((player) => (
                                <tr key={player.id} className="border-t border-[#E8DCC8] bg-white/70">
                                  <td className="px-4 py-4 font-black text-[#0B3D2E]">{player.position}</td>
                                  <td className="px-4 py-4 font-black text-[#0B3D2E]">{player.playerName}</td>
                                  <td className="px-4 py-4 text-sm text-[#51635C]">{player.team}</td>
                                  <td className="px-4 py-4 text-center font-black text-[#0B3D2E]">{player.totalScore}</td>
                                  <td className="px-4 py-4 text-center font-black text-[#B8892D]">{player.toPar}</td>
                                  <td className="px-4 py-4 text-center text-sm text-[#51635C]">{player.through}</td>
                                  <td className="px-4 py-4 text-center font-black text-[#0B3D2E]">{player.today}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-6 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                        <div>
                          <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                            Team Scores
                          </p>
                          <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                            Counting Score Total ({countingScores})
                          </h4>
                        </div>

                        <div className="mt-6 overflow-x-auto">
                          <table className="min-w-full border-separate border-spacing-0">
                            <thead className="bg-[#F6F1E6] text-left text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                              <tr>
                                <th className="px-4 py-4">Position</th>
                                <th className="px-4 py-4">Team Name</th>
                                <th className="px-4 py-4 text-center">Total Score</th>
                                <th className="px-4 py-4 text-center">To Par</th>
                                <th className="px-4 py-4 text-center">Through</th>
                                <th className="px-4 py-4 text-center">Today</th>
                              </tr>
                            </thead>
                            <tbody>
                              {teamLeaderboard.map((team) => (
                                <tr key={team.teamName} className="border-t border-[#E8DCC8] bg-white/70">
                                  <td className="px-4 py-4 font-black text-[#0B3D2E]">{team.position}</td>
                                  <td className="px-4 py-4 font-black text-[#0B3D2E]">{team.teamName}</td>
                                  <td className="px-4 py-4 text-center font-black text-[#0B3D2E]">{team.totalScore}</td>
                                  <td className="px-4 py-4 text-center font-black text-[#B8892D]">{team.toPar}</td>
                                  <td className="px-4 py-4 text-center text-sm text-[#51635C]">{team.through}</td>
                                  <td className="px-4 py-4 text-center font-black text-[#0B3D2E]">{team.today}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-separate border-spacing-0">
                            <thead className="bg-[#F6F1E6] text-left text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                              <tr>
                                <th className="px-4 py-4">Player Name</th>
                                <th className="px-4 py-4">Team</th>
                                {Array.from({ length: displayHoleCount }, (_, index) => (
                                  <th key={index + 1} className="px-2 py-4 text-center">
                                    {index + 1}
                                  </th>
                                ))}
                                <th className="px-4 py-4 text-center">Total</th>
                                <th className="px-4 py-4 text-center">To Par</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scorecardRows.map((row) => {
                                const total = calculateTotal(row.scores);
                                const toPar = formatTotalToPar(total);

                                return (
                                  <tr key={row.id} className="border-t border-[#E8DCC8] bg-white/70">
                                    <td className="px-4 py-4 font-black text-[#0B3D2E]">
                                      <div className="flex items-center gap-3">
                                        <span>{row.playerName}</span>
                                        <button
                                          type="button"
                                          onClick={() => openQrModal(row)}
                                          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E8DCC8] bg-[#FCFAF5] text-sm font-black text-[#0B3D2E] transition duration-300 hover:bg-[#E8DCC8]"
                                          aria-label={`Open QR code for ${row.playerName}`}
                                        >
                                          ⬢
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4 text-sm text-[#51635C]">{row.team}</td>
                                    {row.scores.map((score, holeIndex) => (
                                      <td key={`${row.id}-${holeIndex}`} className="px-2 py-3 text-center">
                                        <input
                                          type="number"
                                          min="1"
                                          max="12"
                                          value={score}
                                          onChange={(event) => handleScoreInputChange(row.id, holeIndex, event.target.value)}
                                          className="h-9 w-12 rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-2 py-1 text-center text-sm font-semibold text-[#0B3D2E] outline-none"
                                        />
                                      </td>
                                    ))}
                                    <td className="px-4 py-4 text-center font-black text-[#0B3D2E]">{total}</td>
                                    <td className="px-4 py-4 text-center font-black text-[#B8892D]">{toPar}</td>
                                    <td className="px-4 py-4 text-right">
                                      <button
                                        type="button"
                                        onClick={() => openPrintScorecardModal(row)}
                                        className="rounded-full border border-[#B8892D] px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                                      >
                                        Print Scorecard
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center shadow-inner">
                      <h4 className="text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                        No players have been added yet.
                      </h4>
                      <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-[#51635C]">
                        Add players in the Players tab first, then generate scorecards for the tournament field.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center shadow-inner">
                    <h4 className="text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                      Scorecards ready to generate.
                    </h4>
                    <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-[#51635C]">
                      Use the button above to generate scorecards for each player in the roster and begin editing strokes hole by hole.
                    </p>
                  </div>
                )}
              </div>
            ) : activeTab === "Clippd Export" ? (
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                      Clippd Export
                    </p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                      Prepare tournament results for submission.
                    </h3>
                  </div>
                  <p className="mt-4 max-w-3xl text-lg leading-8 text-[#51635C]">
                    Clubhouse HQ can prepare your tournament results for submission to Scoreboard powered by Clippd.
                  </p>

                  <div className="mt-6 grid gap-5 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                      <span>Clippd Tournament ID</span>
                      <input
                        name="tournamentId"
                        value={clippdExportState.tournamentId}
                        onChange={handleClippdInputChange}
                        className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                        placeholder="e.g. 10482"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                      <span>Clippd Tournament Key</span>
                      <input
                        name="tournamentKey"
                        value={clippdExportState.tournamentKey}
                        onChange={handleClippdInputChange}
                        className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                        placeholder="e.g. 6f8a2c"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] md:col-span-2">
                      <span>Export Format</span>
                      <select
                        name="exportFormat"
                        value={clippdExportState.exportFormat}
                        onChange={handleClippdInputChange}
                        className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      >
                        <option>Final Results CSV</option>
                        <option>Hole-by-Hole CSV</option>
                        <option>Team Results CSV</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleClippdSave}
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Save Clippd Info
                    </button>
                    <button
                      type="button"
                      onClick={openScoreboardImportModal}
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Import from Scoreboard
                    </button>
                    <button
                      type="button"
                      onClick={handleClippdGenerate}
                      className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                    >
                      Generate Export
                    </button>
                  </div>
                </div>
              </div>
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

      {isScoreboardImportModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm"
          onClick={closeScoreboardImportModal}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Scoreboard Import
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    Import Tournament from Scoreboard
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeScoreboardImportModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <form className="px-7 py-7" onSubmit={handleScoreboardImportSubmit}>
              <p className="text-base leading-8 text-[#51635C]">
                Enter your Scoreboard Tournament ID and Tournament Key to import event details, teams, players, course setup, scorecards, tee times, and starting holes.
              </p>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] md:col-span-2">
                  <span>Scoreboard Tournament ID</span>
                  <input
                    name="tournamentId"
                    value={scoreboardImportState.tournamentId}
                    onChange={handleScoreboardImportInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. 10482"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] md:col-span-2">
                  <span>Tournament Key</span>
                  <input
                    name="tournamentKey"
                    value={scoreboardImportState.tournamentKey}
                    onChange={handleScoreboardImportInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. 6f8a2c"
                  />
                </label>
              </div>

              <div className="mt-8">
                <p className="text-sm font-black uppercase tracking-[0.3em] text-[#B8892D]">
                  Import Options
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["tournamentDetails", "Tournament details"],
                    ["teams", "Teams"],
                    ["players", "Players"],
                    ["courseSetup", "Course setup"],
                    ["scorecards", "Scorecards"],
                    ["teeTimes", "Tee times"],
                    ["startingHoles", "Starting holes"],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 rounded-2xl border border-[#E8DCC8] bg-white/80 px-4 py-3 text-sm font-semibold text-[#0B3D2E]">
                      <input
                        type="checkbox"
                        name={key}
                        checked={Boolean(scoreboardImportState.options[key as keyof typeof scoreboardImportState.options])}
                        onChange={handleScoreboardImportInputChange}
                        className="h-4 w-4 rounded border-[#E8DCC8] text-[#0B3D2E] focus:ring-[#0B3D2E]"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeScoreboardImportModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  Import Preview
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {activeQrPlayer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-8 backdrop-blur-sm"
          onClick={closeQrModal}
        >
          <div
            className="flex max-h-[calc(100vh-4rem)] w-full max-w-xl flex-col overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Mobile Score Entry
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    {activeQrPlayer.playerName}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeQrModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto px-7 py-7">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Player Name</p>
                  <p className="mt-2 font-black text-[#0B3D2E]">{activeQrPlayer.playerName}</p>
                </div>
                <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Team</p>
                  <p className="mt-2 font-black text-[#0B3D2E]">{activeQrPlayer.team}</p>
                </div>
                <div className="rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5 md:col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Round</p>
                  <p className="mt-2 font-black text-[#0B3D2E]">{normalizedRoundSetup.roundNumber}</p>
                </div>
              </div>

              <div className="mt-6 rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center shadow-inner">
                <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-[24px] border border-dashed border-[#B8892D] bg-white text-4xl font-black text-[#0B3D2E]">
                  {activeQrCodeDataUrl ? (
                    <Image
                      src={activeQrCodeDataUrl}
                      alt={`QR code for ${activeQrPairing ? `group ${activeQrPairing.groupNumber}` : activeQrPlayer.playerName}`}
                      width={128}
                      height={128}
                      unoptimized
                      className="h-full w-full rounded-[20px] object-contain p-2"
                    />
                  ) : (
                    "..."
                  )}
                </div>
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  {isQrMobileScorecardReady
                    ? `Group ${activeQrPairing?.groupNumber ?? ""} mobile scoring access`
                    : "Preparing mobile scoring access"}
                </p>
                <div className="mt-4 rounded-2xl border border-[#E8DCC8] bg-white/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  {isQrMobileScorecardReady
                    ? `Scorecard URL: ${resolvedMobileScorecardUrl || mobileScorecardUrl}`
                    : "Scorecard URL: Preparing shared link"}
                </div>
              </div>

              <p className="mt-6 text-center text-base leading-8 text-[#51635C]">
                Players simply scan this QR code to enter scores from any phone. No app required.
              </p>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeQrModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Close
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Download QR
                </button>
                <Link
                  href={browserMobileScorecardUrl || mobileScorecardUrl}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-center text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Open Mobile Scorecard
                </Link>
                <button
                  type="button"
                  onClick={handlePrintFromQrModal}
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  Print Scorecard
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activePrintPlayer ? (
        <div
          className="print-scorecard-overlay fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm"
          onClick={closePrintScorecardModal}
        >
          <div
            className="print-scorecard-shell w-full max-w-5xl overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="print-hide bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Printable Scorecard
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    {activePrintPlayer.playerName}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closePrintScorecardModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="px-7 py-7">
              <div className="print-scorecard-sheet rounded-[28px] border border-[#E8DCC8] bg-white/80 p-6 shadow-inner">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-sm font-black tracking-[0.25em] text-[#F6F1E6]">
                      HQ
                    </div>
                    <div>
                      <p className="text-lg font-black tracking-[-0.02em] text-[#0B3D2E]">Clubhouse HQ</p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">College Golf Operations</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Tournament</p>
                    <p className="mt-1 font-black text-[#0B3D2E]">{tournament.name}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Round Number</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{normalizedRoundSetup.roundNumber}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Player</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{activePrintPlayer.playerName}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Team</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{activePrintPlayer.team}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Tee Time</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{normalizedRoundSetup.teeTime}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Starting Hole</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{normalizedRoundSetup.startingHole}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Course</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{tournament.course}</p>
                  </div>
                </div>

                <div className="mt-6 overflow-hidden rounded-[24px] border border-[#E8DCC8]">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead className="bg-[#F6F1E6] text-left text-[10px] font-black uppercase tracking-[0.3em] text-[#51635C]">
                      <tr>
                        <th className="px-3 py-3">Hole</th>
                        <th className="px-3 py-3">Par</th>
                        <th className="px-3 py-3">Yardage</th>
                        <th className="px-3 py-3">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 18 }, (_, index) => {
                        const holeNumber = index + 1;
                        const score = activePrintPlayer.scores[holeNumber - 1] ?? 0;
                        const scoreDisplay = score > 0 ? score : "";
                        const par = 4;
                        const yardage = 350 + holeNumber * 6;
                        return (
                          <tr key={holeNumber} className="border-t border-[#E8DCC8] bg-white/70">
                            <td className="px-3 py-3 font-black text-[#0B3D2E]">{holeNumber}</td>
                            <td className="px-3 py-3 text-[#51635C]">{par}</td>
                            <td className="px-3 py-3 text-[#51635C]">{yardage}</td>
                            <td className="px-3 py-3 font-black text-[#0B3D2E]">{scoreDisplay}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Front 9 Total</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{activePrintPlayer.scores.slice(0, 9).reduce((sum, score) => sum + score, 0)}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Back 9 Total</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{activePrintPlayer.scores.slice(9, 18).reduce((sum, score) => sum + score, 0)}</p>
                  </div>
                  <div className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Overall Total</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{activePrintPlayer.scores.reduce((sum, score) => sum + score, 0)}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">To Par</p>
                    <p className="mt-2 font-black text-[#0B3D2E]">{formatTotalToPar(activePrintPlayer.scores.reduce((sum, score) => sum + score, 0))}</p>
                  </div>
                  <div className="rounded-full border border-[#E8DCC8] bg-white px-4 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                    Notes
                  </div>
                </div>

                <div className="mt-6 rounded-[24px] border border-[#E8DCC8] bg-[#FCFAF5] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Notes</p>
                  <div className="print-notes-area mt-3 min-h-20 rounded-[18px] border border-dashed border-[#E8DCC8] bg-white/80 p-4 text-sm text-[#51635C]">
                    Add notes for the player or round here.
                  </div>
                </div>
              </div>

              <div className="print-hide mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closePrintScorecardModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handlePrintScorecard}
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  Print
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className="print-batch-scorecards-root hidden">
        {printablePairings.map((pairing) => {
          const pairingPlayers = Array.isArray(pairing.players) ? pairing.players : [];

          const rowsForGroup = pairingPlayers.map((player) => {
            const matchingScorecardRow = safeScorecardRows.find((row) => row.playerName === player.playerName);
            const scores = Array.from({ length: 18 }, (_, index) => matchingScorecardRow?.scores[index] ?? 0);
            const total = scores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0);

            return {
              playerName: player.playerName,
              teamName: player.teamName,
              scores,
              total,
            };
          });

          return (
            <article key={`print-group-${pairing.groupNumber}`} className="print-batch-sheet mb-8 border border-black p-4 text-black">
              <header className="mb-4 border-b border-black pb-2">
                <h2 className="text-xl font-black">{tournament.name}</h2>
                <p className="mt-1 text-sm font-semibold">Round {normalizedRoundSetup.roundNumber}</p>
                <p className="text-sm font-semibold">Group {pairing.groupNumber}</p>
                <p className="text-sm font-semibold">Players: {pairingPlayers.map((player) => player.playerName).join(", ")}</p>
              </header>

              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-1 text-left">Player</th>
                    {Array.from({ length: 18 }, (_, index) => (
                      <th key={`print-hole-${pairing.groupNumber}-${index + 1}`} className="border border-black px-2 py-1 text-center">
                        {index + 1}
                      </th>
                    ))}
                    <th className="border border-black px-2 py-1 text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-1 font-semibold">Par</td>
                    {Array.from({ length: 18 }, (_, index) => (
                      <td key={`print-par-${pairing.groupNumber}-${index + 1}`} className="border border-black px-2 py-1 text-center">
                        4
                      </td>
                    ))}
                    <td className="border border-black px-2 py-1 text-center font-semibold">72</td>
                  </tr>

                  {rowsForGroup.map((row) => (
                    <tr key={`print-player-row-${pairing.groupNumber}-${row.playerName}`}>
                      <td className="border border-black px-2 py-1">
                        <div className="font-semibold">{row.playerName}</div>
                        <div className="text-[10px]">{row.teamName}</div>
                      </td>
                      {row.scores.map((score, index) => (
                        <td key={`print-score-${pairing.groupNumber}-${row.playerName}-${index + 1}`} className="border border-black px-2 py-1 text-center">
                          {score > 0 ? score : ""}
                        </td>
                      ))}
                      <td className="border border-black px-2 py-1 text-center font-semibold">{row.total > 0 ? row.total : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          );
        })}
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
