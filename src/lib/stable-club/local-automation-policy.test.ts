import { describe, expect, it } from "vitest";
import { type Address } from "viem";
import {
  LOCAL_AUTOMATION_BYPASS_DEFAULT,
  isExplicitLocalAutomationBypassAllowed,
  isLaunchAutomationEnabledForEnvironment,
} from "@/lib/stable-club/local-automation-policy";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";
import type { StableClubLocalDeployments } from "@/lib/stable-club/deployments";
import {
  validateHarvestEnvironment,
} from "@/lib/stable-club/harvest";
import {
  validateCompoundEnvironment,
} from "@/lib/stable-club/compound";
import {
  validateRebalanceEnvironment,
} from "@/lib/stable-club/rebalance";

const USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

function localDeployments(
  overrides: Partial<StableClubLocalDeployments> = {},
): StableClubLocalDeployments {
  return {
    chainId: 31337,
    network: "hardhat-local",
    isTestOnly: true,
    label: "test",
    deployedAt: new Date().toISOString(),
    deployer: USER,
    testUser: USER,
    feeRecipient: USER,
    permissionRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    feeRouter: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    executor: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    automationExecutor: "0x1234567890123456789012345678901234567890",
    safetyController: "0x2345678901234567890123456789012345678901",
    testAdapter: "0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f",
    usdc: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
    weth: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
    poolId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    rpcUrl: "http://127.0.0.1:8545",
    ...overrides,
  };
}

describe("local automation bypass policy", () => {
  it("defaults bypass to false", () => {
    expect(LOCAL_AUTOMATION_BYPASS_DEFAULT).toBe(false);
    expect(isExplicitLocalAutomationBypassAllowed(localDeployments())).toBe(false);
    expect(isLaunchAutomationEnabledForEnvironment("harvest", localDeployments())).toBe(false);
  });

  it("allows bypass only with explicit flag on hardhat-local test deployments", () => {
    const optedIn = localDeployments({ localAutomationBypass: true });
    expect(isExplicitLocalAutomationBypassAllowed(optedIn)).toBe(true);
    expect(isLaunchAutomationEnabledForEnvironment("compound", optedIn)).toBe(true);
  });

  it("rejects bypass on production networks and Base mainnet chain id", () => {
    expect(
      isExplicitLocalAutomationBypassAllowed(
        localDeployments({ localAutomationBypass: true, network: "base" }),
      ),
    ).toBe(false);
    expect(
      isExplicitLocalAutomationBypassAllowed(
        localDeployments({ localAutomationBypass: true, network: "mainnet" }),
      ),
    ).toBe(false);
    expect(
      isExplicitLocalAutomationBypassAllowed(
        localDeployments({ localAutomationBypass: true, chainId: 8453 }),
      ),
    ).toBe(false);
  });

  it("hardhat-local without explicit opt-in keeps harvest/compound/rebalance disabled", () => {
    const d = localDeployments();
    expect(validateHarvestEnvironment(d, true)).toMatchObject({
      ok: false,
      code: "launch-harvest-disabled",
    });
    expect(validateCompoundEnvironment(d, true)).toMatchObject({
      ok: false,
      code: "launch-compound-disabled",
    });
    expect(validateRebalanceEnvironment(d, true)).toMatchObject({
      ok: false,
      code: "launch-rebalance-disabled",
    });
  });

  it("explicit opt-in enables local automation while launch flags remain false", () => {
    expect(PRIVATE_BETA_LAUNCH_PARAMS.automation.harvestEnabled).toBe(false);
    const d = localDeployments({ localAutomationBypass: true });
    expect(validateHarvestEnvironment(d, true)).toEqual({ ok: true });
    expect(validateCompoundEnvironment(d, true)).toEqual({ ok: true });
    expect(validateRebalanceEnvironment(d, true)).toEqual({ ok: true });
  });
});
