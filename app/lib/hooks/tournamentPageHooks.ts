"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { toDataURL } from "qrcode";
import { loadComparisonScores } from "../services/scoreService";
import {
  hydratePairingsWithPlayerIds,
  loadTournamentPageState,
  persistTournamentPageState,
  type TournamentPageLoadResult,
} from "../services/tournamentService";
import {
  loadSharedTournamentIdFromStorage,
  loadTournamentsFromStorage,
} from "../tournamentStorage";
import type { LegacyPairingGroup, LegacyScorecardRow, LegacyTournamentUiState } from "../tournamentModel";
import type { StoredTournament } from "../tournamentStorage";

type SetState<T> = (value: T | ((current: T) => T)) => void;

type TournamentMeta = StoredTournament;
type ComparisonScoreEntry = Awaited<ReturnType<typeof loadComparisonScores>>[number];
type PersistedTournamentPageState = LegacyTournamentUiState;

export type TournamentPageStateSnapshot = {
  teams: LegacyTournamentUiState["teams"];
  players: LegacyTournamentUiState["players"];
  pairings: LegacyTournamentUiState["pairings"];
  scorecardsGenerated: boolean;
  scorecardRows: LegacyTournamentUiState["scorecards"]["scorecardRows"];
  roundSetup: LegacyTournamentUiState["scorecards"]["roundSetup"];
  clippdExportState: LegacyTournamentUiState["clippdExportState"];
  scoreboardImportState: LegacyTournamentUiState["scoreboardImportState"];
  autoRepairState: LegacyTournamentUiState["autoRepairState"];
};

const toLegacyUiState = (state: TournamentPageStateSnapshot): LegacyTournamentUiState => ({
  teams: state.teams,
  players: state.players,
  pairings: state.pairings,
  scorecards: {
    scorecardsGenerated: state.scorecardsGenerated,
    scorecardRows: state.scorecardRows,
    roundSetup: state.roundSetup,
  },
  clippdExportState: state.clippdExportState,
  scoreboardImportState: state.scoreboardImportState,
  autoRepairState: state.autoRepairState,
});

export const useClientMounted = (setIsClientMounted: (isMounted: boolean) => void) => {
  useEffect(() => {
    setIsClientMounted(true);
  }, [setIsClientMounted]);
};

export const useTournamentMetadata = ({
  isClientMounted,
  tournamentId,
  createFallbackTournamentMeta,
  setTournamentMeta,
  setSharedTournamentId,
}: {
  isClientMounted: boolean;
  tournamentId: string;
  createFallbackTournamentMeta: (tournamentId: string) => TournamentMeta;
  setTournamentMeta: SetState<TournamentMeta>;
  setSharedTournamentId: SetState<string>;
}) => {
  useEffect(() => {
    if (!isClientMounted) {
      return;
    }

    const savedTournaments = loadTournamentsFromStorage();
    setTournamentMeta(savedTournaments.find((item) => item.id === tournamentId) ?? createFallbackTournamentMeta(tournamentId));
    setSharedTournamentId(loadSharedTournamentIdFromStorage(tournamentId));
  }, [createFallbackTournamentMeta, isClientMounted, setSharedTournamentId, setTournamentMeta, tournamentId]);
};

export const useLatestTournamentPageState = (state: TournamentPageStateSnapshot) => {
  const latestStateRef = useRef(state);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  return latestStateRef;
};

