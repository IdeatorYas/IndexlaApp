import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  LOCAL_HARDHAT_CHAIN_ID,
  LOCAL_HARDHAT_NETWORK,
  assertChainEnvironmentMatch,
  assertLocalHardhatDeploymentIdentity,
  assertLocalMockPermit2Allowed,
} from "@/lib/stable-club/chain-isolation";
import { BASE_PERMIT2 } from "@/lib/stable-club/verified-base-addresses";
import { resolvePermit2Address } from "@/lib/stable-club/permit2";
import {
  isValidLocalDeployments,
  type StableClubLocalDeployments,
} from "@/lib/stable-club/deployments";
import {
  isValidPhase2aDeployments,
  type StableClubPhase2aDeployments,
} from "@/lib/stable-club/phase2a-deployments";

const MOCK_P2 = "0x1111111111111111111111111111111111111111" as Address;
const ADDR = "0x2222222222222222222222222222222222222222" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function localDeployments(
  overrides: Partial<StableClubLocalDeployments> = {},
): StableClubLocalDeployments {
  return {
    chainId: LOCAL_HARDHAT_CHAIN_ID,
    network: LOCAL_HARDHAT_NETWORK,
    isTestOnly: true,
    label: "test",
    deployedAt: "2026-01-01T00:00:00.000Z",
    deployer: ADDR,
    testUser: ADDR,
    feeRecipient: ADDR,
    permissionRegistry: ADDR,
    feeRouter: ADDR,
    executor: ADDR,
    testAdapter: ADDR,
    usdc: ADDR,
    weth: ADDR,
    poolId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    rpcUrl: "http://127.0.0.1:8545",
    ...overrides,
  };
}

function phase2aDeployments(
  overrides: Partial<StableClubPhase2aDeployments> = {},
): StableClubPhase2aDeployments {
  const adapter = {
    poolId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    protocol: "mock",
    adapter: ADDR,
    tokenA: ADDR,
    tokenB: ADDR,
    factory: ADDR,
    npm: ADDR,
    router: ADDR,
  };
  return {
    chainId: LOCAL_HARDHAT_CHAIN_ID,
    network: LOCAL_HARDHAT_NETWORK,
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

describe("SC-F02 chain isolation", () => {
  it("8453 accepts only canonical Permit2", () => {
    expect(resolvePermit2Address({ chainId: 8453 })).toBe(BASE_PERMIT2.address);
    expect(
      resolvePermit2Address({ chainId: 8453, permit2: BASE_PERMIT2.address }),
    ).toBe(BASE_PERMIT2.address);
  });

  it("8453 rejects non-canonical Permit2 even when marked localHardhat", () => {
    expect(() =>
      resolvePermit2Address({
        chainId: 8453,
        permit2: MOCK_P2,
        localHardhat: true,
      }),
    ).toThrow(/Non-canonical/);
    expect(() =>
      assertChainEnvironmentMatch({
        walletChainId: 8453,
        deploymentChainId: 8453,
        permit2: MOCK_P2,
      }),
    ).toThrow(/Non-canonical/);
  });

  it("local chain uses declared mock Permit2 only under the local identity gate", () => {
    expect(resolvePermit2Address({ chainId: 31337, permit2: MOCK_P2 })).toBe(MOCK_P2);
    expect(() => assertLocalMockPermit2Allowed({
      chainId: 31337,
      network: LOCAL_HARDHAT_NETWORK,
      permit2: MOCK_P2,
      isTestOnly: true,
    })).not.toThrow();
    expect(() =>
      assertLocalMockPermit2Allowed({
        chainId: 31337,
        network: LOCAL_HARDHAT_NETWORK,
        permit2: BASE_PERMIT2.address,
        isTestOnly: true,
      }),
    ).toThrow(/MockPermit2/);
  });

  it("rejects local deployment payloads that claim Base chainId 8453", () => {
    expect(() =>
      assertLocalHardhatDeploymentIdentity({
        chainId: 8453,
        network: LOCAL_HARDHAT_NETWORK,
        isTestOnly: true,
      }),
    ).toThrow(/8453/);
    expect(
      isValidLocalDeployments(
        localDeployments({ chainId: 8453, network: LOCAL_HARDHAT_NETWORK }),
      ),
    ).toBe(false);
    expect(
      isValidPhase2aDeployments(
        phase2aDeployments({ chainId: 8453, network: LOCAL_HARDHAT_NETWORK }),
      ),
    ).toBe(false);
  });

  it("rejects chain/payload mismatch that would block approval and deposit", () => {
    expect(() =>
      assertChainEnvironmentMatch({
        walletChainId: 8453,
        deploymentChainId: 31337,
        network: LOCAL_HARDHAT_NETWORK,
        permit2: MOCK_P2,
      }),
    ).toThrow(/Chain mismatch/);
    expect(() =>
      assertChainEnvironmentMatch({
        walletChainId: 8453,
        deploymentChainId: 8453,
        network: LOCAL_HARDHAT_NETWORK,
        permit2: MOCK_P2,
      }),
    ).toThrow(/Base wallet must not consume local Hardhat/);
  });

  it("accepts matched local wallet + local payload", () => {
    expect(() =>
      assertChainEnvironmentMatch({
        walletChainId: 31337,
        deploymentChainId: 31337,
        network: LOCAL_HARDHAT_NETWORK,
        permit2: MOCK_P2,
      }),
    ).not.toThrow();
    expect(isValidLocalDeployments(localDeployments())).toBe(true);
    expect(isValidPhase2aDeployments(phase2aDeployments())).toBe(true);
  });

  it("rejects zero-address required fields and unknown local identity", () => {
    expect(isValidLocalDeployments(localDeployments({ executor: ZERO }))).toBe(false);
    expect(
      isValidLocalDeployments(localDeployments({ network: "unknown-local" })),
    ).toBe(false);
    expect(isValidPhase2aDeployments(phase2aDeployments({ permit2: ZERO }))).toBe(false);
  });
});
