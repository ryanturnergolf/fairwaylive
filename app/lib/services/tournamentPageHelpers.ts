import type { LegacyPairingGroup, LegacyPlayer, LegacyScorecardRow, LegacyTeam } from "../tournamentModel";

export type TeamFormValues = {
  schoolName: string;
  shortName: string;
  teamColor: string;
  coachName: string;
};

export type PlayerFormValues = {
  firstName: string;
  lastName: string;
  teamId: string;
  handicap: string;
  email: string;
};

export type ImportedPlayerPreview = {
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

export const buildTeamShortName = (schoolName: string) => {
  const words = schoolName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "TEAM";
  }

  const initials = words.map((word) => word[0]).join("").toUpperCase();
  return initials.slice(0, 4) || "TEAM";
};

export const validateTeamForm = (teamFormState: TeamFormValues): Partial<Record<keyof TeamFormValues, string>> => {
  const nextErrors: Partial<Record<keyof TeamFormValues, string>> = {};

  if (!teamFormState.schoolName.trim()) {
    nextErrors.schoolName = "School name is required.";
  }

  return nextErrors;
};

export const validatePlayerForm = (playerFormState: PlayerFormValues): Partial<Record<keyof PlayerFormValues, string>> => {
  const nextErrors: Partial<Record<keyof PlayerFormValues, string>> = {};

  if (!playerFormState.firstName.trim()) {
    nextErrors.firstName = "First name is required.";
  }
  if (!playerFormState.lastName.trim()) {
    nextErrors.lastName = "Last name is required.";
  }
  if (!playerFormState.teamId.trim()) {
    nextErrors.teamId = "Team is required.";
  }

  return nextErrors;
};

export const upsertTeamFromForm = ({
  teams,
  teamFormState,
  editingTeamId,
  defaultTeamColor,
  nextTeamId,
}: {
  teams: LegacyTeam[];
  teamFormState: TeamFormValues;
  editingTeamId: number | null;
  defaultTeamColor: string;
  nextTeamId: number;
}) => {
  if (editingTeamId) {
    const existingTeam = teams.find((team) => team.id === editingTeamId);
    return teams.map((team) =>
      team.id === editingTeamId
        ? {
            ...team,
            schoolName: teamFormState.schoolName.trim(),
            shortName: teamFormState.shortName.trim().toUpperCase() || existingTeam?.shortName || buildTeamShortName(teamFormState.schoolName),
            teamColor: teamFormState.teamColor.trim() || existingTeam?.teamColor || defaultTeamColor,
            coachName: teamFormState.coachName.trim() || existingTeam?.coachName || "",
          }
        : team
    );
  }

  return [
    {
      id: nextTeamId,
      schoolName: teamFormState.schoolName.trim(),
      shortName: teamFormState.shortName.trim().toUpperCase() || buildTeamShortName(teamFormState.schoolName),
      teamColor: teamFormState.teamColor.trim() || defaultTeamColor,
      coachName: teamFormState.coachName.trim(),
    },
    ...teams,
  ];
};

export const upsertPlayerFromForm = ({
  players,
  teams,
  playerFormState,
  editingPlayerId,
  nextPlayerId,
}: {
  players: LegacyPlayer[];
  teams: LegacyTeam[];
  playerFormState: PlayerFormValues;
  editingPlayerId: number | null;
  nextPlayerId: number;
}) => {
  const selectedTeam = teams.find((team) => String(team.id) === playerFormState.teamId);

  if (editingPlayerId) {
    return players.map((player) =>
      player.id === editingPlayerId
        ? {
            ...player,
            firstName: playerFormState.firstName.trim(),
            lastName: playerFormState.lastName.trim(),
            teamId: playerFormState.teamId,
            teamName: selectedTeam?.schoolName || "Unassigned",
            handicap: playerFormState.handicap.trim() || player.handicap || "0",
            email: playerFormState.email.trim() || player.email || "",
          }
        : player
    );
  }

  return [
    {
      id: nextPlayerId,
      firstName: playerFormState.firstName.trim(),
      lastName: playerFormState.lastName.trim(),
      teamId: playerFormState.teamId,
      teamName: selectedTeam?.schoolName || "Unassigned",
      handicap: playerFormState.handicap.trim() || "0",
      email: playerFormState.email.trim(),
    },
    ...players,
  ];
};

