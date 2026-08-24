import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Degen Club", () => {
  test.setTimeout(60_000);

  test("shows persistent warning, hero and marketplace grid", async ({ page }) => {
    await page.goto(APP_ROUTES.degenClub);
    await expect(
      page.getByRole("heading", { name: "The New Way To Play Memecoins." }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/Extreme Risk — Memecoins are highly volatile/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Discover Indexes" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Build Your Basket" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
    await page.locator("#degen-marketplace").scrollIntoViewIfNeeded();
    await expect(page.getByRole("tab", { name: "Indexes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View Details" })).toHaveCount(4);
    await expect(page.getByText("Illustrative").first()).toBeVisible();
  });

  test("Build Your Basket opens risk modal then Create degen template", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.degenClub);
    await expect(
      page.getByRole("heading", { name: "The New Way To Play Memecoins." }),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Build Your Basket" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByText(/Extreme Risk — Memecoins are highly volatile/).nth(1),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue to Create" }).click();
    await expect(page).toHaveURL(/\/app\/create\?template=degen/);
    await expect(
      page.getByText(/Extreme Risk — Memecoins are highly volatile/).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Degen Index template/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Assets & Allocations" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("product detail page shows warning and invest confirmation", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.degenProduct("solana-memecoin-index"));
    await expect(
      page.getByRole("heading", { name: "Solana Memecoin Index", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Rules & Strategy")).toBeVisible();
    await page.getByRole("banner").getByRole("button", { name: "Connect Wallet" }).click();
    await page.getByRole("button", { name: "Invest" }).click();
    await expect(
      page.getByRole("heading", { name: "Investment confirmation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm Invest Preview" }),
    ).toBeDisabled();
    await page
      .getByLabel(/I understand and acknowledge this extreme risk/)
      .check();
    await page.getByRole("button", { name: "Confirm Invest Preview" }).click();
    await expect(page.getByText(/preview only/i)).toBeVisible();
  });

  test("portfolios tab shows multi-chain banner and three products", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.degenClub);
    await expect(
      page.getByRole("heading", { name: "The New Way To Play Memecoins." }),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("tab", { name: "Portfolios" }).click();
    await expect(page.getByText("Multi-Chain Memecoins")).toBeVisible();
    await expect(page.getByRole("link", { name: "View Details" })).toHaveCount(3);
  });
});
