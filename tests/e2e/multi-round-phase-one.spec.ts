import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createEmptyTournamentModel,
  defaultLegacyTournamentUiState,
  type TournamentStorageEnvelope,
} from "../../app/lib/tournamentModel";
import {
  countQualifyingRounds,
  orderConfiguredRounds,
  parseConfiguredRoundCount,
  projectConfiguredTournamentRounds,
  resolveConfiguredTournamentRound,
  selectInitialOperationalRound,
  validateQualifyingRoundCount,
} from "../../app/lib/services/roundDomainService";
import {
  buildConfiguredQualifyingRoundProjection,
  resolvePlayerResumeRound,
} from "../../app/lib/services/qualifyingRoundIdentityService";
import {
  hydrateTournamentPageEnvelopeForRound,
} from "../../app/lib/services/tournamentService";
import { validateQualifyingCreation } from "../../app/lib/services/qualifyingCreationService";
import { parseTournamentStorageEnvelope } from "../../app/lib/tournamentStorage";

const migrationPath = join(process.cwd(), "supabase/migrations/20260829000000_add_durable_multi_round_authority.sql");
const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const stableRoundId = (roundNumber: number) => `00000000-0000-4000-8000-${String(roundNumber).padStart(12, "0")}`;

const buildEnvelope = (): TournamentStorageEnvelope => {
  const tournament = createEmptyTournamentModel("tournament-id", "Ten Rounds", "Course", {
    operationalCurrentRoundId: stableRoundId(4),
    selectedRoundId: stableRoundId(2),
    rounds: 10,
  }, 10);
  tournament.rounds = tournament.rounds.map((round) => ({ ...round, id: stableRoundId(round.roundNumber) }));
  tournament.scores = [1, 2, 3, 10].map((roundNumber) => ({
    playerId: "player-1",
    roundId: stableRoundId(roundNumber),
    holeScores: Array.from({ length: 9 }, () => roundNumber),
    total: roundNumber * 9,
    status: roundNumber === 2 ? "live" as const : "complete" as const,
    enteredBy: "self" as const,
  }));
  return {
    version: 2,
    tournament,
    uiState: defaultLegacyTournamentUiState(),
    roundPresentationsById: Object.fromEntries([1, 2, 3, 10].map((roundNumber) => [
      stableRoundId(roundNumber),
      {
        pairings: [],
        scorecards: {
          scorecardsGenerated: true,
          scorecardRows: [{ id: 1, playerName: "Player One", team: "Team", scores: Array.from({ length: 9 }, () => roundNumber) }],
          roundSetup: { roundNumber: String(roundNumber), startingHole: "1", numberOfHoles: "9", teeTime: "8:00 AM", countingScores: "4" },
        },
      },
    ])),
  };
};

test("configured Tournament rounds accept exactly 1 through 10 and order R10 numerically", () => {
  expect(() => parseConfiguredRoundCount(0)).toThrow("between 1 and 10");
  expect(parseConfiguredRoundCount(1)).toBe(1);
  expect(parseConfiguredRoundCount(10)).toBe(10);
  expect(() => parseConfiguredRoundCount(11)).toThrow("between 1 and 10");
  const unordered = [10, 2, 1, 4, 3].map((roundNumber) => ({ id: stableRoundId(roundNumber), roundNumber }));
  expect(projectConfiguredTournamentRounds(unordered).map((round) => round.displayLabel)).toEqual(["R1", "R2", "R3", "R4", "R10"]);
});

test("legacy round-N identifiers resolve only to an existing round owned by the supplied event projection", () => {
  const rounds = [1, 2, 10].map((roundNumber) => ({ id: stableRoundId(roundNumber), roundNumber }));
  expect(resolveConfiguredTournamentRound(rounds, "round-2")?.id).toBe(stableRoundId(2));
  expect(resolveConfiguredTournamentRound(rounds, stableRoundId(10))?.roundNumber).toBe(10);
  expect(resolveConfiguredTournamentRound(rounds, "round-3")).toBeNull();
  expect(resolveConfiguredTournamentRound(rounds, "round-11")).toBeNull();
  expect(resolveConfiguredTournamentRound(rounds, "other-event-round")).toBeNull();
});

