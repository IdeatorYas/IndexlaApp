import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Creator Hub", () => {
  test.setTimeout(60_000);

  test("browse, featured, hub card and follow preview", async ({ page }) => {
    await page.goto(APP_ROUTES.creators);
    await expect(
      page.getByRole("heading", { name: "Creators", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Become a Creator" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Featured Creators" }),
    ).toBeVisible();
    await expect(page.getByText("INDEXLA").first()).toBeVisible();
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await page.getByRole("button", { name: "Follow" }).first().click();
    await expect(page.getByText(/Following @|preview only/i).first()).toBeVisible();
  });

  test("search no-results state", async ({ page }) => {
    await page.goto(APP_ROUTES.creators);
    await page.getByLabel("Search creators").fill("zzz-no-match-xyz");
    await expect(
      page.getByRole("heading", { name: "No search results" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Creator Leaderboard", () => {
  test.setTimeout(60_000);

  test("podium, table and portfolio leaderboard link without reward copy", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.creatorLeaderboard);
    await expect(
      page.getByRole("heading", { name: "Creator Leaderboard" }),
    ).toBeVisible();
    await expect(
      page.getByText(/separate from the Portfolio Leaderboard/i),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /View Portfolio Leaderboard/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Top 3" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Creator rankings" }),
    ).toBeVisible();
    await expect(page.getByText(/Top 10 portfolios win monthly/i)).toHaveCount(0);
    await expect(page.getByText(/Performance 50%/i)).toHaveCount(0);
    await page.getByRole("link", { name: "View Profile" }).first().click();
    await expect(page).toHaveURL(/\/app\/creators\//);
  });
});
