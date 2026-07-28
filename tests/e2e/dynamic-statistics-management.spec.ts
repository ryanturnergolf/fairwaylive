import { expect, test, type Page, type Route } from "@playwright/test";
import {
  buildCoachStatisticConfiguration,
  type StatisticAssignmentTarget,
} from "../../app/lib/services/dynamicStatisticsService";
import type {
  EventStatisticPackageAssignment,
  StatisticDefinition,
  StatisticDefinitionVersion,
  StatisticPackage,
  StatisticPackageItem,
  StatisticPackageVersion,
} from "../../app/lib/dynamicStatisticsModel";

const ownerId = "88888888-8888-4888-8888-888888888888";
const tournamentId = "11111111-1111-4111-8111-111111111111";
const qualifyingId = "22222222-2222-4222-8222-222222222222";
const now = "2026-07-28T12:00:00.000Z";

type Row = Record<string, unknown>;

const definitionRow = (input: Partial<Row> & Pick<Row, "id" | "key" | "name">): Row => ({
  owner_id: null,
  description: null,
  input_type: "yes_no",
  is_built_in: true,
  is_active: true,
  created_at: now,
  updated_at: now,
  ...input,
});

const versionRow = (input: Partial<Row> & Pick<Row, "id" | "definition_id" | "name">): Row => ({
  owner_id: null,
  version: 1,
  description: null,
  input_type: "yes_no",
  configuration: {},
  applicability: {},
  created_at: now,
  ...input,
});

const installStatisticsApi = async (page: Page) => {
  const definitions: Row[] = [
    definitionRow({
      id: "10000000-0000-4000-8000-000000000001",
      key: "fairway_hit",
      name: "Fairway Hit",
    }),
    definitionRow({
      id: "30000000-0000-4000-8000-000000000001",
      owner_id: ownerId,
      key: "practice_quality",
      name: "Practice Quality",
      is_built_in: false,
    }),
  ];
  const definitionVersions: Row[] = [
    versionRow({
      id: "20000000-0000-4000-8000-000000000001",
      definition_id: definitions[0].id,
      name: "Fairway Hit",
    }),
    versionRow({
      id: "40000000-0000-4000-8000-000000000001",
      definition_id: definitions[1].id,
      owner_id: ownerId,
      name: "Practice Quality",
    }),
  ];
  const packages: Row[] = [];
  const packageVersions: Row[] = [];
  const packageItems: Row[] = [];
  const assignments: Row[] = [];
  let counter = 10;
  const nextId = () => `99999999-9999-4999-8999-${String(counter++).padStart(12, "0")}`;

  await page.route("**/rest/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const name = url.pathname.split("/").at(-1) ?? "";
    const method = request.method();
    const payload = request.postDataJSON() as Row | null;
    const ok = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname.includes("/rpc/")) {
      if (name === "create_custom_statistic_definition" && payload) {
        const definition = definitionRow({
          id: nextId(),
          owner_id: ownerId,
          key: payload.definition_key,
          name: payload.definition_name,
          description: payload.definition_description,
          input_type: payload.definition_input_type,
          is_built_in: false,
        });
        const version = versionRow({
          id: nextId(),
          definition_id: definition.id,
          owner_id: ownerId,
          name: payload.definition_name,
          description: payload.definition_description,
          input_type: payload.definition_input_type,
          configuration: payload.definition_configuration,
          applicability: payload.definition_applicability,
        });
        definitions.push(definition);
        definitionVersions.push(version);
        return ok({ definition, version });
      }
      if (name === "revise_custom_statistic_definition" && payload) {
        const existing = definitionVersions.filter(
          (version) => version.definition_id === payload.target_definition_id
        );
        const version = versionRow({
          id: nextId(),
          definition_id: payload.target_definition_id,
          owner_id: ownerId,
          version: existing.length + 1,
          name: payload.definition_name,
          description: payload.definition_description,
          input_type: payload.definition_input_type,
          configuration: payload.definition_configuration,
          applicability: payload.definition_applicability,
        });
        definitionVersions.push(version);
        return ok(version);
      }
      if (name === "create_statistic_package" && payload) {
        const statisticPackage = {
          id: nextId(), owner_id: ownerId, name: payload.package_name,
          description: payload.package_description, is_active: true, created_at: now, updated_at: now,
        };
        const version = {
          id: nextId(), package_id: statisticPackage.id, owner_id: ownerId, version: 1,
          name: payload.package_name, description: payload.package_description, created_at: now,
        };
        const items = (payload.package_items as Row[]).map((item) => ({
          id: nextId(), package_version_id: version.id, owner_id: ownerId,
          definition_version_id: item.definition_version_id, display_order: item.display_order,
          is_required: item.is_required, created_at: now,
        }));
        packages.push(statisticPackage);
        packageVersions.push(version);
        packageItems.push(...items);
        return ok({ package: statisticPackage, version, items });
      }
      if (name === "revise_statistic_package" && payload) {
        const existing = packageVersions.filter((version) => version.package_id === payload.target_package_id);
        const version = {
          id: nextId(), package_id: payload.target_package_id, owner_id: ownerId,
          version: existing.length + 1, name: payload.package_name,
          description: payload.package_description, created_at: now,
        };
        const items = (payload.package_items as Row[]).map((item) => ({
          id: nextId(), package_version_id: version.id, owner_id: ownerId,
          definition_version_id: item.definition_version_id, display_order: item.display_order,
          is_required: item.is_required, created_at: now,
        }));
        packageVersions.push(version);
        packageItems.push(...items);
        return ok({ version, items });
      }
    }

    const rowsByTable: Record<string, Row[]> = {
      statistic_definitions: definitions,
      statistic_definition_versions: definitionVersions,
      statistic_packages: packages,
      statistic_package_versions: packageVersions,
      statistic_package_version_items: packageItems,
      event_statistic_package_assignments: assignments,
      tournaments: [{
        id: tournamentId, created_by: ownerId, owner_id: ownerId, name: "Pilot Tournament",
        course: "North Course", tournament_date: "2026-08-01", number_of_rounds: 1,
        status: "draft", finalized_at: null, aggregate_version: 1, created_at: now, updated_at: now,
      }],
      qualifying_sessions: [{
        id: qualifyingId, tournament_id: null, owner_id: ownerId, name: "Fall Qualifying",
        roster_type: "men", scoring_mode: "reciprocal", status: "draft",
        selected_players: [], groups: [], finalized_at: null, finalized_by: null,
        created_at: now, updated_at: now,
      }],
    };
    const rows = rowsByTable[name];
    if (!rows) return ok([]);
    if (method === "GET") return ok(rows);
    if (method === "PATCH" && payload) {
      const id = url.searchParams.get("id")?.replace("eq.", "");
      const row = rows.find((candidate) => candidate.id === id);
      Object.assign(row ?? {}, payload, { updated_at: now });
      return ok(row ?? null);
    }
    if (method === "POST" && name === "event_statistic_package_assignments" && payload) {
      const row = {
        id: nextId(),
        owner_id: ownerId,
        assigned_at: now,
        assigned_by: ownerId,
        ...payload,
      };
      assignments.unshift(row);
      return ok(row, 201);
    }
    return ok([]);
  });

  return { definitions, definitionVersions, packages, packageVersions, packageItems, assignments };
};

