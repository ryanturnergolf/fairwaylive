import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findMissingRequiredStatistics,
  validateHoleStatisticValueInput,
  validateStatisticConfiguration,
  validateStatisticDefinitionInput,
  validateStatisticPackageAssignment,
  validateStatisticPackageInput,
  validateStatisticValue,
} from "../../app/lib/services/dynamicStatisticsService";
import type {
  HoleStatisticValue,
  StatisticPackageItem,
} from "../../app/lib/dynamicStatisticsModel";

test("definition validation supports every Phase 1 input type", () => {
  expect(validateStatisticDefinitionInput({
    key: " Shots 100 And In ",
    name: " Shots from 100 Yards and In ",
    inputType: "option_list",
    configuration: { options: ["1", "2", "3", "4", "5", "6+"] },
    applicability: { pars: [3, 4, 5] },
  })).toEqual({
    key: "shots_100_and_in",
    name: "Shots from 100 Yards and In",
    description: null,
    inputType: "option_list",
    configuration: { options: ["1", "2", "3", "4", "5", "6+"] },
    applicability: { pars: [3, 4, 5] },
  });

  expect(validateStatisticConfiguration("checkbox", {})).toEqual({});
  expect(validateStatisticConfiguration("yes_no", {})).toEqual({});
  expect(validateStatisticConfiguration("bounded_number", { minimum: 0, maximum: 10 }))
    .toEqual({ minimum: 0, maximum: 10 });
  expect(() => validateStatisticConfiguration("bounded_number", { minimum: 10, maximum: 2 }))
    .toThrow("Bounded statistics require a valid minimum and maximum.");
  expect(() => validateStatisticConfiguration("option_list", { options: ["Yes", "Yes"] }))
    .toThrow("Option statistics require at least two unique options.");
  expect(() => validateStatisticDefinitionInput({
    key: "fairway",
    name: "Fairway",
    inputType: "yes_no",
    applicability: { pars: [3, 6] },
  })).toThrow("Statistic applicability pars are invalid.");
});

test("package validation rejects duplicates and ambiguous ordering", () => {
  const valid = validateStatisticPackageInput({
    name: " Tournament Core ",
    items: [
      { definitionVersionId: "fairway-version", displayOrder: 0, isRequired: true },
      { definitionVersionId: "putts-version", displayOrder: 1 },
    ],
  });
  expect(valid.name).toBe("Tournament Core");
  expect(valid.items[1].isRequired).toBe(false);

  expect(() => validateStatisticPackageInput({
    name: "Duplicate",
    items: [
      { definitionVersionId: "same", displayOrder: 0 },
      { definitionVersionId: "same", displayOrder: 1 },
    ],
  })).toThrow("A statistic package cannot contain duplicate definitions.");
  expect(() => validateStatisticPackageInput({
    name: "Duplicate order",
    items: [
      { definitionVersionId: "one", displayOrder: 0 },
      { definitionVersionId: "two", displayOrder: 0 },
    ],
  })).toThrow("Statistic display order must be unique.");
});

test("value validation enforces immutable definition-version contracts", () => {
  expect(validateStatisticValue("yes_no", {}, true)).toBe(true);
  expect(validateStatisticValue("bounded_number", { minimum: 0, maximum: 6 }, 4)).toBe(4);
  expect(validateStatisticValue("option_list", { options: ["1", "2", "3", "4", "5", "6+"] }, "6+"))
    .toBe("6+");
  expect(() => validateStatisticValue("yes_no", {}, "yes")).toThrow(
    "This statistic requires a boolean value."
  );
  expect(() => validateStatisticValue("bounded_number", { minimum: 0, maximum: 6 }, 7)).toThrow(
    "Statistic value is outside its allowed range."
  );
  expect(() => validateStatisticValue("option_list", { options: ["left", "right"] }, "center"))
    .toThrow("Statistic value is not an allowed option.");
});

