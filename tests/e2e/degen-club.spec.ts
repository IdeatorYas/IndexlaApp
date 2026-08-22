import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Degen Club", () => {
  test.setTimeout(60_000);

  test("shows persistent warning, hero and discover grid", async ({ page }) => {
    await page.goto(APP_ROUTES.degenClub);
    await expect(
      page.getByText(/Extreme Risk — Memecoins are highly volatile/),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Multiple Shots" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Discover Memecoin Indexes" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Build Your Own" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
    await expect(page.getByText("Solana Meme 10-Shots").first()).toBeVisible();
    await expect(page.getByText("Illustrative").first()).toBeVisible();
  });

  test("Build Your Own opens risk modal then Create degen template", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.degenClub);
    await page.getByRole("button", { name: "Build Your Own" }).click();
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

  test("product detail shows warning and invest confirmation", async ({
    page,
  }) => {
    await page.goto(`${APP_ROUTES.degenClub}?id=degen-ten-shots`);
    await expect(
      page.getByRole("heading", { name: "Solana Meme 10-Shots" }).nth(1),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Rebalance rules")).toBeVisible();
    await page.getByRole("button", { name: "Invest" }).click();
    await expect(
      page.getByRole("heading", { name: "Investment confirmation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm Invest Preview" }),
    ).toBeDisabled();
    await page.getByRole("dialog").getByRole("button", { name: "Connect Wallet" }).click();
    await page
      .getByLabel(/I understand and acknowledge this extreme risk/)
      .check();
    await page.getByRole("button", { name: "Confirm Invest Preview" }).click();
    await expect(page.getByText(/preview only/i)).toBeVisible();
  });
});
