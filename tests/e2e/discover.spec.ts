import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Discover marketplace", () => {
  test.setTimeout(60_000);

  test("loads catalog controls and product grid", async ({ page }) => {
    await page.goto(APP_ROUTES.discover);
    await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: "Discover tabs" }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("Search portfolios, indexes or assets"),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Featured" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trending" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "All products" }),
    ).toBeVisible();
    await expect(page.getByText("INDEXLA · Verified").first()).toBeVisible();
  });

  test("opens product detail from query param", async ({ page }) => {
    await page.goto(`${APP_ROUTES.discover}?tab=indexes&id=ai-infra-index`);
    await expect(
      page.getByRole("heading", { level: 2, name: "AI Infrastructure Index" }),
    ).toBeVisible();
    await expect(page.getByText("You hold the real underlying assets")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Invest", exact: true }),
    ).toBeVisible();
  });

  test("filters indexes tab", async ({ page }) => {
    await page.goto(APP_ROUTES.discover);
    await page.getByRole("tab", { name: "Indexes" }).click();
    await expect(page).toHaveURL(/tab=indexes/);
  });
});