test("new snapshot projection isolates R1 R2 R3 and R10 by stable round identity", () => {
  const envelope = buildEnvelope();
  for (const roundNumber of [1, 2, 3, 10]) {
    const hydration = hydrateTournamentPageEnvelopeForRound(envelope, roundNumber);
    expect(hydration.roundSetup.roundNumber).toBe(String(roundNumber));
    expect(hydration.scorecardRows[0].scores).toEqual(Array.from({ length: 9 }, () => roundNumber));
  }
  expect(hydrateTournamentPageEnvelopeForRound(envelope, 1).scorecardRows[0].scores).toEqual(Array(9).fill(1));
  expect(envelope.tournament.settings.operationalCurrentRoundId).toBe(stableRoundId(4));
  expect(envelope.tournament.settings.selectedRoundId).toBe(stableRoundId(2));
});

test("legacy single-presentation snapshots remain bound to their recorded round without duplication", () => {
  const legacyUiState = defaultLegacyTournamentUiState();
  legacyUiState.scorecards.roundSetup.roundNumber = "2";
  legacyUiState.scorecards.scorecardsGenerated = true;
  legacyUiState.scorecards.scorecardRows = [{ id: 7, playerName: "Legacy Player", team: "Legacy", scores: Array(9).fill(5) }];
  const raw = JSON.stringify({ version: 2, tournament: createEmptyTournamentModel("legacy", "Legacy", "Course", {}, 3), uiState: legacyUiState });
  const parsed = parseTournamentStorageEnvelope("legacy", raw);
  expect(parsed?.roundPresentationsById).toBeUndefined();
  expect(hydrateTournamentPageEnvelopeForRound(parsed!, 1).scorecardRows).toEqual([]);
  expect(hydrateTournamentPageEnvelopeForRound(parsed!, 2).scorecardRows[0].scores).toEqual(Array(9).fill(5));
  expect(hydrateTournamentPageEnvelopeForRound(parsed!, 3).scorecardRows).toEqual([]);
});

test("operational current round is independent from selected workspace round", () => {
  const envelope = buildEnvelope();
  expect(envelope.tournament.settings.operationalCurrentRoundId).toBe(stableRoundId(4));
  envelope.tournament.settings.selectedRoundId = stableRoundId(10);
  expect(envelope.tournament.settings.operationalCurrentRoundId).toBe(stableRoundId(4));
  expect(hydrateTournamentPageEnvelopeForRound(envelope, 10).roundSetup.roundNumber).toBe("10");
});

test("Qualifying supports 1 through 10 total rounds across days and rejects 0 or 11", () => {
  const rounds = (count: number) => Array.from({ length: count }, () => ({}));
  expect(countQualifyingRounds([{ rounds: rounds(3) }, { rounds: rounds(3) }, { rounds: rounds(4) }])).toBe(10);
  expect(validateQualifyingRoundCount([{ rounds: rounds(1) }])).toBe(1);
  expect(validateQualifyingRoundCount([{ rounds: rounds(10) }])).toBe(10);
  expect(() => validateQualifyingRoundCount([])).toThrow("between 1 and 10");
  expect(() => validateQualifyingRoundCount([{ rounds: rounds(11) }])).toThrow("between 1 and 10");
});

