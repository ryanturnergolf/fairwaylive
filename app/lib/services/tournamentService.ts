import {
  createTournamentRow,
  getTournamentPlayers,
  getTournamentRow,
  listTournamentRows,
  upsertTournamentStateSnapshot,
  upsertTournamentPlayers,
  type CreateTournamentRowInput,
  type TournamentPlayerRow,
  type TournamentRow,
  type TournamentPlayerUpsertRow,
} from "../repositories/tournamentRepository";
import type { StoredTournament } from "../tournamentStorage";
import type { Pairing, Player, Team, TournamentStorageEnvelope } from "../tournamentModel";

export type CreateTournamentInput = Omit<StoredTournament, "id"> & {
  fallbackId: string;
};

export type CreateTournamentResult = {
  tournament: StoredTournament;
  source: "supabase" | "local";
  row: TournamentRow | null;
  error: unknown;
};

export type EnsureSharedTournamentInput = CreateTournamentInput & {
  existingSharedTournamentId?: string;
};

export type SyncTournamentStateSnapshotInput = {
  tournamentId: string;
  localTournamentId: string;
  envelope: TournamentStorageEnvelope;
};

export type SharedTournamentScorecardState = {
  tournament: StoredTournament;
  pairings: Array<{
    groupNumber: number;
    teeTime: string;
    startingHole: string;
    players: Array<{
      playerId: string;
      playerName: string;
      teamName: string;
    }>;
  }>;
  scorecardRows: Array<{
    id: number;
    playerName: string;
    team: string;
    scores: number[];
  }>;
  roundSetup: {
    roundNumber: string;
    numberOfHoles: string;
  };
};

const toRoundCount = (rounds: string) => {
  const parsed = Number(rounds);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
};

