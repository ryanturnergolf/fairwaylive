import { expect, test } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Clubhouse HQ", level: 1 })).toBeVisible();
});