test("event assignments and hole values retain explicit event and scoring identities", () => {
  expect(validateStatisticPackageAssignment({
    eventType: "qualifying",
    eventId: "session-id",
    packageVersionId: "package-version-id",
  })).toEqual({
    eventType: "qualifying",
    eventId: "session-id",
    packageVersionId: "package-version-id",
  });

  expect(validateHoleStatisticValueInput({
    definitionVersionId: "definition-version",
    rosterPlayerId: "permanent-player",
    seasonId: "season",
    eventType: "tournament",
    eventId: "tournament",
    tournamentId: "tournament",
    roundNumber: 1,
    holeNumber: 18,
    playerId: "event-player",
    enteredByPlayerId: "event-player",
    entryKind: "self",
    value: false,
    operationKey: "device-operation",
  })).toMatchObject({
    rosterPlayerId: "permanent-player",
    playerId: "event-player",
    enteredByPlayerId: "event-player",
    entryKind: "self",
    value: false,
  });
  expect(() => validateHoleStatisticValueInput({
    definitionVersionId: "definition-version",
    eventType: "tournament",
    eventId: "tournament",
    roundNumber: 1,
    holeNumber: 19,
    playerId: "event-player",
    enteredByPlayerId: "event-player",
    entryKind: "self",
    value: true,
    operationKey: "operation",
  })).toThrow("Hole number is invalid.");
});

test("required package items are enforced by the reusable service boundary", () => {
  const items = [
    { definitionVersionId: "fairway", displayOrder: 0, isRequired: true },
    { definitionVersionId: "gir", displayOrder: 1, isRequired: true },
    { definitionVersionId: "notes", displayOrder: 2, isRequired: false },
  ] as StatisticPackageItem[];
  const values = [
    { definitionVersionId: "gir" },
    { definitionVersionId: "notes" },
  ] as HoleStatisticValue[];

  expect(findMissingRequiredStatistics(items, values)).toEqual(["fairway"]);
  expect(findMissingRequiredStatistics(items, [
    ...values,
    { definitionVersionId: "fairway" } as HoleStatisticValue,
  ])).toEqual([]);
});

test("migration is additive, owner-scoped, versioned, and preserves existing scoring tables", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260804000000_add_dynamic_statistics_foundation.sql"),
    "utf8"
  ).toLowerCase();

  for (const table of [
    "statistic_definitions",
    "statistic_definition_versions",
    "statistic_packages",
    "statistic_package_versions",
    "statistic_package_version_items",
    "event_statistic_package_assignments",
    "statistic_hole_values",
  ]) {
    expect(migration).toContain(`create table public.${table}`);
    expect(migration).toContain(`alter table public.${table} enable row level security`);
  }
  expect(migration).toContain("reject_dynamic_statistic_history_mutation");
  expect(migration).toContain("protect_dynamic_statistic_catalog_identity");
  expect(migration).toContain("statistic definition edits require a new immutable version");
  expect(migration).toContain("statistic package edits require a new immutable version");
  expect(migration).toContain("revise_custom_statistic_definition");
  expect(migration).toContain("revise_statistic_package");
  expect(migration).toContain("pg_advisory_xact_lock");
  expect(migration).toContain("validate_statistic_definition_version");
  expect(migration).toContain("definition_snapshot");
  expect(migration).toContain("official statistic resolution target is invalid.");
  expect(migration).toContain("on delete restrict");
  expect(migration).toContain("owner_id = public.current_coach_id()");
  expect(migration).toContain("security invoker");
  expect(migration).toContain("revoke all on function");
  expect(migration).not.toContain("security definer");
  expect(migration).not.toContain(" for delete ");
  expect(migration).not.toMatch(/alter table public\.(score_entries|score_hole_entries)/);
  expect(migration).not.toMatch(/insert into public\.(score_entries|score_hole_entries)/);
});

test("built-ins include certified and approved future definitions without schema columns", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260804000000_add_dynamic_statistics_foundation.sql"),
    "utf8"
  );
  for (const key of [
    "fairway_hit",
    "green_in_regulation",
    "putts",
    "penalty_strokes",
    "shots_100_and_in",
    "up_and_down_opportunity",
    "up_and_down_success",
    "sand_save",
  ]) {
    expect(migration).toContain(`'${key}'`);
  }
  expect(migration).toContain(`'{"pars":[4,5]}'::jsonb`);
  expect(migration).toContain("Official rows supersede rather than overwrite original entries.");
});
