import {
  createTournamentRow,
  upsertTournamentPlayers,
  type CreateTournamentRowInput,
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
