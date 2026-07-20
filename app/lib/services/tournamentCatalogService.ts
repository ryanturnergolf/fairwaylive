import { listTournamentRows, type TournamentRow } from "../repositories/tournamentRepository";
import {
  loadSharedTournamentIdFromStorage,
  type StoredTournament,
} from "../tournamentStorage";
import {
  loadSharedTournamentAggregates,
  type TournamentAggregate,
} from "./tournamentService";

export type TournamentCatalogProvenance = "supabase" | "snapshot" | "local-only" | "cached";

export type TournamentCatalogEntry = {
  canonicalId: string;
  localId: string | null;
  sharedTournamentId: string | null;
  name: string;
  course: string;
  date: string;
  city: string;
  state: string;
  rounds: string;
  scoringFormat: string;
  status: string;
  isFinalized: boolean;
  finalizedAt: string | null;
  updatedAt: string | null;
  provenance: TournamentCatalogProvenance;
  isLocalOnly: boolean;
  isSupabaseBacked: boolean;
  aggregate: TournamentAggregate | null;
  tournament: StoredTournament;
};

export type TournamentCatalogIdentityResolver = (localTournamentId: string) => string;

export type BuildTournamentCatalogInput = {
  localTournaments?: StoredTournament[];
  tournamentRows?: TournamentRow[];
  aggregates?: TournamentAggregate[];
  resolveSharedTournamentId?: TournamentCatalogIdentityResolver;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const getFinalization = (settings: unknown) => {
  const finalization = asRecord(asRecord(settings)?.finalization);
  const finalizedAt = asString(finalization?.finalizedAt);
  return {
    isFinalized: Boolean(finalization?.isFinalized && finalizedAt),
    finalizedAt: finalizedAt || null,
  };
};

const isFinalizedStatus = (status: string) =>
  ["finalized", "complete"].includes(status.trim().toLowerCase());

const toTournament = (entry: Omit<TournamentCatalogEntry, "tournament">): StoredTournament => ({
  id: entry.canonicalId,
  name: entry.name,
  course: entry.course,
  date: entry.date,
  city: entry.city,
  state: entry.state,
  rounds: entry.rounds,
  scoringFormat: entry.scoringFormat,
  status: entry.status,
  settings: entry.aggregate?.tournament.settings ?? {},
});

const withTournament = (
  entry: Omit<TournamentCatalogEntry, "tournament">,
  settings?: unknown
): TournamentCatalogEntry => ({
  ...entry,
  tournament: {
    ...toTournament(entry),
    settings: settings ?? entry.aggregate?.tournament.settings ?? {},
  },
});

const compareCatalogEntries = (left: TournamentCatalogEntry, right: TournamentCatalogEntry) => {
  const dateOrder = right.date.localeCompare(left.date);
  if (dateOrder !== 0) return dateOrder;
  const nameOrder = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  if (nameOrder !== 0) return nameOrder;
  return left.canonicalId.localeCompare(right.canonicalId);
};

const buildRemoteEntry = (
  sharedTournamentId: string,
  row: TournamentRow | null,
  aggregate: TournamentAggregate | null
): TournamentCatalogEntry => {
  const snapshotTournament = aggregate?.tournament;
  const snapshotSettings = asRecord(snapshotTournament?.settings);
  const snapshotFinalization = getFinalization(snapshotTournament?.settings);
  const status = row?.status ?? snapshotTournament?.status ?? "upcoming";
  const finalizedAt = row
    ? row.finalized_at ?? null
    : snapshotFinalization.finalizedAt;
  const isFinalized = row
    ? Boolean(row.finalized_at || isFinalizedStatus(row.status))
    : snapshotFinalization.isFinalized || isFinalizedStatus(status);
  const canonicalId = row?.id || sharedTournamentId;
  const entry = {
    canonicalId,
    localId: aggregate?.localTournamentId || null,
    sharedTournamentId: canonicalId,
    name: row?.name || snapshotTournament?.name || "Tournament",
    course: row?.course || snapshotTournament?.course || "",
    date: row?.tournament_date || snapshotTournament?.date || asString(snapshotSettings?.date),
    city: snapshotTournament?.city || asString(snapshotSettings?.city),
    state: snapshotTournament?.state || asString(snapshotSettings?.state),
    rounds: String(row?.number_of_rounds || Number(snapshotTournament?.rounds) || 1),
    scoringFormat: snapshotTournament?.scoringFormat || asString(snapshotSettings?.scoringFormat),
    status,
    isFinalized,
    finalizedAt,
    updatedAt: row?.updated_at ?? aggregate?.snapshotUpdatedAt ?? null,
    provenance: aggregate?.source === "snapshot" ? "snapshot" as const : "supabase" as const,
    isLocalOnly: false,
    isSupabaseBacked: true,
    aggregate,
  };
  return withTournament(entry, snapshotTournament?.settings);
};

const enrichRemoteEntry = (
  entry: TournamentCatalogEntry,
  localTournament: StoredTournament
): TournamentCatalogEntry => {
  const next = {
    ...entry,
    localId: entry.localId || localTournament.id,
    course: entry.course || localTournament.course,
    date: entry.date || localTournament.date,
    city: entry.city || localTournament.city,
    state: entry.state || localTournament.state,
    scoringFormat: entry.scoringFormat || localTournament.scoringFormat,
  };
  return withTournament(next, entry.tournament.settings);
};

const buildLocalEntry = (
  tournament: StoredTournament,
  sharedTournamentId: string
): TournamentCatalogEntry => {
  const finalization = getFinalization(tournament.settings);
  const isSupabaseBacked = Boolean(sharedTournamentId);
  const canonicalId = sharedTournamentId || tournament.id;
  const entry = {
    canonicalId,
    localId: tournament.id,
    sharedTournamentId: sharedTournamentId || null,
    name: tournament.name,
    course: tournament.course,
    date: tournament.date,
    city: tournament.city,
    state: tournament.state,
    rounds: tournament.rounds,
    scoringFormat: tournament.scoringFormat,
    status: tournament.status,
    isFinalized: finalization.isFinalized || isFinalizedStatus(tournament.status),
    finalizedAt: finalization.finalizedAt,
    updatedAt: null,
    provenance: isSupabaseBacked ? "cached" as const : "local-only" as const,
    isLocalOnly: !isSupabaseBacked,
    isSupabaseBacked,
    aggregate: null,
  };
  return withTournament(entry, tournament.settings);
};

export const buildTournamentCatalog = ({
  localTournaments = [],
  tournamentRows = [],
  aggregates = [],
  resolveSharedTournamentId = loadSharedTournamentIdFromStorage,
}: BuildTournamentCatalogInput): TournamentCatalogEntry[] => {
  const aggregatesBySharedId = new Map(
    aggregates.map((aggregate) => [aggregate.sharedTournamentId || aggregate.tournamentId, aggregate])
  );
  const entriesByCanonicalId = new Map<string, TournamentCatalogEntry>();

  tournamentRows.forEach((row) => {
    entriesByCanonicalId.set(
      row.id,
      buildRemoteEntry(row.id, row, aggregatesBySharedId.get(row.id) ?? null)
    );
  });

  aggregates.forEach((aggregate) => {
    const sharedTournamentId = aggregate.sharedTournamentId || aggregate.tournamentId;
    if (!entriesByCanonicalId.has(sharedTournamentId)) {
      entriesByCanonicalId.set(
        sharedTournamentId,
        buildRemoteEntry(sharedTournamentId, aggregate.tournamentRow, aggregate)
      );
    }
  });

  localTournaments.forEach((localTournament) => {
    const mappedSharedId =
      resolveSharedTournamentId(localTournament.id) ||
      aggregates.find((aggregate) => aggregate.localTournamentId === localTournament.id)?.sharedTournamentId ||
      "";
    const remoteEntry = mappedSharedId ? entriesByCanonicalId.get(mappedSharedId) : null;

    if (remoteEntry) {
      entriesByCanonicalId.set(mappedSharedId, enrichRemoteEntry(remoteEntry, localTournament));
      return;
    }

    const localEntry = buildLocalEntry(localTournament, mappedSharedId);
    const existing = entriesByCanonicalId.get(localEntry.canonicalId);
    entriesByCanonicalId.set(
      localEntry.canonicalId,
      existing ? enrichRemoteEntry(existing, localTournament) : localEntry
    );
  });

  return [...entriesByCanonicalId.values()].sort(compareCatalogEntries);
};

export const loadTournamentCatalog = async (
  localTournaments: StoredTournament[] = []
): Promise<TournamentCatalogEntry[]> => {
  const tournamentRows = await listTournamentRows();
  const aggregates = await loadSharedTournamentAggregates(tournamentRows);
  return buildTournamentCatalog({ localTournaments, tournamentRows, aggregates });
};
