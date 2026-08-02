import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildQualifyingStatisticChoices,
  getDefaultQualifyingStatisticKeys,
} from "../../app/lib/services/qualifyingStatisticsSelectionService";

const definitionModel = (key: string, name: string, isBuiltIn = true) => ({
  definition: {
    id: `definition-${key}`,
    ownerId: isBuiltIn ? null : "owner-a",
    key,
    name,
    description: null,
    inputType: "yes_no" as const,
    isBuiltIn,
    isActive: true,
    createdAt: "2026-08-02T00:00:00Z",
    updatedAt: "2026-08-02T00:00:00Z",
  },
  latestVersion: {
    id: `version-${key}`,
    definitionId: `definition-${key}`,
    ownerId: isBuiltIn ? null : "owner-a",
    version: 1,
    name,
    description: null,
    inputType: "yes_no" as const,
    configuration: {},
    applicability: {},
    createdAt: "2026-08-02T00:00:00Z",
  },
  versions: [],
});

test("Qualifying statistics default to Fairway, GIR, and Putts while configured additions remain optional", () => {
  const defaults = getDefaultQualifyingStatisticKeys();
  expect([...defaults]).toEqual(["fairway_hit", "green_in_regulation", "putts"]);
  expect(defaults.has("penalty_strokes")).toBe(false);
  defaults.delete("fairway_hit");
  defaults.add("penalty_strokes");
  expect([...defaults]).toEqual(["green_in_regulation", "putts", "penalty_strokes"]);
  defaults.clear();
  expect([...defaults]).toEqual([]);
});

test("available definitions reuse latest immutable versions and existing built-in/custom metadata", () => {
  const choices = buildQualifyingStatisticChoices({
    definitions: [
      definitionModel("fairway_hit", "Fairway Hit"),
      definitionModel("commitment", "Commitment", false),
      { ...definitionModel("archived", "Archived"), definition: { ...definitionModel("archived", "Archived").definition, isActive: false } },
    ],
    packages: [],
    assignments: [],
    assignmentTargets: [],
  });
  expect(choices).toEqual([
    expect.objectContaining({ key: "fairway_hit", definitionVersionId: "version-fairway_hit", group: "Built-in statistics" }),
    expect.objectContaining({ key: "commitment", definitionVersionId: "version-commitment", group: "Custom statistics" }),
  ]);
});

test("creation migration atomically reuses exact packages and supports explicit empty assignments", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260809000000_assign_qualifying_statistics_during_creation.sql"),
    "utf8"
  ).toLowerCase();
  expect(migration).toContain("create_qualifying_session_draft_with_statistics");
  expect(migration).toContain("create_qualifying_session_draft_flexible");
  expect(migration).toContain("cardinality(input_statistic_definition_version_ids)");
  expect(migration).toContain("statistic_package_version_items");
  expect(migration).toContain("item.display_order = selected.item_order - 1");
  expect(migration).toContain("insert into public.event_statistic_package_assignments");
  expect(migration).toContain("'qualifying', session_id");
  expect(migration).not.toContain("security definer");
  expect(migration).not.toContain("update public.statistic_package_versions");
  expect(migration).not.toContain("update public.statistic_package_version_items");

  const optionalSelectionMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260809010000_make_qualifying_selected_statistics_optional.sql"),
    "utf8"
  ).toLowerCase();
  expect(optionalSelectionMigration).toContain("not item.is_required");
  expect(optionalSelectionMigration).toContain("selected.item_order - 1, false");
  expect(optionalSelectionMigration).not.toContain("security definer");
});

test("assigned empty packages suppress legacy inputs while missing assignments preserve legacy fallback", () => {
  const scorecard = readFileSync(join(process.cwd(), "app/scorecard/[playerId]/page.tsx"), "utf8");
  expect(scorecard).toContain("dynamicStatistics?.assignment ?");
  expect(scorecard).toContain("dynamicStatistics.items");
  expect(scorecard).toContain("Fairway Hit");
  expect(scorecard).toContain("Green in Regulation");
  expect(scorecard).toContain("Putts");
  const designated = readFileSync(join(process.cwd(), "app/scorecard/[playerId]/DesignatedQualifyingScorecard.tsx"), "utf8");
  expect(designated).toContain("loadMobileDynamicStatistics");
  expect(designated).toContain("saveMobileDynamicStatistics");
  expect(designated).toContain("Score-only Qualifying");
});
