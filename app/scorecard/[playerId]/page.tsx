"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  loadSharedTournamentIdFromStorage,
  loadTournamentStateFromStorage,
  loadTournamentsFromStorage,
  loadTournamentStorageEnvelope,
  mergeTournamentScoreSubmission,
} from "../../lib/tournamentStorage";
import { loadComparisonScores, loadPlayerScores, saveHole, saveRound } from "../../lib/services/scoreService";
import { loadSharedTournamentScorecardState } from "../../lib/services/tournamentService";
import { getTournamentFinalizationRecord } from "../../lib/services/tournamentFinalizationService";

type Hole = {
  holeNumber: number;
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
};

type PairingGroup = {
  groupNumber: number;
  teeTime: string;
  startingHole: string;
  players: Array<{
    playerId?: string;
    playerName: string;
    teamName: string;
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

const hasAnyHoleScore = (holeScores: number[] | null | undefined) =>
  Array.isArray(holeScores) && holeScores.some((score) => Number(score) > 0);

const getScoredHoleNumbers = (holes: Hole[], ...scoreSets: number[][]) =>
  holes
    .filter((_, index) => scoreSets.some((holeScores) => (holeScores[index] ?? 0) > 0))
    .map((hole) => hole.holeNumber);

const getFirstUnscoredHoleIndex = (holeCount: number, ...scoreSets: number[][]) => {
  for (let i = 0; i < holeCount; i++) {
    if (scoreSets.some((holeScores) => (holeScores[i] ?? 0) === 0)) {
      return i;
    }
  }

  return -1;
};

export default function PlayerScorecardPage() {
  const params = useParams<{ playerId: string }>();
  const searchParams = useSearchParams();
  const routePlayerId = Array.isArray(params?.playerId) ? params.playerId[0] : params?.playerId;
  const requestedTournamentId = searchParams.get("tournamentId") ?? "";
  const requestedPairingId = searchParams.get("pairing") ?? "";
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
        if (!requestedTournamentId && !requestedPairingId) {
          finishResolution(null);
          return;
        }

        if (!requestedTournamentId || !requestedPairingId) {
          finishResolution({ error: "Missing tournament or pairing information in this QR code." });
          return;
        }

        const localTournament = loadTournamentsFromStorage().find((item) => item.id === requestedTournamentId);
        const localTournamentState = loadTournamentStateFromStorage<PersistedTournamentState>(requestedTournamentId);
        const storedEnvelope = loadTournamentStorageEnvelope(requestedTournamentId);
        const sharedState =
          localTournament && localTournamentState && storedEnvelope
            ? null
            : await withTimeout(
                loadSharedTournamentScorecardState(requestedTournamentId).catch((error) => {
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

          const matchedTournamentPlayer = tournamentPlayers.find(
            (item) => getTournamentPlayerName(item) === player.playerName && getTournamentPlayerTeam(item) === player.teamName
          );
          if (matchedTournamentPlayer) {
            candidates.add(String(matchedTournamentPlayer.id));
          }

          const matchedScorecard = scorecardRows.find(
            (row) => row.playerName === player.playerName && row.team === player.teamName
          );
          if (matchedScorecard) {
            candidates.add(String(matchedScorecard.id));
          }

          return Array.from(candidates);
        };

        const routeMatchedTournamentPlayer = tournamentPlayers.find(
          (player) => String(player.id) === String(routePlayerId)
        );
        const routeMatchedScorecard = scorecardRows.find((row) => String(row.id) === String(routePlayerId));
        const routeMatchedPairingPlayer = pairing.players.find((player) => {
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
          routePlayerId && routePlayerId.startsWith("group-") ? pairing.players[0] : routeMatchedPairingPlayer;

        const selectedIndex = selectedPlayer ? pairing.players.indexOf(selectedPlayer) : -1;
        const markerPlayer =
          selectedIndex >= 0 ? pairing.players[(selectedIndex + 1) % pairing.players.length] : undefined;
        const selectedPlayerIds = selectedPlayer ? getIdCandidates(selectedPlayer) : [];
        const markerPlayerIds = markerPlayer ? getIdCandidates(markerPlayer) : [];
        const selectedPlayerId =
          selectedPlayer?.playerId ||
          (routePlayerId && !routePlayerId.startsWith("group-") ? routePlayerId : "") ||
          selectedPlayerIds[0] ||
          "";
        const markerPlayerId =
          markerPlayer?.playerId ||
          markerPlayerIds[0];

        if (!selectedPlayer) {
          finishResolution({ error: "Invalid scoring link. Please request a new mobile scoring link." });
          return;
        }

        const holeCount = Math.max(1, Math.min(18, Number(tournamentState.scorecards?.roundSetup?.numberOfHoles) || 18));

        finishResolution({
          playerId: String(selectedPlayerId),
          tournamentName: tournament.name,
          playerName: selectedPlayer.playerName,
          team: selectedPlayer.teamName,
          round: tournamentState.scorecards?.roundSetup?.roundNumber || "1",
          holes: defaultHoles.slice(0, holeCount),
          markerPlayerId,
          markerPlayerName: markerPlayer?.playerName,
          markerTeam: markerPlayer?.teamName,
          playerScoreIds: selectedPlayerIds,
          markerScoreIds: markerPlayerIds,
        });
      } catch {
        finishResolution({ error: "Invalid scoring link. Please request a new mobile scoring link." });
      }
    };

    void resolveScorecard();

    return () => {
      isCancelled = true;
    };
  }, [requestedTournamentId, requestedPairingId, routePlayerId]);

  // Extract resolved player IDs for reliable hydration
  const resolvedPlayerIds = useMemo(() => {
    if (!qrResolvedScorecard || "error" in qrResolvedScorecard) {
      return null;
    }
    return {
      selectedPlayerId: qrResolvedScorecard.playerId,
      markerPlayerId: qrResolvedScorecard.markerPlayerId,
      selectedPlayerIds: qrResolvedScorecard.playerScoreIds?.length
        ? qrResolvedScorecard.playerScoreIds
        : [qrResolvedScorecard.playerId],
      markerPlayerIds: qrResolvedScorecard.markerScoreIds?.length
        ? qrResolvedScorecard.markerScoreIds
        : qrResolvedScorecard.markerPlayerId
          ? [qrResolvedScorecard.markerPlayerId]
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
  const sharedScoreTournamentId = linkedSharedTournamentId || requestedTournamentId;

  const [scores, setScores] = useState<number[]>(Array.from({ length: scorecard.holes.length }, () => 0));
  const [markerScores, setMarkerScores] = useState<number[]>(Array.from({ length: scorecard.holes.length }, () => 0));
  const [markedPlayerSelfScores, setMarkedPlayerSelfScores] = useState<number[]>(Array.from({ length: scorecard.holes.length }, () => 0));
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [savedHoles, setSavedHoles] = useState<number[]>([]);
  const [view, setView] = useState<"scoring" | "review" | "submitted">("scoring");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [scoresLoaded, setScoresLoaded] = useState(false);
  const [, setScoreDiagnostics] = useState<ScoreDiagnostics>(initialScoreDiagnostics);
  const finalizationVerifiedAtRef = useRef(0);

  const refreshCurrentFinalizedStateForSave = async () => {
    if (!requestedTournamentId) {
      finalizationVerifiedAtRef.current = Date.now();
      return false;
    }

    const localEnvelope = loadTournamentStorageEnvelope(requestedTournamentId);
    if (getTournamentFinalizationRecord(localEnvelope)) {
      finalizationVerifiedAtRef.current = Date.now();
      setIsTournamentFinalized(true);
      setSaveError(finalizedReadOnlyMessage);
      return true;
    }

    const shouldCheckSharedFinalization = Boolean(linkedSharedTournamentId || uuidPattern.test(requestedTournamentId));
    if (!shouldCheckSharedFinalization || !sharedScoreTournamentId) {
      finalizationVerifiedAtRef.current = Date.now();
      return false;
    }

    const sharedState = await withTimeout(
      loadSharedTournamentScorecardState(sharedScoreTournamentId).catch((error) => {
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
      if (scoresLoaded || !requestedTournamentId || !resolvedPlayerIds) {
        return;
      }

      const roundNumber = Number(resolvedPlayerIds.roundId.replace("round-", "")) || 1;
      const holeCount = scorecard.holes.length;
      let loadedSelfScores: number[] | null = null;
      let loadedMarkerScores: number[] | null = null;
      let loadedMarkedPlayerSelfScores: number[] | null = null;
      let localStorageLoadedCount = 0;
      let supabaseLoadedCount = 0;
      const envelope = loadTournamentStorageEnvelope(requestedTournamentId);
      if (envelope) {
        const scorecardRows = envelope.uiState?.scorecards?.scorecardRows || [];
        const selfScorecardRow = scorecardRows.find(
          (row) => resolvedPlayerIds.selectedPlayerIds.includes(String(row.id)) && hasAnyHoleScore(row.scores)
        );
        const markerScorecardRow = scorecardRows.find(
          (row) => resolvedPlayerIds.markerPlayerIds.includes(String(row.id)) && hasAnyHoleScore(row.scores)
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
          (s) => resolvedPlayerIds.markerPlayerIds.includes(String(s.playerId)) &&
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

        if (resolvedPlayerIds.markerPlayerId) {
          const markedPlayerSelf = envelope.tournament.scores.find(
            (s) => resolvedPlayerIds.markerPlayerIds.includes(String(s.playerId)) &&
                   s.roundId === resolvedPlayerIds.roundId &&
                   s.enteredBy === "self"
          );
          if (hasAnyHoleScore(markedPlayerSelf?.holeScores)) {
            localStorageLoadedCount += 1;
          }
          loadedMarkedPlayerSelfScores = hasAnyHoleScore(markedPlayerSelf?.holeScores)
            ? normalizeHoleScores(markedPlayerSelf?.holeScores, holeCount)
            : null;
        }
      }

      const loadRemoteScore = async (playerIds: string[], enteredByPlayerId: string) => {
        for (const playerId of playerIds) {
          const remoteScore = await loadPlayerScores({
            tournamentId: sharedScoreTournamentId,
            roundNumber,
            playerId,
            enteredByPlayerId,
          });

          if (remoteScore?.hole_scores?.length) {
            return normalizeHoleScores(remoteScore.hole_scores, holeCount);
          }
        }

        return null;
      };

      try {
        const remoteSelfScores = await loadRemoteScore(
          resolvedPlayerIds.selectedPlayerIds,
          resolvedPlayerIds.selectedPlayerId
        );
        if (hasAnyHoleScore(remoteSelfScores)) {
          supabaseLoadedCount += 1;
          loadedSelfScores = remoteSelfScores;
        }

        if (resolvedPlayerIds.markerPlayerId) {
          const remoteMarkerScores = await loadRemoteScore(
            resolvedPlayerIds.markerPlayerIds,
            resolvedPlayerIds.selectedPlayerId
          );
          if (hasAnyHoleScore(remoteMarkerScores)) {
            supabaseLoadedCount += 1;
            loadedMarkerScores = remoteMarkerScores;
          }

          const remoteMarkedPlayerSelfScores = await loadRemoteScore(
            resolvedPlayerIds.markerPlayerIds,
            resolvedPlayerIds.markerPlayerId
          );
          if (hasAnyHoleScore(remoteMarkedPlayerSelfScores)) {
            supabaseLoadedCount += 1;
            loadedMarkedPlayerSelfScores = remoteMarkedPlayerSelfScores;
          }
        }

        const sharedScores = await loadComparisonScores({ tournamentId: sharedScoreTournamentId, roundNumber });
        supabaseLoadedCount = Math.max(
          supabaseLoadedCount,
          sharedScores.filter((entry) => hasAnyHoleScore(entry.hole_scores)).length
        );
        const getSharedScore = (playerIds: string[], enteredByPlayerIds?: string[], preferMarkerEntry = false) => {
          const matchingScores = sharedScores
            .filter((entry) => playerIds.includes(String(entry.player_id)) && hasAnyHoleScore(entry.hole_scores))
            .filter((entry) => !enteredByPlayerIds || enteredByPlayerIds.includes(String(entry.entered_by_player_id)));
          const selectedEntry = preferMarkerEntry
            ? matchingScores.find((entry) => !playerIds.includes(String(entry.entered_by_player_id))) ?? matchingScores[0]
            : matchingScores[0];

          return selectedEntry ? normalizeHoleScores(selectedEntry.hole_scores, holeCount) : null;
        };

        if (!hasAnyHoleScore(loadedSelfScores)) {
          const sharedScoreboardSelfScores = getSharedScore(resolvedPlayerIds.selectedPlayerIds, undefined, true);
          if (hasAnyHoleScore(sharedScoreboardSelfScores)) {
            loadedSelfScores = sharedScoreboardSelfScores;
          }
        }

        if (!hasAnyHoleScore(loadedMarkerScores)) {
          const sharedMarkerScores = getSharedScore(
            resolvedPlayerIds.markerPlayerIds,
            [resolvedPlayerIds.selectedPlayerId]
          );
          if (hasAnyHoleScore(sharedMarkerScores)) {
            loadedMarkerScores = sharedMarkerScores;
          }
        }

        if (!hasAnyHoleScore(loadedMarkedPlayerSelfScores)) {
          const sharedMarkedPlayerSelfScores = getSharedScore(
            resolvedPlayerIds.markerPlayerIds,
            resolvedPlayerIds.markerPlayerId ? [resolvedPlayerIds.markerPlayerId] : []
          );
          if (hasAnyHoleScore(sharedMarkedPlayerSelfScores)) {
            loadedMarkedPlayerSelfScores = sharedMarkedPlayerSelfScores;
          }
        }
      } catch (error) {
        console.warn("[ScoreService] Unable to load shared score entries.", error);
        if (isDevelopment) {
          setScoreDiagnostics((current) => ({
            ...current,
            lastHydrationError: getErrorMessage(error),
          }));
        }
      } finally {
        if (!isCancelled) {
          const nextScores = loadedSelfScores ?? normalizeHoleScores(undefined, holeCount);
          const nextMarkerScores = loadedMarkerScores ?? normalizeHoleScores(undefined, holeCount);

          setScores(nextScores);
          setMarkerScores(nextMarkerScores);
          if (loadedMarkedPlayerSelfScores) {
            setMarkedPlayerSelfScores(loadedMarkedPlayerSelfScores);
          }
          setSavedHoles(getScoredHoleNumbers(scorecard.holes, nextScores, nextMarkerScores));

          const firstIncompleteIndex = getFirstUnscoredHoleIndex(holeCount, nextScores);
          if (firstIncompleteIndex >= 0) {
            setCurrentHoleIndex(firstIncompleteIndex);
          } else {
            setView("review");
          }

          setScoresLoaded(true);
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

  // Discrepancy detection: compare marked player's self scores vs marker scores
  const discrepancies = useMemo(() => {
    return scorecard.holes
      .map((hole, index) => {
        const self = markedPlayerSelfScores[index];
        const marker = markerScores[index];
        if (self > 0 && marker > 0 && self !== marker) {
          const diff = Math.abs(self - marker);
          return { holeNumber: hole.holeNumber, self, marker, diff };
        }
        return null;
      })
      .filter((d) => d !== null) as Array<{ holeNumber: number; self: number; marker: number; diff: number }>;
  }, [markedPlayerSelfScores, markerScores, scorecard.holes]);

  const hasDiscrepancies = discrepancies.length > 0;

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
  const markedPlayerTotals = useMemo(() => {
    const playedHoles = markedPlayerSelfScores.filter((score) => score > 0).length;
    const total = markedPlayerSelfScores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0);
    const parPlayed = scorecard.holes.slice(0, playedHoles).reduce((sum, hole) => sum + hole.par, 0);

    return {
      playedHoles,
      total,
      toPar: playedHoles > 0 ? formatToPar(total - parPlayed) : "--",
    };
  }, [scorecard.holes, markedPlayerSelfScores]);

  // Front/back 9 totals for marked player
  const markedPlayerFront9Total = markedPlayerSelfScores.slice(0, 9).reduce((sum, s) => sum + (s > 0 ? s : 0), 0);
  const markedPlayerBack9Total = markedPlayerSelfScores.slice(9, scorecard.holes.length).reduce((sum, s) => sum + (s > 0 ? s : 0), 0);

  const isQrScorecardRequest = Boolean(requestedTournamentId && requestedPairingId);

  if (isQrScorecardRequest && !hasResolvedQrScorecard) {
    return (
      <main className="min-h-screen bg-[#F6F1E6] px-4 py-8 text-[#0B3D2E]">
        <div className="mx-auto max-w-md rounded-[28px] border border-[#E8DCC8] bg-white/90 p-6 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-xs font-black tracking-[0.25em] text-[#F6F1E6]">
              HQ
            </div>
            <div>
              <h1 className="text-sm font-black tracking-[-0.02em]">Clubhouse HQ</h1>
              <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">
                Mobile Scorecard
              </p>
            </div>
          </div>

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
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#B8892D]/30 bg-[#0B3D2E] text-xs font-black tracking-[0.25em] text-[#F6F1E6]">
              HQ
            </div>
            <div>
              <h1 className="text-sm font-black tracking-[-0.02em]">Clubhouse HQ</h1>
              <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-[#B8892D]">
                Mobile Scorecard
              </p>
            </div>
          </div>

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

  const updateScore = (value: string) => {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

    setScores((current) =>
      current.map((score, index) => (index === currentHoleIndex ? safeValue : score))
    );
  };

  const updateMarkerScore = (value: string) => {
    const parsed = Number(value);
    const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

    setMarkerScores((current) =>
      current.map((score, index) => (index === currentHoleIndex ? safeValue : score))
    );
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
    scope: "hole" | "round"
  ) => {
    const wasJustVerified = Date.now() - finalizationVerifiedAtRef.current < 1000;
    if (isTournamentFinalized || (!wasJustVerified && (await refreshCurrentFinalizedStateForSave()))) {
      return;
    }

    const serviceSave = scope === "round" ? saveRound : saveHole;

    if (isDevelopment) {
      setScoreDiagnostics((current) => ({
        ...current,
        supabaseSaveAttempted: "yes",
        supabaseSaveResult: "pending",
        supabaseSaveTournamentId: sharedScoreTournamentId,
        lastSaveError: "",
      }));
    }

    await serviceSave({
      tournamentId: sharedScoreTournamentId,
      roundNumber,
      playerId,
      enteredByPlayerId,
      holeScores: [...holeScores],
      total: holeScores.reduce((sum, score) => sum + (Number.isFinite(score) ? score : 0), 0),
      entryStatus: getEntryStatus(holeScores),
      submittedAt: null,
    })
      .then((result) => {
        if (isDevelopment) {
          setScoreDiagnostics((current) => ({
            ...current,
            supabaseSaveResult: `ok ${result.id}`,
          }));
        }

        return result;
      })
      .catch((error) => {
      console.error("[ScoreService] Unable to save score entry.", error);
      if (isDevelopment) {
        setScoreDiagnostics((current) => ({
          ...current,
          supabaseSaveResult: "failed",
          lastSaveError: getErrorMessage(error),
        }));
      }
    });
  };

  const handleSaveHole = async () => {
    if (isTournamentFinalized || (await refreshCurrentFinalizedStateForSave())) {
      setSaveError(finalizedReadOnlyMessage);
      return;
    }

    if (scores[currentHoleIndex] === 0) return;

    // Validate playerId before saving
    if (!isValidPlayerId(scorecard.playerId)) {
      setSaveError("Unable to save score. Player information is invalid. Please request a new scoring link.");
      return;
    }

    setSavedHoles((current) => {
      if (current.includes(currentHole.holeNumber)) return current;
      return [...current, currentHole.holeNumber];
    });
    setSaveError("");

    if (requestedTournamentId) {
      const roundNumber = String(Number(scorecard.round) || 1);
      const roundId = `round-${roundNumber}`;
      const parsedRoundNumber = Number(roundNumber);
      const nextScores = normalizeHoleScores(scores, scorecard.holes.length);
      const nextMarkerScores = normalizeHoleScores(markerScores, scorecard.holes.length);
      const stableSelfPlayerId = String(scorecard.playerId);
      const stableMarkerPlayerId = isValidPlayerId(scorecard.markerPlayerId) ? String(scorecard.markerPlayerId) : "";
      const localSelfPlayerId = getLocalStoragePlayerId(resolvedPlayerIds?.selectedPlayerIds ?? [stableSelfPlayerId], stableSelfPlayerId);
      const localMarkerPlayerId = stableMarkerPlayerId
        ? getLocalStoragePlayerId(resolvedPlayerIds?.markerPlayerIds ?? [stableMarkerPlayerId], stableMarkerPlayerId)
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
      const selfScoreSaved = mergeTournamentScoreSubmission(requestedTournamentId, localSelfPlayerId, roundId, nextScores, "self");
      let markerScoreSaved = false;
      void saveScoreThroughService(stableSelfPlayerId, stableSelfPlayerId, parsedRoundNumber, nextScores, "hole");
       
      // Save marker score only if markerPlayerId is valid
      if (stableMarkerPlayerId && hasAnyHoleScore(nextMarkerScores)) {
        markerScoreSaved = mergeTournamentScoreSubmission(requestedTournamentId, localMarkerPlayerId, roundId, nextMarkerScores, "marker");
        void saveScoreThroughService(stableMarkerPlayerId, stableSelfPlayerId, parsedRoundNumber, nextMarkerScores, "hole");
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

    if (currentHoleIndex < scorecard.holes.length - 1) {
      setCurrentHoleIndex((current) => current + 1);
    }
  };

  const handlePreviousHole = () => {
    setCurrentHoleIndex((current) => Math.max(current - 1, 0));
  };

  const handleNextHole = () => {
    setCurrentHoleIndex((current) => Math.min(current + 1, scorecard.holes.length - 1));
  };

  const handleReviewRound = () => {
    setView("review");
    setShowConfirm(false);
    setSaveError("");
  };

  const handleConfirmSubmit = async () => {
    if (isTournamentFinalized || (await refreshCurrentFinalizedStateForSave())) {
      setSaveError(finalizedReadOnlyMessage);
      return;
    }

    if (!requestedTournamentId) {
      setSaveError("Unable to submit. Tournament information is missing.");
      return;
    }

    // Validate markerPlayerId before submitting
    if (!isValidPlayerId(scorecard.markerPlayerId)) {
      setSaveError("Unable to submit. Marker player information is invalid.");
      return;
    }

    const roundNumber = String(Number(scorecard.round) || 1);
    const roundId = `round-${roundNumber}`;
    const stableMarkerPlayerId = String(scorecard.markerPlayerId);
    const localMarkerPlayerId = getLocalStoragePlayerId(resolvedPlayerIds?.markerPlayerIds ?? [stableMarkerPlayerId], stableMarkerPlayerId);
    // Submit marked player's self scores as complete
    const ok = mergeTournamentScoreSubmission(requestedTournamentId, localMarkerPlayerId, roundId, markedPlayerSelfScores, "self");
    if (isDevelopment) {
      setScoreDiagnostics((current) => ({
        ...current,
        localStorageSaveAttempted: "yes",
        localStorageSaveResult: ok ? "submit ok" : "submit failed",
        supabaseSaveTournamentId: sharedScoreTournamentId,
        savePlayerId: stableMarkerPlayerId,
        saveMarkerPlayerId: stableMarkerPlayerId,
      }));
    }
    if (!ok && !sharedScoreTournamentId) {
      setSaveError("Unable to submit. Please try again.");
      return;
    }
    void saveScoreThroughService(stableMarkerPlayerId, stableMarkerPlayerId, Number(roundNumber), markedPlayerSelfScores, "round");
    setView("submitted");
  };

  const isHoleSaved = savedHoles.includes(currentHole.holeNumber);

  const sharedHeader = (
    <header className="sticky top-0 z-10 border-b border-[#E8DCC8] bg-[#F6F1E6]/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
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
    return (
      <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
        {sharedHeader}
        <section className="mx-auto max-w-md px-4 py-5">
          {isTournamentFinalized ? (
            <div className="mb-4 rounded-[24px] border border-[#77B98E] bg-[#ECF8EF] p-4 text-sm font-semibold text-[#146233]">
              This tournament is finalized. Score entry is read-only for historical viewing.
            </div>
          ) : null}
          <div className="rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Verification Submitted</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              Scorecard Verified
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#51635C]">
              {scorecard.markerPlayerName || "Player"}&rsquo;s round {scorecard.round} scores have been verified and recorded.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {front9Holes.length > 0 ? (
                <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Front 9</p>
                  <p className="mt-2 text-lg font-black text-[#0B3D2E]">{markedPlayerFront9Total}</p>
                </div>
              ) : null}
              {back9Holes.length > 0 ? (
                <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Back 9</p>
                  <p className="mt-2 text-lg font-black text-[#0B3D2E]">{markedPlayerBack9Total}</p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] p-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Total</p>
                <p className="mt-2 text-lg font-black text-[#0B3D2E]">{markedPlayerTotals.total}</p>
              </div>
            </div>
            <div className="mt-3 rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">
              {markedPlayerTotals.toPar} to par
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (view === "review") {
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
                  const selfScore = markedPlayerSelfScores[index];
                  const markerScore = markerScores[index];
                  const isMatch = selfScore === markerScore;
                  const discrepancy = Math.abs(selfScore - markerScore);

                  return (
                    <tr
                      key={hole.holeNumber}
                      className={`border-b border-[#E8DCC8] last:border-0 ${
                        !isMatch && selfScore > 0 && markerScore > 0 ? "bg-red-100" : selfScore > 0 && markerScore > 0 ? "bg-green-50" : ""
                      }`}
                    >
                      <td className="px-2 py-2 font-black text-[#0B3D2E]">{hole.holeNumber}</td>
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
        <section className="mx-auto max-w-md px-4 py-5">
          {isTournamentFinalized ? (
            <div className="mb-4 rounded-[24px] border border-[#77B98E] bg-[#ECF8EF] p-4 text-sm font-semibold text-[#146233]">
              This tournament is finalized. Score entry is read-only for historical viewing.
            </div>
          ) : null}
          <div className="rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Verify Score</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[#0B3D2E]">
              {scorecard.markerPlayerName || "Player"}
            </h2>
            <p className="mt-0.5 text-xs text-[#51635C]">{scorecard.markerTeam}</p>

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
                      Hole {d.holeNumber}: Self {d.self} vs Marker {d.marker}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {front9Holes.length > 0 ? renderHolesTable(front9Holes, 0, "Front 9") : null}
            {back9Holes.length > 0 ? renderHolesTable(back9Holes, 9, "Back 9") : null}

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#0B3D2E]/20 bg-[#0B3D2E]/5 px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#0B3D2E]">Total</span>
              <div className="text-right">
                <span className="text-xl font-black text-[#0B3D2E]">{markedPlayerTotals.total}</span>
                <span className="ml-2 text-sm font-semibold text-[#51635C]">({markedPlayerTotals.toPar})</span>
              </div>
            </div>
          </div>

          {!showConfirm ? (
            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setView("scoring")}
                className="w-full rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300"
              >
                Edit Scores
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={hasDiscrepancies || isTournamentFinalized}
                className={`w-full rounded-full px-6 py-4 text-sm font-black uppercase tracking-[0.25em] transition duration-300 ${
                  hasDiscrepancies || isTournamentFinalized
                    ? "cursor-not-allowed border border-[#E8DCC8] bg-[#F6F1E6] text-[#B8892D] opacity-50"
                    : "bg-[#B8892D] text-[#0B3D2E] shadow-lg shadow-[#B8892D]/20 active:translate-y-0.5"
                }`}
              >
                {isTournamentFinalized ? "Tournament Finalized" : hasDiscrepancies ? "Fix Score Mismatches to Submit" : "Submit Verification"}
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-[28px] border border-[#B8892D]/40 bg-[#B8892D]/8 p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">Confirm Submission</p>
              <p className="mt-3 text-sm leading-6 text-[#0B3D2E]">
                All scores have been verified for {scorecard.markerPlayerName || "Player"}. Please confirm to submit.
              </p>
              {saveError ? (
                <p className="mt-3 text-sm font-semibold text-red-700">{saveError}</p>
              ) : null}
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={isTournamentFinalized}
                  className="w-full rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirm Submit
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="w-full rounded-full border border-[#E8DCC8] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#51635C] transition duration-300"
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

      <section className="mx-auto max-w-md px-4 py-5">
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
        </div>

        <div className="mt-5 rounded-[28px] border border-[#E8DCC8] bg-white/90 p-5 shadow-[0_18px_45px_rgba(11,61,46,0.08)]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
              Hole {currentHole.holeNumber}
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
              <p className="mt-2 text-lg font-black text-[#0B3D2E]">{currentHole.holeNumber}</p>
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

          <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
            {scorecard.playerName}'s Score
            <input
              type="number"
              min="1"
              max="12"
              value={scores[currentHoleIndex] === 0 ? "" : scores[currentHoleIndex]}
              onChange={(event) => updateScore(event.target.value)}
              onInput={(event) => updateScore(event.currentTarget.value)}
              disabled={isTournamentFinalized}
              placeholder="Enter score"
              className="mt-2 w-full rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-4 text-center text-2xl font-black tracking-[-0.02em] text-[#0B3D2E] outline-none"
            />
          </label>

          {scorecard.markerPlayerName ? (
            <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
              {scorecard.markerPlayerName}'s Score
              <input
                type="number"
                min="1"
                max="12"
                value={markerScores[currentHoleIndex] === 0 ? "" : markerScores[currentHoleIndex]}
                onChange={(event) => updateMarkerScore(event.target.value)}
                onInput={(event) => updateMarkerScore(event.currentTarget.value)}
                disabled={isTournamentFinalized}
                placeholder="Enter score"
                className="mt-2 w-full rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-4 text-center text-2xl font-black tracking-[-0.02em] text-[#0B3D2E] outline-none"
              />
            </label>
          ) : null}

          <button
            type="button"
            onClick={handleSaveHole}
            disabled={isTournamentFinalized || scores[currentHoleIndex] === 0}
            className="mt-4 w-full rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Hole
          </button>
          {saveError ? (
            <p className="mt-3 text-center text-sm font-semibold text-red-700">{saveError}</p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handlePreviousHole}
              disabled={currentHoleIndex === 0}
              className="rounded-full border border-[#B8892D] px-4 py-3 text-xs font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous Hole
            </button>
            <button
              type="button"
              onClick={handleNextHole}
              disabled={currentHoleIndex === scorecard.holes.length - 1}
              className="rounded-full border border-[#B8892D] px-4 py-3 text-xs font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next Hole
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReviewRound}
          disabled={isTournamentFinalized || !allHolesScored}
          className="mt-5 w-full rounded-full bg-[#B8892D] px-6 py-4 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] shadow-lg shadow-[#B8892D]/20 transition duration-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isTournamentFinalized ? "Tournament Finalized" : "Review & Submit Round"}
        </button>

        {!allHolesScored ? (
          <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#51635C]">
            Save all {scorecard.holes.length} holes to submit
          </p>
        ) : null}
      </section>
    </main>
  );
}
