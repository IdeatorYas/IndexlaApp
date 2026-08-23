import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Product page flow", () => {
  test("marketplace card to product page to invest choice", async ({ page }) => {
    await page.goto(APP_ROUTES.dashboard);
    await page
      .locator('[aria-label="Marketplace"] .grid a[href*="/app/product/"]')
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/product\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Portfolio Allocation" }),
    ).toBeVisible();
    await expect(page.getByText("100% Allocated")).toBeVisible();
    await expect(page.getByText("24H · 7D · 30D")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Selected Strategy" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Risk Disclosure" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "By confirming this investment, you acknowledge and accept these risks.",
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Invest" }).click();
    await expect(
      page.getByRole("heading", { name: "How would you like to invest?" }),
    ).toBeVisible();
    await page.getByText("Invest as Published").click();
    await expect(page).toHaveURL(/\/app\/create\?from=.*&mode=published/);
  });

  test("Customize First create path reaches review risk acknowledgment", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.product("layer-1-index"));
    await page.getByRole("button", { name: "Invest" }).click();
    await page.getByText("Customize First").click();
    await expect(page).toHaveURL(/\/app\/create\?from=.*&mode=customize/);
  });
});
