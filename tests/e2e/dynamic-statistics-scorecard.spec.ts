import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  areRequiredMobileStatisticsComplete,
  buildMobileStatisticSummaries,
  getMobileStatisticTapOptions,
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

test("100 Yards and In uses 1 through 10 tap values while Putts keeps its bounded tap contract", () => {
  const shots = item({
    key: "shots_100_and_in",
    name: "Shots from 100 Yards and In",
    inputType: "option_list",
    configuration: { options: ["1", "2", "3", "4", "5", "6+"] },
  });
  const putts = item({ key: "putts", name: "Putts", inputType: "bounded_number", configuration: { minimum: 0, maximum: 10 } });

  expect(getMobileStatisticTapOptions(shots)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  expect(getMobileStatisticTapOptions(putts)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("pinned package summaries include every selected definition in package order", () => {
  const items = [
    item({ key: "fairway_hit", name: "Fairway Hit", inputType: "yes_no", applicability: { pars: [4, 5] }, displayOrder: 0 }),
    item({ key: "green_in_regulation", name: "Green in Regulation", inputType: "yes_no", displayOrder: 1 }),
    item({ key: "putts", name: "Putts", inputType: "bounded_number", displayOrder: 2 }),
    item({ key: "shots_100_and_in", name: "Shots from 100 Yards and In", inputType: "option_list", displayOrder: 3 }),
    item({ key: "up_and_down_opportunity", name: "Up-and-Down Opportunity", inputType: "yes_no", displayOrder: 4 }),
    item({ key: "up_and_down_success", name: "Up-and-Down Success", inputType: "yes_no", applicability: { requiresDefinitionKey: "up_and_down_opportunity", requiresValue: true }, displayOrder: 5 }),
  ];
  const summaries = buildMobileStatisticSummaries(items, [{ par: 4 }, { par: 3 }], [
    { fairway_hit: true, green_in_regulation: true, putts: 2, shots_100_and_in: "3", up_and_down_opportunity: true, up_and_down_success: true },
    { green_in_regulation: false, putts: 1, shots_100_and_in: "2", up_and_down_opportunity: false },
  ]);

  expect(summaries.map((summary) => summary.name)).toEqual([
    "Fairway Hit",
    "Green in Regulation",
    "Putts",
    "Shots from 100 Yards and In",
    "Up-and-Down Success",
  ]);
  expect(summaries.map((summary) => summary.displayValue)).toEqual(["1/1", "1/2", "3 total", "5 total", "1/1 Yes"]);
  expect(summaries.find((summary) => summary.key === "fairway_hit")?.displayValue).not.toContain("Yes");
  expect(summaries.find((summary) => summary.key === "green_in_regulation")?.displayValue).not.toContain("Yes");
  expect(summaries.find((summary) => summary.key === "shots_100_and_in")).toMatchObject({ recordedCount: 2, applicableCount: 2 });
  expect(summaries.some((summary) => summary.key === "up_and_down_opportunity")).toBe(false);
  expect(buildMobileStatisticSummaries(items.slice(0, 3), [{ par: 4 }], [{}]).some((summary) => summary.key === "shots_100_and_in")).toBe(false);
  expect(buildMobileStatisticSummaries([], [{ par: 4 }], [{}])).toEqual([]);
  expect(areRequiredMobileStatisticsComplete([], [{ par: 4 }], [{}])).toBe(true);
});

test("player summary totals nine-hole 100 Yards and In values and hides only opportunity", () => {
  const items = [
    item({ key: "shots_100_and_in", name: "Shots from 100 Yards and In", inputType: "option_list", displayOrder: 0 }),
    item({ key: "up_and_down_opportunity", name: "Up-and-Down Opportunity", inputType: "yes_no", displayOrder: 1 }),
    item({ key: "up_and_down_success", name: "Up-and-Down Success", inputType: "yes_no", applicability: { requiresDefinitionKey: "up_and_down_opportunity", requiresValue: true }, displayOrder: 2 }),
  ];
  const shotValues = ["2", "3", "2", "4", "3", "2", "3", "2", "4"];
  const summaries = buildMobileStatisticSummaries(
    items,
    Array.from({ length: 9 }, () => ({ par: 4 })),
    shotValues.map((value) => ({
      shots_100_and_in: value,
      up_and_down_opportunity: true,
      up_and_down_success: true,
    }))
  );

  expect(summaries.find((summary) => summary.key === "shots_100_and_in")).toMatchObject({
    displayValue: "25 total",
    recordedCount: 9,
    applicableCount: 9,
  });
  expect(summaries.some((summary) => summary.key === "up_and_down_opportunity")).toBe(false);
  expect(summaries.find((summary) => summary.key === "up_and_down_success")?.displayValue).toBe("9/9 Yes");
});

test("post-round statistic cards keep only meaningful summary results", () => {
  const scorecardSource = readFileSync(join(process.cwd(), "app/scorecard/[playerId]/page.tsx"), "utf8");
  expect(scorecardSource).not.toContain("holes recorded");
  expect(scorecardSource).toContain('["Hole", "Distance", "Par", "Score"]');
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
  expect(source).toContain("getMobileStatisticTapOptions(item)");
  expect(source.indexOf("if (tapOptions)")).toBeLessThan(source.indexOf('if (item.inputType === "option_list")'));
  expect(source).toContain("hasAssignedStatisticPackage ?");
  expect(source).toContain("dynamicStatisticSummaries.map");
  expect(source).toContain('["Fairways", `${fairwaysHit}/${fairwaysAvailable}`]');
  expect(source.indexOf("await saveMobileDynamicStatistics")).toBeLessThan(
    source.indexOf("// Save marker score only if markerPlayerId is valid")
  );
  expect(source).toContain("Complete required statistics:");
  expect(source).toContain("clubhouse-hq-dynamic-statistics:");
  expect(source).toContain('scorecard.playerId === "demo"');
});