export const useTournamentPageLoading = ({
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
}: {
  tournamentId: string;
  storageKey: string;
  setTournamentMeta: SetState<TournamentMeta>;
  setSharedTournamentId: SetState<string>;
  setTeams: SetState<LegacyTournamentUiState["teams"]>;
  setPlayers: SetState<LegacyTournamentUiState["players"]>;
  setPairings: SetState<LegacyTournamentUiState["pairings"]>;
  setScorecardsGenerated: SetState<boolean>;
  setScorecardRows: SetState<LegacyTournamentUiState["scorecards"]["scorecardRows"]>;
  setRoundSetup: SetState<LegacyTournamentUiState["scorecards"]["roundSetup"]>;
  setClippdExportState: SetState<LegacyTournamentUiState["clippdExportState"]>;
  setScoreboardImportState: SetState<LegacyTournamentUiState["scoreboardImportState"]>;
  setAutoRepairState: SetState<LegacyTournamentUiState["autoRepairState"]>;
}) => {
  const hasLoadedFromStorageRef = useRef(false);
  const hydrationPendingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !tournamentId || !storageKey) {
      return;
    }

    let isCancelled = false;
    hasLoadedFromStorageRef.current = false;
    hydrationPendingRef.current = false;

    const loadStoredOrRemoteSnapshot = async () => {
      try {
        const loadResultOrPromise = loadTournamentPageState(tournamentId);
        const loadResult: TournamentPageLoadResult =
          typeof (loadResultOrPromise as Promise<unknown>).then === "function"
            ? await (loadResultOrPromise as Promise<TournamentPageLoadResult>)
            : (loadResultOrPromise as TournamentPageLoadResult);
        if (isCancelled) {
          return;
        }

        if (loadResult.status === "empty") {
          hasLoadedFromStorageRef.current = true;
          return;
        }

        if (loadResult.status === "metadata") {
          setTournamentMeta(loadResult.tournament);
          setSharedTournamentId(loadResult.sharedTournamentId);
          hasLoadedFromStorageRef.current = true;
          return;
        }

        if (loadResult.tournament) {
          setTournamentMeta(loadResult.tournament);
        }
        if (loadResult.sharedTournamentId) {
          setSharedTournamentId(loadResult.sharedTournamentId);
        }
        setTeams(loadResult.hydration.teams);
        setPlayers(loadResult.hydration.players);
        setPairings(hydratePairingsWithPlayerIds(loadResult.hydration.pairings, loadResult.hydration.players));
        setScorecardsGenerated(loadResult.hydration.scorecardsGenerated);
        setScorecardRows(loadResult.hydration.scorecardRows);
        setRoundSetup(loadResult.hydration.roundSetup);
        setClippdExportState(loadResult.hydration.clippdExportState);
        setScoreboardImportState(loadResult.hydration.scoreboardImportState);
        setAutoRepairState(loadResult.hydration.autoRepairState);
        hasLoadedFromStorageRef.current = true;
        hydrationPendingRef.current = loadResult.hydrationPending;
      } catch (error) {
        if (!isCancelled) {
          hasLoadedFromStorageRef.current = true;
          console.warn("[TournamentService] Unable to load tournament state snapshot; local storage fallback remains active.", error);
        }
      }
    };

    void loadStoredOrRemoteSnapshot();

    return () => {
      isCancelled = true;
    };
  }, [
    setAutoRepairState,
    setClippdExportState,
    setPairings,
    setPlayers,
    setRoundSetup,
    setScoreboardImportState,
    setScorecardRows,
    setScorecardsGenerated,
    setSharedTournamentId,
    setTeams,
    setTournamentMeta,
    storageKey,
    tournamentId,
  ]);

  return { hasLoadedFromStorageRef, hydrationPendingRef };
};

