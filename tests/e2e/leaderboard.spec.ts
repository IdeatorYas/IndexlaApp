import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Portfolio Leaderboard", () => {
  test.setTimeout(60_000);

  test("monthly default shows podium, winner zone and rewards copy", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.leaderboard);
    await expect(
      page.getByRole("heading", { name: "Portfolio Leaderboard" }),
    ).toBeVisible();
    await expect(page.getByText("Illustrative").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(
        "A portion of platform fees funds the monthly Creator Rewards Pool.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/Performance 50% · AUM 25% · Volume 15% · \$DEXLA Tips 10%/),
    ).toBeVisible();
    await expect(
      page.getByText("The Top 10 portfolios qualify each month."),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Top 3" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Winner Zone" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Competing Portfolios" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Monthly Creator Rewards" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View Reward Details" }),
    ).toBeVisible();
  });

  test("All-Time is historical only without monthly reward claims", async ({
    page,
  }) => {
    await page.goto(`${APP_ROUTES.leaderboard}?period=all-time`);
    await expect(
      page.getByText(/All-Time is historical only/),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/does not imply All-Time rewards/),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Monthly Creator Rewards" }),
    ).toHaveCount(0);
  });
});