test("coach configuration read model selects immutable latest versions", () => {
  const definition = {
    id: "definition", ownerId, key: "quality", name: "Quality", description: null,
    inputType: "yes_no", isBuiltIn: false, isActive: true, createdAt: now, updatedAt: now,
  } satisfies StatisticDefinition;
  const versions = [1, 2].map((version) => ({
    id: `definition-v${version}`, definitionId: definition.id, ownerId, version,
    name: `Quality ${version}`, description: null, inputType: "yes_no" as const,
    configuration: {}, applicability: {}, createdAt: now,
  })) satisfies StatisticDefinitionVersion[];
  const statisticPackage = {
    id: "package", ownerId, name: "Core", description: null, isActive: true,
    createdAt: now, updatedAt: now,
  } satisfies StatisticPackage;
  const packageVersions = [1, 2].map((version) => ({
    id: `package-v${version}`, packageId: statisticPackage.id, ownerId, version,
    name: `Core ${version}`, description: null, createdAt: now,
  })) satisfies StatisticPackageVersion[];
  const items = [{
    id: "item", packageVersionId: "package-v2", ownerId,
    definitionVersionId: "definition-v2", displayOrder: 0, isRequired: true, createdAt: now,
  }] satisfies StatisticPackageItem[];
  const assignments = [] satisfies EventStatisticPackageAssignment[];
  const targets = [] satisfies StatisticAssignmentTarget[];

  const result = buildCoachStatisticConfiguration({
    definitions: [definition],
    definitionVersions: versions,
    packages: [statisticPackage],
    packageVersions,
    packageItems: items,
    assignments,
    assignmentTargets: targets,
  });

  expect(result.definitions[0].latestVersion.version).toBe(2);
  expect(result.definitions[0].versions.map((version) => version.version)).toEqual([2, 1]);
  expect(result.packages[0].latestVersion.version).toBe(2);
  expect(result.packages[0].latestItems).toEqual(items);
});