test("Qualifying stable identity distinguishes operational selected and player resume rounds", () => {
  const configured = buildConfiguredQualifyingRoundProjection({
    qualifyingRounds: Array.from({ length: 10 }, (_, index) => ({
      id: `qualifying-${index + 1}`,
      qualifying_session_id: "session-1",
      qualifying_day_id: index < 5 ? "day-1" : "day-2",
      round_order: (index % 5) + 1,
      display_name: `Round ${index + 1}`,
      hole_count: 9,
      starting_hole: 1,
      ending_hole: 9,
      hole_sequence: [1,2,3,4,5,6,7,8,9],
    })),
    days: [{ id: "day-1", dayNumber: 1 }, { id: "day-2", dayNumber: 2 }],
    tournamentRounds: Array.from({ length: 10 }, (_, index) => ({
      id: stableRoundId(index + 1),
      tournamentId: "tournament-id",
      roundNumber: index + 1,
      name: `Round ${index + 1}`,
      holeCount: 9,
      startingHole: 1,
      endingHole: 9,
      holeSequence: [1,2,3,4,5,6,7,8,9],
      qualifyingDay: index < 5 ? 1 : 2,
      qualifyingSegment: (index % 5) + 1,
      qualifyingSessionId: "session-1",
      createdAt: null,
      updatedAt: null,
    })),
  });
  const resume = resolvePlayerResumeRound(configured, new Set([1, 2, 3, 4]));
  expect(configured.map((round) => round.roundNumber)).toEqual([1,2,3,4,5,6,7,8,9,10]);
  expect(resume?.qualifyingRoundId).toBe("qualifying-5");
  expect(configured[5].qualifyingRoundId).toBe("qualifying-6");
  expect(configured[1].qualifyingRoundId).toBe("qualifying-2");
});

test("migration creates all durable rounds atomically and protects edits and operational ownership", () => {
  const sql = readFileSync(migrationPath, "utf8");
  expect(sql).toContain("number_of_rounds between 1 and 10");
  expect(sql).toContain("create or replace function public.create_tournament_with_rounds");
  expect(sql).toContain("generate_series(1, input_number_of_rounds)");
  expect(sql).toContain("create or replace function public.configure_tournament_round_count");
  expect(sql).toContain("A finalized Tournament round count is immutable");
  expect(sql).toContain("cannot be removed because it has dependent state");
  expect(sql).toContain("operational_current_round_id");
  expect(sql).toContain("foreign key (operational_current_round_id, id)");
  expect(sql).not.toContain("alter table public.score_entries add column");
  expect(sql).not.toContain("alter table public.score_hole_entries add column");
});

test("creation UIs expose the 1 through 10 contract and no fixed R1-R4 repair selector remains", () => {
  const dashboard = source("app/dashboard/page.tsx");
  const qualifyingWizard = source("app/coach-dashboard/qualifying-manager/new/page.tsx");
  const pairings = source("app/tournament/[id]/components/PairingsScorecardGeneration.tsx");
  expect(dashboard).toContain("Array.from({ length: 10 }");
  expect(qualifyingWizard).toContain("MAX_CONFIGURED_ROUNDS");
  expect(qualifyingWizard).toContain("total configured rounds");
  expect(pairings).toContain("roundOptions.map");
  expect(pairings).not.toContain('["Round 1", "Round 2", "Round 3", "Round 4"]');
});

test("legacy one-round input remains compatible while malformed direct Qualifying input is rejected", () => {
  const legacyDay = { dayNumber: 1, playDate: "2026-08-29", holesTotal: 9, courseName: "Course", teeName: "Blue", startingHole: 1 };
  const base = {
    name: "Legacy One Round",
    rosterType: "men" as const,
    scoringMode: "reciprocal" as const,
    selectedPlayers: [{ id: "p1", name: "Player", rosterType: "men" as const, classYear: "Senior" }],
    groups: [{ id: "g1", name: "Group 1", playerIds: ["p1"] }],
  };
  expect(validateQualifyingCreation({ ...base, days: [legacyDay] }).ok).toBe(true);
  const elevenRounds = Array.from({ length: 11 }, (_, index) => ({ roundOrder: index + 1, startingHole: 1, holeCount: 1 }));
  expect(validateQualifyingCreation({ ...base, days: [{ ...legacyDay, holesTotal: 11, rounds: elevenRounds }] }).errors)
    .toContain("Qualifying must contain between 1 and 10 total configured rounds.");
});
