import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("My Portfolio", () => {
  test.setTimeout(60_000);

  test("disconnected state then connected overview", async ({ page }) => {
    await page.goto(APP_ROUTES.portfolio);
    await expect(
      page.getByRole("heading", { name: "My Portfolio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Wallet disconnected" }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Connect Wallet" })
      .first()
      .click();
    await expect(page.getByText("Your portfolios")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("tablist", { name: "My Portfolio tabs" }),
    ).toBeVisible();
    await expect(page.getByText("Total value")).toBeVisible();
  });

  test("assets and automation tabs render", async ({ page }) => {
    await page.goto(APP_ROUTES.portfolio);
    await page
      .getByRole("button", { name: "Connect Wallet" })
      .first()
      .click();
    await expect(page.getByText("Your portfolios")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("tab", { name: "Assets" }).click();
    await expect(page.getByRole("columnheader", { name: "Asset" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Buy" }).first()).toBeVisible();

    await page.getByRole("tab", { name: "Automation" }).click();
    await expect(page.getByText("Permission scope")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Revoke Permission" }),
    ).toBeVisible();
  });
});
