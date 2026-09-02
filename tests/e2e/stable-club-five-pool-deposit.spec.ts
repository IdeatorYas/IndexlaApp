import { test, expect, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  STABLE_CLUB_FIVE_POOL_E2E_INJECT_WALLET_SCRIPT,
  STABLE_CLUB_E2E_REJECT_WALLET_SCRIPT,
  STABLE_CLUB_E2E_WRONG_NETWORK_SCRIPT,
} from "./helpers/stable-club-five-pool-inject-wallet";

const SHOT_DIR = path.join(process.cwd(), "tmp/five-pool-deposit-qa");
const E2E_USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

test.describe.configure({ mode: "serial" });

test.describe("Five-pool deposit — runtime verification", () => {
  test.setTimeout(240_000);

  test.beforeAll(() => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
  });

  test("wrong network is surfaced", async ({ page }) => {
    await page.addInitScript(STABLE_CLUB_E2E_WRONG_NETWORK_SCRIPT);
    await page.goto("/app/stable-club");
    // Injected provider returns eth_accounts immediately — UI auto-connects on wrong chain.
    await expect(page.getByText(/Wrong network/i).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: path.join(SHOT_DIR, "wrong-network.png"),
      fullPage: true,
    });
  });

  test("wallet rejection during deposit approvals", async ({ page }) => {
    await page.addInitScript(STABLE_CLUB_E2E_REJECT_WALLET_SCRIPT);
    await page.goto("/app/stable-club");
    const connectBtn = page.getByRole("button", { name: "Connect Wallet" }).first();
    if (await connectBtn.isVisible().catch(() => false)) {
      await connectBtn.click();
    }
    await expect(page.getByText(E2E_USER)).toBeVisible({ timeout: 15_000 });

    const panel = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Five-pool deposit" }) })
      .last();
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.getByText("CL executor", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await panel.getByRole("button", { name: /Register five-pool strategy/i }).click();
    await expect(panel.getByText(/Wallet rejected|Registration failed|rejected/i)).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: path.join(SHOT_DIR, "wallet-rejection.png"),
      fullPage: true,
    });
  });

  test("full local deposit: quotes, preview, Permit2, confirm, duplicate block", async ({
    page,
  }) => {
    await page.addInitScript(STABLE_CLUB_FIVE_POOL_E2E_INJECT_WALLET_SCRIPT);
    await page.goto("/app/stable-club");

    await expect(
      page.getByRole("heading", { name: /Base Pools \+ Dashboard \+ Automation/i }),
    ).toBeVisible();

    const connectBtn = page.getByRole("button", { name: "Connect Wallet" }).first();
    if (await connectBtn.isVisible().catch(() => false)) {
      await connectBtn.click();
    }
    await expect(page.getByText(E2E_USER)).toBeVisible({ timeout: 15_000 });

    const panel = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Five-pool deposit" }) })
      .last();
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.getByText("CL executor", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // Register strategy when needed (treat StrategyAlreadyExists as success)
    const registerBtn = panel.getByRole("button", { name: /Register five-pool strategy/i });
    if (await registerBtn.isEnabled()) {
      await registerBtn.click();
      await expect(registerBtn).toBeDisabled({ timeout: 90_000 });
    }
    await expect(panel.getByText("Not registered")).toHaveCount(0);
    // Clear any prior failed-status noise so deposit can proceed
    await expect(panel.getByRole("button", { name: /^Prepare quotes$/i })).toBeEnabled();

    await panel.getByLabel(/Total deposit \(USDC\)/i).fill("1000");
    // SC-F11: accessible names include the executable max (500 bps).
    const swapSlip = panel.getByLabel("Swap slippage (bps, max 500)");
    const lpSlip = panel.getByLabel("LP slippage (bps, max 500)");
    await expect(swapSlip).toBeVisible();
    await expect(lpSlip).toBeVisible();
    await expect(swapSlip).toHaveAttribute("max", "500");
    await expect(lpSlip).toHaveAttribute("max", "500");
    await swapSlip.fill("100");
    await lpSlip.fill("100");

    await panel.getByRole("button", { name: /^Prepare quotes$/i }).click();
    await expect(panel.getByText("Deposit preview")).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByText(/Source oracle-guard/)).toBeVisible();

    // Five 20% rows
    await expect(panel.getByRole("cell", { name: "USDC-cbBTC-AERO-CL100", exact: true })).toBeVisible();
    await expect(panel.getByRole("cell", { name: "USDC-cbBTC-UNI-005", exact: true })).toBeVisible();
    await expect(panel.getByRole("cell", { name: "cbBTC-WETH-AERO-CL10", exact: true })).toBeVisible();
    await expect(panel.getByRole("cell", { name: "cbBTC-WETH-AERO-CL100", exact: true })).toBeVisible();
    await expect(panel.getByRole("cell", { name: "cbBTC-WETH-UNI-005", exact: true })).toBeVisible();
    const allocCells = panel.locator("td", { hasText: /20% · 200 USDC/ });
    await expect(allocCells).toHaveCount(5);

    // Eight swap legs
    await expect(panel.getByText(/Eight swap legs/i)).toBeVisible();
    await expect(panel.getByText(/leg0-usdc-cbbtc:/)).toBeVisible();
    await expect(panel.getByText(/leg4-usdc-weth:/)).toBeVisible();
    await expect(panel.getByText(/Source oracle-guard/)).toBeVisible();
    await expect(panel.getByText(/Non-custodial/i)).toBeVisible();

    await page.screenshot({
      path: path.join(SHOT_DIR, "desktop-preview.png"),
      fullPage: true,
    });

    // Mobile viewport check (no clipping of preview section)
    await page.setViewportSize(devices["iPhone 12"].viewport!);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(SHOT_DIR, "mobile-preview.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 800 });

    const depositBtn = panel.getByRole("button", { name: /Deposit Into 5-Pool Strategy/i });
    await expect(depositBtn).toBeEnabled();

    // Prefer a free on-chain nonce (prior local runs may have consumed 1)
    await expect(panel.getByText("Next deposit nonce")).toBeVisible();

    const depositPromise = depositBtn.click();
    await expect(panel.getByText("2 · Awaiting approval / signature")).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: path.join(SHOT_DIR, "progress-awaiting-approval.png"),
      fullPage: true,
    });
    await depositPromise;

    // Wait for confirmed or surface failure details for the report
    const confirmed = panel.getByText("4 · Confirmed");
    const failed = panel.getByText("5 · Failed — retry");
    await Promise.race([
      confirmed.waitFor({ state: "visible", timeout: 180_000 }),
      failed.waitFor({ state: "visible", timeout: 180_000 }),
    ]);

    if (await failed.isVisible()) {
      await page.screenshot({
        path: path.join(SHOT_DIR, "desktop-failed.png"),
        fullPage: true,
      });
      const errText = await panel.locator("p").allTextContents();
      throw new Error(`Deposit failed UI state. Panel text:\n${errText.join("\n")}`);
    }

    await expect(confirmed).toBeVisible();
    await expect(panel.getByText(/Deposit confirmed/i)).toBeVisible();
    await expect(panel.getByText(/Tx:/i)).toBeVisible();
    const txLine = panel.locator("p").filter({ hasText: /Tx:/i });
    const txText = await txLine.textContent();
    expect(txText).toMatch(/0x[a-fA-F0-9]{16,}/);

    const approvalLine = panel.locator("p").filter({ hasText: /Approvals:/i });
    const approvalText = (await approvalLine.textContent()) ?? "";

    await page.screenshot({
      path: path.join(SHOT_DIR, "desktop-confirmed.png"),
      fullPage: true,
    });

    // Duplicate submission: plan cleared after confirm → deposit disabled
    await expect(depositBtn).toBeDisabled();

    // Stale quote path: prepare again then invalidate via amount change
    await panel.getByRole("button", { name: /^Prepare quotes$/i }).click();
    await expect(panel.getByRole("heading", { name: "Deposit preview" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(panel.getByText(/Quotes ready — review preview/i)).toBeVisible();
    await panel.getByLabel(/Total deposit \(USDC\)/i).fill("1000.000001");
    await expect(panel.getByText("Deposit preview")).toHaveCount(0);
    await expect(depositBtn).toBeDisabled();

    await panel.getByLabel(/Total deposit \(USDC\)/i).fill("1000");
    fs.writeFileSync(
      path.join(SHOT_DIR, "runtime-result.json"),
      JSON.stringify(
        {
          user: E2E_USER,
          confirmedVisible: true,
          txSnippet: txText,
          approvalSnippet: approvalText,
          screenshots: fs.readdirSync(SHOT_DIR).filter((f) => f.endsWith(".png")),
        },
        null,
        2,
      ),
    );
  });
});
