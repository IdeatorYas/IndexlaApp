import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Degen Club", () => {
  test.setTimeout(60_000);

  test("shows persistent warning, hero and marketplace grid", async ({ page }) => {
    await page.goto(APP_ROUTES.degenClub);
    await expect(page.getByText("DEGEN CLUB").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "The New Way To Play Memecoins." }),
    ).toBeVisible();
    await expect(
      page.getByText("EXTREME RISK WARNING").first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Memecoins are highly speculative and extremely volatile/),
    ).toBeVisible();
    await expect(
      page.getByText(/STOP BETTING EVERYTHING ON ONE COIN\./),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "BUILD YOUR BASKET" }),
    ).toBeVisible();
    await expect(
      page.getByText(/AUM, 30D performance, investors and activity are Illustrative/),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
    await page.locator("#degen-marketplace").scrollIntoViewIfNeeded();
    await expect(page.getByRole("tab", { name: "Indexes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View Details" })).toHaveCount(4);
  });

  test("Build Your Basket opens risk modal then Create degen template", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.degenClub);
    await expect(
      page.getByRole("heading", { name: "The New Way To Play Memecoins." }),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "BUILD YOUR BASKET" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Continue to Create" }).click();
    await expect(page).toHaveURL(/\/app\/create\?template=degen/);
  });

  test("product detail page shows compact layout and trade confirmation", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.degenProduct("solana-memecoin-index"));
    await expect(
      page.getByRole("heading", { name: "Solana Memecoin Index", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".degen-detail-allocation")).toBeVisible();
    await expect(page.locator(".degen-detail-holdings li")).toHaveCount(10);
    await page.getByRole("banner").getByRole("button", { name: "Connect Wallet" }).click();
    await page.getByRole("button", { name: "Trade" }).click();
    await expect(
      page.getByRole("heading", { name: "Trade confirmation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm Trade Preview" }),
    ).toBeDisabled();
    await page
      .getByLabel(/I understand and acknowledge this extreme risk/)
      .check();
    await page.getByRole("button", { name: "Confirm Trade Preview" }).click();
    await expect(page.getByText(/preview only/i)).toBeVisible();
  });

  test("portfolios tab shows multi-chain banner and three products", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.degenClub);
    await page.getByRole("tab", { name: "Portfolios" }).click();
    await expect(page.getByText("Multi-Chain Memecoins")).toBeVisible();
    await expect(page.getByRole("link", { name: "View Details" })).toHaveCount(3);
  });

  test("marketplace cards show compact donuts with trade CTAs visible", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.degenClub);
    await page.locator("#degen-marketplace").scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible({
      timeout: 20_000,
    });

    const firstCard = page.locator(".degen-card").first();
    await expect(firstCard.locator(".degen-allocation-donut, .degen-card-donut").first()).toBeVisible();
    await expect(firstCard.getByRole("button", { name: "Trade" })).toBeVisible();
    await expect(
      firstCard.getByRole("link", { name: "View Details" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Portfolios" }).click();
    await expect(page.locator(".degen-card")).toHaveCount(3);
    await expect(
      page.locator(".degen-card").first().getByRole("button", { name: "Trade" }),
    ).toBeVisible();
  });

  test("chain filters include Sui and Robinhood Chain", async ({ page }) => {
    await page.goto(APP_ROUTES.degenClub);
    await page.locator("#degen-marketplace").scrollIntoViewIfNeeded();
    await expect(page.getByRole("tab", { name: "Sui" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: "Robinhood Chain" })).toBeVisible();
  });
});