export const useTournamentPagePersistence = ({
  tournamentId,
  storageKey,
  sharedTournamentId,
  tournament,
  state,
  setSharedTournamentId,
  hasLoadedFromStorageRef,
  hydrationPendingRef,
  isCoachAuthenticated,
}: {
  tournamentId: string;
  storageKey: string;
  sharedTournamentId: string;
  tournament: TournamentMeta;
  state: TournamentPageStateSnapshot;
  setSharedTournamentId: SetState<string>;
  hasLoadedFromStorageRef: MutableRefObject<boolean>;
  hydrationPendingRef: MutableRefObject<boolean>;
  isCoachAuthenticated: boolean;
}) => {
  const snapshotSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotSignatureRef = useRef("");

  useEffect(() => {
    return () => {
      if (snapshotSyncTimeoutRef.current) {
        clearTimeout(snapshotSyncTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !tournamentId || !storageKey) {
      return;
    }

    if (!hasLoadedFromStorageRef.current) {
      return;
    }

    if (hydrationPendingRef.current) {
      hydrationPendingRef.current = false;
      return;
    }

    persistTournamentPageState({
      tournamentId,
      sharedTournamentId,
      tournament,
      state: toLegacyUiState(state),
      snapshotSyncTimeout: snapshotSyncTimeoutRef.current,
      lastSnapshotSignature: lastSnapshotSignatureRef.current,
      onSharedTournamentIdChange: setSharedTournamentId,
      onSnapshotTimeoutChange: (timeout) => {
        snapshotSyncTimeoutRef.current = timeout;
      },
      onSnapshotSignatureChange: (signature) => {
        lastSnapshotSignatureRef.current = signature;
      },
    });
  }, [
    hasLoadedFromStorageRef,
    hydrationPendingRef,
    isCoachAuthenticated,
    setSharedTournamentId,
    sharedTournamentId,
    state,
    storageKey,
    tournament,
    tournamentId,
  ]);
};

export const useTournamentStoragePolling = ({
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
}: {
  tournamentId: string;
  storageKey: string;
  latestStateRef: MutableRefObject<TournamentPageStateSnapshot>;
  defaultRoundSetupState: LegacyTournamentUiState["scorecards"]["roundSetup"];
  setTeams: SetState<LegacyTournamentUiState["teams"]>;
  setPlayers: SetState<LegacyTournamentUiState["players"]>;
  setPairings: SetState<LegacyTournamentUiState["pairings"]>;
  setScorecardsGenerated: SetState<boolean>;
  setScorecardRows: SetState<LegacyTournamentUiState["scorecards"]["scorecardRows"]>;
  setRoundSetup: SetState<LegacyTournamentUiState["scorecards"]["roundSetup"]>;
  setClippdExportState: SetState<LegacyTournamentUiState["clippdExportState"]>;
  setScoreboardImportState: SetState<LegacyTournamentUiState["scoreboardImportState"]>;
  setAutoRepairState: SetState<LegacyTournamentUiState["autoRepairState"]>;
}) => {
  useEffect(() => {
    if (typeof window === "undefined" || !tournamentId || !storageKey) {
      return;
    }

    const syncFromStorage = () => {
      try {
        const storedValue = window.localStorage.getItem(storageKey);
        if (!storedValue) {
          return;
        }

        const parsedValue = JSON.parse(storedValue) as Partial<PersistedTournamentPageState>;
        const latestState = latestStateRef.current;

        if (parsedValue.teams && JSON.stringify(parsedValue.teams) !== JSON.stringify(latestState.teams)) {
          setTeams(parsedValue.teams);
        }

        if (parsedValue.players && JSON.stringify(parsedValue.players) !== JSON.stringify(latestState.players)) {
          setPlayers(parsedValue.players);
        }

        if (parsedValue.pairings) {
          const storedPairings = hydratePairingsWithPlayerIds(
            parsedValue.pairings.filter(
              (pairing): pairing is LegacyPairingGroup =>
                typeof pairing === "object" &&
                pairing !== null &&
                "groupNumber" in pairing &&
                "teeTime" in pairing &&
                "startingHole" in pairing &&
                "players" in pairing
            ),
            parsedValue.players ?? latestState.players
          );

          if (JSON.stringify(storedPairings) !== JSON.stringify(latestState.pairings)) {
            setPairings(storedPairings);
          }
        }

        if (parsedValue.scorecards) {
          const nextScorecardsGenerated = Boolean(parsedValue.scorecards.scorecardsGenerated);

          if (nextScorecardsGenerated !== latestState.scorecardsGenerated) {
            setScorecardsGenerated(nextScorecardsGenerated);
          }

          if (JSON.stringify(parsedValue.scorecards.scorecardRows || []) !== JSON.stringify(latestState.scorecardRows)) {
            setScorecardRows(parsedValue.scorecards.scorecardRows || []);
          }

          if (JSON.stringify(parsedValue.scorecards.roundSetup || defaultRoundSetupState) !== JSON.stringify(latestState.roundSetup)) {
            setRoundSetup(parsedValue.scorecards.roundSetup || defaultRoundSetupState);
          }
        }

        if (parsedValue.clippdExportState && JSON.stringify(parsedValue.clippdExportState) !== JSON.stringify(latestState.clippdExportState)) {
          setClippdExportState(parsedValue.clippdExportState);
        }

        if (parsedValue.scoreboardImportState && JSON.stringify(parsedValue.scoreboardImportState) !== JSON.stringify(latestState.scoreboardImportState)) {
          setScoreboardImportState(parsedValue.scoreboardImportState);
        }

        if (parsedValue.autoRepairState && JSON.stringify(parsedValue.autoRepairState) !== JSON.stringify(latestState.autoRepairState)) {
          setAutoRepairState(parsedValue.autoRepairState);
        }
      } catch {
        // Ignore polling errors so the page remains responsive.
      }
    };

    const intervalId = window.setInterval(syncFromStorage, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    defaultRoundSetupState,
    latestStateRef,
    setAutoRepairState,
    setClippdExportState,
    setPairings,
    setPlayers,
    setRoundSetup,
    setScoreboardImportState,
    setScorecardRows,
    setScorecardsGenerated,
    setTeams,
    storageKey,
    tournamentId,
  ]);
};

const mergeSharedScores = (rows: LegacyScorecardRow[], entries: ComparisonScoreEntry[]) => {
  const entriesByPlayerId = new Map<string, ComparisonScoreEntry[]>();
  entries.forEach((entry) => {
    entriesByPlayerId.set(String(entry.player_id), [...(entriesByPlayerId.get(String(entry.player_id)) ?? []), entry]);
  });

  return rows.map((row) => {
    const playerEntries = entriesByPlayerId.get(String(row.id)) ?? [];
    const selectedEntry = playerEntries.find((entry) => String(entry.entered_by_player_id) !== String(entry.player_id));

    if (!selectedEntry?.hole_scores?.length) {
      return row;
    }

    return {
      ...row,
      scores: selectedEntry.hole_scores.map((score) => (Number.isFinite(Number(score)) ? Number(score) : 0)),
    };
  });
};

export const useSharedScoreSynchronization = ({
  isClientMounted,
  tournamentId,
  sharedTournamentId,
  scorecardsGenerated,
  scorecardRowsLength,
  roundNumber,
  setScorecardRows,
}: {
  isClientMounted: boolean;
  tournamentId: string;
  sharedTournamentId: string;
  scorecardsGenerated: boolean;
  scorecardRowsLength: number;
  roundNumber: string;
  setScorecardRows: SetState<LegacyScorecardRow[]>;
}) => {
  useEffect(() => {
    if (!isClientMounted || !tournamentId || !scorecardsGenerated || scorecardRowsLength === 0) {
      return;
    }

    let isCancelled = false;
    if (!sharedTournamentId) {
      return;
    }

    const parsedRoundNumber = Number(roundNumber) || 1;

    const refreshSharedScores = async () => {
      try {
        const sharedScores = await loadComparisonScores({ tournamentId: sharedTournamentId, roundNumber: parsedRoundNumber });
        if (isCancelled || sharedScores.length === 0) {
          return;
        }

        setScorecardRows((currentRows) => {
          const mergedRows = mergeSharedScores(currentRows, sharedScores);
          return JSON.stringify(mergedRows) === JSON.stringify(currentRows) ? currentRows : mergedRows;
        });
      } catch (error) {
        console.warn("[ScoreService] Unable to load shared tournament score entries.", error);
      }
    };

    void refreshSharedScores();
    const intervalId = window.setInterval(refreshSharedScores, 10000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isClientMounted, roundNumber, scorecardRowsLength, scorecardsGenerated, setScorecardRows, sharedTournamentId, tournamentId]);
};

export const useBodyOverflowLock = (isLocked: boolean) => {
  useEffect(() => {
    if (typeof document === "undefined" || !isLocked) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isLocked]);
};

export const useQrCodeDataUrl = ({
  shouldGenerate,
  resolvedMobileScorecardUrl,
  setActiveQrCodeDataUrl,
}: {
  shouldGenerate: boolean;
  resolvedMobileScorecardUrl: string;
  setActiveQrCodeDataUrl: SetState<string>;
}) => {
  useEffect(() => {
    if (!shouldGenerate || !resolvedMobileScorecardUrl) {
      setActiveQrCodeDataUrl("");
      return;
    }

    let isActive = true;

    toDataURL(resolvedMobileScorecardUrl, {
      margin: 1,
      width: 256,
      color: {
        dark: "#0B3D2E",
        light: "#FFFFFF",
      },
    })
      .then((dataUrl) => {
        if (isActive) {
          setActiveQrCodeDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (isActive) {
          setActiveQrCodeDataUrl("");
        }
      });

    return () => {
      isActive = false;
    };
  }, [resolvedMobileScorecardUrl, setActiveQrCodeDataUrl, shouldGenerate]);
};
