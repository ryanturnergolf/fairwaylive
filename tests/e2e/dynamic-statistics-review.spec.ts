import { expect, test } from "@playwright/test";
import type {
  HoleStatisticValue,
  StatisticDefinition,
  StatisticDefinitionVersion,
  StatisticPackageItem,
} from "../../app/lib/dynamicStatisticsModel";
import {
  buildDynamicStatisticReviewItems,
  parseDynamicStatisticOfficialValue,
  type DynamicStatisticReviewFoundation,
} from "../../app/lib/services/dynamicStatisticsReviewService";

const definition = (id: string, key: string): StatisticDefinition =>
  ({
    id,
    key,
    name: key,
  }) as StatisticDefinition;

const version = (
  id: string,
  definitionId: string,
  name: string,
  inputType: StatisticDefinitionVersion["inputType"],
  configuration: StatisticDefinitionVersion["configuration"] = {},
  applicability: StatisticDefinitionVersion["applicability"] = {}
): StatisticDefinitionVersion =>
  ({
    id,
    definitionId,
    name,
    inputType,
    configuration,
    applicability,
  }) as StatisticDefinitionVersion;

const packageItem = (
  id: string,
  definitionVersionId: string,
  displayOrder: number,
  isRequired: boolean
): StatisticPackageItem =>
  ({ id, packageVersionId: "package-v1", definitionVersionId, displayOrder, isRequired }) as StatisticPackageItem;

const value = (
  id: string,
  definitionVersionId: string,
  entryKind: HoleStatisticValue["entryKind"],
  statisticValue: HoleStatisticValue["value"],
  createdAt: string,
  enteredByPlayerId = entryKind === "self" ? "player-a" : "marker-a"
): HoleStatisticValue =>
  ({
    id,
    definitionVersionId,
    eventType: "tournament",
    eventId: "event-a",
    tournamentId: "event-a",
    roundNumber: 1,
    holeNumber: 1,
    playerId: "player-a",
    enteredByPlayerId,
    entryKind,
    value: statisticValue,
    createdAt,
  }) as HoleStatisticValue;

const foundation = (
  values: HoleStatisticValue[]
): DynamicStatisticReviewFoundation => ({
  assignment: {
    id: "assignment-a",
    ownerId: "owner-a",
    eventType: "tournament",
    eventId: "event-a",
    packageVersionId: "package-v1",
    assignedAt: "2026-07-28T00:00:00Z",
    assignedBy: "owner-a",
  },
  definitions: [
    definition("definition-fairway", "fairway"),
    definition("definition-putts", "putts"),
    definition("definition-lie", "lie"),
  ],
  definitionVersions: [
    version("version-fairway", "definition-fairway", "Fairway Hit", "yes_no", {}, { pars: [4, 5] }),
    version("version-putts", "definition-putts", "Putts", "bounded_number", { minimum: 0, maximum: 6 }),
    version("version-lie", "definition-lie", "Approach Lie", "option_list", { options: ["Fairway", "Rough"] }),
  ],
  packageItems: [
    packageItem("item-putts", "version-putts", 2, true),
    packageItem("item-fairway", "version-fairway", 1, true),
    packageItem("item-lie", "version-lie", 3, false),
  ],
  values,
});

test("dynamic Review preserves package order and classifies match, disagreement, and missing states", () => {
  const items = buildDynamicStatisticReviewItems({
    foundation: foundation([
      value("fairway-self", "version-fairway", "self", true, "2026-07-28T00:00:00Z"),
      value("fairway-marker", "version-fairway", "marker", true, "2026-07-28T00:00:01Z"),
      value("putts-self", "version-putts", "self", 2, "2026-07-28T00:00:02Z"),
      value("putts-marker", "version-putts", "marker", 3, "2026-07-28T00:00:03Z"),
    ]),
    players: [{ playerId: "player-a", playerName: "Alex Player" }],
    roundNumber: 1,
    holePars: [4],
  });

  expect(items.map((item) => item.name)).toEqual(["Fairway Hit", "Putts", "Approach Lie"]);
  expect(items.map((item) => item.status)).toEqual(["match", "different", "missing"]);
  expect(items[1]).toMatchObject({ playerValue: 2, markerValue: 3, officialValue: null });
});

