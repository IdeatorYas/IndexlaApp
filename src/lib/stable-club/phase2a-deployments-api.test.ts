import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { BASE_PERMIT2 } from "@/lib/stable-club/verified-base-addresses";
import type { StableClubPhase2aDeployments } from "@/lib/stable-club/phase2a-deployments";
import {
  PHASE2A_BASE_UNAVAILABLE_MESSAGE,
  PHASE2A_LOCAL_UNAVAILABLE_MESSAGE,
  parseLocalPhase2aDeploymentsJson,
  resolvePhase2aDeploymentsApiResponse,
} from "@/lib/stable-club/phase2a-deployments-api";

const ADDR = "0x2222222222222222222222222222222222222222" as Address;
const MOCK_P2 = "0x1111111111111111111111111111111111111111" as Address;

function localFixture(
  overrides: Partial<StableClubPhase2aDeployments> = {},
): StableClubPhase2aDeployments {
  const adapter = {
    poolId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex,
    protocol: "mock",
    adapter: ADDR,
    tokenA: ADDR,
    tokenB: ADDR,
    factory: ADDR,
    npm: ADDR,
    router: ADDR,
  };
  return {
    chainId: 31337,
    network: "hardhat-local",
    isTestOnly: true,
    label: "test",
    deployedAt: "2026-01-01T00:00:00.000Z",
    deployer: ADDR,
    testUser: ADDR,
    feeRecipient: ADDR,
    permissionRegistry: ADDR,
    strategyRegistry: ADDR,
    feeRouter: ADDR,
    swapRouter: ADDR,
    clExecutor: ADDR,
    oracleGuard: ADDR,
    mevGuard: ADDR,
    safetyController: ADDR,
    permit2: MOCK_P2,
    canonicalBasePermit2: BASE_PERMIT2.address,
    usdc: ADDR,
    cbbtc: ADDR,
    weth: ADDR,
    poolIds: [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333333333333333333333333333",
      "0x4444444444444444444444444444444444444444444444444444444444444444",
      "0x5555555555555555555555555555555555555555555555555555555555555555",
    ],
    adapters: [adapter, adapter, adapter, adapter, adapter],
    routes: [],
    strategyKind: "0x6666666666666666666666666666666666666666666666666666666666666666",
    rpcUrl: "http://127.0.0.1:8545",
    ...overrides,
  };
}

describe("resolvePhase2aDeploymentsApiResponse", () => {
  it("production with null trusted manifest returns controlled unavailable and never loads local JSON", () => {
    const loadLocal = vi.fn(() => localFixture());
    const result = resolvePhase2aDeploymentsApiResponse({
      nodeEnv: "production",
      host: "app.indexla.tech",
      devFlagEnabled: true,
      getTrustedManifest: () => null,
      loadLocalDeployments: loadLocal,
    });

    expect(loadLocal).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      configured: false,
      message: PHASE2A_BASE_UNAVAILABLE_MESSAGE,
    });
  });

  it("dev missing local file returns fail-closed unavailable", () => {
    const result = resolvePhase2aDeploymentsApiResponse({
      nodeEnv: "development",
      host: "localhost:3456",
      devFlagEnabled: true,
      loadLocalDeployments: () => null,
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      configured: false,
      message: PHASE2A_LOCAL_UNAVAILABLE_MESSAGE,
    });
  });

  it("dev malformed local JSON parse fails closed", () => {
    expect(parseLocalPhase2aDeploymentsJson("{not-json")).toBeNull();
    expect(parseLocalPhase2aDeploymentsJson("{}")).toBeNull();
    expect(
      parseLocalPhase2aDeploymentsJson(
        JSON.stringify(localFixture({ chainId: 8453, network: "base", isTestOnly: false })),
      ),
    ).toBeNull();

    const result = resolvePhase2aDeploymentsApiResponse({
      nodeEnv: "development",
      host: "127.0.0.1:3456",
      devFlagEnabled: true,
      loadLocalDeployments: () => parseLocalPhase2aDeploymentsJson("{broken"),
    });
    expect(result.body).toEqual({
      configured: false,
      message: PHASE2A_LOCAL_UNAVAILABLE_MESSAGE,
    });
  });

  it("valid local Hardhat deployments are served only in non-production localhost+dev", () => {
    const deployments = localFixture();
    const result = resolvePhase2aDeploymentsApiResponse({
      nodeEnv: "development",
      host: "localhost:3456",
      devFlagEnabled: true,
      loadLocalDeployments: () => deployments,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      configured: true,
      deployments: {
        chainId: 31337,
        network: "hardhat-local",
        isTestOnly: true,
        clExecutor: ADDR,
      },
    });
    if ("deployments" in result.body && result.body.configured) {
      expect(result.body.deployments).not.toHaveProperty("deployer");
      expect(result.body.deployments).not.toHaveProperty("testUser");
    }
  });

  it("never serves local/test manifests in production even if loader returns them", () => {
    const loadLocal = vi.fn(() => localFixture());
    const result = resolvePhase2aDeploymentsApiResponse({
      nodeEnv: "production",
      host: "localhost",
      devFlagEnabled: true,
      getTrustedManifest: () => null,
      loadLocalDeployments: loadLocal,
    });
    expect(loadLocal).not.toHaveBeenCalled();
    expect(result.body).toMatchObject({ configured: false });
  });
});
