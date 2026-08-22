import { test, expect } from "@playwright/test";
import { APP_ROUTES } from "../../src/lib/routes";

test.describe("Creator Hub", () => {
  test.setTimeout(60_000);

  test("browse, featured, hub card and follow preview", async ({ page }) => {
    await page.goto(APP_ROUTES.creators);
    await expect(
      page.getByRole("heading", { name: "Creators", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Become a Creator" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Featured Creators" }),
    ).toBeVisible();
    await expect(page.getByText("INDEXLA").first()).toBeVisible();
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await page.getByRole("button", { name: "Follow" }).first().click();
    await expect(page.getByText(/Following @|preview only/i).first()).toBeVisible();
  });

  test("search no-results state", async ({ page }) => {
    await page.goto(APP_ROUTES.creators);
    await page.getByLabel("Search creators").fill("zzz-no-match-xyz");
    await expect(
      page.getByRole("heading", { name: "No search results" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Creator Leaderboard", () => {
  test.setTimeout(60_000);

  test("podium, table and portfolio leaderboard link without reward copy", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.creatorLeaderboard);
    await expect(
      page.getByRole("heading", { name: "Creator Leaderboard" }),
    ).toBeVisible();
    await expect(
      page.getByText(/separate from the Portfolio Leaderboard/i),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /View Portfolio Leaderboard/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Top 3" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Creator rankings" }),
    ).toBeVisible();
    await expect(page.getByText(/Top 10 portfolios win monthly/i)).toHaveCount(0);
    await expect(page.getByText(/Performance 50%/i)).toHaveCount(0);
    await page.getByRole("link", { name: "View Profile" }).first().click();
    await expect(page).toHaveURL(/\/app\/creators\//);
  });
});

test.describe("Public Creator Profile", () => {
  test.setTimeout(60_000);

  test("loads populated profile for fixture handle", async ({ page }) => {
    await page.goto(APP_ROUTES.creatorProfile("indexla"));
    await expect(
      page.getByRole("heading", { name: "INDEXLA", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("@indexla").first()).toBeVisible();
    await expect(page.getByText("Illustrative").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Public products" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Published strategies" }),
    ).toBeVisible();
    const disclosure = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Disclosure and risk" }) });
    await expect(
      disclosure.getByTestId("creator-funds-disclosure"),
    ).toHaveCount(1);
    await expect(disclosure.getByTestId("creator-funds-disclosure")).toContainText(
      "Creators never control investor funds",
    );
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(
      page.getByRole("button", { name: /0x742d/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Tip $DEXLA" }).click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Tip $DEXLA" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm Tip Preview" }).click();
    await expect(page.getByText(/preview only/i)).toBeVisible();
  });

  test("unknown handle shows not found", async ({ page }) => {
    const response = await page.goto("/app/creators/no-such-creator-xyz");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Creator not found" }),
    ).toBeVisible();
  });
});

test.describe("Creator Activation", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("indexla.creator.activation.v1");
    });
  });

  test("required copy, public portfolio select, social, submit and approve", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.creatorActivate);
    await expect(
      page.getByRole("heading", { name: "Creator Activation" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(
        /Creator access requires a published public portfolio, connected social profile and verification/i,
      ),
    ).toBeVisible();
    await expect(page.getByText("Personal portfolios (not eligible)")).toBeVisible();
    await expect(page.getByText(/does not qualify/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(page.getByRole("button", { name: /0x742d/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /Select for activation/i }).first().click();
    await expect(page.getByText(/Selected public portfolio/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Continue to Social" }).click();

    await expect(
      page.getByRole("heading", { name: "2. Connect Social Media" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Connect X" }).click();
    await expect(page.getByText(/Connected ·/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Continue to Verification" }).click();

    await page.getByPlaceholder("Display name").fill("Preview Creator");
    await page.getByPlaceholder("handle").fill("previewcreator");
    await page.getByPlaceholder("Short creator bio").fill("Illustrative creator bio");
    await page.locator("select").selectOption("AI");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Submit Verification", exact: true }).click();
    await expect(
      page.getByText("Awaiting Verification", { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Simulate Approval (preview)" }).click();
    await expect(
      page.getByRole("heading", { name: "4. Creator Access Approved" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Creator Dashboard" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View Public Profile" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Publish Strategy" }),
    ).toBeVisible();
  });

  test("hub smart card reflects locked activation status copy", async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.creators);
    await expect(
      page.getByRole("heading", { name: "Become a Creator" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(
        /Creator access requires a published public portfolio, connected social profile and verification/i,
      ).first(),
    ).toBeVisible();
    await page.getByRole("link", { name: "Become a Creator" }).click();
    await expect(page).toHaveURL(/\/app\/creators\/activate/);
  });
});