test("required missing and applicability use the pinned package definition", () => {
  const parThreeItems = buildDynamicStatisticReviewItems({
    foundation: foundation([]),
    players: [{ playerId: "player-a", playerName: "Alex Player" }],
    roundNumber: 1,
    holePars: [3],
  });

  expect(parThreeItems.map((item) => item.name)).toEqual(["Putts", "Approach Lie"]);
  expect(parThreeItems.map((item) => item.status)).toEqual(["required_missing", "missing"]);
});

test("official values converge the read model without replacing original player and marker values", () => {
  const player = value("putts-self", "version-putts", "self", 2, "2026-07-28T00:00:00Z");
  const marker = value("putts-marker", "version-putts", "marker", 3, "2026-07-28T00:00:01Z");
  const official = {
    ...value("putts-official", "version-putts", "official", 4, "2026-07-28T00:00:02Z", "marker-a"),
    supersedesValueId: marker.id,
    officialAt: "2026-07-28T00:00:02Z",
    officialBy: "coach-a",
  };
  const items = buildDynamicStatisticReviewItems({
    foundation: foundation([player, marker, official]),
    players: [{ playerId: "player-a", playerName: "Alex Player" }],
    roundNumber: 1,
    holePars: [4],
  });
  const putts = items.find((item) => item.name === "Putts");

  expect(putts).toMatchObject({
    playerValue: 2,
    markerValue: 3,
    officialValue: 4,
    status: "match",
  });
  expect(putts?.playerEntry?.id).toBe(player.id);
  expect(putts?.markerEntry?.id).toBe(marker.id);
  expect(putts?.officialEntry?.supersedesValueId).toBe(marker.id);
});

test("a later official correction becomes authoritative while prior official history remains", () => {
  const player = value("putts-self", "version-putts", "self", 2, "2026-07-28T00:00:00Z");
  const firstOfficial = {
    ...value("putts-official-1", "version-putts", "official", 3, "2026-07-28T00:00:01Z"),
    supersedesValueId: player.id,
    officialAt: "2026-07-28T00:00:01Z",
    officialBy: "coach-a",
  };
  const correctedOfficial = {
    ...value("putts-official-2", "version-putts", "official", 4, "2026-07-28T00:00:02Z"),
    supersedesValueId: player.id,
    officialAt: "2026-07-28T00:00:02Z",
    officialBy: "coach-a",
  };
  const items = buildDynamicStatisticReviewItems({
    foundation: foundation([player, firstOfficial, correctedOfficial]),
    players: [{ playerId: "player-a", playerName: "Alex Player" }],
    roundNumber: 1,
    holePars: [4],
  });
  const putts = items.find((item) => item.name === "Putts");

  expect(putts?.officialValue).toBe(4);
  expect(putts?.officialEntry?.id).toBe(correctedOfficial.id);
  expect([firstOfficial, correctedOfficial]).toHaveLength(2);
  expect(putts?.playerEntry?.id).toBe(player.id);
});

test("official correction parsing enforces immutable definition contracts", () => {
  const items = buildDynamicStatisticReviewItems({
    foundation: foundation([
      value("putts-self", "version-putts", "self", 2, "2026-07-28T00:00:00Z"),
    ]),
    players: [{ playerId: "player-a", playerName: "Alex Player" }],
    roundNumber: 1,
    holePars: [4],
  });
  const putts = items.find((item) => item.name === "Putts");
  const fairway = items.find((item) => item.name === "Fairway Hit");
  const lie = items.find((item) => item.name === "Approach Lie");

  expect(parseDynamicStatisticOfficialValue(putts!, "4")).toBe(4);
  expect(parseDynamicStatisticOfficialValue(fairway!, "false")).toBe(false);
  expect(parseDynamicStatisticOfficialValue(lie!, "Rough")).toBe("Rough");
  expect(() => parseDynamicStatisticOfficialValue(putts!, "9")).toThrow(
    "outside its allowed range"
  );
  expect(() => parseDynamicStatisticOfficialValue(lie!, "Bunker")).toThrow(
    "not an allowed option"
  );
});

test("events without a pinned package produce no dynamic Review rows", () => {
  expect(
    buildDynamicStatisticReviewItems({
      foundation: {
        assignment: null,
        definitions: [],
        definitionVersions: [],
        packageItems: [],
        values: [],
      },
      players: [{ playerId: "legacy-player", playerName: "Legacy Player" }],
      roundNumber: 1,
      holePars: [4],
    })
  ).toEqual([]);
});
