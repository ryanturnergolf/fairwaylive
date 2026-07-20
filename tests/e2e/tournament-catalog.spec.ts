import { expect, test } from "@playwright/test";
import {
  buildTournamentCatalog,
  type TournamentCatalogEntry,
} from "../../app/lib/services/tournamentCatalogService";
import type { TournamentRow } from "../../app/lib/repositories/tournamentRepository";
import type { StoredTournament } from "../../app/lib/tournamentStorage";
import type { TournamentAggregate } from "../../app/lib/services/tournamentService";

const sharedId = "11111111-1111-4111-8111-111111111111";

const tournamentRow = (overrides: Partial<TournamentRow> = {}): TournamentRow => ({
  id: sharedId,
  created_by: null,
  owner_id: null,
  name: "Supabase Invitational",
  course: "Authority Club",
  tournament_date: "2026-07-19",
  number_of_rounds: 2,
  status: "live",
  finalized_at: null,
  aggregate_version: 3,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-19T10:00:00.000Z",
  ...overrides,
});

const localTournament = (overrides: Partial<StoredTournament> = {}): StoredTournament => ({
  id: "local-invitational",
  name: "Cached Invitational",
  course: "Cached Club",
  date: "2026-07-18",
  city: "Ada",
  state: "OH",
  rounds: "1",
  scoringFormat: "Stroke Play",
  status: "Upcoming",
  settings: {},
  ...overrides,
});

const aggregate = (
  overrides: Partial<TournamentAggregate> = {}
): TournamentAggregate => ({
  tournamentId: sharedId,
  sharedTournamentId: sharedId,
  localTournamentId: "local-invitational",
  tournament: localTournament({
    id: sharedId,
    name: "Snapshot Invitational",
    course: "Snapshot Club",
    date: "2026-07-17",
    status: "snapshot-status",
    settings: { city: "Columbus", state: "OH", scoringFormat: "Stroke Play" },
  }),
  tournamentRow: null,
  envelope: null,
  snapshotUpdatedAt: "2026-07-19T09:00:00.000Z",
  source: "snapshot",
  teams: [],
  players: [],
  pairings: [],
  rounds: [],
  scores: [],
  uiState: null,
  scorecards: null,
  scorecardRows: [],
  roundSetup: null,
  tournamentPlayers: [],
  ...overrides,
});

const byCanonicalId = (entries: TournamentCatalogEntry[], canonicalId: string) =>
  entries.find((entry) => entry.canonicalId === canonicalId);

test("catalog includes a Supabase-only tournament", () => {
  const catalog = buildTournamentCatalog({ tournamentRows: [tournamentRow()] });

  expect(catalog).toHaveLength(1);
  expect(catalog[0]).toMatchObject({
    canonicalId: sharedId,
    sharedTournamentId: sharedId,
    localId: null,
    provenance: "supabase",
    isLocalOnly: false,
    isSupabaseBacked: true,
    name: "Supabase Invitational",
  });
});

test("catalog exposes snapshot-backed Supabase provenance and aggregate", () => {
  const snapshot = aggregate();
  const catalog = buildTournamentCatalog({ aggregates: [snapshot] });

  expect(catalog[0]).toMatchObject({
    canonicalId: sharedId,
    provenance: "snapshot",
    aggregate: snapshot,
    name: "Snapshot Invitational",
    city: "Ada",
  });
});

test("catalog keeps an unmapped localStorage-only tournament visible", () => {
  const catalog = buildTournamentCatalog({
    localTournaments: [localTournament()],
    resolveSharedTournamentId: () => "",
  });

  expect(catalog[0]).toMatchObject({
    canonicalId: "local-invitational",
    localId: "local-invitational",
    sharedTournamentId: null,
    provenance: "local-only",
    isLocalOnly: true,
    isSupabaseBacked: false,
  });
});

test("mapped local ID and Supabase UUID deduplicate into one canonical entry", () => {
  const catalog = buildTournamentCatalog({
    localTournaments: [localTournament()],
    tournamentRows: [tournamentRow()],
    resolveSharedTournamentId: () => sharedId,
  });

  expect(catalog).toHaveLength(1);
  expect(catalog[0]).toMatchObject({
    canonicalId: sharedId,
    localId: "local-invitational",
    sharedTournamentId: sharedId,
    name: "Supabase Invitational",
  });
});

