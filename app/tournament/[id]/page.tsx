"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toDataURL } from "qrcode";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  buildTournamentStorageEnvelope,
  getTournamentStateStorageKey,
  loadTournamentsFromStorage,
  loadTournamentStorageEnvelope,
  saveTournamentStorageEnvelope,
  type StoredTournament,
} from "../../lib/tournamentStorage";

const tabs = ["Overview", "Teams", "Players", "Pairings", "Live Scoring", "Clippd Export"];

type Team = {
  id: number;
  schoolName: string;
  shortName: string;
  teamColor: string;
  coachName: string;
};

type TeamFormState = {
  schoolName: string;
  shortName: string;
  teamColor: string;
  coachName: string;
};

type Player = {
  id: number;
  firstName: string;
  lastName: string;
  teamId: string;
  teamName: string;
  handicap: string;
  email: string;
};

type PairingGroupPlayer = {
  playerId: string;
  playerName: string;
  teamName: string;
};

type PairingGroup = {
  groupNumber: number;
  teeTime: string;
  startingHole: string;
  players: PairingGroupPlayer[];
};

type PlayerFormState = {
  firstName: string;
  lastName: string;
  teamId: string;
  handicap: string;
  email: string;
};

type ImportedPlayerPreview = {
  firstName: string;
  lastName: string;
  school: string;
  gender: string;
  className: string;
  email: string;
  teamId: string;
  teamName: string;
  handicap: string;
};

type ScorecardRow = {
  id: number;
  playerName: string;
  team: string;
  scores: number[];
};

