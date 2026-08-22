import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Create Portfolio / Index", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_ROUTES.create);
    await page.evaluate(() =>
      window.localStorage.removeItem("indexla.create.draft.v1"),
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Create Portfolio / Index" }),
    ).toBeVisible();
  });

  test("renders product choice and index category path", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Choose Product" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Create Index/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Index Category" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^AI\b/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Assets & Allocations" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("portfolio path skips category step", async ({ page }) => {
    await page.getByRole("button", { name: /Create Portfolio/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Assets & Allocations" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Index Category" }),
    ).toHaveCount(0);
  });
});
