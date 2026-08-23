import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Discover marketplace", () => {
  test.setTimeout(60_000);

  test("loads catalog controls and product grid", async ({ page }) => {
    await page.goto(APP_ROUTES.discover);
    await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: "Marketplace product type" }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("Search by index name or asset"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Explore Marketplace" }),
    ).toBeVisible();
    await expect(page.getByText("Layer 1 Index").first()).toBeVisible();
    await expect(page.getByText("INDEXLA · Verified").first()).toBeVisible();
    await expect(page.getByText("Risk").first()).toBeVisible();
  });

  test("opens product detail from query param", async ({ page }) => {
    await page.goto(`${APP_ROUTES.discover}?tab=indexes&id=layer-1-index`);
    await expect(
      page.getByRole("heading", { level: 2, name: "Layer 1 Index" }),
    ).toBeVisible();
    await expect(page.getByText("You hold the real underlying assets")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Invest", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Strategy composition")).toBeVisible();
  });

  test("filters indexes tab and risk", async ({ page }) => {
    await page.goto(APP_ROUTES.discover);
    await page.getByRole("tab", { name: "Portfolios" }).click();
    await expect(page).toHaveURL(/tab=portfolios/);
    await page.getByRole("tab", { name: "Indexes" }).click();
    await page.getByRole("button", { name: "DeFi", exact: true }).click();
    await expect(page.getByText("DeFi Index").first()).toBeVisible();
  });

  test("search finds asset ticker", async ({ page }) => {
    await page.goto(APP_ROUTES.discover);
    await page.getByRole("tab", { name: "Tokenized Stocks" }).click();
    await page
      .getByPlaceholder("Search by index name or asset")
      .fill("NVDA");
    await expect(page.getByText("Tokenized AI Index").first()).toBeVisible({
      timeout: 5000,
    });
  });
});
