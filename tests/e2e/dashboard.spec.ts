import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Main Dashboard", () => {
  test("disconnected wallet shows connect state in overview", async ({ page }) => {
    await page.goto(APP_ROUTES.dashboard);
    await expect(page.getByText("Wallet not connected")).toBeVisible();
  });

  test.describe("connected", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(APP_ROUTES.dashboard);
      await page.getByRole("banner").getByRole("button", { name: "Connect Wallet" }).click();
      await expect(page.getByText("Total Portfolio Value")).toBeVisible({
        timeout: 5000,
      });
    });

    test("renders all dashboard sections", async ({ page }) => {
      await expect(
        page.getByRole("heading", { name: "Welcome back, Investor" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Portfolio Overview" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Main Product Gateways" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Active Portfolios" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Automation Status" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Recent Activity" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Market Snapshot" }),
      ).toBeVisible();
    });

    test("chart period tabs switch", async ({ page }) => {
      await page.getByRole("tab", { name: "7D" }).click();
      await expect(page.getByRole("tab", { name: "7D" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.getByRole("tab", { name: "1Y" }).click();
      await expect(page.getByRole("tab", { name: "1Y" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    test("product gateway cards navigate correctly", async ({ page }) => {
      const cases = [
        { text: "Open Portfolio →", url: /\/app\/portfolio$/ },
        { text: "Discover →", url: /\/app\/discover$/ },
        { text: "Enter Degen Club →", url: /\/app\/degen-club$/ },
        { text: "Explore Strategies →", url: /\/app\/strategies$/ },
        { text: "View Leaderboard →", url: /\/app\/leaderboard$/ },
        { text: "Open Creator Hub →", url: /\/app\/creators$/ },
      ];

      for (const item of cases) {
        await page.goto(APP_ROUTES.dashboard);
        await page.getByRole("banner").getByRole("button", { name: /Connect Wallet|0x742d/ }).click();
        await page.locator("a").filter({ hasText: item.text }).first().click();
        await expect(page).toHaveURL(item.url);
      }
    });
  });
});
