"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { getTournamentStateStorageKey, loadTournamentStorageEnvelope } from "../../lib/tournamentStorage";
import { getSupabaseBrowserClient } from "../../lib/supabaseClient";
import { getTournamentPlayers } from "../../lib/repositories/tournamentRepository";
import {
  normalizeTournamentRoundSetup,
  projectOfficialLeaderboardScorecards,
} from "../../lib/services/tournamentDerivedState";
import {
  loadTournamentReadiness,
  type TournamentReadiness,
  type TournamentReadinessChecks,
  type TournamentReadinessStatus,
} from "../../lib/services/tournamentReadinessService";
import {
  getTournamentFinalizationRecord,
  loadTournamentFinalizationStatus,
  type TournamentFinalizationRecord,
} from "../../lib/services/tournamentFinalizationService";
import { loadComparisonScores } from "../../lib/services/scoreService";
import {
  loadTournamentHoleStatistics,
  resolveOfficialScore,
  type OfficialScoreResolutionChoice,
} from "../../lib/services/statisticsService";
import {
  buildDynamicStatisticReviewItems,
  certifiedMobileHolePars,
  loadDynamicStatisticReviewFoundation,
  parseDynamicStatisticOfficialValue,
  resolveOfficialDynamicStatistic,
  type DynamicStatisticReviewFoundation,
  type DynamicStatisticReviewItem,
} from "../../lib/services/dynamicStatisticsReviewService";
import type { ScoreEntryRow } from "../../lib/repositories/scoreRepository";
import type { ScoreHoleEntryRow } from "../../lib/repositories/statisticsRepository";
import {
  buildTournamentRoundManagerReadModel,
  isValidPairingMutation,
  loadTournamentPageRoundHydration,
  normalizePairings,
  snapshotPairings,
  type TournamentRoundManagerReadModel,
} from "../../lib/services/tournamentService";
import {
  buildImportedPlayers,
  createInvalidatedRosterDependentState,
  generatePairings,
  hasDuplicateRosterIdentity,
  isDuplicatePlayerFormIdentity,
  generateScorecardRowsFromPairings,
  parseImportedPlayerCsv,
  playerImportTemplateCsv,
  relocatePairingPlayer,
  updateScorecardRows,
  upsertPlayerFromForm,
  upsertTeamFromForm,
  validatePlayerForm,
  validatePairingIntegrity,
  validateScorecardIntegrity,
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
import LiveScoringLeaderboard, { type ReviewResolutionItem, type ScorecardRow } from "./components/LiveScoringLeaderboard";
import TournamentPrintExport, {
  type ClippdExportState,
  type ScoreboardImportState,
} from "./components/TournamentPrintExport";
import TournamentStatisticsDashboard from "./components/TournamentStatisticsDashboard";
import OfficialResultsDashboard from "./components/OfficialResultsDashboard";

const baseTabs = ["Overview", "Teams", "Players", "Pairings", "Live Scoring", "Statistics", "Clippd Export"];
const officialResultsTab = "Official Results";

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
  const [roundManager, setRoundManager] = useState<TournamentRoundManagerReadModel>(() =>
    buildTournamentRoundManagerReadModel(null, 1)
  );
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
  const [isCoachAuthenticated, setIsCoachAuthenticated] = useState(false);
  const [tournamentMeta, setTournamentMeta] = useState<TournamentMeta>(() => createFallbackTournamentMeta(""));
  const [sharedTournamentId, setSharedTournamentId] = useState("");
  const [tournamentReadiness, setTournamentReadiness] = useState<TournamentReadiness | null>(null);
  const [isReadinessRefreshing, setIsReadinessRefreshing] = useState(false);
  const [finalizationRecord, setFinalizationRecord] = useState<TournamentFinalizationRecord | null>(null);
  const [sharedScoreEntries, setSharedScoreEntries] = useState<ScoreEntryRow[]>([]);
  const [scoreHoleEntries, setScoreHoleEntries] = useState<ScoreHoleEntryRow[]>([]);
  const [reviewResolutionMessage, setReviewResolutionMessage] = useState("");
  const [reviewOverrideValues, setReviewOverrideValues] = useState<Record<string, string>>({});
  const [reviewOverrideReasons, setReviewOverrideReasons] = useState<Record<string, string>>({});
  const [dynamicReviewFoundation, setDynamicReviewFoundation] =
    useState<DynamicStatisticReviewFoundation | null>(null);
  const [dynamicReviewMessage, setDynamicReviewMessage] = useState("");
  const [dynamicReviewOverrideValues, setDynamicReviewOverrideValues] =
    useState<Record<string, string>>({});
  const [autoRepairState, setAutoRepairState] = useState<AutoRepairState>({
    sourceRound: "Round 1",
    targetRound: "Round 2",
    pairingOrder: "Worst to Best",
    teeTimeInterval: "8 minutes",
  });
  const normalizedRoundSetup = normalizeTournamentRoundSetup(roundSetup, defaultRoundSetupState, scorecardRows);
  useEffect(() => {
    if (
      !scorecardsGenerated ||
      scorecardRows.length === 0 ||
      String(normalizedRoundSetup.countingScores) === roundSetup.countingScores
    ) {
      return;
    }

    setRoundSetup((current) => ({
      ...current,
      countingScores: String(normalizedRoundSetup.countingScores),
    }));
  }, [normalizedRoundSetup.countingScores, roundSetup.countingScores, scorecardRows.length, scorecardsGenerated]);
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
  const tournamentSettings =
    tournament.settings && typeof tournament.settings === "object"
      ? (tournament.settings as { finalization?: { isFinalized?: unknown }; status?: unknown })
      : null;
  const normalizedTournamentStatus = String(tournament.status || tournamentSettings?.status || "").toLowerCase();
  const isTournamentFinalized =
    Boolean(finalizationRecord) ||
    Boolean(tournamentSettings?.finalization?.isFinalized) ||
    normalizedTournamentStatus === "finalized" ||
    normalizedTournamentStatus === "complete";
  const visibleTabs = useMemo(
    () => (isTournamentFinalized ? [...baseTabs, officialResultsTab] : baseTabs),
    [isTournamentFinalized]
  );
  const playerIdsByName = useMemo(() => {
    const ids = new Map<string, string>();
    pairings.forEach((pairing) => {
      pairing.players.forEach((player) => {
        if (player.playerName && player.playerId) {
          ids.set(player.playerName, String(player.playerId));
        }
      });
    });
    return ids;
  }, [pairings]);
  const officialHoleKeys = useMemo(
    () =>
      new Set(
        scoreHoleEntries
          .filter((entry) => entry.is_official || String(entry.review_status).toLowerCase().startsWith("official"))
          .map((entry) => `${entry.player_id}:${entry.hole_number}`)
      ),
    [scoreHoleEntries]
  );
  const leaderboardScorecardRows = useMemo(
    () =>
      projectOfficialLeaderboardScorecards({
        scorecardRows,
        playerIdsByName,
        officialEntries: scoreHoleEntries,
        holeCount: normalizedRoundSetup.numberOfHoles,
      }),
    [normalizedRoundSetup.numberOfHoles, playerIdsByName, scoreHoleEntries, scorecardRows]
  );
  const reviewResolutionItems = useMemo<ReviewResolutionItem[]>(() => {
    const entriesByPlayerId = new Map<string, ScoreEntryRow[]>();
    const holeEntriesByKey = new Map<string, ScoreHoleEntryRow[]>();

    sharedScoreEntries.forEach((entry) => {
      const playerId = String(entry.player_id);
      entriesByPlayerId.set(playerId, [...(entriesByPlayerId.get(playerId) ?? []), entry]);
    });
    scoreHoleEntries.forEach((entry) => {
      const key = `${entry.player_id}:${entry.hole_number}`;
      holeEntriesByKey.set(key, [...(holeEntriesByKey.get(key) ?? []), entry]);
    });

    return scorecardRows.flatMap((row) => {
      const playerId = playerIdsByName.get(row.playerName) ?? `player-${row.id}`;
      const playerEntries = entriesByPlayerId.get(playerId) ?? [];
      const selfEntry = playerEntries.find((entry) => String(entry.entered_by_player_id) === String(entry.player_id));
      const markerEntry = playerEntries.find((entry) => String(entry.entered_by_player_id) !== String(entry.player_id));
      if (!selfEntry || !markerEntry) {
        return [];
      }

      return Array.from({ length: normalizedRoundSetup.numberOfHoles }, (_, index) => {
        const holeNumber = index + 1;
        const playerScore = Number(selfEntry.hole_scores[index]) || 0;
        const markerScore = Number(markerEntry.hole_scores[index]) || 0;
        if (
          playerScore <= 0 ||
          markerScore <= 0 ||
          playerScore === markerScore ||
          officialHoleKeys.has(`${playerId}:${holeNumber}`)
        ) {
          return null;
        }

        const holeEntries = holeEntriesByKey.get(`${playerId}:${holeNumber}`) ?? [];
        return {
          id: `${playerId}-${holeNumber}`,
          playerId,
          playerName: row.playerName,
          holeNumber,
          playerScore,
          markerScore,
          playerEntry: holeEntries.find((entry) => String(entry.entered_by_player_id) === String(entry.player_id)) ?? null,
          markerEntry: holeEntries.find((entry) => String(entry.entered_by_player_id) !== String(entry.player_id)) ?? null,
        };
      }).filter((item): item is ReviewResolutionItem => Boolean(item));
    });
  }, [normalizedRoundSetup.numberOfHoles, officialHoleKeys, playerIdsByName, scoreHoleEntries, scorecardRows, sharedScoreEntries]);
  const dynamicStatisticReviewItems = useMemo(
    () =>
      dynamicReviewFoundation
        ? buildDynamicStatisticReviewItems({
            foundation: dynamicReviewFoundation,
            players: scorecardRows.flatMap((row) => {
              const playerId = playerIdsByName.get(row.playerName);
              return playerId ? [{ playerId, playerName: row.playerName }] : [];
            }),
            roundNumber: normalizedRoundSetup.roundNumber,
            holePars: certifiedMobileHolePars.slice(0, normalizedRoundSetup.numberOfHoles),
          })
        : [],
    [
      dynamicReviewFoundation,
      normalizedRoundSetup.numberOfHoles,
      normalizedRoundSetup.roundNumber,
      playerIdsByName,
      scorecardRows,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab && [...baseTabs, officialResultsTab].includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, []);

  useEffect(() => {
    if (!isTournamentFinalized && activeTab === officialResultsTab) {
      setActiveTab("Overview");
    }
  }, [activeTab, isTournamentFinalized]);

  const refreshReviewResolutionData = useCallback(async () => {
    if (!sharedTournamentId) {
      setSharedScoreEntries([]);
      setScoreHoleEntries([]);
      setDynamicReviewFoundation(null);
      return;
    }

    const roundNumber = Number(normalizedRoundSetup.roundNumber) || 1;
    const [scores, holes, dynamicFoundation] = await Promise.all([
      loadComparisonScores({ tournamentId: sharedTournamentId, roundNumber }).catch((error) => {
        console.warn("[ScoreService] Unable to load review score entries.", error);
        return [];
      }),
      loadTournamentHoleStatistics({ tournamentId: sharedTournamentId, roundNumber }).catch((error) => {
        console.warn("[StatisticsService] Unable to load review hole entries.", error);
        return [];
      }),
      loadDynamicStatisticReviewFoundation(sharedTournamentId).catch((error) => {
        console.warn("[DynamicStatistics] Unable to load Review statistics.", error);
        return null;
      }),
    ]);

    setSharedScoreEntries(scores);
    setScoreHoleEntries(holes);
    setDynamicReviewFoundation(dynamicFoundation);
  }, [normalizedRoundSetup.roundNumber, sharedTournamentId]);

  useEffect(() => {
    if (!isClientMounted || activeTab !== "Live Scoring") {
      return;
    }

    void refreshReviewResolutionData();
  }, [activeTab, isClientMounted, refreshReviewResolutionData]);

  useEffect(() => {
    if (!isClientMounted || !tournamentId) {
      return;
    }

    const localFinalizationRecord = getTournamentFinalizationRecord(loadTournamentStorageEnvelope(tournamentId));
    if (localFinalizationRecord) setFinalizationRecord(localFinalizationRecord);
  }, [
    isClientMounted,
    pairings.length,
    players.length,
    scorecardsGenerated,
    teams.length,
    tournamentId,
    tournamentMeta.settings,
  ]);

  useClientMounted(setIsClientMounted);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setIsCoachAuthenticated(Boolean(data.session && !data.session.user.is_anonymous));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsCoachAuthenticated(Boolean(session && !session.user.is_anonymous));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useTournamentMetadata({
    isClientMounted,
    tournamentId,
    createFallbackTournamentMeta,
    setTournamentMeta,
    setSharedTournamentId,
  });
  const { hasLoadedFromStorageRef, hydrationPendingRef, authenticatedHydrationRef } = useTournamentPageLoading({
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
  const { flushPendingSaves } = useTournamentPagePersistence({
    tournamentId,
    storageKey,
    sharedTournamentId,
    tournament,
    state: latestState,
    setSharedTournamentId,
    hasLoadedFromStorageRef,
    hydrationPendingRef,
    authenticatedHydrationRef,
    isCoachAuthenticated,
    isRemoteSyncBlocked: isTournamentFinalized,
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
    hydrationPendingRef,
    flushPendingSaves,
  });

  useEffect(() => {
    if (!isClientMounted || !tournamentId) return;

    let isCancelled = false;
    void loadTournamentFinalizationStatus({ tournamentId, sharedTournamentId })
      .then((status) => {
        if (!isCancelled) setFinalizationRecord(status.finalizationRecord);
      })
      .catch((error) => {
        console.warn("[TournamentFinalization] Unable to load finalization authority.", error);
      });

    return () => {
      isCancelled = true;
    };
  }, [isClientMounted, sharedTournamentId, tournamentId]);
  useSharedScoreSynchronization({
    isClientMounted,
    tournamentId,
    sharedTournamentId,
    scorecardsGenerated,
    scorecardRowsLength: scorecardRows.length,
    roundNumber: roundSetup.roundNumber,
    playerIdsByName,
    setScorecardRows,
  });

  useEffect(() => {
    if (!isClientMounted || !tournamentId) {
      return;
    }

    setRoundManager(
      buildTournamentRoundManagerReadModel(
        loadTournamentStorageEnvelope(tournamentId),
        normalizedRoundSetup.roundNumber
      )
    );
  }, [
    isClientMounted,
    normalizedRoundSetup.roundNumber,
    pairings.length,
    scorecardRows.length,
    scorecardsGenerated,
    tournamentId,
  ]);

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
  const qrSharedTournamentId =
    sharedTournamentId ||
    tournamentReadiness?.sharedTournamentId ||
    (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tournamentId)
      ? tournamentId
      : "");

  const invalidateRosterDependentState = useCallback(() => {
    const hadGeneratedState = pairings.length > 0 || scorecardRows.length > 0 || scorecardsGenerated;
    const invalidatedState = createInvalidatedRosterDependentState();
    setPairings(invalidatedState.pairings);
    setScorecardRows(invalidatedState.scorecardRows);
    setScorecardsGenerated(invalidatedState.scorecardsGenerated);
    previousValidPairingsRef.current = null;
    setPairingsMessage(hadGeneratedState ? "Roster changed. Regenerate pairings and scorecards." : "");
  }, [pairings.length, scorecardRows.length, scorecardsGenerated]);

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
    if (isTournamentFinalized) {
      setPlayerImportError("This tournament is finalized. Roster edits are locked.");
      return;
    }

    if (playerImportRows.length === 0) {
      return;
    }

    const importedPlayers = buildImportedPlayers(playerImportRows, Date.now());

    if (hasDuplicateRosterIdentity([...importedPlayers, ...players])) {
      setPlayerImportError("Each player name and team combination must be unique.");
      return;
    }

    setPlayers((current) => [...importedPlayers, ...current]);
    invalidateRosterDependentState();
    closePlayerImportModal();
  };

  const openAddTeamModal = () => {
    if (isTournamentFinalized) {
      return;
    }

    resetTeamForm();
    setIsTeamModalOpen(true);
  };

  const openEditTeamModal = (team: Team) => {
    if (isTournamentFinalized) {
      return;
    }

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
    if (isTournamentFinalized) {
      return;
    }

    const nextErrors = validateTeamForm(teamFormState);
    setTeamErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const existingTeam = editingTeamId ? teams.find((team) => team.id === editingTeamId) : null;
    const normalizedSchoolName = teamFormState.schoolName.trim().replace(/\s+/g, " ").toLowerCase();
    if (teams.some((team) => team.id !== editingTeamId && team.schoolName.trim().replace(/\s+/g, " ").toLowerCase() === normalizedSchoolName)) {
      setTeamErrors((current) => ({ ...current, schoolName: "A team with this name already exists." }));
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
    if (existingTeam && existingTeam.schoolName !== teamFormState.schoolName.trim()) {
      setPlayers((current) => current.map((player) =>
        player.teamId === String(existingTeam.id)
          ? { ...player, teamName: teamFormState.schoolName.trim() }
          : player
      ));
    }
    invalidateRosterDependentState();

    closeTeamModal();
  };

  const resetPlayerForm = () => {
    setPlayerFormState(defaultPlayerFormState);
    setPlayerErrors({});
    setEditingPlayerId(null);
  };

  const openAddPlayerModal = () => {
    if (isTournamentFinalized) {
      return;
    }

    const initialTeamId = teams.length > 0 ? String(teams[0].id) : "";
    setPlayerFormState({ ...defaultPlayerFormState, teamId: initialTeamId });
    setPlayerErrors({});
    setEditingPlayerId(null);
    setIsPlayerModalOpen(true);
  };

  const openEditPlayerModal = (player: Player) => {
    if (isTournamentFinalized) {
      return;
    }

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
    if (isTournamentFinalized) {
      return;
    }

    const nextErrors = validatePlayerForm(playerFormState);
    setPlayerErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (isDuplicatePlayerFormIdentity({ players, teams, playerFormState, editingPlayerId })) {
      setPlayerErrors((current) => ({
        ...current,
        firstName: "A player with this name and team already exists.",
      }));
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
    invalidateRosterDependentState();

    closePlayerModal();
  };

  const handleRoundSetupChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isTournamentFinalized) {
      return;
    }

    const { name, value } = event.target;
    setRoundSetup((current) => ({ ...current, [name]: value }));
  };

  const roundHydrationRequestRef = useRef(0);

  const applyRoundHydration = useCallback(
    (roundNumber: number) => {
      const roundHydration = loadTournamentPageRoundHydration(tournamentId, roundNumber);
      if (!roundHydration) {
        return;
      }

      hydrationPendingRef.current = true;
      setTeams(roundHydration.hydration.teams);
      setPlayers(roundHydration.hydration.players);
      setPairings(roundHydration.hydration.pairings);
      setScorecardsGenerated(roundHydration.hydration.scorecardsGenerated);
      setScorecardRows(roundHydration.hydration.scorecardRows);
      setRoundSetup(roundHydration.hydration.roundSetup);
      setClippdExportState(roundHydration.hydration.clippdExportState);
      setScoreboardImportState(roundHydration.hydration.scoreboardImportState);
      setAutoRepairState(roundHydration.hydration.autoRepairState);
      previousValidPairingsRef.current = snapshotPairings(roundHydration.hydration.pairings);
      setRoundManager(roundHydration.roundManager);
      setPairingsMessage("");
      setReviewResolutionMessage("");
    },
    [hydrationPendingRef, tournamentId]
  );

  const handleRoundSelectChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextRoundNumber = Number(event.target.value) || 1;
    if (nextRoundNumber === normalizedRoundSetup.roundNumber) {
      return;
    }

    const requestId = ++roundHydrationRequestRef.current;
    await flushPendingSaves();
    if (requestId !== roundHydrationRequestRef.current) return;
    applyRoundHydration(nextRoundNumber);
  };

  const handleAddRound = async () => {
    if (isTournamentFinalized) {
      return;
    }

    const nextRoundNumber = roundManager.roundOptions.length + 1;
    const requestId = ++roundHydrationRequestRef.current;
    await flushPendingSaves();
    if (requestId !== roundHydrationRequestRef.current) return;
    setTournamentMeta((current) => ({
      ...current,
      rounds: String(Math.max(Number(current.rounds) || 1, nextRoundNumber)),
    }));
    hydrationPendingRef.current = true;
    setPairings([]);
    setScorecardsGenerated(false);
    setScorecardRows([]);
    setRoundSetup({
      ...defaultRoundSetupState,
      roundNumber: String(nextRoundNumber),
      roundName: `Round ${nextRoundNumber}`,
    });
    setRoundManager((current) => ({
      activeRoundNumber: nextRoundNumber,
      roundOptions: [
        ...current.roundOptions.map((round) => ({ ...round, isActive: false })),
        {
          roundNumber: nextRoundNumber,
          roundId: `round-${nextRoundNumber}`,
          name: `Round ${nextRoundNumber}`,
          status: "upcoming",
          pairingsCount: 0,
          scorecardsCount: 0,
          scorecardsGenerated: false,
          isActive: true,
        },
      ],
    }));
  };

  const handleTournamentNavigation = useCallback(async (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    await flushPendingSaves();
    window.location.assign(href);
  }, [flushPendingSaves]);

  const handleScoreInputChange = (rowId: number, holeIndex: number, value: string) => {
    if (isTournamentFinalized) {
      return;
    }

    setScorecardRows((current) => updateScorecardRows(current, rowId, holeIndex, value));
  };

  const handleResolveReviewItem = async (item: ReviewResolutionItem, choice: OfficialScoreResolutionChoice) => {
    if (isTournamentFinalized) {
      setReviewResolutionMessage("This tournament is finalized. Review resolution is read-only.");
      return;
    }

    if (!sharedTournamentId) {
      setReviewResolutionMessage("Shared tournament data is required before review items can be resolved.");
      return;
    }

    const overrideValue = reviewOverrideValues[item.id] ?? "";
    const overrideReason = reviewOverrideReasons[item.id] ?? "";
    const selectedScore =
      choice === "marker"
        ? item.markerScore
        : choice === "player"
          ? item.playerScore
          : Number(overrideValue);

    if (!Number.isInteger(selectedScore) || selectedScore < 1 || selectedScore > 12) {
      setReviewResolutionMessage("Enter a coach override score from 1 to 12.");
      return;
    }

    if (choice === "coach_override" && !overrideReason.trim()) {
      setReviewResolutionMessage("Override reason is required for a coach override.");
      return;
    }

    const sourceEntry =
      choice === "marker" ? item.markerEntry : choice === "player" ? item.playerEntry : null;

    try {
      const officialRow = await resolveOfficialScore({
        tournamentId: sharedTournamentId,
        roundNumber: Number(normalizedRoundSetup.roundNumber) || 1,
        playerId: item.playerId,
        holeNumber: item.holeNumber,
        selectedScore,
        choice,
        officialBy: "Tournament Director",
        overrideReason,
        sourceEntry,
      });

      setScoreHoleEntries((current) => [
        ...current.filter(
          (entry) =>
            !(
              String(entry.player_id) === item.playerId &&
              Number(entry.hole_number) === item.holeNumber &&
              (entry.is_official || String(entry.review_status).toLowerCase().startsWith("official"))
            )
        ),
        officialRow,
      ]);
      setScorecardRows((current) =>
        current.map((row) =>
          row.playerName === item.playerName
            ? {
                ...row,
                scores: row.scores.map((score, index) => (index === item.holeNumber - 1 ? selectedScore : score)),
              }
            : row
        )
      );
      setReviewOverrideValues((current) => ({ ...current, [item.id]: "" }));
      setReviewOverrideReasons((current) => ({ ...current, [item.id]: "" }));
      setReviewResolutionMessage(`Hole ${item.holeNumber} for ${item.playerName} is now official.`);
      void refreshReviewResolutionData();
    } catch (error) {
      setReviewResolutionMessage(error instanceof Error ? error.message : "Unable to resolve review item.");
    }
  };

  const handleResolveDynamicReviewItem = async (
    item: DynamicStatisticReviewItem,
    choice: "player" | "marker" | "coach_override"
  ) => {
    if (isTournamentFinalized) {
      setDynamicReviewMessage("This tournament is finalized. Dynamic statistic Review is read-only.");
      return;
    }
    if (!sharedTournamentId || !dynamicReviewFoundation?.assignment) {
      setDynamicReviewMessage("An assigned statistic package is required.");
      return;
    }
    const sourceEntry =
      choice === "player"
        ? item.playerEntry
        : choice === "marker"
          ? item.markerEntry
          : item.playerEntry ?? item.markerEntry;
    if (!sourceEntry) {
      setDynamicReviewMessage("The selected original statistic value is unavailable.");
      return;
    }
    try {
      const value =
        choice === "player"
          ? item.playerValue
          : choice === "marker"
            ? item.markerValue
            : parseDynamicStatisticOfficialValue(
                item,
                dynamicReviewOverrideValues[item.id] ?? ""
              );
      if (value === null) throw new Error("The selected statistic value is unavailable.");
      const officialValue = await resolveOfficialDynamicStatistic({
        assignment: dynamicReviewFoundation.assignment,
        tournamentId: sharedTournamentId,
        roundNumber: normalizedRoundSetup.roundNumber,
        item,
        value,
        sourceEntry,
        decision: choice,
      });
      setDynamicReviewFoundation((current) =>
        current ? { ...current, values: [...current.values, officialValue] } : current
      );
      setDynamicReviewOverrideValues((current) => ({ ...current, [item.id]: "" }));
      setDynamicReviewMessage(
        `${item.name} on Hole ${item.holeNumber} for ${item.playerName} is now official.`
      );
    } catch (error) {
      setDynamicReviewMessage(
        error instanceof Error ? error.message : "Unable to resolve the statistic."
      );
    }
  };

  const handleGeneratePairings = () => {
    if (isTournamentFinalized) {
      setPairingsMessage("This tournament is finalized. Pairings are read-only.");
      return;
    }

    if (players.length === 0) {
      setPairings([]);
      setPairingsMessage("Add players before generating pairings.");
      return;
    }

    if (hasDuplicateRosterIdentity(players)) {
      setPairings([]);
      setPairingsMessage("Resolve duplicate player names and teams before generating pairings.");
      return;
    }

    const generatedPairings = generatePairings(players);
    previousValidPairingsRef.current = snapshotPairings(generatedPairings);
    setPairings(generatedPairings);
    setPairingsMessage("");
  };

  const commitPairingMutation = (mutator: (current: PairingGroup[]) => PairingGroup[]) => {
    if (isTournamentFinalized) {
      setPairingsMessage("This tournament is finalized. Pairings are read-only.");
      return;
    }

    setPairings((current) => {
      const baselinePairings = previousValidPairingsRef.current ?? snapshotPairings(current);
      const nextPairings = mutator(snapshotPairings(current));
      const normalizedPairings = normalizePairings(nextPairings);

      if (!isValidPairingMutation(normalizedPairings, baselinePairings)) {
        return snapshotPairings(baselinePairings);
      }

      if (!validatePairingIntegrity(normalizedPairings, players)) {
        setPairingsMessage("Pairings no longer match the current roster. Regenerate pairings.");
        return snapshotPairings(baselinePairings);
      }

      previousValidPairingsRef.current = snapshotPairings(normalizedPairings);
      setPairingsMessage("");
      return normalizedPairings;
    });
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
    if (isTournamentFinalized) {
      return;
    }

    if (pairings.length === 0 || !validatePairingIntegrity(pairings, players)) {
      setPairingsMessage("Generate valid pairings for the current roster before generating scorecards.");
      setScorecardsGenerated(false);
      setScorecardRows([]);
      return;
    }

    const generatedRows = generateScorecardRowsFromPairings(pairings, players, normalizedRoundSetup.numberOfHoles);
    if (!validateScorecardIntegrity(generatedRows, pairings, players)) {
      setPairingsMessage("Scorecards could not be generated from the current pairings.");
      setScorecardsGenerated(false);
      setScorecardRows([]);
      return;
    }

    setScorecardsGenerated(true);
    setScorecardRows(generatedRows);
  };

  const validateQrReadiness = useCallback(async () => {
    if (hasDuplicateRosterIdentity(players)) return "Resolve duplicate roster players before generating QR access.";
    if (!validatePairingIntegrity(pairings, players)) return "Regenerate valid pairings before generating QR access.";
    if (!scorecardsGenerated || !validateScorecardIntegrity(scorecardRows, pairings, players)) {
      return "Generate valid scorecards before generating QR access.";
    }
    if (!qrSharedTournamentId) return "Wait for tournament synchronization, then try QR access again.";

    try {
      const roundNumber = Number(normalizedRoundSetup.roundNumber) || 1;
      const synchronizedRows = await getTournamentPlayers(qrSharedTournamentId, roundNumber);
      const expectedIds = new Set(pairings.flatMap((pairing) => pairing.players.map((player) => player.playerId)));
      const synchronizedIds = new Set(synchronizedRows.map((row) => row.player_id));
      if (
        synchronizedRows.length !== players.length ||
        synchronizedIds.size !== expectedIds.size ||
        [...expectedIds].some((playerId) => !synchronizedIds.has(playerId))
      ) {
        return "Player synchronization is incomplete. Try QR access again.";
      }
    } catch {
      return "Player synchronization failed. Try QR access again.";
    }

    return null;
  }, [normalizedRoundSetup.roundNumber, pairings, players, qrSharedTournamentId, scorecardRows, scorecardsGenerated]);

  const handleAutoRepairInputChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = event.target;
    setAutoRepairState((current) => ({ ...current, [name]: value }));
  };

  const openAutoRepairModal = () => {
    if (isTournamentFinalized) {
      setPairingsMessage("This tournament is finalized. Pairings are read-only.");
      return;
    }

    setIsAutoRepairModalOpen(true);
  };

  const closeAutoRepairModal = () => {
    setIsAutoRepairModalOpen(false);
  };

  const handleAutoRepairSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isTournamentFinalized) {
      closeAutoRepairModal();
      return;
    }
    closeAutoRepairModal();
  };

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8 lg:py-6">
        <Link href="/dashboard" onClick={(event) => void handleTournamentNavigation(event, "/dashboard")} className="flex items-center gap-3">
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
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/dashboard" onClick={(event) => void handleTournamentNavigation(event, "/dashboard")}>
            Dashboard
          </Link>
          <Link className="transition duration-300 hover:text-[#B8892D]" href="/live" onClick={(event) => void handleTournamentNavigation(event, "/live")}>
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
              <div className="flex flex-wrap gap-2">
                {isTournamentFinalized ? (
                  <span className="rounded-full border border-[#77B98E] bg-[#ECF8EF] px-4 py-2 text-sm font-black uppercase tracking-[0.25em] text-[#146233]">
                    Finalized Read-Only
                  </span>
                ) : null}
                <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#F6F1E6]/80">
                  Status: {isTournamentFinalized ? "Finalized" : "Upcoming"}
                </span>
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
            {isTournamentFinalized ? (
              <div className="mb-4 rounded-[20px] border border-[#77B98E] bg-[#ECF8EF] px-5 py-4 text-sm font-semibold text-[#146233]">
                This tournament is finalized and read-only. Viewing, printing, exports, reports, and historical QR scorecards remain available.
              </div>
            ) : null}
            {isClientMounted && !isCoachAuthenticated ? (
              <div className="mb-4 rounded-[20px] border border-[#D8C9AE] bg-[#F6F1E6] px-5 py-4 text-sm font-semibold text-[#725D37]">
                Sign in as a coach to sync this tournament and enable mobile scoring.{" "}
                <Link
                  href={`/coach-auth?next=${encodeURIComponent(`/tournament/${tournamentId}`)}`}
                  className="font-black text-[#B8892D] underline underline-offset-2"
                >
                  Sign in
                </Link>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {visibleTabs.map((tab) => (
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

            <section className="mt-4 rounded-[24px] border border-[#D6E0D8] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="grid gap-3 md:grid-cols-[220px_minmax(220px,1fr)]">
                  <label className="block">
                    <span className="text-[10px] font-black uppercase tracking-[0.28em] text-[#0B3D2E]/65">
                      Active Round
                    </span>
                    <select
                      value={normalizedRoundSetup.roundNumber}
                      onChange={handleRoundSelectChange}
                      className="mt-2 w-full rounded-2xl border border-[#D6E0D8] bg-[#F8FBF8] px-4 py-3 text-sm font-black text-[#0B3D2E] outline-none"
                    >
                      {roundManager.roundOptions.map((round) => (
                        <option key={round.roundId} value={round.roundNumber}>
                          {round.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[10px] font-black uppercase tracking-[0.28em] text-[#0B3D2E]/65">
                      Round Name
                    </span>
                    <input
                      type="text"
                      name="roundName"
                      value={roundSetup.roundName || `Round ${normalizedRoundSetup.roundNumber}`}
                      onChange={handleRoundSetupChange}
                      disabled={isTournamentFinalized}
                      className="mt-2 w-full rounded-2xl border border-[#D6E0D8] bg-[#F8FBF8] px-4 py-3 text-sm font-black text-[#0B3D2E] outline-none disabled:opacity-60"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Groups", roundManager.roundOptions.find((round) => round.isActive)?.pairingsCount ?? pairings.length],
                      ["Cards", roundManager.roundOptions.find((round) => round.isActive)?.scorecardsCount ?? scorecardRows.length],
                      ["Status", scorecardsGenerated ? "Ready" : "Draft"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-[#D6E0D8] bg-[#F8FBF8] px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#51635C]">{label}</p>
                        <p className="mt-1 text-sm font-black text-[#0B3D2E]">{value}</p>
                      </div>
                    ))}
                  </div>
                  {!isTournamentFinalized ? (
                    <button
                      type="button"
                      onClick={handleAddRound}
                      className="rounded-full border border-[#0B3D2E] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-[#0B3D2E] transition duration-300 hover:bg-[#0B3D2E] hover:text-[#F6F1E6]"
                    >
                      Add Round
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

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
                onDeleteTeam={(teamId) => {
                  if (!isTournamentFinalized) {
                    setTeams((current) => current.filter((item) => item.id !== teamId));
                    setPlayers((current) => current.filter((player) => player.teamId !== String(teamId)));
                    invalidateRosterDependentState();
                  }
                }}
                onCloseTeamModal={closeTeamModal}
                onTeamInputChange={handleTeamInputChange}
                onTeamSubmit={handleTeamSubmit}
                onOpenPlayerImportModal={openPlayerImportModal}
                onOpenAddPlayerModal={openAddPlayerModal}
                onOpenEditPlayerModal={openEditPlayerModal}
                onDeletePlayer={(playerId) => {
                  if (!isTournamentFinalized) {
                    setPlayers((current) => current.filter((item) => item.id !== playerId));
                    invalidateRosterDependentState();
                  }
                }}
                onClosePlayerModal={closePlayerModal}
                onPlayerInputChange={handlePlayerInputChange}
                onPlayerSubmit={handlePlayerSubmit}
                onClosePlayerImportModal={closePlayerImportModal}
                onPlayerImportTemplateDownload={handlePlayerImportTemplateDownload}
                onPlayerImportFileChange={handlePlayerImportFileChange}
                onPlayerImportConfirm={handlePlayerImportConfirm}
                isReadOnly={isTournamentFinalized}
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
                isReadOnly={isTournamentFinalized}
              />
            ) : activeTab === "Statistics" ? (
              <TournamentStatisticsDashboard
                tournamentId={sharedTournamentId || tournamentId}
                roundNumber={normalizedRoundSetup.roundNumber}
                roundOptions={roundManager.roundOptions.map((round) => ({
                  roundNumber: round.roundNumber,
                  name: round.name,
                }))}
              />
            ) : activeTab === officialResultsTab && isTournamentFinalized ? (
              <OfficialResultsDashboard tournamentId={sharedTournamentId || tournamentId} />
            ) : activeTab === "Live Scoring" || activeTab === "Clippd Export" ? (
              <TournamentPrintExport
                activeTab={activeTab}
                tournamentId={tournamentId}
                sharedTournamentId={qrSharedTournamentId}
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
                onValidateQrReadiness={validateQrReadiness}
                isReadinessRefreshing={isReadinessRefreshing}
                isCoachAuthenticated={isCoachAuthenticated}
                teams={teams}
              >
                {({ onPrintTournamentScorecards, onOpenQrModal, onOpenPrintScorecardModal }) =>
                  activeTab === "Live Scoring" ? (
                    <LiveScoringLeaderboard
                       normalizedRoundSetup={normalizedRoundSetup}
                       scorecardsGenerated={scorecardsGenerated}
                       scorecardRows={scorecardRows}
                       leaderboardScorecardRows={leaderboardScorecardRows}
                      onPrintTournamentScorecards={onPrintTournamentScorecards}
                      onGenerateScorecards={generateScorecards}
                      onRoundSetupChange={handleRoundSetupChange}
                      onScoreInputChange={handleScoreInputChange}
                       onOpenQrModal={onOpenQrModal}
                       onOpenPrintScorecardModal={onOpenPrintScorecardModal}
                       isReadOnly={isTournamentFinalized}
                       reviewResolutionItems={reviewResolutionItems}
                       reviewResolutionMessage={reviewResolutionMessage}
                       reviewOverrideValues={reviewOverrideValues}
                       reviewOverrideReasons={reviewOverrideReasons}
                       onReviewOverrideValueChange={(itemId, value) =>
                         setReviewOverrideValues((current) => ({ ...current, [itemId]: value }))
                       }
                       onReviewOverrideReasonChange={(itemId, value) =>
                         setReviewOverrideReasons((current) => ({ ...current, [itemId]: value }))
                       }
                        onResolveReviewItem={handleResolveReviewItem}
                        dynamicStatisticReviewItems={dynamicStatisticReviewItems}
                        dynamicStatisticReviewMessage={dynamicReviewMessage}
                        dynamicStatisticOverrideValues={dynamicReviewOverrideValues}
                        onDynamicStatisticOverrideValueChange={(itemId, value) =>
                          setDynamicReviewOverrideValues((current) => ({
                            ...current,
                            [itemId]: value,
                          }))
                        }
                        onResolveDynamicStatistic={handleResolveDynamicReviewItem}
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