const toTournamentRowInput = (input: CreateTournamentInput): CreateTournamentRowInput => ({
  name: input.name,
  course: input.course,
  tournamentDate: input.date,
  numberOfRounds: toRoundCount(input.rounds),
  status: input.status.toLowerCase(),
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => uuidPattern.test(value);

export const createTournament = async (
  input: CreateTournamentInput
): Promise<CreateTournamentResult> => {
  const localTournament: StoredTournament = {
    id: input.fallbackId,
    name: input.name,
    course: input.course,
    date: input.date,
    city: input.city,
    state: input.state,
    rounds: input.rounds,
    scoringFormat: input.scoringFormat,
    status: input.status,
    settings: input.settings,
  };

  try {
    const row = await createTournamentRow(toTournamentRowInput(input));

    return {
      tournament: {
        ...localTournament,
        id: row.id,
      },
      source: "supabase",
      row,
      error: null,
    };
  } catch (error) {
    console.error("[TournamentService] Supabase tournament create failed; using local-only tournament.", error);

    return {
      tournament: localTournament,
      source: "local",
      row: null,
      error,
    };
  }
};

export const ensureSharedTournament = async (
  input: EnsureSharedTournamentInput
): Promise<string> => {
  const candidates = [input.existingSharedTournamentId, input.fallbackId].filter(
    (value): value is string => Boolean(value && isUuid(value))
  );

  for (const candidate of candidates) {
    const existingRow = await getTournamentRow(candidate).catch(() => null);
    if (existingRow) {
      return existingRow.id;
    }
  }

  const row = await createTournamentRow(toTournamentRowInput(input));
  return row.id;
};

const asPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getPlayerName = (player: Player) => `${player.firstName} ${player.lastName}`.trim() || player.id;

const getTeamName = (player: Player, teamsById: Map<string, Team>) => {
  const team = teamsById.get(player.teamId);
  return team?.name || (typeof player.statistics.teamName === "string" ? player.statistics.teamName : null);
};

const buildTournamentPlayerRows = (envelope: TournamentStorageEnvelope): TournamentPlayerUpsertRow[] => {
  const { tournament } = envelope;
  const teamsById = new Map(tournament.teams.map((team) => [team.id, team]));
  const teamsByName = new Map(tournament.teams.map((team) => [team.name, team]));
  const playersById = new Map(tournament.players.map((player) => [player.id, player]));
  const roundNumbersById = new Map(
    tournament.rounds.map((round, index) => [round.id, round.roundNumber || index + 1])
  );
  const rowsByKey = new Map<string, TournamentPlayerUpsertRow>();
  const addRow = (row: TournamentPlayerUpsertRow) => {
    rowsByKey.set(`${row.round_number}:${row.player_id}`, row);
  };

  tournament.players.forEach((player, index) => {
    addRow({
      tournament_id: tournament.id,
      player_id: player.id,
      player_name: getPlayerName(player),
      team_id: player.teamId || null,
      team_name: getTeamName(player, teamsById),
      round_number: 1,
      group_number: null,
      tee_number: null,
      starting_hole: null,
      marker_player_id: null,
      is_individual: player.isIndividual,
      position: index + 1,
      status: "active",
    });
  });

  tournament.pairings.forEach((pairing: Pairing) => {
    const roundNumber = roundNumbersById.get(pairing.roundId) ?? 1;
    const startingHole = asPositiveInteger(pairing.startingHole);

    pairing.players.forEach((pairingPlayer, playerIndex) => {
      const player = playersById.get(pairingPlayer.playerId);
      const team = player?.teamId ? teamsById.get(player.teamId) : teamsByName.get(pairingPlayer.teamName);
      const markerPlayer = pairing.players[(playerIndex + 1) % pairing.players.length];

      addRow({
        tournament_id: tournament.id,
        player_id: pairingPlayer.playerId,
        player_name: pairingPlayer.playerName || (player ? getPlayerName(player) : pairingPlayer.playerId),
        team_id: player?.teamId || team?.id || null,
        team_name: pairingPlayer.teamName || team?.name || (player ? getTeamName(player, teamsById) : null),
        round_number: roundNumber,
        group_number: pairing.groupNumber,
        tee_number: startingHole,
        starting_hole: startingHole,
        marker_player_id: markerPlayer?.playerId || null,
        is_individual: player?.isIndividual ?? !team,
        position: playerIndex + 1,
        status: "active",
      });
    });
  });

  return [...rowsByKey.values()];
};

export const syncTournamentPlayers = async (envelope: TournamentStorageEnvelope) => {
  await upsertTournamentPlayers(buildTournamentPlayerRows(envelope));
};

export const syncTournamentStateSnapshot = async ({
  tournamentId,
  localTournamentId,
  envelope,
}: SyncTournamentStateSnapshotInput): Promise<boolean> => {
  if (!tournamentId || !envelope || envelope.version !== 2) {
    return false;
  }

  try {
    await upsertTournamentStateSnapshot({
      tournamentId,
      localTournamentId,
      schemaVersion: envelope.version,
      stateSnapshot: envelope,
    });
    return true;
  } catch (error) {
    console.error("[TournamentService] Supabase tournament state snapshot sync failed; local storage remains saved.", error);
    return false;
  }
};

const toStoredTournament = (row: TournamentRow): StoredTournament => ({
  id: row.id,
  name: row.name,
  course: row.course ?? "",
  date: row.tournament_date ?? "",
  city: "",
  state: "",
  rounds: String(row.number_of_rounds || 1),
  scoringFormat: "",
  status: row.status,
  settings: {},
});

export const loadSharedTournaments = async (): Promise<StoredTournament[]> => {
  const rows = await listTournamentRows();
  return rows.map(toStoredTournament);
};

const toScorecardRowId = (playerId: string, fallbackIndex: number) => {
  const parsed = Number(playerId);
  return Number.isFinite(parsed) ? parsed : fallbackIndex + 1;
};

const hasPairingData = (row: TournamentPlayerRow) =>
  row.group_number !== null || row.tee_number !== null || row.starting_hole !== null || row.marker_player_id !== null;

const dedupeTournamentPlayerRows = (rows: TournamentPlayerRow[]) => {
  const rowsByPlayerId = new Map<string, TournamentPlayerRow>();

  rows.forEach((row) => {
    const existing = rowsByPlayerId.get(row.player_id);
    if (!existing || (!hasPairingData(existing) && hasPairingData(row))) {
      rowsByPlayerId.set(row.player_id, row);
    }
  });

  return [...rowsByPlayerId.values()];
};

export const loadSharedTournamentScorecardState = async (
  tournamentId: string,
  roundNumber = 1,
  holeCount = 18
): Promise<SharedTournamentScorecardState | null> => {
  const [tournamentRow, playerRows] = await Promise.all([
    getTournamentRow(tournamentId),
    getTournamentPlayers(tournamentId, roundNumber),
  ]);

  if (!tournamentRow || playerRows.length === 0) {
    return null;
  }

  const sharedPlayerRows = dedupeTournamentPlayerRows(playerRows);
  const groupedPlayers = new Map<number, TournamentPlayerRow[]>();
  sharedPlayerRows.forEach((row, index) => {
    const groupNumber = row.group_number ?? Math.floor(index / 4) + 1;
    groupedPlayers.set(groupNumber, [...(groupedPlayers.get(groupNumber) ?? []), row]);
  });

  const pairings = Array.from(groupedPlayers.entries())
    .sort(([left], [right]) => left - right)
    .map(([groupNumber, rows]) => ({
      groupNumber,
      teeTime: "",
      startingHole: String(rows[0]?.starting_hole ?? rows[0]?.tee_number ?? 1),
      players: rows.map((row) => ({
        playerId: row.player_id,
        playerName: row.player_name,
        teamName: row.team_name || "Unassigned",
      })),
    }));

  return {
    tournament: toStoredTournament(tournamentRow),
    pairings,
    scorecardRows: sharedPlayerRows.map((row, index) => ({
      id: toScorecardRowId(row.player_id, index),
      playerName: row.player_name,
      team: row.team_name || "Unassigned",
      scores: Array.from({ length: holeCount }, () => 0),
    })),
    roundSetup: {
      roundNumber: String(roundNumber),
      numberOfHoles: String(holeCount),
    },
  };
};
