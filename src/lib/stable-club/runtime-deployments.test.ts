import { describe, expect, it } from "vitest";
import { type Address } from "viem";
import {
  buildPublicPayloadFromTrustedFile,
  hydrateLocalDeploymentsFromApi,
  mergeServerAutomationDevBypass,
  parseClientLocalDeployments,
} from "@/lib/stable-club/runtime-deployments";
import { validateHarvestEnvironment } from "@/lib/stable-club/harvest";
import type { StableClubLocalDeployments } from "@/lib/stable-club/deployments";

const USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

function trustedFile(overrides: Partial<StableClubLocalDeployments> = {}): StableClubLocalDeployments {
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

describe("runtime deployment trust boundaries", () => {
  it("strips localAutomationBypass from trusted file public payload", () => {
    const payload = buildPublicPayloadFromTrustedFile(
      trustedFile({ localAutomationBypass: true }),
    );
    expect("localAutomationBypass" in payload).toBe(false);
  });

  it("rejects client-supplied isTestOnly=false and Base chain smuggling", () => {
    expect(
      parseClientLocalDeployments({
        ...trustedFile(),
        isTestOnly: false,
        chainId: 8453,
        network: "base",
      }),
    ).toBeNull();
  });

  it("rejects client-supplied localAutomationBypass flag", () => {
    expect(
      parseClientLocalDeployments({
        ...trustedFile(),
        localAutomationBypass: true,
      }),
    ).toBeNull();
  });

  it("hydrates bypass only from server attestation, not client JSON", () => {
    const publicPayload = buildPublicPayloadFromTrustedFile(trustedFile());
    const withoutServer = hydrateLocalDeploymentsFromApi({
      configured: true,
      deployments: publicPayload,
    });
    expect(withoutServer?.localAutomationBypass).toBeUndefined();
    expect(validateHarvestEnvironment(withoutServer, true)).toMatchObject({
      ok: false,
      code: "launch-harvest-disabled",
    });

    const withServer = mergeServerAutomationDevBypass(publicPayload, true);
    expect(validateHarvestEnvironment(withServer, true)).toEqual({ ok: true });
  });

  it("rejects production bypass even when client forges server attestation on Base identity", () => {
    const forged = hydrateLocalDeploymentsFromApi({
      configured: true,
      automationDevBypass: true,
      deployments: {
        ...trustedFile(),
        chainId: 8453,
        network: "base",
        isTestOnly: false,
      },
    });
    expect(forged).toBeNull();
  });
});
