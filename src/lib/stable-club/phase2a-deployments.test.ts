import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { BASE_PERMIT2 } from "@/lib/stable-club/verified-base-addresses";
import {
  earliestDiscoveryStartBlock,
  toPublicPhase2aDeploymentsPayload,
  type StableClubPhase2aDeployments,
} from "@/lib/stable-club/phase2a-deployments";

const ADDR = "0x2222222222222222222222222222222222222222" as Address;
const MOCK_P2 = "0x1111111111111111111111111111111111111111" as Address;

function phase2aFixture(
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
    ...overrides,
  };
}

describe("SC-F04 — discoveryStartBlock persistence", () => {
  it("selects the earliest confirmed deployment receipt block and rejects invalid inputs", () => {
    expect(earliestDiscoveryStartBlock([42, 7, 19])).toBe(7);
    expect(earliestDiscoveryStartBlock([BigInt(100), "88"])).toBe(88);
    expect(() => earliestDiscoveryStartBlock([])).toThrow(
      /requires at least one deployment receipt block/,
    );
    expect(() => earliestDiscoveryStartBlock([0])).toThrow(/Invalid deployment receipt block/);
    expect(() => earliestDiscoveryStartBlock([-1])).toThrow(/Invalid deployment receipt block/);
  });

  it("survives public payload conversion from parsed deployment JSON", () => {
    const parsed = phase2aFixture({ discoveryStartBlock: 17 }) as StableClubPhase2aDeployments;
    const publicPayload = toPublicPhase2aDeploymentsPayload(parsed);
    expect(publicPayload.discoveryStartBlock).toBe(17);
    expect(publicPayload.discoveryStartBlock).not.toBe(1);
    expect(publicPayload.discoveryStartBlock).not.toBe(0);

    const without = toPublicPhase2aDeploymentsPayload(phase2aFixture());
    expect(without.discoveryStartBlock).toBeUndefined();
  });
});