export const parseCsvLine = (line: string) => {
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

export const parseImportedPlayerCsv = (text: string, teams: LegacyTeam[]) => {
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

  return rows
    .slice(1)
    .map((row) => {
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
    })
    .filter((preview) => preview.firstName || preview.lastName || preview.email || preview.school);
};

export const buildImportedPlayers = (playerImportRows: ImportedPlayerPreview[], baseId: number): LegacyPlayer[] =>
  playerImportRows.map((row, index) => ({
    id: baseId + index,
    firstName: row.firstName.trim(),
    lastName: row.lastName.trim(),
    teamId: row.teamId,
    teamName: row.teamName,
    handicap: row.handicap,
    email: row.email.trim(),
  }));

export const playerImportTemplateCsv = () =>
  ["First Name,Last Name,School,Gender,Class,Email", "Jane,Doe,Bluffton University,Female,Senior,jane.doe@example.com"].join("\n");

export const updateScorecardRows = (
  scorecardRows: LegacyScorecardRow[],
  rowId: number,
  holeIndex: number,
  value: string
) => {
  const parsedValue = Number(value);

  return scorecardRows.map((row) =>
    row.id === rowId
      ? {
          ...row,
          scores: row.scores.map((score, index) => (index === holeIndex ? (Number.isNaN(parsedValue) ? 0 : parsedValue) : score)),
        }
      : row
  );
};

export const formatMinutesToTime = (minutesSinceMidnight: number) => {
  const normalizedMinutes = ((minutesSinceMidnight % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
};

export const generatePairings = (players: LegacyPlayer[]): LegacyPairingGroup[] => {
  const shuffledPlayers = [...players];
  const stablePlayerIdsByRosterId = new Map(players.map((player, index) => [player.id, `player-${index + 1}`]));

  for (let index = shuffledPlayers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledPlayers[index], shuffledPlayers[swapIndex]] = [shuffledPlayers[swapIndex], shuffledPlayers[index]];
  }

  const generatedPairings: LegacyPairingGroup[] = [];
  const startingMinutes = 8 * 60;

  for (let index = 0; index < shuffledPlayers.length; index += 4) {
    const groupPlayers = shuffledPlayers.slice(index, index + 4);
    generatedPairings.push({
      groupNumber: generatedPairings.length + 1,
      teeTime: formatMinutesToTime(startingMinutes + generatedPairings.length * 10),
      startingHole: "1",
      players: groupPlayers.map((player) => ({
        playerId: stablePlayerIdsByRosterId.get(player.id) || String(player.id),
        playerName: `${player.firstName} ${player.lastName}`.trim(),
        teamName: player.teamName || "Unassigned",
      })),
    });
  }

  return generatedPairings;
};

export const relocatePairingPlayer = ({
  pairings,
  sourcePairingIndex,
  sourcePlayerIndex,
  targetPairingIndex,
  targetPlayerIndex,
}: {
  pairings: LegacyPairingGroup[];
  sourcePairingIndex: number;
  sourcePlayerIndex: number;
  targetPairingIndex: number;
  targetPlayerIndex: number;
}) => {
  if (
    sourcePairingIndex < 0 ||
    targetPairingIndex < 0 ||
    sourcePairingIndex >= pairings.length ||
    targetPairingIndex >= pairings.length
  ) {
    return pairings;
  }

  const nextPairings = pairings.map((pairing) => ({
    ...pairing,
    players: [...pairing.players],
  }));

  const sourcePairing = nextPairings[sourcePairingIndex];
  const targetPairing = nextPairings[targetPairingIndex];

  if (sourcePlayerIndex < 0 || sourcePlayerIndex >= sourcePairing.players.length || targetPlayerIndex < 0) {
    return pairings;
  }

  const [movedPlayer] = sourcePairing.players.splice(sourcePlayerIndex, 1);

  if (!movedPlayer) {
    return pairings;
  }

  const adjustedTargetIndex =
    sourcePairingIndex === targetPairingIndex && sourcePlayerIndex < targetPlayerIndex
      ? targetPlayerIndex - 1
      : targetPlayerIndex;

  targetPairing.players.splice(Math.min(adjustedTargetIndex, targetPairing.players.length), 0, movedPlayer);

  return nextPairings;
};

export const generateScorecardRows = (players: LegacyPlayer[], holeCount: number): LegacyScorecardRow[] =>
  players.map((player) => ({
    id: player.id,
    playerName: `${player.firstName} ${player.lastName}`.trim(),
    team: player.teamName || "Unassigned",
    scores: Array.from({ length: holeCount }, () => 0),
  }));

export const buildMobileScorecardPath = ({
  tournamentId,
  shareToken,
  activeQrPairing,
  activeQrScoringPlayerId,
}: {
  tournamentId?: string;
  shareToken?: string;
  activeQrPairing: LegacyPairingGroup | null;
  activeQrScoringPlayerId: string;
}) => {
  if ((!tournamentId && !shareToken) || !activeQrPairing || !activeQrScoringPlayerId) {
    return "/scorecard/test";
  }

  const params = new URLSearchParams({
    pairing: String(activeQrPairing.groupNumber),
  });

  if (shareToken) {
    params.set("shareToken", shareToken);
  } else if (tournamentId) {
    params.set("tournamentId", tournamentId);
  }

  return `/scorecard/${encodeURIComponent(activeQrScoringPlayerId)}?${params.toString()}`;
};

export const pairingExistsForPlayer = (groupings: LegacyPairingGroup[], playerName: string) =>
  groupings.find((pairing) => pairing.players.some((player) => player.playerName === playerName));