test("Supabase status overrides stale local status", () => {
  const catalog = buildTournamentCatalog({
    localTournaments: [localTournament({ status: "Upcoming" })],
    tournamentRows: [tournamentRow({ status: "finalized" })],
    resolveSharedTournamentId: () => sharedId,
  });

  expect(catalog[0].status).toBe("finalized");
  expect(catalog[0].tournament.status).toBe("finalized");
});

test("Supabase finalized state overrides local state", () => {
  const finalizedAt = "2026-07-19T12:00:00.000Z";
  const catalog = buildTournamentCatalog({
    localTournaments: [
      localTournament({
        status: "live",
        settings: { finalization: { isFinalized: false, finalizedAt: null } },
      }),
    ],
    tournamentRows: [tournamentRow({ status: "finalized", finalized_at: finalizedAt })],
    resolveSharedTournamentId: () => sharedId,
  });

  expect(catalog[0]).toMatchObject({
    status: "finalized",
    isFinalized: true,
    finalizedAt,
  });
});

test("local cached fields enrich missing presentation data without replacing authority", () => {
  const catalog = buildTournamentCatalog({
    localTournaments: [
      localTournament({
        name: "Stale Name",
        course: "Cached Club",
        date: "2026-07-18",
        city: "Ada",
        state: "OH",
        scoringFormat: "Match Play",
      }),
    ],
    tournamentRows: [
      tournamentRow({
        name: "Authoritative Name",
        course: null,
        tournament_date: null,
        status: "live",
      }),
    ],
    resolveSharedTournamentId: () => sharedId,
  });

  expect(catalog[0]).toMatchObject({
    name: "Authoritative Name",
    status: "live",
    course: "Cached Club",
    date: "2026-07-18",
    city: "Ada",
    state: "OH",
    scoringFormat: "Match Play",
  });
});

test("mapped cached tournament remains distinct from unmapped local-only entries", () => {
  const catalog = buildTournamentCatalog({
    localTournaments: [
      localTournament(),
      localTournament({ id: "local-draft", name: "Local Draft" }),
    ],
    resolveSharedTournamentId: (localId) => localId === "local-invitational" ? sharedId : "",
  });

  expect(byCanonicalId(catalog, sharedId)).toMatchObject({
    provenance: "cached",
    isLocalOnly: false,
    isSupabaseBacked: true,
  });
  expect(byCanonicalId(catalog, "local-draft")).toMatchObject({
    provenance: "local-only",
    isLocalOnly: true,
  });
});

test("stale popcorn remains local-only and cannot replace a Supabase tournament", () => {
  const catalog = buildTournamentCatalog({
    localTournaments: [
      localTournament({ id: "popcorn", name: "popcorn", status: "old" }),
    ],
    tournamentRows: [tournamentRow()],
    resolveSharedTournamentId: () => "",
  });

  expect(catalog).toHaveLength(2);
  expect(byCanonicalId(catalog, sharedId)).toMatchObject({
    name: "Supabase Invitational",
    status: "live",
    provenance: "supabase",
  });
  expect(byCanonicalId(catalog, "popcorn")).toMatchObject({
    name: "popcorn",
    provenance: "local-only",
    isLocalOnly: true,
  });
});

test("catalog ordering and canonical identities are deterministic", () => {
  const rows = [
    tournamentRow({ id: "33333333-3333-4333-8333-333333333333", name: "Zulu", tournament_date: "2026-07-18" }),
    tournamentRow({ id: "22222222-2222-4222-8222-222222222222", name: "Alpha", tournament_date: "2026-07-20" }),
  ];
  const locals = [
    localTournament({ id: "local-z", name: "Beta", date: "2026-07-20" }),
  ];
  const input = {
    localTournaments: locals,
    tournamentRows: rows,
    resolveSharedTournamentId: () => "",
  };

  const first = buildTournamentCatalog(input).map((entry) => entry.canonicalId);
  const second = buildTournamentCatalog({
    ...input,
    localTournaments: [...locals].reverse(),
    tournamentRows: [...rows].reverse(),
  }).map((entry) => entry.canonicalId);

  expect(first).toEqual([
    "22222222-2222-4222-8222-222222222222",
    "local-z",
    "33333333-3333-4333-8333-333333333333",
  ]);
  expect(second).toEqual(first);
});
