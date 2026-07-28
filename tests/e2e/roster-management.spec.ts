import { expect, test, type Page, type Route } from "@playwright/test";

const seasonId = "11111111-1111-4111-8111-111111111111";
const ownerId = "88888888-8888-4888-8888-888888888888";
const now = "2026-07-27T12:00:00.000Z";

type Row = Record<string, unknown>;

const installRosterApi = async (page: Page) => {
  const seasons: Row[] = [{
    id: seasonId,
    owner_id: ownerId,
    name: "2026-2027",
    starts_on: "2026-08-01",
    ends_on: "2027-06-30",
    status: "active",
    created_at: now,
    updated_at: now,
  }];
  const players: Row[] = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      owner_id: ownerId,
      source_player_id: null,
      first_name: "Avery",
      last_name: "Brooks",
      preferred_name: null,
      roster_type: "men",
      status: "active",
      archived_at: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      owner_id: ownerId,
      source_player_id: null,
      first_name: "Morgan",
      last_name: "Chen",
      preferred_name: null,
      roster_type: "women",
      status: "active",
      archived_at: null,
      created_at: now,
      updated_at: now,
    },
  ];
  const memberships: Row[] = [
    {
      id: "cccccccc-aaaa-4ccc-8ccc-cccccccccccc",
      owner_id: ownerId,
      season_id: seasonId,
      roster_player_id: players[0].id,
      status: "active",
      class_year: "Senior",
      created_at: now,
      updated_at: now,
    },
    {
      id: "cccccccc-bbbb-4ccc-8ccc-cccccccccccc",
      owner_id: ownerId,
      season_id: seasonId,
      roster_player_id: players[1].id,
      status: "active",
      class_year: "Junior",
      created_at: now,
      updated_at: now,
    },
  ];

  await page.route("**/rest/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split("/").at(-1);
    const method = request.method();
    const requestBody = request.postDataJSON() as Row | Row[] | null;
    const body = Array.isArray(requestBody) ? requestBody[0] : requestBody;

    if (table === "seasons") {
      if (method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(seasons) });
      if (method === "POST" && body) {
        const row = { id: "22222222-2222-4222-8222-222222222222", owner_id: ownerId, created_at: now, updated_at: now, ...body };
        seasons.unshift(row);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row) });
      }
    }

    if (table === "roster_players") {
      if (method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(players) });
      if (method === "POST" && body) {
        const row = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", owner_id: ownerId, archived_at: null, created_at: now, updated_at: now, ...body };
        players.push(row);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row) });
      }
      if (method === "PATCH" && body) {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        const player = players.find((row) => row.id === id);
        Object.assign(player ?? {}, body);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(player ?? null) });
      }
    }

    if (table === "season_roster_memberships") {
      if (method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(memberships.filter((row) => row.season_id === url.searchParams.get("season_id")?.replace("eq.", ""))) });
      if (method === "POST" && body) {
        let row = memberships.find((membership) =>
          membership.season_id === body.season_id && membership.roster_player_id === body.roster_player_id
        );
        if (row) Object.assign(row, body, { updated_at: now });
        else {
          row = { id: `membership-${memberships.length + 1}`, owner_id: ownerId, created_at: now, updated_at: now, ...body };
          memberships.push(row);
        }
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row) });
      }
    }

    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  return { seasons, players, memberships };
};

test("coach dashboard links to separate men's and women's roster pages", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.goto("/coach-dashboard");
  await expect(page.getByRole("link", { name: "Manage Men's Roster" })).toHaveAttribute("href", "/coach-dashboard/roster/men");
  await expect(page.getByRole("link", { name: "Manage Women's Roster" })).toHaveAttribute("href", "/coach-dashboard/roster/women");
});

test("roster pages isolate men and women and support search and status filters", async ({ page }) => {
  await installRosterApi(page);
  await page.goto("/coach-dashboard/roster/men");
  await expect(page.getByRole("heading", { name: "Men's Roster" })).toBeVisible();
  await expect(page.getByText("Avery Brooks")).toBeVisible();
  await expect(page.getByText("Morgan Chen")).toHaveCount(0);

  await page.getByLabel("Search players").fill("missing");
  await expect(page.getByText("No players match this season and filter.")).toBeVisible();
  await page.getByLabel("Search players").fill("avery");
  await page.getByLabel("Status").selectOption("active");
  await expect(page.getByText("Avery Brooks")).toBeVisible();

  await page.goto("/coach-dashboard/roster/women");
  await expect(page.getByRole("heading", { name: "Women's Roster" })).toBeVisible();
  await expect(page.getByText("Morgan Chen")).toBeVisible();
  await expect(page.getByText("Avery Brooks")).toHaveCount(0);
});

test("coach can create a season and add and edit a permanent player", async ({ page }) => {
  const state = await installRosterApi(page);
  await page.goto("/coach-dashboard/roster/men");

  await page.getByRole("button", { name: "Create Season" }).click();
  await page.getByLabel("Season name").fill("2027-2028");
  await page.getByLabel("Start date").fill("2027-08-01");
  await page.getByLabel("End date").fill("2028-06-30");
  await page.getByRole("button", { name: "Save Season" }).click();
  await expect(page.getByRole("status")).toContainText("Season created.");

  await page.getByRole("button", { name: "Add Player" }).click();
  await page.getByLabel("First name").fill("Cam");
  await page.getByLabel("Last name").fill("Riley");
  await page.getByLabel("Preferred name").fill("Cameron");
  await page.getByLabel("Player status").selectOption("incoming");
  await page.getByLabel("Class year").selectOption("Freshman");
  await page.getByRole("button", { name: "Add Player", exact: true }).last().click();
  await expect(page.getByText("Cameron Riley")).toBeVisible();

  const camCard = page.getByText("Cameron Riley").locator("..").locator("..");
  await camCard.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Preferred name").fill("Cam");
  await page.getByLabel("Player status").selectOption("redshirt");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Cam Riley")).toBeVisible();
  expect(state.players.find((player) => player.first_name === "Cam")?.status).toBe("redshirt");
});

test("archive and restore are non-destructive lifecycle transitions", async ({ page }) => {
  const state = await installRosterApi(page);
  await page.goto("/coach-dashboard/roster/men");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Avery Brooks")).toHaveCount(0);
  expect(state.players[0].status).toBe("former");
  expect(state.players).toHaveLength(2);

  await page.getByLabel("Show archived players").check();
  await expect(page.getByText("Avery Brooks")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Avery Brooks")).toBeVisible();
  expect(state.players[0].status).toBe("active");
  expect(state.players[0].archived_at).toBeNull();
  expect(state.players).toHaveLength(2);
});
