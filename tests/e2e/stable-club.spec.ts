import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, formatUnits, http } from "viem";
import { STABLE_CLUB_E2E_INJECT_WALLET_SCRIPT } from "./helpers/stable-club-inject-wallet";
import { STABLE_CLUB_LOCAL_CHAIN, STABLE_CLUB_LOCAL_RPC_URL } from "../../src/lib/stable-club/constants";
import { erc20Abi, testPoolAdapterAbi } from "../../src/lib/stable-club/abis";
import type { StableClubLocalDeployments } from "../../src/lib/stable-club/deployments";

const DEPLOYMENTS_PATH = path.join(
  process.cwd(),
  "src/lib/stable-club/generated/local-deployments.json",
);

const E2E_USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

function loadDeployments(): StableClubLocalDeployments {
  return JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8")) as StableClubLocalDeployments;
}

test.describe("Stable Club Step 1 — frontend to contract", () => {
  test.setTimeout(180_000);

  test("executes deposit, remove, withdraw, pause, revoke and emergency exit", async ({
    page,
  }) => {
    const deployments = loadDeployments();
    const publicClient = createPublicClient({
      chain: STABLE_CLUB_LOCAL_CHAIN,
      transport: http(STABLE_CLUB_LOCAL_RPC_URL),
    });

    await page.addInitScript(STABLE_CLUB_E2E_INJECT_WALLET_SCRIPT);
    await page.goto("/app/stable-club");

    await expect(
      page.getByRole("heading", { name: /Base Pools \+ Dashboard \+ Automation/i }),
    ).toBeVisible();
    await expect(page.getByText(deployments.executor).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Connect Wallet" }).click();
    await expect(page.getByText(E2E_USER)).toBeVisible();

    await page.getByRole("button", { name: "Register strategy permission" }).click();
    await expect(page.getByText(/Register permission confirmed/i)).toBeVisible({
      timeout: 60_000,
    });

    await page.getByLabel("Deposit USDC").fill("300");
    await page.getByLabel("Swap portion USDC").fill("0");
    await page.getByRole("button", { name: "Deposit & add liquidity" }).click();
    await expect(page.getByText(/Deposit & add liquidity confirmed/i)).toBeVisible({
      timeout: 60_000,
    });

    const lpAfterDeposit = await publicClient.readContract({
      address: deployments.testAdapter,
      abi: testPoolAdapterAbi,
      functionName: "balanceOf",
      args: [E2E_USER],
    });
    expect(lpAfterDeposit).toBeGreaterThan(BigInt(0));

    const executorUsdc = await publicClient.readContract({
      address: deployments.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [deployments.executor],
    });
    expect(executorUsdc).toBe(BigInt(0));

    await page.getByRole("button", { name: /Remove .* liquidity/i }).click();
    await expect(page.getByText(/Remove liquidity confirmed/i)).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole("button", { name: "Deposit & add liquidity" }).click();
    await expect(page.getByText(/Deposit & add liquidity confirmed/i)).toBeVisible({
      timeout: 60_000,
    });

    const lpBeforeWithdraw = await publicClient.readContract({
      address: deployments.testAdapter,
      abi: testPoolAdapterAbi,
      functionName: "balanceOf",
      args: [E2E_USER],
    });
    expect(lpBeforeWithdraw).toBeGreaterThan(BigInt(0));

    await page.getByRole("button", { name: "Withdraw all" }).click();
    await expect(page.getByText(/Withdraw all confirmed/i)).toBeVisible({
      timeout: 60_000,
    });

    expect(
      await publicClient.readContract({
        address: deployments.testAdapter,
        abi: testPoolAdapterAbi,
        functionName: "balanceOf",
        args: [E2E_USER],
      }),
    ).toBe(BigInt(0));

    await page.getByRole("button", { name: "Deposit & add liquidity" }).click();
    await expect(page.getByText(/Deposit & add liquidity confirmed/i)).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole("button", { name: "Pause automation" }).click();
    await expect(page.getByText(/Pause automation confirmed/i)).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole("button", { name: "Revoke permission (direct)" }).click();
    await expect(page.getByText(/Revoke permission confirmed/i)).toBeVisible({
      timeout: 60_000,
    });

    const lpBeforeEmergency = await publicClient.readContract({
      address: deployments.testAdapter,
      abi: testPoolAdapterAbi,
      functionName: "balanceOf",
      args: [E2E_USER],
    });
    expect(lpBeforeEmergency).toBeGreaterThan(BigInt(0));

    await page.getByRole("button", { name: "Emergency exit" }).click();
    await expect(page.getByText(/Emergency exit confirmed/i)).toBeVisible({
      timeout: 60_000,
    });

    expect(
      await publicClient.readContract({
        address: deployments.testAdapter,
        abi: testPoolAdapterAbi,
        functionName: "balanceOf",
        args: [E2E_USER],
      }),
    ).toBe(BigInt(0));

    const usdcBalance = await publicClient.readContract({
      address: deployments.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [E2E_USER],
    });
    expect(Number(formatUnits(usdcBalance, 6))).toBeGreaterThan(0);
  });
});
