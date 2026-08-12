"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import { flushSync } from "react-dom";
import {
  loadSharedTournamentIdFromStorage,
  loadTournamentStateFromStorage,
  loadTournamentsFromStorage,
  loadTournamentStorageEnvelope,
  mergeTournamentScoreSubmission,
} from "../../lib/tournamentStorage";
import { completeReview, loadComparisonScores, loadPlayerScores, saveHole, saveRound } from "../../lib/services/scoreService";
import {
  buildScoreHoleEntryInput,
  loadTournamentHoleStatistics,
  type HoleStatisticsInput,
  saveHoleStatistics,
  saveRoundHoleStatistics,
} from "../../lib/services/statisticsService";
import {
  buildReviewOwnership,
  loadReviewComparisonModel,
  type ReviewComparisonModel,
} from "../../lib/services/reviewComparisonService";
import { resolveReciprocalScoringAssignments } from "../../lib/services/reciprocalScoringAssignmentService";
import { loadSharedTournamentScorecardState } from "../../lib/services/tournamentService";
import { findInitialScorecardHoleIndex } from "../../lib/services/scorecardResumeService";
import { getTournamentFinalizationRecord } from "../../lib/services/tournamentFinalizationService";
import { resolveShareToken } from "../../lib/services/shareTokenService";
import DesignatedQualifyingScorecard from "./DesignatedQualifyingScorecard";
import { canUseDevelopmentBrowserSupabaseWriteFallback } from "../../lib/supabaseClient";
import type { StatisticValue } from "../../lib/dynamicStatisticsModel";
import {
  areRequiredMobileStatisticsComplete,
  buildMobileStatisticSummaries,
  getMobileStatisticTapOptions,
  loadMobileDynamicStatistics,
  missingRequiredMobileStatistics,
  saveMobileDynamicStatistics,
  statisticAppliesToHole,
  type MobileDynamicStatistics,
  type MobileStatisticItem,
} from "../../lib/services/mobileDynamicStatisticsService";
import { createOperationId } from "../../lib/services/operationIdService";

type Hole = {
  holeNumber: number;
  courseHoleNumber?: number;
  par: number;
  yardage: number;
};

type PlayerScorecard = {
  playerId: string;
  tournamentName: string;
  playerName: string;
  team: string;
  round: string;
  holes: Hole[];
  markerPlayerId?: string;
  markerPlayerName?: string;
  markerTeam?: string;
  playerScoreIds?: string[];
  markerScoreIds?: string[];
  assignedMarkerPlayerId?: string;
  assignedMarkerScoreIds?: string[];
  initialPlayerScores?: number[];
  initialMarkerScores?: number[];
};

type PairingGroup = {
  groupNumber: number;
  teeTime: string;
  startingHole: string;
  players: Array<{
    playerId?: string;
    playerName: string;
    teamName: string;
    markerPlayerId?: string;
  }>;
};

type PersistedTournamentState = {
  pairings: PairingGroup[];
  scorecards: {
    roundSetup: {
      roundNumber: string;
      numberOfHoles: string;
    };
  };
};

type ScoreDiagnostics = {
  localTournamentId: string;
  sharedTournamentId: string;
  localStorageSaveAttempted: string;
  localStorageSaveResult: string;
  supabaseSaveAttempted: string;
  supabaseSaveResult: string;
  supabaseSaveTournamentId: string;
  savePlayerId: string;
  saveMarkerPlayerId: string;
  scoreEntriesLoadedFromLocalStorage: number;
  scoreEntriesLoadedFromSupabase: number;
  scoreHydrationComplete: string;
  lastSaveError: string;
  lastHydrationError: string;
};

type HoleStatCapture = {
  fairwayHit: boolean | null;
  greenInRegulation: boolean | null;
  putts: number | null;
  penaltyStrokes: number | null;
};

type DynamicHoleValues = Record<string, StatisticValue | null>;

const initialScoreDiagnostics: ScoreDiagnostics = {
  localTournamentId: "",
  sharedTournamentId: "",
  localStorageSaveAttempted: "no",
  localStorageSaveResult: "not attempted",
  supabaseSaveAttempted: "no",
  supabaseSaveResult: "not attempted",
  supabaseSaveTournamentId: "",
  savePlayerId: "",
  saveMarkerPlayerId: "",
  scoreEntriesLoadedFromLocalStorage: 0,
  scoreEntriesLoadedFromSupabase: 0,
  scoreHydrationComplete: "no",
  lastSaveError: "",
  lastHydrationError: "",
};

const isDevelopment =
  process.env.NODE_ENV !== "production" ||
  (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname));

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

const defaultHoles: Hole[] = [
  { holeNumber: 1, par: 4, yardage: 382 },
  { holeNumber: 2, par: 5, yardage: 518 },
  { holeNumber: 3, par: 3, yardage: 177 },
  { holeNumber: 4, par: 4, yardage: 401 },
  { holeNumber: 5, par: 4, yardage: 429 },
  { holeNumber: 6, par: 5, yardage: 542 },
  { holeNumber: 7, par: 3, yardage: 189 },
  { holeNumber: 8, par: 4, yardage: 413 },
  { holeNumber: 9, par: 4, yardage: 396 },
  { holeNumber: 10, par: 4, yardage: 404 },
  { holeNumber: 11, par: 5, yardage: 531 },
  { holeNumber: 12, par: 3, yardage: 171 },
  { holeNumber: 13, par: 4, yardage: 412 },
  { holeNumber: 14, par: 4, yardage: 438 },
  { holeNumber: 15, par: 4, yardage: 393 },
  { holeNumber: 16, par: 3, yardage: 205 },
  { holeNumber: 17, par: 5, yardage: 556 },
  { holeNumber: 18, par: 4, yardage: 421 },
];

const buildRoundHoles = (startingHole: number, holeCount: number, configuredHoles: Hole[] = defaultHoles) =>
  Array.from({ length: holeCount }, (_, index) => {
    const courseHoleNumber = ((startingHole - 1 + index) % 18) + 1;
    const configured = configuredHoles.find((hole) => hole.holeNumber === courseHoleNumber) ?? defaultHoles[courseHoleNumber - 1];
    return { ...configured, holeNumber: index + 1, courseHoleNumber };
  });

const getDisplayHoleNumber = (hole: Hole) => hole.courseHoleNumber ?? hole.holeNumber;

const sampleScorecards: Record<string, PlayerScorecard> = {
  "101": {
    playerId: "101",
    tournamentName: "Buckeye College Invitational",
    playerName: "Miles Carter",
    team: "Bluffton University",
    round: "1",
    holes: defaultHoles,
  },
  "102": {
    playerId: "102",
    tournamentName: "Buckeye College Invitational",
    playerName: "Ethan Brooks",
    team: "Ohio Northern University",
    round: "1",
    holes: defaultHoles,
  },
};

const fallbackScorecard: PlayerScorecard = {
  playerId: "demo",
  tournamentName: "Buckeye College Invitational",
  playerName: "Demo Player",
  team: "Clubhouse HQ",
  round: "1",
  holes: defaultHoles,
};

const SHARED_SCORECARD_LOOKUP_TIMEOUT_MS = 8000;
const SAVE_FINALIZATION_CHECK_TIMEOUT_MS = 4000;
const finalizedReadOnlyMessage = "This tournament has been finalized and is read-only. Score submissions are locked for historical viewing.";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const formatToPar = (value: number) => {
  if (value === 0) {
    return "E";
  }
  return value > 0 ? `+${value}` : `${value}`;
};

const getEntryStatus = (holeScores: number[]) => {
  const hasAnyScore = holeScores.some((score) => score > 0);
  const isComplete = holeScores.length > 0 && holeScores.every((score) => score > 0);

  return isComplete ? "complete" : hasAnyScore ? "live" : "pending";
};

const normalizeHoleScores = (holeScores: number[] | undefined, holeCount: number) =>
  Array.from({ length: holeCount }, (_, index) => {
    const score = Number(holeScores?.[index] ?? 0);
    return Number.isFinite(score) ? score : 0;
  });

const emptyHoleStats = (): HoleStatCapture => ({
  fairwayHit: null,
  greenInRegulation: null,
  putts: null,
  penaltyStrokes: null,
});

const createEmptyHoleStats = (holeCount: number) =>
  Array.from({ length: holeCount }, emptyHoleStats);

const hasAnyHoleScore = (holeScores: number[] | null | undefined) =>
  Array.isArray(holeScores) && holeScores.some((score) => Number(score) > 0);

const getCompletedHoleCount = (holeScores: number[] | null | undefined) =>
  Array.isArray(holeScores) ? holeScores.filter((score) => Number(score) > 0).length : 0;

const chooseMostCompleteScores = (
  currentScores: number[] | null,
  candidateScores: number[] | null
) => {
  if (!hasAnyHoleScore(candidateScores)) {
    return currentScores;
  }

  return getCompletedHoleCount(candidateScores) >= getCompletedHoleCount(currentScores)
    ? candidateScores
    : currentScores;
};

const getScoredHoleNumbers = (holes: Hole[], ...scoreSets: number[][]) =>
  holes
    .filter((_, index) => scoreSets.some((holeScores) => (holeScores[index] ?? 0) > 0))
    .map((hole) => hole.holeNumber);