type RoundSetupState = {
  roundNumber: string;
  startingHole: string;
  numberOfHoles: string;
  teeTime: string;
  countingScores: string;
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

type PersistedTournamentState = {
  teams: Team[];
  players: Player[];
  pairings: PairingGroup[];
  scorecards: {
    scorecardsGenerated: boolean;
    scorecardRows: ScorecardRow[];
    roundSetup: RoundSetupState;
  };
  clippdExportState: ClippdExportState;
  scoreboardImportState: {
    tournamentId: string;
    tournamentKey: string;
    options: {
      tournamentDetails: boolean;
      teams: boolean;
      players: boolean;
      courseSetup: boolean;
      scorecards: boolean;
      teeTimes: boolean;
      startingHoles: boolean;
    };
  };
  autoRepairState: {
    sourceRound: string;
    targetRound: string;
    pairingOrder: string;
    teeTimeInterval: string;
  };
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

const tournamentMetaFromEnvelope = (tournamentId: string, tournament: StoredTournament | null): TournamentMeta =>
  tournament
    ? {
        id: tournament.id,
        name: tournament.name,
        date: tournament.date,
        course: tournament.course,
        city: tournament.city,
        state: tournament.state,
        rounds: tournament.rounds,
        scoringFormat: tournament.scoringFormat,
        status: tournament.status,
        settings: tournament.settings,
      }
    : createFallbackTournamentMeta(tournamentId);

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
  const hasLoadedFromStorageRef = useRef(false);
  const hydrationPendingRef = useRef(false);
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
  const [autoRepairState, setAutoRepairState] = useState({
    sourceRound: "Round 1",
    targetRound: "Round 2",
    pairingOrder: "Worst to Best",
    teeTimeInterval: "8 minutes",
  });
  const normalizedRoundSetup = {
    roundNumber: Math.max(1, Number(roundSetup?.roundNumber) || 1),
    numberOfHoles: Math.max(1, Math.min(18, Number(roundSetup?.numberOfHoles) || 18)),
    countingScores: Math.max(1, Math.min(6, Number(roundSetup?.countingScores) || 4)),
    startingHole: Math.max(1, Number(roundSetup?.startingHole) || 1),
    teeIntervalMinutes: Math.max(1, Number((roundSetup as Partial<Record<string, unknown>> | null)?.teeIntervalMinutes) || 10),
    defaultGroupSize: Math.max(1, Number((roundSetup as Partial<Record<string, unknown>> | null)?.defaultGroupSize) || 4),
    teeTime: roundSetup?.teeTime || defaultRoundSetupState.teeTime,
  };
  const latestStateRef = useRef({
    teams,
    players,
    pairings,
    scorecardsGenerated,
    scorecardRows,
    roundSetup,
    clippdExportState,
    scoreboardImportState,
    autoRepairState,
  });

  const tournament = isClientMounted ? tournamentMeta : createFallbackTournamentMeta(tournamentId);

  const activeQrPairing = useMemo(() => {
    if (!activeQrPlayer) {
      return null;
    }

    return pairingExistsForPlayer(pairings, activeQrPlayer.playerName) ?? null;
  }, [activeQrPlayer, pairings]);

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  useEffect(() => {
    if (!isClientMounted) {
      return;
    }

    const savedTournaments = loadTournamentsFromStorage();
    setTournamentMeta(savedTournaments.find((item) => item.id === tournamentId) ?? createFallbackTournamentMeta(tournamentId));
  }, [isClientMounted, tournamentId]);

  useEffect(() => {
    latestStateRef.current = {
      teams,
      players,
      pairings,
      scorecardsGenerated,
      scorecardRows,
      roundSetup,
      clippdExportState,
      scoreboardImportState,
      autoRepairState,
    };
  }, [teams, players, pairings, scorecardsGenerated, scorecardRows, roundSetup, clippdExportState, scoreboardImportState, autoRepairState]);

  useEffect(() => {
    if (typeof window === "undefined" || !tournamentId || !storageKey) {
      return;
    }

    hasLoadedFromStorageRef.current = false;
    hydrationPendingRef.current = false;

    console.log("[TournamentStorage] load:start", {
      tournamentId,
      storageKey,
    });

    try {
      const storedEnvelope = loadTournamentStorageEnvelope(tournamentId);

      if (!storedEnvelope) {
        hasLoadedFromStorageRef.current = true;
        console.log("[TournamentStorage] load:empty", {
          tournamentId,
          storageKey,
          loadedTeamsCount: 0,
        });
        return;
      }

      const hydratedTournamentState = storedEnvelope.uiState;
      const loadedTeamsCount = hydratedTournamentState.teams.length;

      setTeams(hydratedTournamentState.teams);
      setPlayers(hydratedTournamentState.players);
      setPairings(hydratedTournamentState.pairings);
      setScorecardsGenerated(hydratedTournamentState.scorecardsGenerated);
      setScorecardRows(hydratedTournamentState.scorecardRows);
      setRoundSetup(hydratedTournamentState.roundSetup);
      setClippdExportState(hydratedTournamentState.clippdExportState);
      setScoreboardImportState(hydratedTournamentState.scoreboardImportState);
      setAutoRepairState(hydratedTournamentState.autoRepairState);

      console.log("[TournamentStorage] load:success", {
        tournamentId,
        storageKey,
        loadedTeamsCount,
      });

      hasLoadedFromStorageRef.current = true;
      hydrationPendingRef.current = true;
    } catch {
      // Keep existing storage value in place even if parsing fails.
      hasLoadedFromStorageRef.current = true;
      console.log("[TournamentStorage] load:error", {
        tournamentId,
        storageKey,
        loadedTeamsCount: 0,
      });
    }
  }, [storageKey, tournamentId]);

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

    const persistedState: PersistedTournamentState = {
      teams,
      players,
      pairings,
      scorecards: {
        scorecardsGenerated,
        scorecardRows,
        roundSetup,
      },
      clippdExportState,
      scoreboardImportState,
      autoRepairState,
    };

    saveTournamentStorageEnvelope(
      tournamentId,
      buildTournamentStorageEnvelope(
        tournamentId,
        tournament.name,
        tournament.course,
        persistedState,
        typeof tournament.settings === "object" && tournament.settings !== null ? (tournament.settings as Record<string, unknown>) : {},
        Number(tournament.rounds) || 1
      )
    );
    console.log("[TournamentStorage] save", {
      tournamentId,
      storageKey,
      savedTeamsCount: teams.length,
    });
  }, [teams, players, pairings, scorecardsGenerated, scorecardRows, roundSetup, clippdExportState, scoreboardImportState, autoRepairState, storageKey, tournamentId]);

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

        const parsedValue = JSON.parse(storedValue) as Partial<PersistedTournamentState>;
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
              (pairing): pairing is PairingGroup =>
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
  }, [storageKey, tournamentId]);

  const resetTeamForm = () => {
    setTeamFormState(defaultTeamFormState);
    setTeamErrors({});
    setEditingTeamId(null);
  };

  const parseCsvLine = (line: string) => {
    const values: string[] = [];
    let currentValue = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];

      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = "";
        continue;
      }

      currentValue += char;
    }

    values.push(currentValue.trim());
    return values;
  };

  const parseImportedPlayerCsv = (text: string) => {
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (rows.length < 2) {
      throw new Error("The CSV file is empty.");
    }

    const headers = rows[0]
      .toLowerCase()
      .split(",")
      .map((header) => header.replace(/\s+/g, ""));

    const requiredHeaders = ["firstname", "lastname", "school", "gender", "class", "email"];
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));

    if (missingHeaders.length > 0) {
      throw new Error("The CSV file is missing required columns.");
    }

    return rows.slice(1).map((row) => {
      const values = parseCsvLine(row);
      const data = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      const schoolName = data.school?.trim() || "Unassigned";
      const matchingTeam = teams.find(
        (team) => team.schoolName.toLowerCase() === schoolName.toLowerCase() || team.shortName.toLowerCase() === schoolName.toLowerCase()
      );

      return {
        firstName: data.firstname?.trim() || "",
        lastName: data.lastname?.trim() || "",
        school: schoolName,
        gender: data.gender?.trim() || "",
        className: data.class?.trim() || "",
        email: data.email?.trim() || "",
        teamId: matchingTeam ? String(matchingTeam.id) : "",
        teamName: matchingTeam ? matchingTeam.schoolName : schoolName,
        handicap: "0",
      } satisfies ImportedPlayerPreview;
    }).filter((preview) => preview.firstName || preview.lastName || preview.email || preview.school);
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
    const template = ["First Name,Last Name,School,Gender,Class,Email", "Jane,Doe,Bluffton University,Female,Senior,jane.doe@example.com"].join("\n");
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
      const rows = parseImportedPlayerCsv(text);
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

    const importedPlayers: Player[] = playerImportRows.map((row, index) => ({
      id: Date.now() + index,
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      teamId: row.teamId,
      teamName: row.teamName,
      handicap: row.handicap,
      email: row.email.trim(),
    }));

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

  const validateTeamForm = () => {
    const nextErrors: Partial<Record<keyof TeamFormState, string>> = {};

    if (!teamFormState.schoolName.trim()) {
      nextErrors.schoolName = "School name is required.";
    }
    if (!teamFormState.shortName.trim()) {
      nextErrors.shortName = "Short name is required.";
    }
    if (!teamFormState.teamColor.trim()) {
      nextErrors.teamColor = "Team color is required.";
    }
    if (!teamFormState.coachName.trim()) {
      nextErrors.coachName = "Coach name is required.";
    }

    setTeamErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleTeamSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateTeamForm()) {
      return;
    }

    if (editingTeamId) {
      setTeams((current) =>
        current.map((team) =>
          team.id === editingTeamId
            ? {
                ...team,
                schoolName: teamFormState.schoolName.trim(),
                shortName: teamFormState.shortName.trim().toUpperCase(),
                teamColor: teamFormState.teamColor.trim(),
                coachName: teamFormState.coachName.trim(),
              }
            : team
        )
      );
    } else {
      setTeams((current) => [
        {
          id: Date.now(),
          schoolName: teamFormState.schoolName.trim(),
          shortName: teamFormState.shortName.trim().toUpperCase(),
          teamColor: teamFormState.teamColor.trim(),
          coachName: teamFormState.coachName.trim(),
        },
        ...current,
      ]);
    }

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

  const validatePlayerForm = () => {
    const nextErrors: Partial<Record<keyof PlayerFormState, string>> = {};

    if (!playerFormState.firstName.trim()) {
      nextErrors.firstName = "First name is required.";
    }
    if (!playerFormState.lastName.trim()) {
      nextErrors.lastName = "Last name is required.";
    }
    if (!playerFormState.teamId.trim()) {
      nextErrors.teamId = "Team is required.";
    }
    if (!playerFormState.handicap.trim()) {
      nextErrors.handicap = "Handicap is required.";
    }

    setPlayerErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handlePlayerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validatePlayerForm()) {
      return;
    }

    const selectedTeam = teams.find((team) => String(team.id) === playerFormState.teamId);

    if (editingPlayerId) {
      setPlayers((current) =>
        current.map((player) =>
          player.id === editingPlayerId
            ? {
                ...player,
                firstName: playerFormState.firstName.trim(),
                lastName: playerFormState.lastName.trim(),
                teamId: playerFormState.teamId,
                teamName: selectedTeam?.schoolName || "Unassigned",
                handicap: playerFormState.handicap.trim(),
                email: playerFormState.email.trim(),
              }
            : player
        )
      );
    } else {
      setPlayers((current) => [
        {
          id: Date.now(),
          firstName: playerFormState.firstName.trim(),
          lastName: playerFormState.lastName.trim(),
          teamId: playerFormState.teamId,
          teamName: selectedTeam?.schoolName || "Unassigned",
          handicap: playerFormState.handicap.trim(),
          email: playerFormState.email.trim(),
        },
        ...current,
      ]);
    }

    closePlayerModal();
  };

  const handleRoundSetupChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setRoundSetup((current) => ({ ...current, [name]: value }));
  };

  const handleScoreInputChange = (rowId: number, holeIndex: number, value: string) => {
    const parsedValue = Number(value);

    setScorecardRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              scores: row.scores.map((score, index) => (index === holeIndex ? (Number.isNaN(parsedValue) ? 0 : parsedValue) : score)),
            }
          : row
      )
    );
  };

  const calculateTotal = (scores: number[]) =>
    scores.reduce((total, score) => total + (Number.isFinite(score) ? score : 0), 0);

  const calculatePlayedTotal = (scores: number[]) =>
    scores.reduce((total, score) => total + (score > 0 ? score : 0), 0);

  const calculatePlayedHoles = (scores: number[]) =>
    scores.reduce((count, score) => count + (score > 0 ? 1 : 0), 0);

  const formatScoreToPar = (difference: number) => {
    if (difference === 0) {
      return "E";
    }
    return difference > 0 ? `+${difference}` : `${difference}`;
  };

  const addTiePositions = <T,>(rows: T[], getScore: (row: T) => number) => {
    const scoreCounts = rows.reduce((map, row) => {
      const score = getScore(row);
      map.set(score, (map.get(score) ?? 0) + 1);
      return map;
    }, new Map<number, number>());

    return rows.map((row, index) => {
      const score = getScore(row);
      const ordinal = index + 1;
      const position = (scoreCounts.get(score) ?? 0) > 1 ? `T${ordinal}` : `${ordinal}`;

      return {
        ...row,
        position,
      };
    });
  };

  const formatMinutesToTime = (minutesSinceMidnight: number) => {
    const normalizedMinutes = ((minutesSinceMidnight % 1440) + 1440) % 1440;
    const hours24 = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    const meridiem = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
  };

  const handleGeneratePairings = () => {
    if (players.length === 0) {
      setPairings([]);
      setPairingsMessage("Add players before generating pairings.");
      return;
    }

    const shuffledPlayers = [...players];

    for (let index = shuffledPlayers.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffledPlayers[index], shuffledPlayers[swapIndex]] = [shuffledPlayers[swapIndex], shuffledPlayers[index]];
    }

    const generatedPairings: PairingGroup[] = [];
    const startingMinutes = 8 * 60;

    for (let index = 0; index < shuffledPlayers.length; index += 4) {
      const groupPlayers = shuffledPlayers.slice(index, index + 4);
      generatedPairings.push({
        groupNumber: generatedPairings.length + 1,
        teeTime: formatMinutesToTime(startingMinutes + generatedPairings.length * 10),
        startingHole: "1",
        players: groupPlayers.map((player) => ({
          playerId: String(player.id),
          playerName: `${player.firstName} ${player.lastName}`.trim(),
          teamName: player.teamName || "Unassigned",
        })),
      });
    }

    setPairings(generatedPairings);
    setPairingsMessage("");
  };

  const normalizePairings = (nextPairings: PairingGroup[]) =>
    nextPairings
      .filter((pairing) => pairing.players.length > 0)
      .map((pairing, index) => ({
        ...pairing,
        groupNumber: index + 1,
      }));

  const hydratePairingsWithPlayerIds = (groupings: PairingGroup[], roster: Player[]) => {
    const rosterByIdentity = new Map(
      roster.map((player) => [
        `${`${player.firstName} ${player.lastName}`.trim()}::${player.teamName || "Unassigned"}`,
        String(player.id),
      ])
    );

    return groupings.map((pairing) => ({
      ...pairing,
      players: pairing.players.map((player) => ({
        ...player,
        playerId:
          player.playerId || rosterByIdentity.get(`${player.playerName}::${player.teamName}`) || `${player.playerName}::${player.teamName}`,
      })),
    }));
  };

  const snapshotPairings = (groupings: PairingGroup[]) =>
    groupings.map((pairing) => ({
      ...pairing,
      players: pairing.players.map((player) => ({ ...player })),
    }));

  const createPairingPlayerKeyList = (groupings: PairingGroup[]) =>
    groupings
      .flatMap((pairing) => pairing.players.map((player) => player.playerId))
      .sort();

  const findPairingPlayerLocation = (groupings: PairingGroup[], playerId: string) => {
    for (let pairingIndex = 0; pairingIndex < groupings.length; pairingIndex += 1) {
      const playerIndex = groupings[pairingIndex].players.findIndex((player) => player.playerId === playerId);

      if (playerIndex !== -1) {
        return { pairingIndex, playerIndex };
      }
    }

    return null;
  };

  const findPairingIndexByGroupId = (groupings: PairingGroup[], groupId: number) =>
    groupings.findIndex((pairing) => pairing.groupNumber === groupId);

  const isValidPairingMutation = (candidatePairings: PairingGroup[], baselinePairings: PairingGroup[]) => {
    const candidateKeys = createPairingPlayerKeyList(candidatePairings);
    const baselineKeys = createPairingPlayerKeyList(baselinePairings);

    return JSON.stringify(candidateKeys) === JSON.stringify(baselineKeys);
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

  const relocatePairingPlayer = (
    sourcePairingIndex: number,
    sourcePlayerIndex: number,
    targetPairingIndex: number,
    targetPlayerIndex: number
  ) => {
    commitPairingMutation((current) => {
      if (
        sourcePairingIndex < 0 ||
        targetPairingIndex < 0 ||
        sourcePairingIndex >= current.length ||
        targetPairingIndex >= current.length
      ) {
        return current;
      }

      const nextPairings = current.map((pairing) => ({
        ...pairing,
        players: [...pairing.players],
      }));

      const sourcePairing = nextPairings[sourcePairingIndex];
      const targetPairing = nextPairings[targetPairingIndex];

      if (
        sourcePlayerIndex < 0 ||
        sourcePlayerIndex >= sourcePairing.players.length ||
        targetPlayerIndex < 0
      ) {
        return current;
      }

      const [movedPlayer] = sourcePairing.players.splice(sourcePlayerIndex, 1);

      if (!movedPlayer) {
        return current;
      }

      const adjustedTargetIndex =
        sourcePairingIndex === targetPairingIndex && sourcePlayerIndex < targetPlayerIndex
          ? targetPlayerIndex - 1
          : targetPlayerIndex;

      targetPairing.players.splice(
        Math.min(adjustedTargetIndex, targetPairing.players.length),
        0,
        movedPlayer
      );

      return nextPairings;
    });
  };

  const movePlayerWithinPairing = (pairingIndex: number, playerIndex: number, direction: -1 | 1) => {
    relocatePairingPlayer(pairingIndex, playerIndex, pairingIndex, playerIndex + direction);
  };

  const movePlayerBetweenPairings = (pairingIndex: number, playerIndex: number, direction: -1 | 1) => {
    const targetPairingIndex = pairingIndex + direction;

    if (targetPairingIndex < 0 || targetPairingIndex >= pairings.length) {
      return;
    }

    relocatePairingPlayer(
      pairingIndex,
      playerIndex,
      targetPairingIndex,
      pairings[targetPairingIndex].players.length
    );
  };

  const formatToPar = (total: number) => {
    const difference = total - 72;
    if (difference === 0) {
      return "E";
    }
    return difference > 0 ? `+${difference}` : `${difference}`;
  };

  const generateScorecards = () => {
    const holeCount = normalizedRoundSetup.numberOfHoles;
    const nextRows = players.map((player) => ({
      id: player.id,
      playerName: `${player.firstName} ${player.lastName}`.trim(),
      team: player.teamName || "Unassigned",
      scores: Array.from({ length: holeCount }, () => 0),
    }));

    setScorecardsGenerated(true);
    setScorecardRows(nextRows);
  };

  const displayHoleCount = normalizedRoundSetup.numberOfHoles;
  const countingScores = normalizedRoundSetup.countingScores;
  const fullRoundPar = displayHoleCount * 4;

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

  const resolvedMobileScorecardUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    if (!tournamentId || !activeQrPairing) {
      return `${window.location.origin}/scorecard/test`;
    }

    return `${window.location.origin}/scorecard/group-${activeQrPairing.groupNumber}?tournamentId=${encodeURIComponent(tournamentId)}&pairing=${activeQrPairing.groupNumber}`;
  }, [activeQrPairing, tournamentId]);

  useEffect(() => {
    if (typeof document === "undefined" || !activeQrPlayer) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeQrPlayer]);

  useEffect(() => {
    if (!activeQrPlayer || !resolvedMobileScorecardUrl) {
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
  }, [activeQrPlayer, resolvedMobileScorecardUrl]);

  const handlePrintFromQrModal = () => {
    if (!activeQrPlayer) {
      return;
    }

    closeQrModal();
    openPrintScorecardModal(activeQrPlayer);
  };

  function pairingExistsForPlayer(groupings: PairingGroup[], playerName: string) {
    return groupings.find((pairing) => pairing.players.some((player) => player.playerName === playerName));
  }

  const individualLeaderboard = useMemo(() => {
    if (!scorecardsGenerated || scorecardRows.length === 0) {
      return [] as Array<{ position: string; id: number; playerName: string; team: string; totalScore: number; toPar: string; through: string; today: string }>;
    }

    const standings = [...scorecardRows]
      .map((row) => {
        const playedHoles = calculatePlayedHoles(row.scores);
        const totalScore = calculatePlayedTotal(row.scores);
        const activePar = playedHoles * 4;
        const toPar = playedHoles > 0 ? formatScoreToPar(totalScore - activePar) : "--";
        const through = playedHoles >= displayHoleCount ? "F" : `${playedHoles}/${displayHoleCount}`;

        return {
          id: row.id,
          playerName: row.playerName,
          team: row.team,
          totalScore,
          toPar,
          through,
          today: toPar,
        };
      })
      .sort((a, b) => a.totalScore - b.totalScore || a.playerName.localeCompare(b.playerName));

    return addTiePositions(standings, (row) => row.totalScore);
  }, [displayHoleCount, scorecardRows, scorecardsGenerated]);

  const teamLeaderboard = useMemo(() => {
    if (!scorecardsGenerated || scorecardRows.length === 0) {
      return [] as Array<{ position: string; teamName: string; totalScore: number; toPar: string; through: string; today: string }>;
    }

    const grouped = new Map<string, ScorecardRow[]>();

    scorecardRows.forEach((row) => {
      const current = grouped.get(row.team) ?? [];
      current.push(row);
      grouped.set(row.team, current);
    });

    const standings = Array.from(grouped.entries())
      .map(([team, rows]) => {
        const completedRows = rows
          .map((row) => {
            const playedHoles = calculatePlayedHoles(row.scores);
            return {
              ...row,
              playedHoles,
              totalScore: calculatePlayedTotal(row.scores),
            };
          })
          .filter((row) => row.playedHoles >= displayHoleCount)
          .sort((a, b) => a.totalScore - b.totalScore || a.playerName.localeCompare(b.playerName));

        if (completedRows.length < countingScores) {
          return null;
        }

        const countedPlayers = completedRows.slice(0, countingScores);
        const totalScore = countedPlayers.reduce((total, row) => total + row.totalScore, 0);
        const toPar = formatScoreToPar(totalScore - fullRoundPar * countingScores);

        return {
          teamName: team,
          totalScore,
          toPar,
          through: "F",
          today: toPar,
        };
      })
      .filter((team): team is { teamName: string; totalScore: number; toPar: string; through: string; today: string } => Boolean(team))
      .sort((a, b) => a.totalScore - b.totalScore || a.teamName.localeCompare(b.teamName));

    return addTiePositions(standings, (row) => row.totalScore);
  }, [countingScores, displayHoleCount, fullRoundPar, scorecardRows, scorecardsGenerated]);

  const printablePairings = useMemo(() => {
    if (pairings.length > 0) {
      return pairings;
    }

    if (scorecardRows.length === 0) {
      return [] as PairingGroup[];
    }

    const fallbackRows = [...scorecardRows].sort((a, b) => a.playerName.localeCompare(b.playerName));
    const generatedPairings: PairingGroup[] = [];

    for (let index = 0; index < fallbackRows.length; index += 4) {
      generatedPairings.push({
        groupNumber: generatedPairings.length + 1,
          teeTime: normalizedRoundSetup.teeTime || "--",
          startingHole: String(normalizedRoundSetup.startingHole),
          players: fallbackRows.slice(index, index + normalizedRoundSetup.defaultGroupSize).map((row) => ({
          playerName: row.playerName,
          teamName: row.team,
        })),
      });
    }

    return generatedPairings;
  }, [normalizedRoundSetup.defaultGroupSize, normalizedRoundSetup.startingHole, normalizedRoundSetup.teeTime, pairings, scorecardRows]);

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
            {activeTab === "Teams" ? (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                      Teams
                    </p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                      Build your tournament field.
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={openAddTeamModal}
                    className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                  >
                    Add Team
                  </button>
                </div>

                {teams.length === 0 ? (
                  <div className="rounded-[32px] border border-[#E8DCC8] bg-[#FCFAF5] p-10 text-center shadow-inner">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0B3D2E] text-2xl font-black text-[#F0C96A]">
                      HQ
                    </div>
                    <h4 className="mt-6 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                      No teams have been added.
                    </h4>
                    <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-[#51635C]">
                      Add your first college team to begin building the tournament.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-6 lg:grid-cols-2">
                    {teams.map((team) => (
                      <div key={team.id} className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                              {team.shortName}
                            </p>
                            <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                              {team.schoolName}
                            </h4>
                          </div>
                          <div className="h-5 w-5 rounded-full border border-[#E8DCC8]" style={{ backgroundColor: team.teamColor || "#0B3D2E" }} />
                        </div>

                        <div className="mt-6 space-y-3 text-sm text-[#51635C]">
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-semibold uppercase tracking-[0.25em]">Coach</span>
                            <span className="text-right font-black text-[#0B3D2E]">{team.coachName}</span>
                          </div>
                        </div>

                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => openEditTeamModal(team)}
                            className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setTeams((current) => current.filter((item) => item.id !== team.id))}
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
            ) : activeTab === "Players" ? (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                      Players
                    </p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                      Build your player roster.
                    </h3>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={openPlayerImportModal}
                      className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                    >
                      Import Players
                    </button>
                    <button
                      type="button"
                      onClick={openAddPlayerModal}
                      className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                    >
                      Add Player
                    </button>
                  </div>
                </div>

                {players.length === 0 ? (
                  <div className="rounded-[32px] border border-[#E8DCC8] bg-[#FCFAF5] p-10 text-center shadow-inner">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0B3D2E] text-2xl font-black text-[#F0C96A]">
                      HQ
                    </div>
                    <h4 className="mt-6 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                      No players have been added.
                    </h4>
                    <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-[#51635C]">
                      Add your first player to begin building the tournament.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-6 lg:grid-cols-2">
                    {players.map((player) => (
                      <div key={player.id} className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">
                            {player.teamName}
                          </p>
                          <h4 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                            {player.firstName} {player.lastName}
                          </h4>
                        </div>

                        <div className="mt-6 space-y-3 text-sm text-[#51635C]">
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-semibold uppercase tracking-[0.25em]">Handicap</span>
                            <span className="text-right font-black text-[#0B3D2E]">{player.handicap}</span>
                          </div>
                        </div>

                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => openEditPlayerModal(player)}
                            className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlayers((current) => current.filter((item) => item.id !== player.id))}
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
            ) : activeTab === "Pairings" ? (
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                        Pairings
                      </p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                        Create and refine your tee-time flow.
                      </h3>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleGeneratePairings}
                        className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                      >
                        Generate Pairings
                      </button>
                      <button
                        type="button"
                        onClick={openAutoRepairModal}
                        className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                      >
                        Auto Re-Pair by Results
                      </button>
                    </div>
                  </div>

                  <p className="mt-4 max-w-3xl text-lg leading-8 text-[#51635C]">
                    Pairings will be generated from your tournament field and updated as your event evolves. This experience is UI-only for now.
                  </p>

                  <div className="mt-6 rounded-[24px] border border-[#E8DCC8] bg-white/80 p-6 shadow-inner">
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B8892D]">
                      Draft Schedule Preview
                    </p>
                    {pairingsMessage ? (
                      <div className="mt-4 rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] px-6 py-5 text-center text-sm font-semibold uppercase tracking-[0.25em] text-[#0B3D2E]">
                        {pairingsMessage}
                      </div>
                    ) : null}

                    {pairings.length > 0 ? (
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {/* TODO: Rebuild pairing drag-and-drop with a dedicated library such as dnd-kit. */}
                        {pairings.map((pairing, pairingIndex) => (
                          <div
                            key={pairing.groupNumber}
                            className="rounded-[20px] border border-[#E8DCC8] bg-[#FCFAF5] p-5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#B8892D]">Group {pairing.groupNumber}</p>
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                                <span className="rounded-full border border-[#E8DCC8] bg-white px-3 py-1">{pairing.teeTime}</span>
                                <span className="rounded-full border border-[#E8DCC8] bg-white px-3 py-1">Hole {pairing.startingHole}</span>
                              </div>
                            </div>

                            <div className="mt-4 space-y-2">
                              {pairing.players.map((player, playerIndex) => (
                                <div
                                  key={`${pairing.groupNumber}-${player.playerName}`}
                                  className="rounded-2xl border border-[#E8DCC8] bg-white/80 px-4 py-3 transition duration-200"
                                >
                                  <p className="font-black text-[#0B3D2E]">{player.playerName}</p>
                                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">{player.teamName}</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => movePlayerBetweenPairings(pairingIndex, playerIndex, -1)}
                                      disabled={pairingIndex === 0}
                                      className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#F6F1E6] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      ← Group
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => movePlayerWithinPairing(pairingIndex, playerIndex, -1)}
                                      disabled={playerIndex === 0}
                                      className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#F6F1E6] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => movePlayerWithinPairing(pairingIndex, playerIndex, 1)}
                                      disabled={playerIndex === pairing.players.length - 1}
                                      className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#F6F1E6] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => movePlayerBetweenPairings(pairingIndex, playerIndex, 1)}
                                      disabled={pairingIndex === pairings.length - 1}
                                      className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#F6F1E6] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Group →
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : pairingsMessage ? null : (
                      <div className="mt-4 rounded-[20px] border border-dashed border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center text-[#51635C]">
                        Draft pairing groups will appear here once the next phase is connected.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : activeTab === "Live Scoring" ? (
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[#E8DCC8] bg-[#FCFAF5] p-7 shadow-[0_18px_45px_rgba(11,61,46,0.06)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.35em] text-[#B8892D]">
                        Live Scoring
                      </p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#0B3D2E]">
                        Round Setup
                      </h3>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={handlePrintTournamentScorecards}
                        className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                      >
                        Print Scorecards
                      </button>
                      <button
                        type="button"
                        onClick={generateScorecards}
                        className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                      >
                        Generate Scorecards
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
                    <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                      <span>Round Number</span>
                      <input
                        name="roundNumber"
                        value={normalizedRoundSetup.roundNumber}
                        onChange={handleRoundSetupChange}
                        className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                      <span>Starting Hole</span>
                      <input
                        name="startingHole"
                        value={normalizedRoundSetup.startingHole}
                        onChange={handleRoundSetupChange}
                        className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                      <span>Number of Holes</span>
                      <input
                        name="numberOfHoles"
                        value={normalizedRoundSetup.numberOfHoles}
                        onChange={handleRoundSetupChange}
                        className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                      <span>Tee Time</span>
                      <input
                        name="teeTime"
                        value={normalizedRoundSetup.teeTime}
                        onChange={handleRoundSetupChange}
                        className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                      <span>Counting Scores</span>
                      <input
                        name="countingScores"
                        type="number"
                        min="1"
                        max="6"
                        value={normalizedRoundSetup.countingScores}
                        onChange={handleRoundSetupChange}
                        className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                      />
                    </label>
                  </div>
                </div>

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
                                const toPar = formatToPar(total);

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

      {isAutoRepairModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm"
          onClick={closeAutoRepairModal}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Pairings Automation
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    Auto Re-Pair by Results
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeAutoRepairModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <form className="px-7 py-7" onSubmit={handleAutoRepairSubmit}>
              <p className="text-base leading-8 text-[#51635C]">
                After a completed round, Clubhouse HQ will automatically reorder teams and players based on results. Worst teams go out first. Leading teams go out last. Players are also reordered within team groups from highest score to lowest score.
              </p>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Source Round</span>
                  <select
                    name="sourceRound"
                    value={autoRepairState.sourceRound}
                    onChange={handleAutoRepairInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                  >
                    <option>Round 1</option>
                    <option>Round 2</option>
                    <option>Round 3</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Target Round</span>
                  <select
                    name="targetRound"
                    value={autoRepairState.targetRound}
                    onChange={handleAutoRepairInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                  >
                    <option>Round 2</option>
                    <option>Round 3</option>
                    <option>Round 4</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Pairing Order</span>
                  <select
                    name="pairingOrder"
                    value={autoRepairState.pairingOrder}
                    onChange={handleAutoRepairInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                  >
                    <option>Worst to Best</option>
                    <option>Best to Worst</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Tee Time Interval</span>
                  <select
                    name="teeTimeInterval"
                    value={autoRepairState.teeTimeInterval}
                    onChange={handleAutoRepairInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                  >
                    <option>8 minutes</option>
                    <option>9 minutes</option>
                    <option>10 minutes</option>
                    <option>12 minutes</option>
                  </select>
                </label>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeAutoRepairModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  Generate Draft Pairings
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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

      {isPlayerImportModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm"
          onClick={closePlayerImportModal}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Player Import
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    Import Players
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closePlayerImportModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="px-7 py-7">
              <p className="text-base leading-8 text-[#51635C]">
                Download the CSV template, upload a completed file, preview imported players, and confirm the import into your tournament roster.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handlePlayerImportTemplateDownload}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Download CSV Template
                </button>
                <label className="flex cursor-pointer items-center justify-center rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5">
                  <span>Upload CSV</span>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={handlePlayerImportFileChange} />
                </label>
              </div>

              {playerImportFileName ? (
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  Selected file: {playerImportFileName}
                </p>
              ) : null}

              {playerImportError ? (
                <div className="mt-4 rounded-2xl border border-[#E8DCC8] bg-white/80 px-4 py-3 text-sm text-[#0B3D2E]">
                  {playerImportError}
                </div>
              ) : null}

              {playerImportRows.length > 0 ? (
                <div className="mt-6 rounded-[24px] border border-[#E8DCC8] bg-white/80 p-5 shadow-inner">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black uppercase tracking-[0.3em] text-[#B8892D]">
                      Preview Imported Players
                    </p>
                    <span className="rounded-full border border-[#E8DCC8] bg-[#FCFAF5] px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#51635C]">
                      {playerImportRows.length} rows
                    </span>
                  </div>

                  <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                    {playerImportRows.map((row, index) => (
                      <div key={`${row.firstName}-${row.lastName}-${index}`} className="rounded-2xl border border-[#E8DCC8] bg-[#FCFAF5] px-4 py-3 text-sm text-[#0B3D2E]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="font-black">{row.firstName} {row.lastName}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#51635C]">{row.school}</span>
                        </div>
                        <div className="mt-2 text-xs uppercase tracking-[0.25em] text-[#51635C]">
                          {row.gender} • {row.className} • {row.email}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-[24px] border border-dashed border-[#E8DCC8] bg-[#FCFAF5] p-8 text-center text-[#51635C]">
                  Upload a CSV file to preview imported players before confirming.
                </div>
              )}

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closePlayerImportModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePlayerImportConfirm}
                  disabled={playerImportRows.length === 0}
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#51635C]"
                >
                  Confirm Import
                </button>
              </div>
            </div>
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
                    "QR"
                  )}
                </div>
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  {activeQrPairing ? `Group ${activeQrPairing.groupNumber} mobile scoring access` : "QR Code unavailable"}
                </p>
                <div className="mt-4 rounded-2xl border border-[#E8DCC8] bg-white/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  Scorecard URL: {resolvedMobileScorecardUrl || mobileScorecardUrl}
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
                  href={resolvedMobileScorecardUrl || mobileScorecardUrl}
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
                    <p className="mt-2 font-black text-[#0B3D2E]">{formatToPar(activePrintPlayer.scores.reduce((sum, score) => sum + score, 0))}</p>
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

      {isTeamModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm"
          onClick={closeTeamModal}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Team Management
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    {editingTeamId ? "Edit Team" : "Add Team"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeTeamModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <form className="px-7 py-7" onSubmit={handleTeamSubmit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] sm:col-span-2">
                  <span>School Name</span>
                  <input
                    name="schoolName"
                    value={teamFormState.schoolName}
                    onChange={handleTeamInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. Bluffton University"
                  />
                  {teamErrors.schoolName ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{teamErrors.schoolName}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Short Name</span>
                  <input
                    name="shortName"
                    value={teamFormState.shortName}
                    onChange={handleTeamInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. BU"
                  />
                  {teamErrors.shortName ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{teamErrors.shortName}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Team Color</span>
                  <input
                    name="teamColor"
                    value={teamFormState.teamColor}
                    onChange={handleTeamInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. #0B3D2E"
                  />
                  {teamErrors.teamColor ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{teamErrors.teamColor}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] sm:col-span-2">
                  <span>Coach Name</span>
                  <input
                    name="coachName"
                    value={teamFormState.coachName}
                    onChange={handleTeamInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. Coach Smith"
                  />
                  {teamErrors.coachName ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{teamErrors.coachName}</p> : null}
                </label>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeTeamModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  {editingTeamId ? "Save Team" : "Add Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isPlayerModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/70 px-4 py-6 backdrop-blur-sm"
          onClick={closePlayerModal}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-[#E8DCC8] bg-[#F6F1E6] shadow-[0_24px_80px_rgba(11,61,46,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-[#0B3D2E] px-7 py-6 text-[#F6F1E6]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#F0C96A]">
                    Player Management
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.02em]">
                    {editingPlayerId ? "Edit Player" : "Add Player"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closePlayerModal}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-semibold transition duration-300 hover:bg-white/15"
                >
                  ×
                </button>
              </div>
            </div>

            <form className="px-7 py-7" onSubmit={handlePlayerSubmit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>First Name</span>
                  <input
                    name="firstName"
                    value={playerFormState.firstName}
                    onChange={handlePlayerInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. Alex"
                  />
                  {playerErrors.firstName ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{playerErrors.firstName}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Last Name</span>
                  <input
                    name="lastName"
                    value={playerFormState.lastName}
                    onChange={handlePlayerInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. Thompson"
                  />
                  {playerErrors.lastName ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{playerErrors.lastName}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Team</span>
                  <select
                    name="teamId"
                    value={playerFormState.teamId}
                    onChange={handlePlayerInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                  >
                    <option value="">Select a team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={String(team.id)}>
                        {team.schoolName}
                      </option>
                    ))}
                  </select>
                  {playerErrors.teamId ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{playerErrors.teamId}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C]">
                  <span>Handicap</span>
                  <input
                    name="handicap"
                    value={playerFormState.handicap}
                    onChange={handlePlayerInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. +2"
                  />
                  {playerErrors.handicap ? <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#B8892D]">{playerErrors.handicap}</p> : null}
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#51635C] sm:col-span-2">
                  <span>Email (optional)</span>
                  <input
                    name="email"
                    type="email"
                    value={playerFormState.email}
                    onChange={handlePlayerInputChange}
                    className="rounded-2xl border border-[#E8DCC8] bg-white px-4 py-3 text-base font-medium normal-case tracking-normal text-[#0B3D2E] outline-none"
                    placeholder="e.g. alex@example.com"
                  />
                </label>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closePlayerModal}
                  className="rounded-full border border-[#B8892D] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#0B3D2E] transition duration-300 hover:bg-[#B8892D]/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#0B3D2E] px-6 py-3 text-sm font-black uppercase tracking-[0.25em] text-[#F6F1E6] shadow-lg shadow-[#0B3D2E]/15 transition duration-300 hover:-translate-y-0.5"
                >
                  {editingPlayerId ? "Save Player" : "Add Player"}
                </button>
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
