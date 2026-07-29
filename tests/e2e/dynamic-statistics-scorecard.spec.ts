import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  missingRequiredMobileStatistics,
  statisticAppliesToHole,
  type MobileStatisticItem,
} from "../../app/lib/services/mobileDynamicStatisticsService";

const item = (input: Partial<MobileStatisticItem> & Pick<MobileStatisticItem, "key" | "inputType">) => ({
  definitionVersionId: `${input.key}-version`,
  name: input.key,
  description: null,
  configuration: {},
  applicability: {},
  displayOrder: 0,
  isRequired: false,
  ...input,
}) as MobileStatisticItem;

test("assigned mobile packages preserve order, input contracts, and required flags", () => {
  const items = [
    item({ key: "fairway_hit", inputType: "yes_no", applicability: { pars: [4, 5] }, isRequired: true }),
    item({ key: "confidence", inputType: "option_list", configuration: { options: ["Low", "High"] }, displayOrder: 1 }),
    item({ key: "putts", inputType: "bounded_number", configuration: { minimum: 0, maximum: 10 }, displayOrder: 2, isRequired: true }),
    item({ key: "recovery", inputType: "checkbox", displayOrder: 3 }),
  ];

  expect(items.map((entry) => entry.inputType)).toEqual([
    "yes_no",
    "option_list",
    "bounded_number",
    "checkbox",
  ]);
  expect(missingRequiredMobileStatistics(items, 4, {
    fairway_hit: true,
    confidence: "High",
    putts: null,
  }).map((entry) => entry.key)).toEqual(["putts"]);
  expect(missingRequiredMobileStatistics(items, 4, {
    fairway_hit: false,
    putts: 0,
  })).toEqual([]);
});

test("hole applicability excludes par-specific and unmet dependent statistics", () => {
  const fairway = item({
    key: "fairway_hit",
    inputType: "yes_no",
    applicability: { pars: [4, 5] },
    isRequired: true,
  });
  const upAndDown = item({
    key: "up_and_down_success",
    inputType: "yes_no",
    applicability: { requiresDefinitionKey: "up_and_down_opportunity", requiresValue: true },
    isRequired: true,
  });

  expect(statisticAppliesToHole(fairway, 3, {})).toBe(false);
  expect(statisticAppliesToHole(fairway, 4, {})).toBe(true);
  expect(statisticAppliesToHole(upAndDown, 4, { up_and_down_opportunity: false })).toBe(false);
  expect(statisticAppliesToHole(upAndDown, 4, { up_and_down_opportunity: true })).toBe(true);
});

test("mobile access migration is token-scoped, append-only, and does not broaden RLS", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260806000000_add_mobile_dynamic_statistics_access.sql"),
    "utf8"
  ).toLowerCase();

  expect(migration).toContain("has_valid_share_token(target_tournament_id, array['mobile_scoring'])");
  expect(migration).toContain("is_tournament_finalized(target_tournament_id)");
  expect(migration).toContain("insert into public.statistic_hole_values");
  expect(migration).toContain("on conflict (owner_id, operation_key) do nothing");
  expect(migration).toContain("statistic_package_version_items");
  expect(migration).toContain("player.player_id = target_player_id");
  expect(migration).not.toContain("update public.statistic_hole_values");
  expect(migration).not.toContain("delete from public.statistic_hole_values");
  expect(migration).not.toContain("create policy");

  const playerReadMigration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260806010000_enforce_mobile_dynamic_statistics_player_read.sql"
    ),
    "utf8"
  ).toLowerCase();
  expect(playerReadMigration).toContain("player.player_id = target_player_id");
  expect(playerReadMigration).toContain("player.round_number = target_round_number");
  expect(playerReadMigration).toContain("has_valid_share_token");
  expect(playerReadMigration).toContain("revoke all on function");
});

test("scorecard keeps the legacy fallback and saves assigned values before marker persistence", () => {
  const source = readFileSync(
    join(process.cwd(), "app/scorecard/[playerId]/page.tsx"),
    "utf8"
  );

  expect(source).toContain("dynamicStatistics?.assignment ?");
  expect(source).toContain("Fairway Hit");
  expect(source).toContain("Green in Regulation");
  expect(source).toContain("Putts");
  expect(source.indexOf("await saveMobileDynamicStatistics")).toBeLessThan(
    source.indexOf("// Save marker score only if markerPlayerId is valid")
  );
  expect(source).toContain("Complete required statistics:");
  expect(source).toContain("clubhouse-hq-dynamic-statistics:");
  expect(source).toContain('scorecard.playerId === "demo"');
});
