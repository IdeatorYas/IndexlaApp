import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Strategies", () => {
  test.setTimeout(60_000);

  test("marketplace tab shows featured and filters", async ({ page }) => {
    await page.goto(APP_ROUTES.strategies);
    await expect(
      page.getByRole("heading", { name: "Strategies" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: "Strategies tabs" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Featured" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Buy Fear / Sell Greed").first()).toBeVisible();
    await expect(page.getByText("Momentum Alpha").first()).toBeVisible();
    await expect(page.getByText("2,000 $DEXLA").first()).toBeVisible();
  });

  test("my strategies and publish tabs render", async ({ page }) => {
    await page.goto(`${APP_ROUTES.strategies}?tab=mine`);
    await expect(page.getByText("Creator Income Overlay")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", { name: "Claim Revenue" }).first(),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Publish Strategy" }).click();
    await expect(page.getByText("Review economics")).toBeVisible();
    await expect(page.getByText(/Listing fee: 500 \$DEXLA/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save Draft" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish Strategy" }),
    ).toBeVisible();
  });
});