function ReciprocalPlayerScorecardPage() {
  const params = useParams<{ playerId: string }>();
  const searchParams = useSearchParams();
  const routePlayerId = Array.isArray(params?.playerId) ? params.playerId[0] : params?.playerId;
  const requestedTournamentId = searchParams.get("tournamentId") ?? "";
  const requestedPairingId = searchParams.get("pairing") ?? "";
  const requestedShareToken = searchParams.get("shareToken") ?? "";
  const requestedRound = searchParams.get("round") ?? "";
  const [resolvedShareTournamentId, setResolvedShareTournamentId] = useState("");
  const [qrResolvedScorecard, setQrResolvedScorecard] = useState<PlayerScorecard | { error: string } | null>(null);
  const [hasResolvedQrScorecard, setHasResolvedQrScorecard] = useState(false);
  const [isTournamentFinalized, setIsTournamentFinalized] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setHasResolvedQrScorecard(false);
    setIsTournamentFinalized(false);

    const finishResolution = (scorecard: PlayerScorecard | { error: string } | null) => {
      if (isCancelled) {
        return;
      }

      setQrResolvedScorecard(scorecard);
      setHasResolvedQrScorecard(true);
    };

    const resolveScorecard = async () => {
      try {
        // Wrap resolveShareToken with the same timeout used for state-snapshot
        // lookups — without it, a slow or hung server-side Supabase query keeps
        // the loading screen stuck indefinitely.
        const tokenResolution =
          requestedShareToken
            ? await withTimeout(
                resolveShareToken(requestedShareToken).catch(() => null),
                SHARED_SCORECARD_LOOKUP_TIMEOUT_MS
              )
            : null;
        if (requestedShareToken && (!tokenResolution || tokenResolution.purpose !== "mobile_scoring")) {
          finishResolution({ error: "This secure scoring link is invalid or expired. Please request a new QR code." });
          return;
        }
        if (
          requestedShareToken &&
          requestedTournamentId &&
          tokenResolution?.tournamentId !== requestedTournamentId
        ) {
          finishResolution({ error: "This secure scoring link does not match the requested tournament." });
          return;
        }
        const effectiveTournamentId = requestedTournamentId || tokenResolution?.tournamentId || "";

        if (tokenResolution?.tournamentId && !isCancelled) {
          setResolvedShareTournamentId(tokenResolution.tournamentId);
        }

        if (!effectiveTournamentId && !requestedPairingId) {
          finishResolution(null);
          return;
        }

        if (!effectiveTournamentId || !requestedPairingId) {
          finishResolution({ error: "Missing tournament or pairing information in this QR code." });
          return;
        }

        const requestedRoundNumber = Number(requestedRound);
        if (requestedShareToken && (!Number.isInteger(requestedRoundNumber) || requestedRoundNumber < 1)) {
          finishResolution({ error: "This QR code is missing its tournament round. Please request a new QR code." });
          return;
        }

        const localTournament = loadTournamentsFromStorage().find((item) => item.id === effectiveTournamentId);
        const localTournamentState = loadTournamentStateFromStorage<PersistedTournamentState>(effectiveTournamentId);
        const storedEnvelope = loadTournamentStorageEnvelope(effectiveTournamentId);
        const isLegacySharedLinkWithoutToken = Boolean(requestedTournamentId && !requestedShareToken);
        const hasLocalLegacyTournamentState = Boolean(localTournament && localTournamentState && storedEnvelope);
        if (
          isLegacySharedLinkWithoutToken &&
          !hasLocalLegacyTournamentState &&
          !canUseDevelopmentBrowserSupabaseWriteFallback()
        ) {
          finishResolution({ error: "This mobile scoring link has expired. Please request a new secure scoring link." });
          return;
        }

        const sharedState =
          hasLocalLegacyTournamentState
            ? null
            : await withTimeout(
                loadSharedTournamentScorecardState(
                  effectiveTournamentId,
                  requestedRoundNumber || 1,
                  18,
                  requestedShareToken
                ).catch((error) => {
                  console.warn("[TournamentService] Unable to load shared tournament scorecard state.", error);
                  return null;
                }),
                SHARED_SCORECARD_LOOKUP_TIMEOUT_MS
              );
        const tournament = localTournament ?? sharedState?.tournament;
        setIsTournamentFinalized(Boolean(getTournamentFinalizationRecord(storedEnvelope)) || Boolean(sharedState?.isFinalized));
        if (!tournament) {
          finishResolution({ error: "We could not find that tournament. Please request a new mobile scoring link." });
          return;
        }

        const tournamentState =
          localTournamentState ??
          (sharedState
            ? {
                pairings: sharedState.pairings,
                scorecards: { roundSetup: sharedState.roundSetup },
            }
            : null);
        if (!tournamentState || !Array.isArray(tournamentState.pairings) || tournamentState.pairings.length === 0) {
          finishResolution({ error: "This tournament does not have any saved pairings yet." });
          return;
        }

        const pairingNumber = Number(requestedPairingId);
        const pairing = tournamentState.pairings.find((item) => item.groupNumber === pairingNumber);
        if (!pairing || pairing.players.length === 0) {
          finishResolution({ error: "We could not find that pairing. Please request a new mobile scoring link." });
          return;
        }

        const scorecardRows = storedEnvelope?.uiState?.scorecards?.scorecardRows || sharedState?.scorecardRows || [];
        const tournamentPlayers =
          storedEnvelope?.tournament.players ??
          sharedState?.scorecardRows.map((row) => ({
            id: String(row.id),
            firstName: row.playerName.split(" ")[0] || row.playerName,
            lastName: row.playerName.split(" ").slice(1).join(" "),
            teamId: row.team,
            isIndividual: false,
            statistics: { teamName: row.team },
          })) ??
          [];
        const tournamentTeams =
          storedEnvelope?.tournament.teams ??
          Array.from(new Set((sharedState?.scorecardRows ?? []).map((row) => row.team))).map((team) => ({
            id: team,
            name: team,
            players: [],
          }));
        if (tournamentPlayers.length === 0) {
          finishResolution({ error: "This tournament has no player data. Please request a new mobile scoring link." });
          return;
        }

        const teamNameById = new Map(tournamentTeams.map((team) => [team.id, team.name]));
        const getTournamentPlayerName = (player: (typeof tournamentPlayers)[number]) =>
          `${player.firstName} ${player.lastName}`.trim();
        const getTournamentPlayerTeam = (player: (typeof tournamentPlayers)[number]) =>
          (player.teamId ? teamNameById.get(player.teamId) : undefined) ||
          (typeof player.statistics.teamName === "string" ? player.statistics.teamName : undefined) ||
          "Unassigned";
        const isSamePairingPlayer = (
          left: { playerName: string; teamName: string },
          right: { playerName: string; teamName: string }
        ) => left.playerName === right.playerName && left.teamName === right.teamName;

        const getIdCandidates = (player: { playerId?: string; playerName: string; teamName: string }) => {
          const candidates = new Set<string>();
          if (player.playerId) {
            candidates.add(String(player.playerId));
          }

          const matchedTournamentPlayers = tournamentPlayers.filter(
            (item) => getTournamentPlayerName(item) === player.playerName && getTournamentPlayerTeam(item) === player.teamName
          );
          if (matchedTournamentPlayers.length === 1) {
            candidates.add(String(matchedTournamentPlayers[0].id));
          }

          const matchedScorecards = scorecardRows.filter(
            (row) => row.playerName === player.playerName && row.team === player.teamName
          );
          if (matchedScorecards.length === 1) {
            candidates.add(String(matchedScorecards[0].id));
          }

          return Array.from(candidates);
        };

        const routeMatchedTournamentPlayer = tournamentPlayers.find(
          (player) => String(player.id) === String(routePlayerId)
        );
        const routeMatchedScorecard = scorecardRows.find((row) => String(row.id) === String(routePlayerId));
        const routeMatchedPairingPlayers = pairing.players.filter((player) => {
          if (player.playerId && String(player.playerId) === String(routePlayerId)) {
            return true;
          }

          if (
            routeMatchedTournamentPlayer &&
            isSamePairingPlayer(player, {
              playerName: getTournamentPlayerName(routeMatchedTournamentPlayer),
              teamName: getTournamentPlayerTeam(routeMatchedTournamentPlayer),
            })
          ) {
            return true;
          }

          return Boolean(
            routeMatchedScorecard &&
              isSamePairingPlayer(player, {
                playerName: routeMatchedScorecard.playerName,
                teamName: routeMatchedScorecard.team,
              })
          );
        });

        const selectedPlayer =
          routePlayerId && routePlayerId.startsWith("group-")
            ? pairing.players.length === 1 ? pairing.players[0] : undefined
            : routeMatchedPairingPlayers.length === 1 ? routeMatchedPairingPlayers[0] : undefined;

        const reciprocalAssignments = selectedPlayer
          ? resolveReciprocalScoringAssignments(pairing.players, selectedPlayer)
          : null;
        const markerPlayer = reciprocalAssignments?.markedPlayer;
        const assignedMarkerPlayer = reciprocalAssignments?.assignedMarkerPlayer;
        const selectedPlayerIds = selectedPlayer ? getIdCandidates(selectedPlayer) : [];
        const markerPlayerIds = markerPlayer ? getIdCandidates(markerPlayer) : [];
        const assignedMarkerPlayerIds = assignedMarkerPlayer ? getIdCandidates(assignedMarkerPlayer) : [];
        const selectedPlayerId =
          selectedPlayer?.playerId ||
          (routePlayerId && !routePlayerId.startsWith("group-") ? routePlayerId : "") ||
          selectedPlayerIds[0] ||
          "";
        const markerPlayerId =
          markerPlayer?.playerId ||
          markerPlayerIds[0];
        const assignedMarkerPlayerId =
          assignedMarkerPlayer?.playerId ||
          assignedMarkerPlayerIds[0];

        if (!selectedPlayer) {
          finishResolution({ error: "Invalid scoring link. Please request a new mobile scoring link." });
          return;
        }

        if (!markerPlayer || !markerPlayerId || String(markerPlayerId) === String(selectedPlayerId)) {
          finishResolution({ error: "Marker assignment is incomplete. Ask the coach to regenerate QR access." });
          return;
        }

        if (
          !assignedMarkerPlayer ||
          !assignedMarkerPlayerId ||
          String(assignedMarkerPlayerId) === String(selectedPlayerId)
        ) {
          finishResolution({ error: "Marker assignment is incomplete. Ask the coach to regenerate QR access." });
          return;
        }

        const holeCount = Math.max(1, Math.min(18, Number(tournamentState.scorecards?.roundSetup?.numberOfHoles) || 18));
        const tournamentSettings = typeof tournament.settings === "object" && tournament.settings ? tournament.settings as Record<string, unknown> : {};
        const localCourseSetup = typeof tournamentSettings.courseSetup === "object" && tournamentSettings.courseSetup
          ? tournamentSettings.courseSetup as { holes?: Array<{ holeNumber: number; par: number; yardage: number }> }
          : null;
        const selectedSnapshotScorecard = scorecardRows.find(
          (row) => row.playerName === selectedPlayer.playerName && row.team === selectedPlayer.teamName
        );
        const markerSnapshotScorecard = scorecardRows.find(
          (row) => row.playerName === markerPlayer.playerName && row.team === markerPlayer.teamName
        );

        finishResolution({
          playerId: String(selectedPlayerId),
          tournamentName: tournament.name,
          playerName: selectedPlayer.playerName,
          team: selectedPlayer.teamName,
          round: tournamentState.scorecards?.roundSetup?.roundNumber || "1",
          holes: buildRoundHoles(
            Math.max(1, Math.min(18, Number(pairing.startingHole) || 1)),
            holeCount,
            (sharedState?.courseHoles ?? localCourseSetup?.holes ?? []).map((hole) => ({ holeNumber: hole.holeNumber, par: hole.par, yardage: hole.yardage }))
          ),
          markerPlayerId,
          markerPlayerName: markerPlayer?.playerName,
          markerTeam: markerPlayer?.teamName,
          playerScoreIds: selectedPlayerIds,
          markerScoreIds: markerPlayerIds,
          assignedMarkerPlayerId,
          assignedMarkerScoreIds: assignedMarkerPlayerIds,
          initialPlayerScores: selectedSnapshotScorecard?.scores,
          initialMarkerScores: markerSnapshotScorecard?.scores,
        });
      } catch {
        finishResolution({ error: "Invalid scoring link. Please request a new mobile scoring link." });
      }
    };

    void resolveScorecard();

    return () => {
      isCancelled = true;
    };
  }, [requestedTournamentId, requestedPairingId, requestedRound, requestedShareToken, routePlayerId]);

  // Extract resolved player IDs for reliable hydration
  const resolvedPlayerIds = useMemo(() => {
    if (!qrResolvedScorecard || "error" in qrResolvedScorecard) {
      return null;
    }
    return {
      selectedPlayerId: qrResolvedScorecard.playerId,
      markedPlayerId: qrResolvedScorecard.markerPlayerId,
      assignedMarkerPlayerId: qrResolvedScorecard.assignedMarkerPlayerId,
      selectedPlayerIds: qrResolvedScorecard.playerScoreIds?.length
        ? qrResolvedScorecard.playerScoreIds
        : [qrResolvedScorecard.playerId],
      markedPlayerIds: qrResolvedScorecard.markerScoreIds?.length
        ? qrResolvedScorecard.markerScoreIds
        : qrResolvedScorecard.markerPlayerId
          ? [qrResolvedScorecard.markerPlayerId]
          : [],
      assignedMarkerPlayerIds: qrResolvedScorecard.assignedMarkerScoreIds?.length
        ? qrResolvedScorecard.assignedMarkerScoreIds
        : qrResolvedScorecard.assignedMarkerPlayerId
          ? [qrResolvedScorecard.assignedMarkerPlayerId]
          : [],
      roundId: `round-${String(Number(qrResolvedScorecard.round) || 1)}`,
    };
  }, [qrResolvedScorecard]);

  const scorecard = (qrResolvedScorecard && "error" in qrResolvedScorecard
    ? fallbackScorecard
    : qrResolvedScorecard ?? sampleScorecards[routePlayerId || ""] ?? fallbackScorecard);
  const linkedSharedTournamentId = useMemo(() => {
    if (!requestedTournamentId) {
      return "";
    }

    return loadSharedTournamentIdFromStorage(requestedTournamentId) || "";
  }, [requestedTournamentId]);
  const sharedScoreTournamentId = resolvedShareTournamentId || linkedSharedTournamentId || requestedTournamentId;

  const [scores, setScores] = useState<number[]>(Array.from({ length: scorecard.holes.length }, () => 0));
  const [markerScores, setMarkerScores] = useState<number[]>(Array.from({ length: scorecard.holes.length }, () => 0));
  const scoresRef = useRef(scores);
  const markerScoresRef = useRef(markerScores);
  const [reviewSelfScores, setReviewSelfScores] = useState<number[]>(Array.from({ length: scorecard.holes.length }, () => 0));
  const [reviewMarkerScores, setReviewMarkerScores] = useState<number[]>(Array.from({ length: scorecard.holes.length }, () => 0));
  const [holeStats, setHoleStats] = useState<HoleStatCapture[]>(createEmptyHoleStats(scorecard.holes.length));
  const [dynamicStatistics, setDynamicStatistics] = useState<MobileDynamicStatistics | null>(null);
  const [dynamicHoleValues, setDynamicHoleValues] = useState<DynamicHoleValues[]>(
    Array.from({ length: scorecard.holes.length }, () => ({}))
  );
  const dynamicOperationKeysRef = useRef(new Map<string, string>());
  const persistedDynamicValuesRef = useRef(new Map<string, string>());
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const currentHoleIndexRef = useRef(0);
  const hasManualHoleNavigationRef = useRef(false);
  const [savedHoles, setSavedHoles] = useState<number[]>([]);
  const [view, setView] = useState<"scoring" | "review" | "submitted">("scoring");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [reviewSyncError, setReviewSyncError] = useState("");
  const [isReviewSynchronizing, setIsReviewSynchronizing] = useState(false);
  const [reviewComparison, setReviewComparison] = useState<ReviewComparisonModel | null>(null);
  const [submitWithoutStatistics, setSubmitWithoutStatistics] = useState(false);
  const [scoreLoadError, setScoreLoadError] = useState("");
  const [scoresLoaded, setScoresLoaded] = useState(false);
  const [scoreControlsReady, setScoreControlsReady] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [postSubmissionView, setPostSubmissionView] = useState<"confirmation" | "scorecard">(
    searchParams.get("postRound") === "scorecard" ? "scorecard" : "confirmation"
  );
  const [submittedStatistics, setSubmittedStatistics] = useState<ReviewComparisonModel["statistics"] | null>(null);
  const [isSubmittedStatisticsLoading, setIsSubmittedStatisticsLoading] = useState(false);
  const [submittedStatisticsError, setSubmittedStatisticsError] = useState("");
  const [, setScoreDiagnostics] = useState<ScoreDiagnostics>(initialScoreDiagnostics);
  const finalizationVerifiedAtRef = useRef(0);
  const scoreSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [isSavingHole, setIsSavingHole] = useState(false);
  const isSavingHoleRef = useRef(false);

  const dynamicStatisticsStorageKey = sharedScoreTournamentId && scorecard.playerId
    ? `clubhouse-hq-dynamic-statistics:${sharedScoreTournamentId}:${scorecard.round}:${scorecard.playerId}`
    : "";

  useEffect(() => {
    if (
      !sharedScoreTournamentId ||
      !requestedShareToken ||
      !scorecard.playerId ||
      scorecard.playerId === "demo" ||
      scorecard.playerId.startsWith("group-")
    ) {
      setDynamicStatistics(null);
      return;
    }
    let cancelled = false;
    const roundNumber = Number(scorecard.round) || 1;
    const emptyValues = Array.from({ length: scorecard.holes.length }, () => ({} as DynamicHoleValues));
    let cachedValues = emptyValues;
    if (dynamicStatisticsStorageKey) {
      try {
        const cached = window.localStorage.getItem(dynamicStatisticsStorageKey);
        if (cached) cachedValues = JSON.parse(cached) as DynamicHoleValues[];
      } catch {
        // A malformed cache must not prevent authoritative hydration.
      }
    }

    loadMobileDynamicStatistics({
      shareToken: requestedShareToken,
      tournamentId: sharedScoreTournamentId,
      roundNumber,
      playerId: scorecard.playerId,
    })
      .then((configuration) => {
        if (cancelled) return;
        const nextValues = cachedValues.map((values) => ({ ...values }));
        const itemByVersion = new Map(
          configuration.items.map((item) => [item.definitionVersionId, item])
        );
        configuration.values.forEach((value) => {
          const item = itemByVersion.get(value.definitionVersionId);
          if (item && value.holeNumber >= 1 && value.holeNumber <= nextValues.length) {
            nextValues[value.holeNumber - 1][item.key] = value.value;
            persistedDynamicValuesRef.current.set(
              `${value.holeNumber}:${value.definitionVersionId}`,
              JSON.stringify(value.value)
            );
          }
        });
        setDynamicStatistics(configuration);
        setDynamicHoleValues(nextValues);
        setHoleStats((current) =>
          current.map((statistics, index) => ({
            ...statistics,
            ...(typeof nextValues[index]?.fairway_hit === "boolean"
              ? { fairwayHit: nextValues[index].fairway_hit as boolean }
              : {}),
            ...(typeof nextValues[index]?.green_in_regulation === "boolean"
              ? { greenInRegulation: nextValues[index].green_in_regulation as boolean }
              : {}),
            ...(typeof nextValues[index]?.putts === "number"
              ? { putts: nextValues[index].putts as number }
              : {}),
          }))
        );
      })
      .catch((error) => {
        console.warn("[DynamicStatistics] Unable to hydrate assigned statistics.", error);
        if (!cancelled) setDynamicHoleValues(cachedValues);
      });
    return () => {
      cancelled = true;
    };
  }, [
    dynamicStatisticsStorageKey,
    requestedShareToken,
    scorecard.holes.length,
    scorecard.playerId,
    scorecard.round,
    sharedScoreTournamentId,
  ]);

  const refreshCurrentFinalizedStateForSave = async () => {
    const effectiveTournamentId = requestedTournamentId || resolvedShareTournamentId;

    if (!effectiveTournamentId) {
      finalizationVerifiedAtRef.current = Date.now();
      return false;
    }

    const localEnvelope = loadTournamentStorageEnvelope(effectiveTournamentId);
    if (getTournamentFinalizationRecord(localEnvelope)) {
      finalizationVerifiedAtRef.current = Date.now();
      setIsTournamentFinalized(true);
      setSaveError(finalizedReadOnlyMessage);
      return true;
    }

    const shouldCheckSharedFinalization = Boolean(linkedSharedTournamentId || uuidPattern.test(effectiveTournamentId));
    if (!shouldCheckSharedFinalization || !sharedScoreTournamentId) {
      finalizationVerifiedAtRef.current = Date.now();
      return false;
    }

    const sharedState = await withTimeout(
      loadSharedTournamentScorecardState(
        sharedScoreTournamentId,
        Number(scorecard.round),
        scorecard.holes.length,
        requestedShareToken
      ).catch((error) => {
        console.warn("[TournamentService] Unable to verify tournament finalization before score save.", error);
        return null;
      }),
      SAVE_FINALIZATION_CHECK_TIMEOUT_MS
    );

    if (sharedState?.isFinalized) {
      finalizationVerifiedAtRef.current = Date.now();
      setIsTournamentFinalized(true);
      setSaveError(finalizedReadOnlyMessage);
      return true;
    }

    finalizationVerifiedAtRef.current = Date.now();
    return false;
  };

  useEffect(() => {
    if (!isDevelopment || !requestedTournamentId) {
      return;
    }

    const hasLocalTournament =
      loadTournamentsFromStorage().some((item) => item.id === requestedTournamentId) ||
      Boolean(loadTournamentStorageEnvelope(requestedTournamentId));

    setScoreDiagnostics((current) => ({
      ...current,
      localTournamentId: hasLocalTournament ? requestedTournamentId : "",
      sharedTournamentId: sharedScoreTournamentId,
    }));
  }, [requestedTournamentId, sharedScoreTournamentId]);

  // Load existing scores from storage on component mount using resolved player IDs
  useEffect(() => {
    let isCancelled = false;

    const loadExistingScores = async () => {
      if (scoresLoaded || !sharedScoreTournamentId || !resolvedPlayerIds) {
        return;
      }
      const exactLocalEnvelope = loadTournamentStorageEnvelope(requestedTournamentId);
      if (
        !requestedShareToken &&
        exactLocalEnvelope?.tournament.id === requestedTournamentId
      ) {
        setScoreControlsReady(true);
      }

      const roundNumber = Number(resolvedPlayerIds.roundId.replace("round-", "")) || 1;
      const holeCount = scorecard.holes.length;
      let loadedSelfScores: number[] | null = hasAnyHoleScore(scorecard.initialPlayerScores)
        ? normalizeHoleScores(scorecard.initialPlayerScores, holeCount)
        : null;
      let loadedMarkerScores: number[] | null = hasAnyHoleScore(scorecard.initialMarkerScores)
        ? normalizeHoleScores(scorecard.initialMarkerScores, holeCount)
        : null;
      let loadedReviewSelfScores: number[] | null = hasAnyHoleScore(scorecard.initialPlayerScores)
        ? normalizeHoleScores(scorecard.initialPlayerScores, holeCount)
        : null;
      let loadedReviewMarkerScores: number[] | null = hasAnyHoleScore(scorecard.initialPlayerScores)
        ? normalizeHoleScores(scorecard.initialPlayerScores, holeCount)
        : null;
      let loadedSubmissionComplete = false;
      let loadedReviewComparison: ReviewComparisonModel | null = null;
      let loadedHoleStats = createEmptyHoleStats(holeCount);
      let remoteLoadFailed = false;
      let stableSelfRowExists = false;
      let stableMarkerRowExists = false;
      let localStorageLoadedCount = 0;
      let supabaseLoadedCount = 0;
      const envelope = loadTournamentStorageEnvelope(requestedTournamentId);
      if (envelope) {
        const scorecardRows = envelope.uiState?.scorecards?.scorecardRows || [];
        const selfScorecardRow = scorecardRows.find(
          (row) => resolvedPlayerIds.selectedPlayerIds.includes(String(row.id)) && hasAnyHoleScore(row.scores)
        );
        const markerScorecardRow = scorecardRows.find(
          (row) => resolvedPlayerIds.markedPlayerIds.includes(String(row.id)) && hasAnyHoleScore(row.scores)
        );

        const selfScore = envelope.tournament.scores.find(
          (s) => resolvedPlayerIds.selectedPlayerIds.includes(String(s.playerId)) &&
                 s.roundId === resolvedPlayerIds.roundId &&
                 s.enteredBy === "self"
        );
        if (hasAnyHoleScore(selfScore?.holeScores) || hasAnyHoleScore(selfScorecardRow?.scores)) {
          localStorageLoadedCount += 1;
        }
        loadedSelfScores = hasAnyHoleScore(selfScore?.holeScores)
          ? normalizeHoleScores(selfScore?.holeScores, holeCount)
          : hasAnyHoleScore(selfScorecardRow?.scores)
            ? normalizeHoleScores(selfScorecardRow?.scores, holeCount)
            : null;

        const markerScore = envelope.tournament.scores.find(
          (s) => resolvedPlayerIds.markedPlayerIds.includes(String(s.playerId)) &&
                 s.roundId === resolvedPlayerIds.roundId &&
                 s.enteredBy === "marker"
        );
        if (hasAnyHoleScore(markerScore?.holeScores) || hasAnyHoleScore(markerScorecardRow?.scores)) {
          localStorageLoadedCount += 1;
        }
        loadedMarkerScores = hasAnyHoleScore(markerScore?.holeScores)
          ? normalizeHoleScores(markerScore?.holeScores, holeCount)
          : hasAnyHoleScore(markerScorecardRow?.scores)
            ? normalizeHoleScores(markerScorecardRow?.scores, holeCount)
            : null;

        if (!isCancelled) {
          const localSelfScores = loadedSelfScores ?? normalizeHoleScores(undefined, holeCount);
          const localMarkerScores = loadedMarkerScores ?? normalizeHoleScores(undefined, holeCount);
          scoresRef.current = localSelfScores;
          markerScoresRef.current = localMarkerScores;
          setScores(localSelfScores);
          setMarkerScores(localMarkerScores);
          setSavedHoles(getScoredHoleNumbers(scorecard.holes, localSelfScores, localMarkerScores));
          setScoreControlsReady(true);
        }
      }

      const loadRemoteScore = async (playerIds: string[], enteredByPlayerId: string) => {
        for (const playerId of playerIds) {
          const remoteScore = await loadPlayerScores({
            tournamentId: sharedScoreTournamentId,
            roundNumber,
            playerId,
            enteredByPlayerId,
            shareToken: requestedShareToken || undefined,
          });

          if (remoteScore) {
            return {
              rowExists: true,
              scores: normalizeHoleScores(remoteScore.hole_scores, holeCount),
            };
          }
        }

        return {
          rowExists: false,
          scores: null,
        };
      };

      try {
        const remoteSelfScore = await loadRemoteScore(
          resolvedPlayerIds.selectedPlayerIds,
          resolvedPlayerIds.selectedPlayerId
        );
        stableSelfRowExists = remoteSelfScore.rowExists;
        if (remoteSelfScore.rowExists) {
          loadedSelfScores = remoteSelfScore.scores;
          if (hasAnyHoleScore(remoteSelfScore.scores)) {
            supabaseLoadedCount += 1;
          }
        }

        if (resolvedPlayerIds.markedPlayerId && resolvedPlayerIds.assignedMarkerPlayerId) {
          const remoteMarkerScore = await loadRemoteScore(
            resolvedPlayerIds.markedPlayerIds,
            resolvedPlayerIds.selectedPlayerId
          );
          stableMarkerRowExists = remoteMarkerScore.rowExists;
          if (remoteMarkerScore.rowExists) {
            loadedMarkerScores = remoteMarkerScore.scores;
            if (hasAnyHoleScore(remoteMarkerScore.scores)) {
              supabaseLoadedCount += 1;
            }
          }

          const remoteCurrentPlayerMarkerScores = await loadRemoteScore(
            resolvedPlayerIds.selectedPlayerIds,
            resolvedPlayerIds.assignedMarkerPlayerId
          );
          if (remoteCurrentPlayerMarkerScores.rowExists) {
            if (hasAnyHoleScore(remoteCurrentPlayerMarkerScores.scores)) {
              supabaseLoadedCount += 1;
            }
            loadedReviewMarkerScores = remoteCurrentPlayerMarkerScores.scores;
          }
        }

        const sharedScores = await loadComparisonScores({
          tournamentId: sharedScoreTournamentId,
          roundNumber,
          shareToken: requestedShareToken || undefined,
        });
        const selectedSelfSubmitted = sharedScores.some(
          (entry) =>
            resolvedPlayerIds.selectedPlayerIds.includes(String(entry.player_id)) &&
            resolvedPlayerIds.selectedPlayerIds.includes(String(entry.entered_by_player_id)) &&
            entry.entry_status === "submitted"
        );
        const markerEntrySubmitted = resolvedPlayerIds.assignedMarkerPlayerId
          ? sharedScores.some(
              (entry) =>
                resolvedPlayerIds.selectedPlayerIds.includes(String(entry.player_id)) &&
                resolvedPlayerIds.assignedMarkerPlayerIds.includes(String(entry.entered_by_player_id)) &&
                entry.entry_status === "submitted"
            )
          : false;
        if (!isCancelled && selectedSelfSubmitted && markerEntrySubmitted) {
          loadedSubmissionComplete = true;
          setSubmissionComplete(true);
          setView("submitted");
        }
        supabaseLoadedCount = Math.max(
          supabaseLoadedCount,
          sharedScores.filter((entry) => hasAnyHoleScore(entry.hole_scores)).length
        );
        const stableSelfEntry = sharedScores.find(
          (entry) =>
            resolvedPlayerIds.selectedPlayerIds.includes(String(entry.player_id)) &&
            resolvedPlayerIds.selectedPlayerIds.includes(String(entry.entered_by_player_id))
        );
        if (stableSelfEntry) {
          stableSelfRowExists = true;
          loadedSelfScores = normalizeHoleScores(stableSelfEntry.hole_scores, holeCount);
        }

        const stableMarkerEntry = sharedScores.find(
          (entry) =>
            resolvedPlayerIds.markedPlayerIds.includes(String(entry.player_id)) &&
            resolvedPlayerIds.selectedPlayerIds.includes(String(entry.entered_by_player_id))
        );
        if (stableMarkerEntry) {
          stableMarkerRowExists = true;
          loadedMarkerScores = normalizeHoleScores(stableMarkerEntry.hole_scores, holeCount);
        }

        const getSharedScore = (playerIds: string[], enteredByPlayerIds?: string[], preferMarkerEntry = false) => {
          const matchingScores = sharedScores
            .filter((entry) => playerIds.includes(String(entry.player_id)) && hasAnyHoleScore(entry.hole_scores))
            .filter((entry) => !enteredByPlayerIds || enteredByPlayerIds.includes(String(entry.entered_by_player_id)));
          const selectedEntry = preferMarkerEntry
            ? matchingScores.find((entry) => !playerIds.includes(String(entry.entered_by_player_id))) ?? matchingScores[0]
            : matchingScores[0];

          return selectedEntry ? normalizeHoleScores(selectedEntry.hole_scores, holeCount) : null;
        };

        if (!stableSelfRowExists && !hasAnyHoleScore(loadedSelfScores)) {
          const sharedScoreboardSelfScores = getSharedScore(
            resolvedPlayerIds.selectedPlayerIds,
            resolvedPlayerIds.selectedPlayerIds
          );
          if (hasAnyHoleScore(sharedScoreboardSelfScores)) {
            loadedSelfScores = sharedScoreboardSelfScores;
          }
        }

        if (!stableMarkerRowExists && !hasAnyHoleScore(loadedMarkerScores)) {
          const sharedMarkerScores = getSharedScore(
            resolvedPlayerIds.markedPlayerIds,
            [resolvedPlayerIds.selectedPlayerId]
          );
          if (hasAnyHoleScore(sharedMarkerScores)) {
            loadedMarkerScores = sharedMarkerScores;
          }
        }

        if (!hasAnyHoleScore(loadedReviewMarkerScores)) {
          const sharedCurrentPlayerMarkerScores = getSharedScore(
            resolvedPlayerIds.selectedPlayerIds,
            resolvedPlayerIds.assignedMarkerPlayerId ? resolvedPlayerIds.assignedMarkerPlayerIds : []
          );
          if (hasAnyHoleScore(sharedCurrentPlayerMarkerScores)) {
            loadedReviewMarkerScores = sharedCurrentPlayerMarkerScores;
          }
        }

        const displayedCardsComplete =
          normalizeHoleScores(loadedSelfScores ?? undefined, holeCount).every((score) => score > 0) &&
          normalizeHoleScores(loadedMarkerScores ?? undefined, holeCount).every((score) => score > 0);
        if (displayedCardsComplete) {
          loadedReviewComparison = await loadReviewComparisonModel({
            tournamentId: sharedScoreTournamentId,
            roundNumber,
            shareToken: requestedShareToken || undefined,
            markedPlayerIds: resolvedPlayerIds.selectedPlayerIds,
            markerEnteredByPlayerIds: resolvedPlayerIds.assignedMarkerPlayerIds,
            statisticsPlayerIds: resolvedPlayerIds.selectedPlayerIds,
            holes: scorecard.holes,
            snapshotSelfScores: scorecard.initialPlayerScores,
            snapshotMarkerScores: scorecard.initialPlayerScores,
          });
          loadedReviewSelfScores = loadedReviewComparison.selfScores;
          loadedReviewMarkerScores = loadedReviewComparison.markerScores;
        }

        try {
          const statisticEntries = await withTimeout(
            loadTournamentHoleStatistics({
              tournamentId: sharedScoreTournamentId,
              roundNumber,
              shareToken: requestedShareToken || undefined,
            }),
            SAVE_FINALIZATION_CHECK_TIMEOUT_MS
          );
          if (!statisticEntries) throw new Error("Statistics hydration timed out.");
          const currentPlayerEntries = statisticEntries.filter(
            (entry) =>
              resolvedPlayerIds.selectedPlayerIds.includes(String(entry.player_id)) &&
              resolvedPlayerIds.selectedPlayerIds.includes(String(entry.entered_by_player_id))
          );
          const entriesByHole = new Map(
            currentPlayerEntries.map((entry) => [Number(entry.hole_number), entry])
          );
          loadedHoleStats = scorecard.holes.map((hole) => {
            const entry = entriesByHole.get(hole.holeNumber);
            return {
              fairwayHit: hole.par === 3 ? null : entry?.fairway_hit ?? null,
              greenInRegulation: entry?.green_in_regulation ?? null,
              putts: entry?.putts ?? null,
              penaltyStrokes: null,
            };
          });
        } catch (error) {
          console.warn("[StatisticsService] Unable to hydrate editable hole statistics.", error);
        }
      } catch (error) {
        remoteLoadFailed = true;
        console.warn("[ScoreService] Unable to load shared score entries.", error);
        if (!isCancelled) {
          setScoreLoadError(
            hasAnyHoleScore(loadedSelfScores) || hasAnyHoleScore(loadedMarkerScores)
              ? "Live score updates could not be checked. Showing the latest saved tournament scores."
              : "Saved scores could not be loaded. Check the scoring link or connection and try again."
          );
        }
        if (isDevelopment) {
          setScoreDiagnostics((current) => ({
            ...current,
            lastHydrationError: getErrorMessage(error),
          }));
        }
      } finally {
        if (!isCancelled) {
          const nextScores = (
            stableSelfRowExists
              ? loadedSelfScores
              : chooseMostCompleteScores(loadedSelfScores, scoresRef.current)
          ) ?? normalizeHoleScores(undefined, holeCount);
          const nextMarkerScores = (
            stableMarkerRowExists
              ? loadedMarkerScores
              : chooseMostCompleteScores(loadedMarkerScores, markerScoresRef.current)
          ) ?? normalizeHoleScores(undefined, holeCount);

          scoresRef.current = nextScores;
          markerScoresRef.current = nextMarkerScores;
          setScores(nextScores);
          setMarkerScores(nextMarkerScores);
          if (loadedReviewSelfScores) setReviewSelfScores(loadedReviewSelfScores);
          if (loadedReviewMarkerScores) setReviewMarkerScores(loadedReviewMarkerScores);
          setReviewComparison(loadedReviewComparison);
          setHoleStats(loadedHoleStats);
          setSavedHoles(getScoredHoleNumbers(scorecard.holes, nextScores, nextMarkerScores));

          const firstIncompleteIndex = findInitialScorecardHoleIndex({
            holes: scorecard.holes,
            selfScores: nextScores,
            markedPlayerScores: nextMarkerScores,
            statistics: loadedHoleStats,
          });
          if (loadedSubmissionComplete) {
            setView("submitted");
          } else if (firstIncompleteIndex >= 0) {
            if (!hasManualHoleNavigationRef.current) {
              currentHoleIndexRef.current = firstIncompleteIndex;
              setCurrentHoleIndex(firstIncompleteIndex);
            }
          } else if (loadedReviewComparison) {
            setView("review");
          } else {
            setView("scoring");
          }

          setScoresLoaded(true);
          setScoreControlsReady(
            !remoteLoadFailed ||
              Boolean(
                !requestedShareToken &&
                envelope?.tournament.id === requestedTournamentId
              ) ||
              hasAnyHoleScore(nextScores) ||
              hasAnyHoleScore(nextMarkerScores)
          );
          if (isDevelopment) {
            setScoreDiagnostics((current) => ({
              ...current,
              scoreEntriesLoadedFromLocalStorage: localStorageLoadedCount,
              scoreEntriesLoadedFromSupabase: supabaseLoadedCount,
              scoreHydrationComplete: "yes",
              lastHydrationError: current.lastHydrationError,
            }));
          }
        }
      }
    };

    void loadExistingScores();

    return () => {
      isCancelled = true;
    };
    }, [scoresLoaded, requestedTournamentId, resolvedPlayerIds, sharedScoreTournamentId, scorecard.holes]);

  useEffect(() => {
    if (!submissionComplete || !sharedScoreTournamentId || !resolvedPlayerIds) {
      return;
    }

    let isCancelled = false;
    const loadSubmittedStatistics = async () => {
      setIsSubmittedStatisticsLoading(true);
      setSubmittedStatisticsError("");
      try {
        const entries = await loadTournamentHoleStatistics({
          tournamentId: sharedScoreTournamentId,
          roundNumber: Number(scorecard.round) || 1,
          shareToken: requestedShareToken || undefined,
        });
        const selfEntries = entries.filter(
          (entry) =>
            resolvedPlayerIds.selectedPlayerIds.includes(String(entry.player_id)) &&
            resolvedPlayerIds.selectedPlayerIds.includes(String(entry.entered_by_player_id))
        );
        const entriesByHole = new Map(selfEntries.map((entry) => [Number(entry.hole_number), entry]));
        const statistics = scorecard.holes.map((hole) => {
          const entry = entriesByHole.get(hole.holeNumber);
          return {
            holeNumber: hole.holeNumber,
            fairwayHit: entry?.fairway_hit ?? null,
            greenInRegulation: entry?.green_in_regulation ?? null,
            putts: entry?.putts ?? null,
          };
        });
        if (!isCancelled) {
          setSubmittedStatistics(statistics);
        }
      } catch (error) {
        console.warn("[PostSubmission] Unable to load authoritative statistics.", error);
        if (!isCancelled) {
          setSubmittedStatistics(null);
          setSubmittedStatisticsError("Round statistics could not be loaded. Recorded scores remain available.");
        }
      } finally {
        if (!isCancelled) {
          setIsSubmittedStatisticsLoading(false);
        }
      }
    };
    void loadSubmittedStatistics();
    return () => {
      isCancelled = true;
    };
  }, [
    requestedShareToken,
    resolvedPlayerIds,
    scorecard.holes,
    scorecard.round,
    sharedScoreTournamentId,
    submissionComplete,
  ]);

  useEffect(() => {
    if (submissionComplete && searchParams.get("postRound") === "scorecard") {
      setPostSubmissionView("scorecard");
    }
  }, [searchParams, submissionComplete]);

  // Discrepancy detection: compare marked player's self scores vs marker scores
  const discrepancies = useMemo(() => {
    return scorecard.holes
      .map((hole, index) => {
        const self = reviewSelfScores[index];
        const marker = reviewMarkerScores[index];
        if (self > 0 && marker > 0 && self !== marker) {
          const diff = Math.abs(self - marker);
          return { holeNumber: hole.holeNumber, self, marker, diff };
        }
        return null;
      })
      .filter((d) => d !== null) as Array<{ holeNumber: number; self: number; marker: number; diff: number }>;
  }, [reviewMarkerScores, reviewSelfScores, scorecard.holes]);

  const hasDiscrepancies = discrepancies.length > 0;
  const hasCompleteMarkedPlayerSelfScores =
    reviewSelfScores.length === scorecard.holes.length &&
    reviewSelfScores.every((score) => score > 0);
  const hasCompleteMarkerScores =
    reviewMarkerScores.length === scorecard.holes.length &&
    reviewMarkerScores.every((score) => score > 0);
  const hasCompleteComparison = hasCompleteMarkedPlayerSelfScores && hasCompleteMarkerScores;
  const hasAssignedStatisticPackage = Boolean(dynamicStatistics?.assignment);
  const dynamicStatisticSummaries = hasAssignedStatisticPackage
    ? buildMobileStatisticSummaries(dynamicStatistics?.items ?? [], scorecard.holes, dynamicHoleValues)
    : [];
  const statisticsComplete = hasAssignedStatisticPackage
    ? areRequiredMobileStatisticsComplete(dynamicStatistics?.items ?? [], scorecard.holes, dynamicHoleValues)
    : Boolean(reviewComparison?.statisticsComplete);
  const statisticsRequirementSatisfied = statisticsComplete || submitWithoutStatistics;
  const canSubmitVerification =
    hasCompleteComparison &&
    !hasDiscrepancies &&
    statisticsRequirementSatisfied &&
    !isTournamentFinalized;

  const currentHole = scorecard.holes[currentHoleIndex];
  const allHolesScored = scorecard.holes.length > 0 && scores.every((s) => s > 0);

  const front9Holes = scorecard.holes.slice(0, 9);
  const back9Holes = scorecard.holes.slice(9);
  const front9Total = scores.slice(0, 9).reduce((sum, s) => sum + (s > 0 ? s : 0), 0);
  const back9Total = scores.slice(9, scorecard.holes.length).reduce((sum, s) => sum + (s > 0 ? s : 0), 0);
  const front9Par = front9Holes.reduce((sum, h) => sum + h.par, 0);
  const back9Par = back9Holes.reduce((sum, h) => sum + h.par, 0);

  // Totals for current player (scoring view)
  const totals = useMemo(() => {
    const playedHoles = scores.filter((score) => score > 0).length;
    const total = scores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0);
    const parPlayed = scorecard.holes.slice(0, playedHoles).reduce((sum, hole) => sum + hole.par, 0);

    return {
      playedHoles,
      total,
      toPar: playedHoles > 0 ? formatToPar(total - parPlayed) : "--",
    };
  }, [scorecard.holes, scores]);

  // Totals for marked player (review view)
  const reviewSelfTotals = useMemo(() => {
    const playedHoles = reviewSelfScores.filter((score) => score > 0).length;
    const total = reviewSelfScores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0);
    const parPlayed = scorecard.holes.slice(0, playedHoles).reduce((sum, hole) => sum + hole.par, 0);

    return {
      playedHoles,
      total,
      toPar: playedHoles > 0 ? formatToPar(total - parPlayed) : "--",
    };
  }, [reviewSelfScores, scorecard.holes]);
  const reviewMarkerTotal = reviewMarkerScores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0);

  const isQrScorecardRequest = Boolean((requestedTournamentId || requestedShareToken) && requestedPairingId);

  if (isQrScorecardRequest && !hasResolvedQrScorecard) {
    return (
      <main className="min-h-screen bg-[#F6F1E6] px-4 py-8 text-[#0B3D2E]">
        <div className="mx-auto max-w-md rounded-[28px] border border-[#E8DCC8] bg-white/90 p-6 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-xs font-black tracking-[0.25em] text-[#F6F1E6]">
              HQ
            </div>
            <div>
              <h1 className="text-sm font-black tracking-[-0.02em]">Clubhouse HQ</h1>
              <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">
                Mobile Scorecard
              </p>
            </div>
          </Link>

          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
            Loading Scorecard
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0B3D2E]">
            Resolving scoring link...
          </h2>
          <p className="mt-4 text-base leading-8 text-[#51635C]">
            We are loading the tournament scorecard from this device.
          </p>
        </div>
      </main>
    );
  }

  if (hasResolvedQrScorecard && qrResolvedScorecard && "error" in qrResolvedScorecard) {
    return (
      <main className="min-h-screen bg-[#F6F1E6] px-4 py-8 text-[#0B3D2E]">
        <div className="mx-auto max-w-md rounded-[28px] border border-[#E8DCC8] bg-white/90 p-6 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-xs font-black tracking-[0.25em] text-[#F6F1E6]">
              HQ
            </div>
            <div>
              <h1 className="text-sm font-black tracking-[-0.02em]">Clubhouse HQ</h1>
              <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">
                Mobile Scorecard
              </p>
            </div>
          </Link>

          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
            Mobile Score Entry Unavailable
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0B3D2E]">
            This scoring link is not valid.
          </h2>
          <p className="mt-4 text-base leading-8 text-[#51635C]">
            {qrResolvedScorecard.error}
          </p>

          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const updateCurrentHoleStats = (patch: Partial<HoleStatCapture>) => {
    setHoleStats((current) => {
      const normalizedStats =
        current.length === scorecard.holes.length ? current : createEmptyHoleStats(scorecard.holes.length);

      return normalizedStats.map((stats, index) =>
        index === currentHoleIndex ? { ...stats, ...patch } : stats
      );
    });
  };

  const toggleBooleanStat = (field: "fairwayHit" | "greenInRegulation", value: boolean) => {
    const currentValue = holeStats[currentHoleIndex]?.[field] ?? null;
    updateCurrentHoleStats({ [field]: currentValue === value ? null : value });
  };

  const toggleNumberStat = (field: "putts", value: number) => {
    const currentValue = holeStats[currentHoleIndex]?.[field] ?? null;
    updateCurrentHoleStats({ [field]: currentValue === value ? null : value });
  };

  const updateDynamicStatistic = (item: MobileStatisticItem, value: StatisticValue | null) => {
    setDynamicHoleValues((current) => {
      const next = current.map((hole) => ({ ...hole }));
      next[currentHoleIndex] = { ...(next[currentHoleIndex] ?? {}), [item.key]: value };
      if (dynamicStatisticsStorageKey) {
        window.localStorage.setItem(dynamicStatisticsStorageKey, JSON.stringify(next));
      }
      dynamicOperationKeysRef.current.set(
        `${currentHoleIndex + 1}:${item.definitionVersionId}`,
        createOperationId()
      );
      return next;
    });
    if (item.key === "fairway_hit" && (typeof value === "boolean" || value === null)) {
      updateCurrentHoleStats({ fairwayHit: value });
    } else if (item.key === "green_in_regulation" && (typeof value === "boolean" || value === null)) {
      updateCurrentHoleStats({ greenInRegulation: value });
    } else if (item.key === "putts" && (typeof value === "number" || value === null)) {
      updateCurrentHoleStats({ putts: value });
    }
  };

  // Validate player ID is real (non-empty, not demo, not a route group)
  const isValidPlayerId = (id: unknown): boolean => {
    return typeof id === "string" && id.length > 0 && id !== "demo" && !id.startsWith("group-");
  };

  const getLocalStoragePlayerId = (playerIds: string[], fallbackPlayerId: string) => {
    if (!requestedTournamentId) {
      return fallbackPlayerId;
    }

    const envelope = loadTournamentStorageEnvelope(requestedTournamentId);
    if (!envelope) {
      return fallbackPlayerId;
    }

    return (
      playerIds.find((id) => envelope.tournament.players.some((player) => String(player.id) === String(id))) ||
      playerIds.find((id) => envelope.uiState.scorecards.scorecardRows.some((row) => String(row.id) === String(id))) ||
      fallbackPlayerId
    );
  };

  const saveScoreThroughService = async (
    playerId: string,
    enteredByPlayerId: string,
    roundNumber: number,
    holeScores: number[],
    scope: "hole" | "round",
    stats?: HoleStatisticsInput,
    saveStatistics = true
  ) => {
    const wasJustVerified = Date.now() - finalizationVerifiedAtRef.current < 1000;
    if (isTournamentFinalized || (!wasJustVerified && (await refreshCurrentFinalizedStateForSave()))) {
      return false;
    }

    const serviceSave = scope === "round" ? saveRound : saveHole;
    const entryStatus = getEntryStatus(holeScores);

    if (isDevelopment) {
      setScoreDiagnostics((current) => ({
        ...current,
        supabaseSaveAttempted: "yes",
        supabaseSaveResult: "pending",
        supabaseSaveTournamentId: sharedScoreTournamentId,
        lastSaveError: "",
      }));
    }

    try {
      const result = await serviceSave({
        tournamentId: sharedScoreTournamentId,
        roundNumber,
        playerId,
        enteredByPlayerId,
        holeScores: [...holeScores],
        total: holeScores.reduce((sum, score) => sum + (Number.isFinite(score) ? score : 0), 0),
        entryStatus,
        submittedAt: null,
        shareToken: requestedShareToken || undefined,
      });

      if (saveStatistics) {
        try {
          if (scope === "hole") {
            const strokes = Number(holeScores[currentHoleIndex]) || 0;
            if (strokes > 0) {
              await saveHoleStatistics(
                buildScoreHoleEntryInput({
                  tournamentId: sharedScoreTournamentId,
                  roundNumber,
                  playerId,
                  enteredByPlayerId,
                  holeNumber: currentHole.holeNumber,
                  strokes,
                  fairwayHit: stats?.fairwayHit ?? null,
                  greenInRegulation: stats?.greenInRegulation ?? null,
                  putts: stats?.putts ?? null,
                  penaltyStrokes: null,
                  entryStatus,
                  shareToken: requestedShareToken || undefined,
                })
              );
            }
          } else {
            await saveRoundHoleStatistics({
              tournamentId: sharedScoreTournamentId,
              roundNumber,
              playerId,
              enteredByPlayerId,
              holeScores: [...holeScores],
              entryStatus,
              shareToken: requestedShareToken || undefined,
            });
          }
        } catch (error) {
          const hasRequiredStatistics =
            stats?.fairwayHit != null || stats?.greenInRegulation != null || stats?.putts != null;
          if (hasRequiredStatistics) {
            throw error;
          }
          console.warn("[StatisticsService] Unable to save optional empty hole statistics.", error);
        }
      }

      if (isDevelopment) {
        setScoreDiagnostics((current) => ({
          ...current,
          supabaseSaveResult: `ok ${result.id}`,
        }));
      }
      return true;
    } catch (error) {
      console.error("[ScoreService] Unable to save score entry.", error);
      if (isDevelopment) {
        setScoreDiagnostics((current) => ({
          ...current,
          supabaseSaveResult: "failed",
          lastSaveError: getErrorMessage(error),
        }));
      }
      setSaveError("Unable to save this hole. Check your connection and try Save Hole again.");
      return false;
    }
  };

  const queueImmediateScoreSave = (kind: "self" | "marker", nextScores: number[]) => {
    if (submissionComplete || !sharedScoreTournamentId || !resolvedPlayerIds) {
      return scoreSaveQueueRef.current;
    }

    const playerId = kind === "self" ? resolvedPlayerIds.selectedPlayerId : resolvedPlayerIds.markedPlayerId;
    if (!playerId || playerId === resolvedPlayerIds.selectedPlayerId && kind === "marker") {
      setSaveError("Unable to save score. Marker assignment is invalid.");
      return scoreSaveQueueRef.current;
    }

    const roundNumber = Number(resolvedPlayerIds.roundId.replace("round-", ""));
    const enteredByPlayerId = resolvedPlayerIds.selectedPlayerId;
    const normalizedScores = normalizeHoleScores(nextScores, scorecard.holes.length);
    const localPlayerId = getLocalStoragePlayerId(
      kind === "self" ? resolvedPlayerIds.selectedPlayerIds : resolvedPlayerIds.markedPlayerIds,
      playerId
    );

    const queuedSave = scoreSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const saved = await saveScoreThroughService(
          playerId,
          enteredByPlayerId,
          roundNumber,
          normalizedScores,
          "hole",
          undefined,
          false
        );
        if (saved && requestedTournamentId) {
          mergeTournamentScoreSubmission(
            requestedTournamentId,
            localPlayerId,
            resolvedPlayerIds.roundId,
            normalizedScores,
            kind
          );
        }
      });
    scoreSaveQueueRef.current = queuedSave;
    return queuedSave;
  };

  const updateScore = (value: string) => {
    const targetHoleIndex = currentHoleIndexRef.current;
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const nextScores = scoresRef.current.map((score, index) => (index === targetHoleIndex ? safeValue : score));
    scoresRef.current = nextScores;
    setScores(nextScores);
    if (safeValue > 0 && markerScoresRef.current[targetHoleIndex] > 0) {
      const holeNumber = scorecard.holes[targetHoleIndex].holeNumber;
      setSavedHoles((current) => current.includes(holeNumber) ? current : [...current, holeNumber]);
    }
    void queueImmediateScoreSave("self", nextScores);
  };

  const updateMarkerScore = (value: string) => {
    const targetHoleIndex = currentHoleIndexRef.current;
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const nextScores = markerScoresRef.current.map((score, index) => (index === targetHoleIndex ? safeValue : score));
    markerScoresRef.current = nextScores;
    setMarkerScores(nextScores);
    if (safeValue > 0 && scoresRef.current[targetHoleIndex] > 0) {
      const holeNumber = scorecard.holes[targetHoleIndex].holeNumber;
      setSavedHoles((current) => current.includes(holeNumber) ? current : [...current, holeNumber]);
    }
    void queueImmediateScoreSave("marker", nextScores);
  };

  const handleSaveHole = async () => {
    const targetHoleIndex = currentHoleIndexRef.current;
    if (isSavingHoleRef.current) return;

    isSavingHoleRef.current = true;
    flushSync(() => setIsSavingHole(true));
    try {
      await scoreSaveQueueRef.current.catch(() => undefined);

      const targetHole = scorecard.holes[targetHoleIndex];
      const nextScores = normalizeHoleScores(scoresRef.current, scorecard.holes.length);
      const nextMarkerScores = normalizeHoleScores(markerScoresRef.current, scorecard.holes.length);

      if (isTournamentFinalized || (await refreshCurrentFinalizedStateForSave())) {
        setSaveError(finalizedReadOnlyMessage);
        return;
      }

      if (!targetHole || nextScores[targetHoleIndex] === 0) return;

      // Validate playerId before saving
      if (!isValidPlayerId(scorecard.playerId)) {
        setSaveError("Unable to save score. Player information is invalid. Please request a new scoring link.");
        return;
      }

      const targetDynamicValues = dynamicHoleValues[targetHoleIndex] ?? {};
      const missingDynamicStatistics = dynamicStatistics?.assignment
        ? missingRequiredMobileStatistics(dynamicStatistics.items, targetHole.par, targetDynamicValues)
        : [];
      if (missingDynamicStatistics.length > 0) {
        setSaveError(
          `Complete required statistics: ${missingDynamicStatistics.map((item) => item.name).join(", ")}.`
        );
        return;
      }

      setSavedHoles((current) => {
        if (current.includes(targetHole.holeNumber)) return current;
        return [...current, targetHole.holeNumber];
      });
      setSaveError("");

      if (sharedScoreTournamentId) {
        const roundNumber = String(Number(scorecard.round) || 1);
        const roundId = `round-${roundNumber}`;
        const parsedRoundNumber = Number(roundNumber);
        const selectedStats = holeStats[targetHoleIndex] ?? emptyHoleStats();
        const targetHoleStats: HoleStatisticsInput = {
          fairwayHit: targetHole.par === 3 ? null : selectedStats.fairwayHit,
          greenInRegulation: selectedStats.greenInRegulation,
          putts: selectedStats.putts,
          penaltyStrokes: null,
        };
        const hasEnteredStatistics =
          targetHoleStats.fairwayHit != null ||
          targetHoleStats.greenInRegulation != null ||
          targetHoleStats.putts != null;
        const stableSelfPlayerId = String(scorecard.playerId);
        const stableMarkerPlayerId = isValidPlayerId(scorecard.markerPlayerId) ? String(scorecard.markerPlayerId) : "";
        const localSelfPlayerId = getLocalStoragePlayerId(resolvedPlayerIds?.selectedPlayerIds ?? [stableSelfPlayerId], stableSelfPlayerId);
        const localMarkerPlayerId = stableMarkerPlayerId
          ? getLocalStoragePlayerId(resolvedPlayerIds?.markedPlayerIds ?? [stableMarkerPlayerId], stableMarkerPlayerId)
          : "";
        if (isDevelopment) {
          setScoreDiagnostics((current) => ({
            ...current,
            localStorageSaveAttempted: "yes",
            localStorageSaveResult: "pending",
            supabaseSaveTournamentId: sharedScoreTournamentId,
            savePlayerId: stableSelfPlayerId,
            saveMarkerPlayerId: stableMarkerPlayerId,
            lastSaveError: "",
          }));
        }

        // Save self score with validated playerId
        const selfScoreSaved = requestedTournamentId
          ? mergeTournamentScoreSubmission(requestedTournamentId, localSelfPlayerId, roundId, nextScores, "self")
          : true;
        let markerScoreSaved = false;
        const selfSaveCompleted = await saveScoreThroughService(
          stableSelfPlayerId,
          stableSelfPlayerId,
          parsedRoundNumber,
          nextScores,
          "hole",
          targetHoleStats
        );
        if (!selfSaveCompleted && (Boolean(requestedShareToken) || hasEnteredStatistics || !selfScoreSaved)) {
          return;
        }

        if (dynamicStatistics?.assignment) {
          const valuesToSave = dynamicStatistics.items.flatMap((item) => {
            const value = targetDynamicValues[item.key];
            if (value == null || !statisticAppliesToHole(item, targetHole.par, targetDynamicValues)) return [];
            const operationKeyRef = `${targetHole.holeNumber}:${item.definitionVersionId}`;
            if (persistedDynamicValuesRef.current.get(operationKeyRef) === JSON.stringify(value)) return [];
            let operationKey = dynamicOperationKeysRef.current.get(operationKeyRef);
            if (!operationKey) {
              operationKey = createOperationId();
              dynamicOperationKeysRef.current.set(operationKeyRef, operationKey);
            }
            return [{
              definitionVersionId: item.definitionVersionId,
              holeNumber: targetHole.holeNumber,
              value,
              operationKey,
            }];
          });
          try {
            await saveMobileDynamicStatistics({
              shareToken: requestedShareToken,
              tournamentId: sharedScoreTournamentId,
              roundNumber: parsedRoundNumber,
              playerId: stableSelfPlayerId,
              values: valuesToSave,
            });
            valuesToSave.forEach((value) => {
              persistedDynamicValuesRef.current.set(
                `${value.holeNumber}:${value.definitionVersionId}`,
                JSON.stringify(value.value)
              );
            });
          } catch (error) {
            console.error("[DynamicStatistics] Unable to save assigned statistics.", error);
            setSaveError("Unable to save this hole. Check your connection and try Save Hole again.");
            return;
          }
        }

        // Save marker score only if markerPlayerId is valid
        if (stableMarkerPlayerId && hasAnyHoleScore(nextMarkerScores)) {
          markerScoreSaved = requestedTournamentId
            ? mergeTournamentScoreSubmission(requestedTournamentId, localMarkerPlayerId, roundId, nextMarkerScores, "marker")
            : true;
          const markerSaveCompleted = await saveScoreThroughService(
            stableMarkerPlayerId,
            stableSelfPlayerId,
            parsedRoundNumber,
            nextMarkerScores,
            "hole"
          );
          if (!markerSaveCompleted && (Boolean(requestedShareToken) || !markerScoreSaved)) {
            return;
          }
        }
        if (isDevelopment) {
          setScoreDiagnostics((current) => ({
            ...current,
            localStorageSaveResult: `self ${selfScoreSaved ? "ok" : "failed"} / marker ${
              hasAnyHoleScore(nextMarkerScores) ? (markerScoreSaved ? "ok" : "failed or skipped") : "not entered"
            }`,
          }));
        }
      }

      if (targetHoleIndex < scorecard.holes.length - 1) {
        const nextHoleIndex = targetHoleIndex + 1;
        currentHoleIndexRef.current = nextHoleIndex;
        setCurrentHoleIndex(nextHoleIndex);
      }
    } finally {
      window.requestAnimationFrame(() => {
        isSavingHoleRef.current = false;
        setIsSavingHole(false);
      });
    }
  };

  const handlePreviousHole = async () => {
    if (isSavingHoleRef.current) return;
    await scoreSaveQueueRef.current;
    hasManualHoleNavigationRef.current = true;
    const next = Math.max(currentHoleIndexRef.current - 1, 0);
    currentHoleIndexRef.current = next;
    setCurrentHoleIndex(next);
  };

  const handleNextHole = async () => {
    if (isSavingHoleRef.current) return;
    await scoreSaveQueueRef.current;
    hasManualHoleNavigationRef.current = true;
    const next = Math.min(currentHoleIndexRef.current + 1, scorecard.holes.length - 1);
    currentHoleIndexRef.current = next;
    setCurrentHoleIndex(next);
  };

  const handleReviewRound = async () => {
    if (isSavingHoleRef.current || isReviewSynchronizing) return;
    setIsReviewSynchronizing(true);
    setReviewSyncError("");
    setSaveError("");

    try {
      await scoreSaveQueueRef.current;
      if (!sharedScoreTournamentId || !resolvedPlayerIds?.assignedMarkerPlayerId) {
        throw new Error("Tournament comparison information is unavailable.");
      }

      const comparison = await loadReviewComparisonModel({
        tournamentId: sharedScoreTournamentId,
        roundNumber: Number(scorecard.round) || 1,
        shareToken: requestedShareToken || undefined,
        markedPlayerIds: resolvedPlayerIds.selectedPlayerIds,
        markerEnteredByPlayerIds: resolvedPlayerIds.assignedMarkerPlayerIds,
        statisticsPlayerIds: resolvedPlayerIds.selectedPlayerIds,
        holes: scorecard.holes,
        snapshotSelfScores: scorecard.initialPlayerScores,
        snapshotMarkerScores: scorecard.initialPlayerScores,
      });

      setReviewComparison(comparison);
      setSubmitWithoutStatistics(false);
      setReviewSelfScores(comparison.selfScores);
      setReviewMarkerScores(comparison.markerScores);
      setView("review");
      setShowConfirm(false);
    } catch (error) {
      console.warn("[ReviewComparison] Unable to synchronize authoritative comparison.", error);
      setReviewSyncError("Review data could not be synchronized. Check your connection and try again.");
    } finally {
      setIsReviewSynchronizing(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (submissionComplete) {
      setView("submitted");
      setShowConfirm(false);
      return;
    }
    await scoreSaveQueueRef.current;
    if (isTournamentFinalized || (await refreshCurrentFinalizedStateForSave())) {
      setSaveError(finalizedReadOnlyMessage);
      return;
    }

    if (!sharedScoreTournamentId) {
      setSaveError("Unable to submit. Tournament information is missing.");
      return;
    }

    const persistedEntries = await loadComparisonScores({
      tournamentId: sharedScoreTournamentId,
      roundNumber: Number(scorecard.round),
      shareToken: requestedShareToken || undefined,
    });
    const scorerAlreadySubmitted = persistedEntries.some(
      (entry) =>
        resolvedPlayerIds?.selectedPlayerIds.includes(String(entry.player_id)) &&
        resolvedPlayerIds.selectedPlayerIds.includes(String(entry.entered_by_player_id)) &&
        entry.entry_status === "submitted"
    );
    const markerAlreadySubmitted = persistedEntries.some(
      (entry) =>
        resolvedPlayerIds?.selectedPlayerIds.includes(String(entry.player_id)) &&
        resolvedPlayerIds.assignedMarkerPlayerIds.includes(String(entry.entered_by_player_id)) &&
        entry.entry_status === "submitted"
    );
    if (scorerAlreadySubmitted && markerAlreadySubmitted) {
      setSubmissionComplete(true);
      setView("submitted");
      return;
    }

    const assignedMarkerPlayerId = resolvedPlayerIds?.assignedMarkerPlayerId;
    if (!isValidPlayerId(assignedMarkerPlayerId)) {
      setSaveError("Unable to submit. Marker player information is invalid.");
      return;
    }

    const roundNumber = Number(scorecard.round);
    if (
      !Number.isInteger(roundNumber) ||
      roundNumber < 1 ||
      scores.some((score) => score <= 0) ||
      !hasCompleteComparison
    ) {
      setSaveError("Complete every scorer and marker score before submitting.");
      return;
    }
    if (hasDiscrepancies) {
      setSaveError("Resolve every scorer and marker mismatch before submitting.");
      return;
    }
    if (!reviewComparison?.statisticsComplete && !submitWithoutStatistics) {
      setSaveError("Complete every required statistic or select the statistics opt-out before submitting.");
      return;
    }
    const reviewOwnership = buildReviewOwnership(scorecard.playerId, String(assignedMarkerPlayerId));
    const submittedAt = new Date().toISOString();
    try {
      await saveRound({
        tournamentId: sharedScoreTournamentId,
        roundNumber,
        playerId: reviewOwnership.reviewedPlayerId,
        enteredByPlayerId: reviewOwnership.selfEnteredByPlayerId,
        holeScores: [...reviewSelfScores],
        total: reviewSelfScores.reduce((sum, score) => sum + score, 0),
        entryStatus: "submitted",
        submittedAt,
        shareToken: requestedShareToken || undefined,
      });
      await saveRound({
        tournamentId: sharedScoreTournamentId,
        roundNumber,
        playerId: reviewOwnership.reviewedPlayerId,
        enteredByPlayerId: reviewOwnership.markerEnteredByPlayerId,
        holeScores: [...reviewMarkerScores],
        total: reviewMarkerScores.reduce((sum, score) => sum + score, 0),
        entryStatus: "submitted",
        submittedAt,
        shareToken: requestedShareToken || undefined,
      });
      await Promise.all([
        completeReview({
          tournamentId: sharedScoreTournamentId,
          roundNumber,
          playerId: reviewOwnership.reviewedPlayerId,
          selfReviewComplete: true,
          markerReviewComplete: true,
          shareToken: requestedShareToken || undefined,
        }),
      ]);
      setSubmissionComplete(true);
      setView("submitted");
    } catch (error) {
      setSaveError(`Unable to submit scores. ${getErrorMessage(error)}`);
    }
  };

  const updatePostSubmissionView = (nextView: "confirmation" | "scorecard") => {
    setPostSubmissionView(nextView);
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (nextView === "scorecard") {
      url.searchParams.set("postRound", "scorecard");
    } else {
      url.searchParams.delete("postRound");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const isHoleSaved = savedHoles.includes(currentHole.holeNumber);
  const currentStatCapture = holeStats[currentHoleIndex] ?? emptyHoleStats();
  const statButtonClass = (isSelected: boolean) =>
    `min-h-12 rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.15em] transition duration-200 ${
      isSelected
        ? "border-[#0B3D2E] bg-[#0B3D2E] text-[#F6F1E6]"
        : "border-[#E8DCC8] bg-[#FCFAF5] text-[#0B3D2E]"
    } disabled:cursor-not-allowed disabled:opacity-50`;

  const sharedHeader = (
    <header className="sticky top-0 z-20 border-b border-[#E8DCC8] bg-[#F6F1E6]/95 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-xs font-black tracking-[0.25em] text-[#F6F1E6]">
            HQ
          </div>
          <div>
            <h1 className="text-sm font-black tracking-[-0.02em]">Clubhouse HQ</h1>
            <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">
              Mobile Scorecard
            </p>
          </div>
        </Link>
        <span className="rounded-full border border-[#E8DCC8] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
          Round {scorecard.round}
        </span>
      </div>
    </header>
  );

  if (view === "submitted") {
    const totalPar = front9Par + back9Par;
    const submittedStats =
      submittedStatistics ??
      scorecard.holes.map((hole) => ({
        holeNumber: hole.holeNumber,
        fairwayHit: null,
        greenInRegulation: null,
        putts: null,
      }));
    const fairwaysAvailable = scorecard.holes.filter((hole) => hole.par !== 3).length;
    const fairwaysHit = submittedStats.filter((statistic) => statistic.fairwayHit === true).length;
    const greensHit = submittedStats.filter((statistic) => statistic.greenInRegulation === true).length;
    const frontNinePutts = submittedStats
      .slice(0, 9)
      .reduce((sum, statistic) => sum + (statistic.putts ?? 0), 0);
    const backNinePutts = submittedStats
      .slice(9)
      .reduce((sum, statistic) => sum + (statistic.putts ?? 0), 0);
    const totalPutts = frontNinePutts + backNinePutts;
    const legacyStatisticsIncomplete = scorecard.holes.some((hole, index) => {
      const statistic = submittedStats[index];
      return (
        (hole.par !== 3 && statistic.fairwayHit === null) ||
        statistic.greenInRegulation === null ||
        statistic.putts === null
      );
    });
    const statisticsIncomplete = hasAssignedStatisticPackage ? !statisticsComplete : legacyStatisticsIncomplete;
    const percentage = (value: number, available: number) =>
      available > 0 ? `${Math.round((value / available) * 100)}%` : "—";
    const formatBooleanStatistic = (value: boolean | null) =>
      value === null ? "—" : value ? "Yes" : "No";
    const leaderboardParams = new URLSearchParams({
      shareToken: requestedShareToken,
      round: requestedRound || scorecard.round,
    });
    const leaderboardHref = `/leaderboard?${leaderboardParams.toString()}`;
    const renderSubmittedNine = (
      title: string,
      holes: Hole[],
      startIndex: number,
      scoreTotal: number,
      parTotal: number
    ) => (
      <section className="rounded-[24px] border border-[#E8DCC8] bg-white/90 p-3 shadow-[0_14px_35px_rgba(11,61,46,0.06)]">
        <div className="flex items-end justify-between gap-3 px-1 pb-3">
          <h3 className="text-lg font-black tracking-[-0.02em]">{title}</h3>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#51635C]">
            Score {scoreTotal} · Par {parTotal}
          </p>
        </div>
        <table className="w-full table-fixed text-[10px]">
          <thead>
            <tr className="border-y border-[#E8DCC8] bg-[#FCFAF5] text-[#51635C]">
              {(hasAssignedStatisticPackage ? ["Hole", "Par", "Score"] : ["Hole", "Par", "Score", "Fairway", "GIR", "Putts"]).map((heading) => (
                <th key={heading} className="px-0.5 py-2 text-center font-black uppercase tracking-[0.08em]">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holes.map((hole, sectionIndex) => {
              const index = startIndex + sectionIndex;
              const statistic = submittedStats[index];
              return (
                <tr key={hole.holeNumber} className="border-b border-[#E8DCC8] last:border-0">
                  <td className="px-0.5 py-2 text-center font-black">{hole.holeNumber}</td>
                  <td className="px-0.5 py-2 text-center text-[#51635C]">{hole.par}</td>
                  <td className="px-0.5 py-2 text-center font-black">{scores[index] || "—"}</td>
                  {!hasAssignedStatisticPackage ? (
                    <>
                  <td className="px-0.5 py-2 text-center text-[#51635C]">
                    {hole.par === 3 ? "N/A" : formatBooleanStatistic(statistic.fairwayHit)}
                  </td>
                  <td className="px-0.5 py-2 text-center text-[#51635C]">
                    {formatBooleanStatistic(statistic.greenInRegulation)}
                  </td>
                  <td className="px-0.5 py-2 text-center text-[#51635C]">{statistic.putts ?? "—"}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );

    return (
      <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
        {sharedHeader}
        <section className="mx-auto max-w-lg px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-5">
          {isTournamentFinalized ? (
            <div className="mb-4 rounded-[24px] border border-[#77B98E] bg-[#ECF8EF] p-4 text-sm font-semibold text-[#146233]">
              This tournament is finalized. Score entry is read-only for historical viewing.
            </div>
          ) : null}
          {postSubmissionView === "confirmation" ? (
            <div className="rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Round Submitted</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0B3D2E]">
                Your scorecard is complete
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#51635C]">
                {scorecard.playerName}&rsquo;s round {scorecard.round} has been submitted and is now read-only.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#B8892D]">Final Score</p>
                  <p className="mt-2 text-2xl font-black">{totals.total}</p>
                </div>
                <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#B8892D]">To Par</p>
                  <p className="mt-2 text-2xl font-black">{totals.toPar}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => updatePostSubmissionView("scorecard")}
                  className="min-h-12 rounded-full bg-[#0B3D2E] px-5 py-3 text-sm font-black text-[#F6F1E6]"
                >
                  View My Scorecard and Stats
                </button>
                <Link
                  href={leaderboardHref}
                  className="flex min-h-12 items-center justify-center rounded-full border border-[#0B3D2E] px-5 py-3 text-sm font-black text-[#0B3D2E]"
                >
                  Go to Leaderboard
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-[#E8DCC8] bg-[#0B3D2E] p-5 text-[#F6F1E6] shadow-[0_18px_45px_rgba(11,61,46,0.15)]">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#F0C96A]">
                  My Scorecard and Stats
                </p>
                <h2 className="mt-2 text-2xl font-black">{scorecard.playerName}</h2>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                  Round {scorecard.round} · {totals.total} · {totals.toPar} to par
                </p>
              </div>

              {isSubmittedStatisticsLoading ? (
                <div role="status" className="rounded-2xl border border-[#E8DCC8] bg-white p-4 text-sm font-semibold">
                  Loading authoritative round statistics…
                </div>
              ) : null}
              {statisticsIncomplete && !isSubmittedStatisticsLoading ? (
                <div role="alert" className="rounded-2xl border border-amber-400 bg-amber-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-800">Statistics Incomplete</p>
                  <p className="mt-2 text-xs leading-5 text-amber-900">
                    Available statistics are shown below. Missing recorded values appear as —.
                  </p>
                  {submittedStatisticsError ? (
                    <p className="mt-2 text-xs font-semibold text-amber-900">{submittedStatisticsError}</p>
                  ) : null}
                </div>
              ) : null}

              {renderSubmittedNine("Front 9", front9Holes, 0, front9Total, front9Par)}
              {back9Holes.length > 0
                ? renderSubmittedNine("Back 9", back9Holes, 9, back9Total, back9Par)
                : null}

              <section className="rounded-[24px] border border-[#E8DCC8] bg-white/90 p-4">
                <h3 className="text-lg font-black">Round Totals</h3>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Front", `${front9Total} / ${front9Par}`],
                    ["Back", `${back9Total} / ${back9Par}`],
                    ["Total", `${totals.total} / ${totalPar}`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-[#FCFAF5] p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#51635C]">{label}</p>
                      <p className="mt-1 text-base font-black">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 rounded-full bg-[#F6F1E6] px-3 py-2 text-center text-xs font-black">
                  Score to par: {totals.toPar}
                </p>
              </section>

              {hasAssignedStatisticPackage ? (
                dynamicStatisticSummaries.length > 0 ? (
                  <section className="rounded-[24px] border border-[#E8DCC8] bg-white/90 p-4">
                    <h3 className="text-lg font-black">Statistics Summary</h3>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {dynamicStatisticSummaries.map((summary) => (
                        <div key={summary.definitionVersionId} className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
                          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#51635C]">{summary.name}</p>
                          <p className="mt-1 text-lg font-black">{summary.displayValue}</p>
                          <p className="mt-1 text-[10px] font-semibold text-[#51635C]">{summary.recordedCount}/{summary.applicableCount} holes recorded</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null
              ) : (
              <section className="rounded-[24px] border border-[#E8DCC8] bg-white/90 p-4">
                <h3 className="text-lg font-black">Statistics Summary</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ["Fairways", `${fairwaysHit}/${fairwaysAvailable}`],
                    ["Fairway %", percentage(fairwaysHit, fairwaysAvailable)],
                    ["GIR", `${greensHit}/${scorecard.holes.length}`],
                    ["GIR %", percentage(greensHit, scorecard.holes.length)],
                    ["Total Putts", String(totalPutts)],
                    ["Front / Back Putts", `${frontNinePutts} / ${backNinePutts}`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#51635C]">{label}</p>
                      <p className="mt-1 text-lg font-black">{value}</p>
                    </div>
                  ))}
                </div>
              </section>
              )}

              <div className="flex flex-col gap-3 pb-4">
                <button
                  type="button"
                  onClick={() => updatePostSubmissionView("confirmation")}
                  className="min-h-12 rounded-full border border-[#0B3D2E] px-5 py-3 text-sm font-black"
                >
                  Back to Submission Confirmation
                </button>
                <Link
                  href={leaderboardHref}
                  className="flex min-h-12 items-center justify-center rounded-full bg-[#0B3D2E] px-5 py-3 text-sm font-black text-[#F6F1E6]"
                >
                  Go to Leaderboard
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  if (view === "review") {
    const reviewStatistics =
      reviewComparison?.statistics ??
      scorecard.holes.map((hole) => ({
        holeNumber: hole.holeNumber,
        fairwayHit: null,
        greenInRegulation: null,
        putts: null,
      }));
    const missingStatisticDetails = scorecard.holes.flatMap((hole, index) => {
      const statistic = reviewStatistics[index];
      const missing = [
        ...(hole.par !== 3 && statistic.fairwayHit === null ? ["Fairway Hit"] : []),
        ...(statistic.greenInRegulation === null ? ["Green in Regulation"] : []),
        ...(statistic.putts === null ? ["Putts"] : []),
      ];
      return missing.length > 0 ? [{ holeNumber: hole.holeNumber, fields: missing }] : [];
    });
    const formatBooleanStatistic = (value: boolean | null) =>
      value === null ? "—" : value ? "Yes" : "No";
    const renderHolesTable = (holes: Hole[], startIndex: number, sectionLabel: string) => {
      return (
        <div className="mt-5">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">{sectionLabel}</p>
          <div className="overflow-hidden rounded-2xl border border-[#E8DCC8]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E8DCC8] bg-[#FCFAF5]">
                  <th className="px-2 py-2 text-left font-black uppercase tracking-[0.2em] text-[#51635C]">Hole</th>
                  <th className="px-2 py-2 text-center font-black uppercase tracking-[0.2em] text-[#51635C]">Self</th>
                  <th className="px-2 py-2 text-center font-black uppercase tracking-[0.2em] text-[#51635C]">Marker</th>
                  <th className="px-2 py-2 text-center font-black uppercase tracking-[0.2em] text-[#51635C]">Match</th>
                </tr>
              </thead>
              <tbody>
                {holes.map((hole, i) => {
                  const index = startIndex + i;
                  const selfScore = reviewSelfScores[index];
                  const markerScore = reviewMarkerScores[index];
                  const isMatch = selfScore === markerScore;
                  const discrepancy = Math.abs(selfScore - markerScore);

                  return (
                    <tr
                      key={hole.holeNumber}
                      className={`border-b border-[#E8DCC8] last:border-0 ${
                        !isMatch && selfScore > 0 && markerScore > 0 ? "bg-red-100" : selfScore > 0 && markerScore > 0 ? "bg-green-50" : ""
                      }`}
                    >
                      <td className="px-2 py-2 font-black text-[#0B3D2E]">{getDisplayHoleNumber(hole)}</td>
                      <td className="px-2 py-2 text-center font-black text-[#0B3D2E]">
                        {selfScore > 0 ? selfScore : "—"}
                      </td>
                      <td className="px-2 py-2 text-center font-black text-[#0B3D2E]">
                        {markerScore > 0 ? markerScore : "—"}
                      </td>
                      <td className={`px-2 py-2 text-center font-black ${
                        !isMatch && selfScore > 0 && markerScore > 0 ? "text-red-700" : selfScore > 0 && markerScore > 0 ? "text-green-700" : "text-[#51635C]"
                      }`}>
                        {selfScore === 0 || markerScore === 0 ? "—" : isMatch ? "✓" : `✗ Δ${discrepancy}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    };

    return (
      <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
        {sharedHeader}
        <section className="mx-auto max-w-lg px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-5">
          {isTournamentFinalized ? (
            <div className="mb-4 rounded-[24px] border border-[#77B98E] bg-[#ECF8EF] p-4 text-sm font-semibold text-[#146233]">
              This tournament is finalized. Score entry is read-only for historical viewing.
            </div>
          ) : null}
          <div className="rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Verify Score</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              {scorecard.playerName || "Player"}
            </h2>
            <p className="mt-0.5 text-xs text-[#51635C]">{scorecard.team}</p>

            {hasDiscrepancies && (
              <div className="mt-4 rounded-2xl border border-red-500 bg-red-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-700">
                  ⚠ Discrepancies Found
                </p>
                <p className="mt-2 text-xs leading-5 text-red-800">
                  {discrepancies.length} hole{discrepancies.length !== 1 ? "s" : ""} {discrepancies.length !== 1 ? "have" : "has"} score mismatch{discrepancies.length !== 1 ? "es" : ""}. Self and marker scores must match exactly before submitting.
                </p>
                <div className="mt-2 space-y-1">
                  {discrepancies.map((d) => (
                    <p key={d.holeNumber} className="text-xs text-red-800">
                      Hole {scorecard.holes[d.holeNumber - 1] ? getDisplayHoleNumber(scorecard.holes[d.holeNumber - 1]) : d.holeNumber}: Self {d.self} vs Marker {d.marker}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {!hasCompleteComparison ? (
              <div role="alert" className="mt-4 rounded-2xl border border-amber-400 bg-amber-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-800">
                  Score Comparison Incomplete
                </p>
                <p className="mt-2 text-xs leading-5 text-amber-900">
                  Every self and marker score must be available before this scorecard can be verified.
                </p>
              </div>
            ) : null}

            {front9Holes.length > 0 ? renderHolesTable(front9Holes, 0, "Front 9") : null}
            {back9Holes.length > 0 ? renderHolesTable(back9Holes, 9, "Back 9") : null}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#0B3D2E]/20 bg-[#0B3D2E]/5 px-4 py-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#0B3D2E]">Self Total</p>
                <p className="mt-1 text-xl font-black text-[#0B3D2E]">{reviewSelfTotals.total}</p>
                <p className="text-xs font-semibold text-[#51635C]">{reviewSelfTotals.toPar}</p>
              </div>
              <div className="rounded-2xl border border-[#0B3D2E]/20 bg-[#0B3D2E]/5 px-4 py-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#0B3D2E]">Marker Total</p>
                <p className="mt-1 text-xl font-black text-[#0B3D2E]">{reviewMarkerTotal}</p>
              </div>
            </div>
          </div>

          {hasAssignedStatisticPackage ? (
            dynamicStatisticSummaries.length > 0 ? (
              <div className="mt-4 rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">My Round Statistics</p>
                    <h3 className="mt-1 text-lg font-black tracking-[-0.02em] text-[#0B3D2E]">Assigned Statistics</h3>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${statisticsComplete ? "border border-[#77B98E] bg-[#ECF8EF] text-[#146233]" : "border border-amber-400 bg-amber-50 text-amber-800"}`}>
                    {statisticsComplete ? "Complete" : "Incomplete"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {dynamicStatisticSummaries.map((summary) => (
                    <div key={summary.definitionVersionId} className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#51635C]">{summary.name}</p>
                      <p className="mt-1 text-lg font-black text-[#0B3D2E]">{summary.displayValue}</p>
                      <p className="mt-1 text-[10px] font-semibold text-[#51635C]">{summary.recordedCount}/{summary.applicableCount} holes recorded</p>
                    </div>
                  ))}
                </div>
                {!statisticsComplete ? (
                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-[#0B3D2E]">
                    <input type="checkbox" checked={submitWithoutStatistics} onChange={(event) => setSubmitWithoutStatistics(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0B3D2E]" />
                    <span>Continue and finalize round without recording statistics</span>
                  </label>
                ) : null}
              </div>
            ) : null
          ) : (
          <div className="mt-4 rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
                  My Round Statistics
                </p>
                <h3 className="mt-1 text-lg font-black tracking-[-0.02em] text-[#0B3D2E]">
                  Round Statistics
                </h3>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${
                  statisticsComplete
                    ? "border border-[#77B98E] bg-[#ECF8EF] text-[#146233]"
                    : "border border-amber-400 bg-amber-50 text-amber-800"
                }`}
              >
                {statisticsComplete ? "Complete" : "Incomplete"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#51635C]">Fairways</p>
                <p className="mt-1 text-lg font-black text-[#0B3D2E]">
                  {reviewComparison?.fairwaysHit ?? 0}/{reviewComparison?.fairwaysAvailable ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#51635C]">GIR</p>
                <p className="mt-1 text-lg font-black text-[#0B3D2E]">
                  {reviewComparison?.greensInRegulation ?? 0}/{reviewComparison?.greensAvailable ?? scorecard.holes.length}
                </p>
              </div>
              <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#51635C]">Putts</p>
                <p className="mt-1 text-lg font-black text-[#0B3D2E]">{reviewComparison?.totalPutts ?? 0}</p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-[#E8DCC8]">
              <table className="w-full min-w-[520px] text-[11px]">
                <thead>
                  <tr className="border-b border-[#E8DCC8] bg-[#FCFAF5]">
                    {["Hole", "Par", "Fairway Hit", "GIR", "Putts", "Status"].map((heading) => (
                      <th
                        key={heading}
                        className="px-2 py-2 text-center font-black uppercase tracking-[0.12em] text-[#51635C]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scorecard.holes.map((hole, index) => {
                    const statistic = reviewStatistics[index];
                    const complete =
                      (hole.par === 3 || statistic.fairwayHit !== null) &&
                      statistic.greenInRegulation !== null &&
                      statistic.putts !== null;
                    return (
                      <tr key={hole.holeNumber} className="border-b border-[#E8DCC8] last:border-0">
                        <td className="px-2 py-2 text-center font-black text-[#0B3D2E]">{hole.holeNumber}</td>
                        <td className="px-2 py-2 text-center text-[#51635C]">{hole.par}</td>
                        <td className="px-2 py-2 text-center text-[#51635C]">
                          {hole.par === 3 ? "N/A" : formatBooleanStatistic(statistic.fairwayHit)}
                        </td>
                        <td className="px-2 py-2 text-center text-[#51635C]">
                          {formatBooleanStatistic(statistic.greenInRegulation)}
                        </td>
                        <td className="px-2 py-2 text-center text-[#51635C]">{statistic.putts ?? "—"}</td>
                        <td className={`px-2 py-2 text-center font-black ${complete ? "text-green-700" : "text-amber-800"}`}>
                          {complete ? "Complete" : "Incomplete"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!statisticsComplete ? (
              <div role="alert" className="mt-4 rounded-2xl border border-amber-400 bg-amber-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-800">
                  Statistics Incomplete
                </p>
                <p className="mt-2 text-xs leading-5 text-amber-900">
                  Complete the required statistics below or explicitly continue without recording them.
                </p>
                <ul className="mt-2 space-y-1">
                  {missingStatisticDetails.map((detail) => (
                    <li key={detail.holeNumber} className="text-xs font-semibold text-amber-900">
                      Hole {detail.holeNumber}: {detail.fields.join(", ")}
                    </li>
                  ))}
                </ul>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-white/70 p-3 text-xs font-semibold leading-5 text-[#0B3D2E]">
                  <input
                    type="checkbox"
                    checked={submitWithoutStatistics}
                    onChange={(event) => setSubmitWithoutStatistics(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#0B3D2E]"
                  />
                  <span>Continue and finalize round without recording statistics</span>
                </label>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-[#77B98E] bg-[#ECF8EF] p-3 text-xs font-semibold text-[#146233]">
                All required round statistics are complete.
              </p>
            )}
          </div>
          )}

          {!showConfirm ? (
            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setView("scoring")}
                className="min-h-12 w-full rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#0B3D2E] transition duration-300"
              >
                Edit Scores
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={!canSubmitVerification}
                className={`min-h-12 w-full rounded-full px-6 py-4 text-sm font-black uppercase tracking-[0.2em] transition duration-300 ${
                  !canSubmitVerification
                    ? "cursor-not-allowed border border-[#E8DCC8] bg-[#F6F1E6] text-[#B8892D] opacity-50"
                    : "bg-[#B8892D] text-[#0B3D2E] shadow-lg shadow-[#B8892D]/20 active:translate-y-0.5"
                }`}
              >
                {isTournamentFinalized
                  ? "Tournament Finalized"
                  : !hasCompleteComparison
                    ? "Complete Score Comparison to Submit"
                   : hasDiscrepancies
                      ? "Fix Score Mismatches to Submit"
                      : !statisticsRequirementSatisfied
                        ? "Complete Statistics or Opt Out to Submit"
                      : "Submit Verification"}
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-[28px] border border-[#B8892D]/40 bg-[#B8892D]/8 p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Confirm Submission</p>
              <p className="mt-3 text-sm leading-6 text-[#0B3D2E]">
                All scores have been verified for {scorecard.playerName || "Player"}.
                {submitWithoutStatistics
                  ? " You chose to continue without recording every required statistic."
                  : " Required statistics are complete."}{" "}
                Please confirm to submit.
              </p>
              {saveError ? (
                <p className="mt-3 text-sm font-semibold text-red-700">{saveError}</p>
              ) : null}
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={isTournamentFinalized}
                  className="min-h-12 w-full rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirm Submit
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="min-h-12 w-full rounded-full border border-[#E8DCC8] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#51635C] transition duration-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      {sharedHeader}

      <section className="mx-auto max-w-lg px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-5 landscape:max-w-2xl">
        {isTournamentFinalized ? (
          <div className="mb-4 rounded-[24px] border border-[#77B98E] bg-[#ECF8EF] p-4 text-sm font-semibold text-[#146233]">
            This tournament is finalized. Score entry is read-only for historical viewing.
          </div>
        ) : null}
        <div className="rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
            Tournament
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0B3D2E]">
            {scorecard.tournamentName}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Player</p>
              <p className="mt-2 text-sm font-black text-[#0B3D2E]">{scorecard.playerName}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Team</p>
              <p className="mt-2 text-sm font-black text-[#0B3D2E]">{scorecard.team}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Current Total</p>
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{totals.total}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">To Par</p>
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{totals.toPar}</p>
            </div>
          </div>

          <div className="mt-3 rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">
            Through {totals.playedHoles}/{scorecard.holes.length}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8DCC8]" aria-label={`Hole progress ${currentHoleIndex + 1} of ${scorecard.holes.length}`}>
            <div className="h-full rounded-full bg-[#B8892D] transition-[width] duration-300" style={{ width: `${((currentHoleIndex + 1) / scorecard.holes.length) * 100}%` }} />
          </div>
        </div>

        <div className="mt-5 rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
              Hole {getDisplayHoleNumber(currentHole)}
            </p>
            {isHoleSaved ? (
              <span className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
                Saved
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Hole</p>
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{getDisplayHoleNumber(currentHole)}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Par</p>
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{currentHole.par}</p>
            </div>
            <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Yards</p>
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{currentHole.yardage}</p>
            </div>
          </div>

          {!scoresLoaded ? (
            <p className="mt-4 rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-sm font-semibold text-[#51635C]">
              Loading saved scores...
            </p>
          ) : null}
          {scoreLoadError ? (
            <p role="alert" className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {scoreLoadError}
            </p>
          ) : null}

          <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
            {scorecard.playerName}'s Score
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="12"
              value={scores[currentHoleIndex] === 0 ? "" : scores[currentHoleIndex]}
              onChange={(event) => updateScore(event.target.value)}
              disabled={!scoreControlsReady || isTournamentFinalized || submissionComplete || isSavingHole}
              placeholder="Enter score"
              className="mt-2 w-full rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-4 text-center text-2xl font-black tracking-[-0.02em] text-[#0B3D2E] outline-none"
            />
          </label>

          {scorecard.markerPlayerName ? (
            <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
              {scorecard.markerPlayerName}'s Score
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="12"
                value={markerScores[currentHoleIndex] === 0 ? "" : markerScores[currentHoleIndex]}
                onChange={(event) => updateMarkerScore(event.target.value)}
                disabled={!scoreControlsReady || isTournamentFinalized || submissionComplete || isSavingHole}
                placeholder="Enter score"
                className="mt-2 w-full rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-4 text-center text-2xl font-black tracking-[-0.02em] text-[#0B3D2E] outline-none"
              />
            </label>
          ) : null}

          {dynamicStatistics?.assignment ? (
            <div className="mt-5 border-t border-[#E8DCC8] pt-4">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                Hole Statistics
              </p>
              {dynamicStatistics.items
                .filter((item) =>
                  statisticAppliesToHole(item, currentHole.par, dynamicHoleValues[currentHoleIndex] ?? {})
                )
                .map((item) => {
                  const value = dynamicHoleValues[currentHoleIndex]?.[item.key] ?? null;
                  const label = `${item.name}${item.isRequired ? " *" : " (Optional)"}`;
                  const disabled = !scoreControlsReady || isTournamentFinalized || isSavingHole;
                  if (item.inputType === "checkbox") {
                    return (
                      <label
                        key={item.definitionVersionId}
                        className="mt-4 flex items-center gap-3 rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-sm font-bold text-[#0B3D2E]"
                      >
                        <input
                          type="checkbox"
                          aria-label={item.name}
                          checked={value === true}
                          onChange={(event) => updateDynamicStatistic(item, event.target.checked)}
                          disabled={disabled}
                          className="h-5 w-5 accent-[#0B3D2E]"
                        />
                        <span>{label}</span>
                      </label>
                    );
                  }
                  if (item.inputType === "yes_no") {
                    return (
                      <fieldset key={item.definitionVersionId} className="mt-4" aria-label={item.name}>
                        <legend className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                          {label}
                        </legend>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {[true, false].map((option) => (
                            <button
                              key={String(option)}
                              type="button"
                              aria-pressed={value === option}
                              onClick={() => updateDynamicStatistic(item, value === option ? null : option)}
                              disabled={disabled}
                              className={statButtonClass(value === option)}
                            >
                              {option ? "Yes" : "No"}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    );
                  }
                   const tapOptions = getMobileStatisticTapOptions(item);
                   if (tapOptions) {
                     return (
                       <fieldset key={item.definitionVersionId} className="mt-4" aria-label={item.name}>
                         <legend className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                           {label}
                         </legend>
                         <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-6">
                           {tapOptions.map((option) => (
                             <button
                               key={String(option)}
                               type="button"
                               aria-pressed={value === option}
                               onClick={() => updateDynamicStatistic(item, value === option ? null : option)}
                               disabled={disabled}
                               className={statButtonClass(value === option)}
                             >
                               {option}
                             </button>
                           ))}
                         </div>
                       </fieldset>
                     );
                   }
                   if (item.inputType === "option_list") {
                    return (
                      <label
                        key={item.definitionVersionId}
                        className="mt-4 block text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]"
                      >
                        {label}
                        <select
                          aria-label={item.name}
                          value={typeof value === "string" ? value : ""}
                          onChange={(event) => updateDynamicStatistic(item, event.target.value || null)}
                          disabled={disabled}
                          className="mt-2 w-full rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-sm font-bold normal-case tracking-normal text-[#0B3D2E]"
                        >
                          <option value="">Select…</option>
                          {(item.configuration.options ?? []).map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  return (
                    <label
                      key={item.definitionVersionId}
                      className="mt-4 block text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]"
                    >
                      {label}
                      <input
                        type="number"
                        aria-label={item.name}
                        min={item.configuration.minimum}
                        max={item.configuration.maximum}
                        value={typeof value === "number" ? value : ""}
                        onChange={(event) =>
                          updateDynamicStatistic(item, event.target.value === "" ? null : Number(event.target.value))
                        }
                        disabled={disabled}
                        className="mt-2 w-full rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-center text-lg font-black tracking-normal text-[#0B3D2E]"
                      />
                    </label>
                  );
                })}
              <p className="mt-3 text-xs font-semibold text-[#51635C]">* Required for this hole</p>
            </div>
          ) : (
          <div className="mt-5 border-t border-[#E8DCC8] pt-4">
            {currentHole.par !== 3 ? (
              <fieldset className="mt-0" aria-label="Fairway Hit">
                <legend className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                  Fairway Hit
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[true, false].map((value) => (
                    <button
                      key={String(value)}
                      type="button"
                      aria-pressed={currentStatCapture.fairwayHit === value}
                      onClick={() => toggleBooleanStat("fairwayHit", value)}
                      disabled={!scoreControlsReady || isTournamentFinalized || isSavingHole}
                      className={statButtonClass(currentStatCapture.fairwayHit === value)}
                    >
                      {value ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <fieldset className="mt-4" aria-label="Green in Regulation">
              <legend className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                Green in Regulation
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[true, false].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={currentStatCapture.greenInRegulation === value}
                    onClick={() => toggleBooleanStat("greenInRegulation", value)}
                    disabled={!scoreControlsReady || isTournamentFinalized || isSavingHole}
                    className={statButtonClass(currentStatCapture.greenInRegulation === value)}
                  >
                    {value ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-4" aria-label="Putts">
              <legend className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                Putts
              </legend>
              <div className="mt-2 grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={currentStatCapture.putts === value}
                    onClick={() => toggleNumberStat("putts", value)}
                    disabled={!scoreControlsReady || isTournamentFinalized || isSavingHole}
                    className={statButtonClass(currentStatCapture.putts === value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>

          </div>
          )}

          <button
            type="button"
            onClick={handleSaveHole}
            disabled={!scoreControlsReady || isTournamentFinalized || isSavingHole || scores[currentHoleIndex] === 0}
            className="mt-5 min-h-12 w-full rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Hole
          </button>
          {saveError ? (
            <p role="alert" className="mt-3 rounded-2xl border border-red-300 bg-red-50 p-3 text-center text-sm font-semibold text-red-700">{saveError}</p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handlePreviousHole}
              disabled={!scoreControlsReady || isSavingHole || currentHoleIndex === 0}
              className="min-h-12 rounded-full border border-[#B8892D] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#0B3D2E] transition duration-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous Hole
            </button>
            <button
              type="button"
              onClick={handleNextHole}
              disabled={!scoreControlsReady || isSavingHole || currentHoleIndex === scorecard.holes.length - 1}
              className="min-h-12 rounded-full border border-[#B8892D] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#0B3D2E] transition duration-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next Hole
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReviewRound}
          disabled={
            !scoreControlsReady ||
            isTournamentFinalized ||
            isSavingHole ||
            isReviewSynchronizing ||
            !allHolesScored
          }
          className="mt-5 min-h-12 w-full rounded-full bg-[#B8892D] px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-[#0B3D2E] shadow-lg shadow-[#B8892D]/20 transition duration-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isTournamentFinalized
            ? "Tournament Finalized"
            : isReviewSynchronizing
              ? "Synchronizing Review..."
              : reviewSyncError
                ? "Retry Review Synchronization"
                : "Review & Submit Round"}
        </button>

        {isReviewSynchronizing ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-3 rounded-2xl border border-[#B8892D]/40 bg-[#FCFAF5] p-3 text-center text-sm font-semibold text-[#51635C]"
          >
            Loading the latest self scores, marker scores, and statistics...
          </div>
        ) : null}
        {reviewSyncError ? (
          <div
            role="alert"
            className="mt-3 rounded-2xl border border-red-300 bg-red-50 p-3 text-center text-sm font-semibold text-red-700"
          >
            {reviewSyncError}
          </div>
        ) : null}
        {!allHolesScored ? (
          <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#51635C]">
            Save all {scorecard.holes.length} holes to submit
          </p>
        ) : null}
      </section>
    </main>
  );
}

export default function PlayerScorecardPage() {
  const params = useParams<{ playerId: string }>();
  const searchParams = useSearchParams();
  const playerId = Array.isArray(params?.playerId) ? params.playerId[0] : params?.playerId ?? "";
  if (searchParams.get("qualifyingPolicy") === "designated_scorer") {
    return (
      <DesignatedQualifyingScorecard
        playerId={playerId}
        roundNumber={Number(searchParams.get("round")) || 1}
        shareToken={searchParams.get("shareToken") ?? ""}
      />
    );
  }
  return <ReciprocalPlayerScorecardPage />;
}
