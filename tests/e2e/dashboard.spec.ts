import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Marketplace-First Dashboard", () => {
  test("disconnected wallet still shows marketplace and secondary snapshot CTA", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.dashboard);
    await expect(
      page.getByRole("heading", { name: /Discover\. Build\. Automate\./ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Featured Products" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Explore Marketplace" }),
    ).toBeVisible();
    await expect(page.getByText("Wallet not connected")).toBeVisible();
    await expect(
      page.getByText(
        "Connect your wallet to view your portfolio, automation and rewards.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Preview · Illustrative Data")).toBeVisible();
  });

  test.describe("connected", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(APP_ROUTES.dashboard);
      await page
        .getByRole("banner")
        .getByRole("button", { name: "Connect Wallet" })
        .click();
      await expect(page.getByText("Total Portfolio Value")).toBeVisible({
        timeout: 5000,
      });
    });

    test("renders marketplace-first dashboard sections in order", async ({
      page,
    }) => {
      await expect(
        page.getByRole("heading", { name: /Discover\. Build\. Automate\./ }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Featured Products" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Explore Marketplace" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Product Pathways" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "How INDEXLA Works" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Personal Snapshot" }),
      ).toBeVisible();
      await expect(
        page.getByText("0% Management · 0% Performance · 0% Exit"),
      ).toBeVisible();
    });

    test("marketplace tabs and rows are present", async ({ page }) => {
      await expect(page.getByRole("heading", { name: "Trending Now" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Most Invested" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "New This Week" })).toBeVisible();
      await page
        .getByRole("tablist", { name: "Marketplace tabs" })
        .getByRole("tab", { name: "Indexes" })
        .click();
      await expect(
        page
          .getByRole("tablist", { name: "Marketplace tabs" })
          .getByRole("tab", { name: "Indexes" }),
      ).toHaveAttribute("aria-selected", "true");
    });

    test("chart period tabs switch in personal snapshot", async ({ page }) => {
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

    test("product pathway cards navigate correctly", async ({ page }) => {
      const cases = [
        { text: "Start Building →", url: /\/app\/create$/ },
        { text: "Enter Degen Club →", url: /\/app\/degen-club$/ },
        { text: "Explore Strategies →", url: /\/app\/strategies$/ },
        { text: "View Leaderboard →", url: /\/app\/leaderboard$/ },
        { text: "Browse Creators →", url: /\/app\/creators$/ },
      ];

      for (const item of cases) {
        await page.goto(APP_ROUTES.dashboard);
        await page
          .getByRole("banner")
          .getByRole("button", { name: /Connect Wallet|0x742d/ })
          .click();
        await page.locator("a").filter({ hasText: item.text }).first().click();
        await expect(page).toHaveURL(item.url);
      }
    });
  });
});