test("coach can view built-ins and create, revise, archive, and restore a custom definition", async ({ page }) => {
  const state = await installStatisticsApi(page);
  await page.goto("/coach-dashboard/statistics");
  await expect(page.getByRole("heading", { name: "Dynamic Statistics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fairway Hit" })).toBeVisible();
  await expect(page.getByText("Built-in", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Create Custom Statistic" }).click();
  await page.getByLabel("Key").fill("approach quality");
  await page.getByLabel("Name").fill("Approach Quality");
  await page.getByLabel("Input type").selectOption("bounded_number");
  await page.getByLabel("Minimum").fill("1");
  await page.getByLabel("Maximum").fill("5");
  await page.getByRole("button", { name: "Create Statistic", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Approach Quality" })).toBeVisible();

  const customCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Approach Quality" }),
  });
  await customCard.getByRole("button", { name: "New Version" }).click();
  await page.getByLabel("Name").fill("Approach Quality Revised");
  await page.getByRole("button", { name: "Create Version" }).click();
  await expect(page.getByRole("heading", { name: "Approach Quality Revised" })).toBeVisible();
  expect(state.definitionVersions.filter((version) =>
    version.definition_id === state.definitions.at(-1)?.id
  )).toHaveLength(2);

  const revisedCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Approach Quality Revised" }),
  });
  await revisedCard.getByRole("button", { name: "Archive" }).click();
  await expect(revisedCard.getByText("Archived")).toBeVisible();
  await revisedCard.getByRole("button", { name: "Restore" }).click();
  await expect(revisedCard.getByText("Active")).toBeVisible();
  expect(state.definitions).toHaveLength(3);
});

test("package changes create versions while supporting order and required flags", async ({ page }) => {
  const state = await installStatisticsApi(page);
  await page.goto("/coach-dashboard/statistics");
  await page.getByRole("button", { name: "packages" }).click();
  await page.getByRole("button", { name: "Create Package" }).click();
  await page.getByLabel("Name").fill("Tournament Core");
  await page.getByLabel("Fairway Hit").check();
  await page.getByLabel("Practice Quality").check();
  await page.getByLabel("Required").first().check();
  await page.getByRole("button", { name: "Move Practice Quality up" }).click();
  await page.getByRole("button", { name: "Create Package", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Tournament Core" })).toBeVisible();
  expect(state.packageItems.map((item) => item.definition_version_id)).toEqual([
    "40000000-0000-4000-8000-000000000001",
    "20000000-0000-4000-8000-000000000001",
  ]);

  const packageCard = page.getByRole("heading", { name: "Tournament Core" }).locator("..").locator("..").locator("..");
  await packageCard.getByRole("button", { name: "Edit Package" }).click();
  await page.getByRole("checkbox", { name: "Fairway Hit", exact: true }).uncheck();
  await page.getByRole("button", { name: "Create Package Version" }).click();
  expect(state.packageVersions).toHaveLength(2);
  await packageCard.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Package archived. Historical versions remain pinned.")).toBeVisible();
  expect(state.packages).toHaveLength(1);
});

test("package versions can be assigned to Tournament, Qualifying, and Practice events", async ({ page }) => {
  const state = await installStatisticsApi(page);
  await page.goto("/coach-dashboard/statistics");
  await page.getByRole("button", { name: "packages" }).click();
  await page.getByRole("button", { name: "Create Package" }).click();
  await page.getByLabel("Name").fill("Assignment Package");
  await page.getByLabel("Fairway Hit").check();
  await page.getByRole("button", { name: "Create Package", exact: true }).last().click();
  await page.getByRole("button", { name: "assignments" }).click();

  const packageVersionId = state.packageVersions[0].id as string;
  await page.getByRole("combobox", { name: "Event", exact: true }).selectOption(tournamentId);
  await page.getByLabel("Package version").selectOption(packageVersionId);
  await page.getByRole("button", { name: "Assign Package Version" }).click();

  await page.getByLabel("Event type").selectOption("qualifying");
  await page.getByRole("combobox", { name: "Event", exact: true }).selectOption(qualifyingId);
  await page.getByLabel("Package version").selectOption(packageVersionId);
  await page.getByRole("button", { name: "Assign Package Version" }).click();

  await page.getByLabel("Event type").selectOption("practice");
  await page.getByLabel("Practice event UUID").fill("33333333-3333-4333-8333-333333333333");
  await page.getByLabel("Package version").selectOption(packageVersionId);
  await page.getByRole("button", { name: "Assign Package Version" }).click();

  expect(state.assignments.map((assignment) => assignment.event_type).sort()).toEqual([
    "practice", "qualifying", "tournament",
  ]);
});

test("coach dashboard exposes Dynamic Statistics configuration", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.goto("/coach-dashboard");
  await expect(page.getByRole("link", { name: "Stat Configuration" }))
    .toHaveAttribute("href", "/coach-dashboard/statistics");
});
