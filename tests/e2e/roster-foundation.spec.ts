import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deserializeQualifyingParticipant } from "../../app/lib/repositories/qualifyingRepository";
import { deserializeTournamentPlayer } from "../../app/lib/repositories/tournamentRepository";
import {
  buildEventRosterIdentityLink,
  getRosterLifecycleTransition,
  validatePermanentRosterPlayerInput,
  validateRosterPlayerUpdate,
  validateRosterSeasonInput,
  validateSeasonRosterMembershipInput,
} from "../../app/lib/services/rosterFoundationService";

test("season validation accepts valid boundaries and rejects invalid ranges and dates", () => {
  expect(validateRosterSeasonInput({
    name: " 2026-2027 ",
    startsOn: "2026-08-01",
    endsOn: "2027-06-30",
    status: "planned",
  })).toEqual({
    name: "2026-2027",
    startsOn: "2026-08-01",
    endsOn: "2027-06-30",
    status: "planned",
  });

  expect(() => validateRosterSeasonInput({
    name: "Invalid",
    startsOn: "2027-06-30",
    endsOn: "2026-08-01",
  })).toThrow("Season dates are invalid.");
  expect(() => validateRosterSeasonInput({
    name: "Invalid",
    startsOn: "2026-02-31",
    endsOn: "2027-06-30",
  })).toThrow("Season dates are invalid.");
  expect(() => validateRosterSeasonInput({
    name: "Invalid",
    startsOn: "2026-08-01",
    endsOn: "2027-06-30",
    status: "unknown" as "planned",
  })).toThrow("Season status is invalid.");
});

test("permanent player validation normalizes names and rejects invalid identity inputs", () => {
  expect(validatePermanentRosterPlayerInput({
    firstName: " Avery ",
    lastName: " Brooks ",
    preferredName: " Ave ",
    sourcePlayerId: " roster-12 ",
    rosterType: "men",
    status: "incoming",
  })).toEqual({
    firstName: "Avery",
    lastName: "Brooks",
    preferredName: "Ave",
    sourcePlayerId: "roster-12",
    rosterType: "men",
    status: "incoming",
  });

  expect(() => validatePermanentRosterPlayerInput({
    firstName: " ",
    lastName: "Brooks",
    rosterType: "men",
  })).toThrow("First name is required.");
  expect(() => validatePermanentRosterPlayerInput({
    firstName: "Avery",
    lastName: "Brooks",
    rosterType: "mixed" as "men",
  })).toThrow("Roster type is invalid.");
  expect(() => validatePermanentRosterPlayerInput({
    firstName: "Avery",
    lastName: "Brooks",
    rosterType: "men",
    status: "deleted" as "active",
  })).toThrow("Player status is invalid.");
});

test("season membership and lifecycle contracts preserve permanent identity", () => {
  expect(validateSeasonRosterMembershipInput({
    seasonId: "season-id",
    rosterPlayerId: "player-id",
    status: "redshirt",
    classYear: " Sophomore ",
  })).toEqual({
    seasonId: "season-id",
    rosterPlayerId: "player-id",
    status: "redshirt",
    classYear: "Sophomore",
  });
  expect(() => validateSeasonRosterMembershipInput({
    seasonId: "",
    rosterPlayerId: "player-id",
  })).toThrow("Season is required.");
  expect(() => validateSeasonRosterMembershipInput({
    seasonId: "season-id",
    rosterPlayerId: "player-id",
    status: "deleted" as "active",
  })).toThrow("Season roster status is invalid.");

  expect(getRosterLifecycleTransition("graduated")).toEqual({
    status: "graduated",
    archivedAt: null,
  });
  expect(getRosterLifecycleTransition("former").archivedAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T/
  );
  expect(() => getRosterLifecycleTransition("deleted" as "active")).toThrow(
    "Player status is invalid."
  );

  expect(validateRosterPlayerUpdate({
    id: "player-id",
    firstName: " Avery ",
    lastName: " Brooks ",
    preferredName: " Ave ",
    status: "redshirt",
  })).toEqual({
    id: "player-id",
    firstName: "Avery",
    lastName: "Brooks",
    preferredName: "Ave",
    status: "redshirt",
  });
});

test("event roster links remain optional for legacy records", () => {
  expect(buildEventRosterIdentityLink(null)).toEqual({});
  expect(buildEventRosterIdentityLink(undefined)).toEqual({});
  expect(buildEventRosterIdentityLink("permanent-player-id")).toEqual({
    rosterPlayerId: "permanent-player-id",
  });

  const qualifyingParticipant = deserializeQualifyingParticipant({
    id: "participant-id",
    qualifying_session_id: "session-id",
    player_id: "legacy-player-id",
    player_name: "Legacy Player",
    roster_type: "women",
    display_order: 0,
    created_at: null,
    updated_at: null,
  });
  expect(qualifyingParticipant.rosterPlayerId).toBeNull();
  expect(qualifyingParticipant.playerId).toBe("legacy-player-id");

  const tournamentPlayer = deserializeTournamentPlayer({
    id: "event-player-row",
    tournament_id: "tournament-id",
    player_id: "legacy-player-id",
    player_name: "Legacy Player",
    team_id: null,
    team_name: null,
    round_number: 1,
    group_number: 1,
    tee_number: null,
    starting_hole: 1,
    marker_player_id: null,
    is_individual: true,
    position: 1,
    status: "active",
    created_at: null,
    updated_at: null,
  });
  expect(tournamentPlayer.roster_player_id).toBeNull();
  expect(tournamentPlayer.player_id).toBe("legacy-player-id");
});

test("migration protects ownership and history without privileged helper functions", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260803000000_add_roster_foundation.sql"),
    "utf8"
  );

  expect(migration).toContain("create table public.seasons");
  expect(migration).toContain("create table public.roster_players");
  expect(migration).toContain("create table public.season_roster_memberships");
  expect(migration).toContain("add column roster_player_id uuid");
  expect(migration).toContain("on delete restrict");
  expect(migration).not.toContain("on delete cascade");
  expect(migration).toContain("enable row level security");
  expect(migration).toContain("owner_id = public.current_coach_id()");
  expect(migration).toContain("validate_roster_player_event_link");
  expect(migration).toContain("player_owner_id <> event_owner_id");
  expect(migration).toContain("There are intentionally no DELETE policies");
  expect(migration).not.toContain("security definer");
  expect(migration).not.toMatch(/insert into public\.(roster_players|seasons)/);
});
