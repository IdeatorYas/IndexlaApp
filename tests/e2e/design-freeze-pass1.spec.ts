import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Design freeze pass 1 — deep links & search", () => {
  test.setTimeout(60_000);

  test("Buy $DEXLA sidebar deep link opens purchase preview", async ({
    page,
  }) => {
    await page.goto(`${APP_ROUTES.portfolio}?action=buy-dexla`);
    await expect(
      page.getByRole("heading", { name: "Wallet disconnected" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Buy \$DEXLA preview will open after you connect/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(
      page.getByRole("dialog", { name: /Buy \$DEXLA/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Buy $DEXLA" }),
    ).toBeVisible();
  });

  test("Claim deep link opens Investor Rewards section", async ({ page }) => {
    await page.goto(`${APP_ROUTES.portfolio}?action=claim`);
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(page.getByText("Your portfolios")).toBeVisible({
      timeout: 10_000,
    });
    const rewards = page.locator("#portfolio-investor-rewards");
    await expect(rewards).toBeVisible();
    await expect(rewards.getByText("Investor rewards")).toBeVisible();
    await expect(rewards.getByRole("button", { name: "Claim Rewards" })).toBeVisible();
  });

  test("Strategies ?focus= selects and highlights strategy", async ({
    page,
  }) => {
    await page.goto(
      `${APP_ROUTES.strategies}?focus=buy-fear-sell-greed`,
    );
    await expect(
      page.getByRole("heading", { name: "Strategies", exact: true }),
    ).toBeVisible();
    const card = page.locator("#strategy-card-buy-fear-sell-greed");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#strategy-detail-panel")).toContainText(
      "Buy Fear / Sell Greed",
    );
  });

  test("⌘K / header search opens global command modal", async ({ page }) => {
    await page.goto(APP_ROUTES.dashboard);
    await page
      .getByRole("button", {
        name: "Search portfolios, indexes, creators and strategies",
      })
      .click();
    const dialog = page.getByRole("dialog", { name: "Global search" });
    await expect(dialog).toBeVisible();
    await page
      .getByLabel(
        "Search portfolios, indexes, creators, strategies and navigation",
      )
      .fill("Fear");
    await expect(
      dialog.getByRole("link", { name: /Buy Fear \/ Sell Greed/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("Create Portfolio / Index terminology in nav", async ({ page }) => {
    await page.goto(APP_ROUTES.dashboard);
    await expect(
      page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
        name: /Create Portfolio \/ Index/,
      }),
    ).toBeVisible();
  });
});
