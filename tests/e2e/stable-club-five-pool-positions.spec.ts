import { test, expect, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { STABLE_CLUB_FIVE_POOL_E2E_INJECT_WALLET_SCRIPT } from "./helpers/stable-club-five-pool-inject-wallet";

const SHOT_DIR = path.join(process.cwd(), "tmp/five-pool-positions-qa");
const E2E_USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

test.describe.configure({ mode: "serial" });

test.describe("Five-pool positions & exits — runtime verification", () => {
  test.setTimeout(360_000);

  test.beforeAll(() => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
  });

  test("deposit creates five NFTs; individual exit; Exit All remainder; emergency path", async ({
    page,
  }) => {
    await page.addInitScript(STABLE_CLUB_FIVE_POOL_E2E_INJECT_WALLET_SCRIPT);
    await page.goto("/app/stable-club");

    const connectBtn = page.getByRole("button", { name: "Connect Wallet" }).first();
    if (await connectBtn.isVisible().catch(() => false)) {
      await connectBtn.click();
    }
    await expect(page.getByText(E2E_USER)).toBeVisible({ timeout: 15_000 });

    const deposit = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Five-pool deposit" }) })
      .last();
    const positions = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Five-pool positions & exits" }) })
      .last();

    await deposit.scrollIntoViewIfNeeded();
    await expect(deposit.getByText("CL executor", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const registerBtn = deposit.getByRole("button", { name: /Register five-pool strategy/i });
    if (await registerBtn.isEnabled()) {
      await registerBtn.click();
      await expect(registerBtn).toBeDisabled({ timeout: 90_000 });
    }

    await deposit.getByLabel(/Total deposit \(USDC\)/i).fill("1000");
    await deposit.getByRole("button", { name: /^Prepare quotes$/i }).click();
    await expect(deposit.getByRole("heading", { name: "Deposit preview" })).toBeVisible({
      timeout: 60_000,
    });
    await deposit.getByRole("button", { name: /Deposit Into 5-Pool Strategy/i }).click();
    await expect(deposit.getByText("4 · Confirmed")).toBeVisible({ timeout: 180_000 });

    const depositTx = await deposit.locator("p").filter({ hasText: /Tx:/i }).textContent();

    await positions.getByRole("button", { name: /Refresh positions/i }).click();
    await expect(positions.getByText("5 / 5")).toBeVisible({ timeout: 60_000 });
    await expect(positions.getByText(/Leg 0 ·/)).toBeVisible();
    await expect(positions.getByText(/Leg 4 ·/)).toBeVisible();

    await page.screenshot({
      path: path.join(SHOT_DIR, "desktop-five-positions.png"),
      fullPage: true,
    });
    await page.setViewportSize(devices["iPhone 12"].viewport!);
    await positions.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(SHOT_DIR, "mobile-five-positions.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 800 });

    // Individual exit on leg 0
    await positions.getByRole("button", { name: /^Exit position$/i }).first().click();
    await expect(positions.getByText(/Awaiting NFT approval|Awaiting exit confirmation/i)).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: path.join(SHOT_DIR, "progress-individual-exit.png"),
      fullPage: true,
    });
    await expect(positions.locator("dd").filter({ hasText: /^Confirmed$/ })).toBeVisible({
      timeout: 180_000,
    });
    await expect(positions.getByText(/Position exited/i)).toBeVisible();
    await expect(positions.getByText("4 / 5")).toBeVisible({ timeout: 60_000 });

    const individualTx = await positions.locator("p").filter({ hasText: /Tx:/i }).textContent();

    // Exit All remaining (atomic)
    await positions.getByRole("button", { name: /Exit All \(atomic\)/i }).click();
    await expect(
      positions.getByText(/Approve NFT|atomic exitAll|Awaiting exit confirmation/i),
    ).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: path.join(SHOT_DIR, "progress-exit-all.png"),
      fullPage: true,
    });
    await expect(positions.getByText(/Exit All confirmed/i)).toBeVisible({ timeout: 180_000 });
    await expect(positions.getByText("0 / 5")).toBeVisible({ timeout: 60_000 });

    const exitAllTx = await positions.locator("p").filter({ hasText: /Tx:/i }).textContent();

    // Fresh deposit for emergency path
    await deposit.getByRole("button", { name: /^Prepare quotes$/i }).click();
    await expect(deposit.getByRole("heading", { name: "Deposit preview" })).toBeVisible({
      timeout: 60_000,
    });
    await deposit.getByRole("button", { name: /Deposit Into 5-Pool Strategy/i }).click();
    await expect(deposit.getByText("4 · Confirmed")).toBeVisible({ timeout: 180_000 });
    await positions.getByRole("button", { name: /Refresh positions/i }).click();
    await expect(positions.getByText("5 / 5")).toBeVisible({ timeout: 60_000 });

    await positions.getByRole("button", { name: /Revoke strategy/i }).click();
    await expect(positions.getByText(/Strategy revoked|Revoked — use emergency/i)).toBeVisible({
      timeout: 90_000,
    });
    await expect(positions.getByRole("button", { name: /Exit All \(atomic\)/i })).toBeDisabled();
    // Ensure submit lock released after revoke refresh
    await expect(positions.getByRole("button", { name: /Emergency Exit All \(sequential\)/i })).toBeEnabled({
      timeout: 60_000,
    });

    await positions.getByRole("button", { name: /Emergency Exit All \(sequential\)/i }).click();
    await expect(
      positions.getByText(
        /Emergency: approve|Emergency exitLeg|Emergency Exit All confirmed|partial failures|Emergency Exit All failed|All emergency exits failed/i,
      ),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      positions.getByText(
        /Emergency Exit All confirmed|partial failures|Emergency Exit All failed|All emergency exits failed/i,
      ),
    ).toBeVisible({ timeout: 240_000 });
    await page.screenshot({
      path: path.join(SHOT_DIR, "emergency-exit-all.png"),
      fullPage: true,
    });

    // Direct protocol plan — reopen one path if positions remain, else empty state
    const openLabel = positions.getByText(/\d+ \/ 5/).first();
    const openText = (await openLabel.textContent()) ?? "";
    if (openText.trim().startsWith("0")) {
      await expect(positions.getByText(/No open Stable Club NFTs/i)).toBeVisible();
    } else {
      await positions.getByRole("button", { name: /Direct protocol exit/i }).first().click();
      await expect(positions.getByText(/Direct protocol \/ NPM escape/i)).toBeVisible();
      await expect(positions.getByText(/not risk-free/i)).toBeVisible();
    }

    await page.screenshot({
      path: path.join(SHOT_DIR, "desktop-final.png"),
      fullPage: true,
    });

    fs.writeFileSync(
      path.join(SHOT_DIR, "runtime-result.json"),
      JSON.stringify(
        {
          user: E2E_USER,
          depositTx,
          individualTx,
          exitAllTx,
          screenshots: fs.readdirSync(SHOT_DIR).filter((f) => f.endsWith(".png")),
        },
        null,
        2,
      ),
    );
  });
});
