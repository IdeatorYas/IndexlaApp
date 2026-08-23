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
      page.getByRole("heading", { name: "Marketplace", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Layer 1 Index").first()).toBeVisible();
    await expect(page.getByText("INDEXLA", { exact: true }).first()).toBeVisible();
    await expect(
      page.locator("article").filter({ hasText: "Layer 1 Index" }).getByText("AUM"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "View Details" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Invest" }).first()).toBeVisible();
  });

  test("legacy discover id param redirects to product page", async ({ page }) => {
    await page.goto(`${APP_ROUTES.discover}?tab=indexes&id=layer-1-index`);
    await expect(page).toHaveURL(/\/app\/product\/layer-1-index/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Layer 1 Index" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Allocation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Selected Strategy" })).toBeVisible();
    await expect(page.getByText("Strategy composition")).toHaveCount(0);
    await expect(page.getByText("You hold the real underlying assets")).toBeVisible();
  });

  test("product invest flow opens choice modal", async ({ page }) => {
    await page.goto(`${APP_ROUTES.product("layer-1-index")}?action=invest`);
    await expect(
      page.getByRole("heading", { name: "How would you like to invest?" }),
    ).toBeVisible();
    await expect(page.getByText("Invest as Published")).toBeVisible();
    await expect(page.getByText("Customize First")).toBeVisible();
  });

  test("filters indexes tab and narrative", async ({ page }) => {
    await page.goto(APP_ROUTES.discover);
    await page.getByRole("tab", { name: "Portfolios" }).click();
    await expect(page).toHaveURL(/tab=portfolios/);
    await page.getByRole("tab", { name: "Indexes" }).click();
    await page
      .getByRole("tablist", { name: "Asset category" })
      .getByRole("tab", { name: "Crypto" })
      .click();
    await page.getByRole("button", { name: "DeFi", exact: true }).click();
    await expect(page.getByText("DeFi Index").first()).toBeVisible();
  });

  test("portfolios tab shows official INDEXLA templates", async ({ page }) => {
    await page.goto(APP_ROUTES.discover);
    await page.getByRole("tab", { name: "Portfolios" }).click();
    await page.getByRole("tab", { name: "Crypto" }).click();
    await expect(page.getByText("Crypto Core").first()).toBeVisible();
    await expect(page.getByText("Crypto Growth").first()).toBeVisible();
    await page.getByRole("tab", { name: "Tokenized Stocks" }).click();
    await expect(page.getByText("Stock Core").first()).toBeVisible();
    await page.getByRole("tab", { name: "Hybrid" }).click();
    await expect(page.getByText("Big 5").first()).toBeVisible();
    await page.getByRole("link", { name: "View Details" }).first().click();
    await expect(page).toHaveURL(/\/app\/product\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
