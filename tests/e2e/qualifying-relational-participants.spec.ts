import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  QualifyingGroupMember,
  QualifyingGroupRecord,
  QualifyingParticipant,
} from "../../app/lib/qualifyingModel";
import { resolveQualifyingParticipantGroupConfiguration } from "../../app/lib/services/qualifyingParticipantGroupService";

const sessionId = "11111111-1111-4111-8111-111111111111";
const participants: QualifyingParticipant[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    qualifyingSessionId: sessionId,
    playerId: "men-alex",
    playerName: "Alex Morgan",
    rosterType: "men",
    displayOrder: 0,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    qualifyingSessionId: sessionId,
    playerId: "men-jordan",
    playerName: "Jordan Lee",
    rosterType: "men",
    displayOrder: 1,
    createdAt: null,
    updatedAt: null,
  },
];
const groups: QualifyingGroupRecord[] = [{
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  qualifyingSessionId: sessionId,
  groupNumber: 1,
  displayOrder: 0,
  createdAt: null,
  updatedAt: null,
}];
const members: QualifyingGroupMember[] = participants.map((participant, index) => ({
  qualifyingGroupId: groups[0].id,
  qualifyingParticipantId: participant.id,
  memberOrder: index,
  createdAt: null,
  updatedAt: null,
}));

test("relational participants and groups override stale Q2 JSON", () => {
  const result = resolveQualifyingParticipantGroupConfiguration({
    participants,
    groups,
    members,
    legacyPlayers: [{
      id: "stale-player",
      name: "Stale Player",
      rosterType: "men",
      classYear: "",
    }],
    legacyGroups: [{ id: "stale-group", name: "Stale Group", playerIds: ["stale-player"] }],
  });

  expect(result.source).toBe("relational");
  expect(result.selectedPlayers.map((player) => player.id)).toEqual(["men-alex", "men-jordan"]);
  expect(result.groups).toEqual([{
    id: groups[0].id,
    name: "Group 1",
    playerIds: ["men-alex", "men-jordan"],
  }]);
});

test("legacy JSON remains a read fallback only when relational rows are absent", () => {
  const legacyPlayers = [{
    id: "women-legacy",
    name: "Legacy Player",
    rosterType: "women" as const,
    classYear: "Senior",
  }];
  const legacyGroups = [{ id: "group-1", name: "Group 1", playerIds: ["women-legacy"] }];
  expect(resolveQualifyingParticipantGroupConfiguration({
    participants: [],
    groups: [],
    members: [],
    legacyPlayers,
    legacyGroups,
  })).toEqual({
    selectedPlayers: legacyPlayers,
    groups: legacyGroups,
    source: "legacy_json",
  });
});

test("Q3A migration is relational, atomic, idempotent, owner-scoped, and engine-isolated", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260727000000_add_qualifying_relational_participants_groups.sql"),
    "utf8"
  );

  expect(migration).toContain("create table if not exists public.qualifying_participants");
  expect(migration).toContain("unique (qualifying_session_id, player_id)");
  expect(migration).toContain("create table if not exists public.qualifying_groups");
  expect(migration).toContain("unique (qualifying_session_id, group_number)");
  expect(migration).toContain("create table if not exists public.qualifying_group_members");
  expect(migration).toContain("qualifying_participant_id uuid not null unique");
  expect(migration).toContain("unique (qualifying_group_id, member_order)");
  expect(migration).toContain("validate_qualifying_participant_roster");
  expect(migration).toContain("validate_qualifying_group_membership");
  expect(migration).toContain("enable row level security");
  expect(migration).toContain("Coaches can manage owned qualifying participants");
  expect(migration).toContain("Coaches can manage owned qualifying groups");
  expect(migration).toContain("Coaches can manage owned qualifying group members");
  expect(migration).toContain("on conflict (qualifying_session_id, player_id) do nothing");
  expect(migration).toContain("on conflict (qualifying_session_id, group_number) do nothing");
  expect(migration).toContain("on conflict (qualifying_participant_id) do nothing");
  expect(migration).toContain("insert into public.qualifying_days");
  expect(migration).toContain("insert into public.qualifying_participants");
  expect(migration).toContain("insert into public.qualifying_groups");
  expect(migration).toContain("insert into public.qualifying_group_members");
  expect(migration).not.toContain("insert into public.tournaments");
  expect(migration).not.toContain("insert into public.tournament_rounds");
  expect(migration).not.toContain("insert into public.tournament_players");
  expect(migration).not.toContain("insert into public.score_entries");
  expect(migration).not.toContain("insert into public.tournament_share_tokens");
});
