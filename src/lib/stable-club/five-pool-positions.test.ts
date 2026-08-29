import { describe, expect, it } from "vitest";
import { ZERO_ADDRESS } from "@/lib/stable-club/nft-approval";
import {
  applyExitSlippageMin,
  assertWalletOwnsPosition,
  buildDirectNpmExitPlan,
  buildExitAllLegs,
  buildFullExitLegParams,
  buildSkippedExitLeg,
  collectTokenIdsFromTransferLogs,
  mapAmountsToLegOrder,
  matchMintTokenId,
  resolveNftContract,
  toFivePoolPosition,
  type FivePoolPosition,
  type StrategyLegBinding,
} from "@/lib/stable-club/five-pool-positions";
import type { Phase2aAdapterDeployment } from "@/lib/stable-club/phase2a-deployments";

const USDC = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const CBBTC = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as const;
const USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const ADAPTER = "0x70e0bA845a1A0F2DA3359C97E0285013525FFC49" as const;

const adapterMeta: Phase2aAdapterDeployment = {
  poolId: "0xb51b99144079a80e7d705d0dbef80a3e5e0b55eba8199486dc8d3770c3c14c11",
  protocol: "aerodrome-slipstream",
  adapter: ADAPTER,
  tokenA: USDC,
  tokenB: CBBTC,
  factory: USER,
  npm: USER,
  router: USER,
};

const leg: StrategyLegBinding = {
  poolId: adapterMeta.poolId,
  allocationBps: BigInt(2000),
  adapter: ADAPTER,
  tokenA: USDC,
  tokenB: CBBTC,
  legPermissionId: "0x1111111111111111111111111111111111111111111111111111111111111111",
  maxLegPerTx: BigInt(0),
  maxLegPerDay: BigInt(0),
};

function samplePosition(legIndex: number): FivePoolPosition {
  return toFivePoolPosition({
    legIndex,
    leg: { ...leg, adapter: ADAPTER },
    adapterMeta,
    network: "hardhat-local",
    chainId: 8453,
    tokenId: BigInt(1),
    owner: USER,
    liquidity: BigInt(1000),
    amount0: BigInt(100),
    amount1: BigInt(200),
    adapterApproved: false,
  });
}

describe("five-pool-positions", () => {
  it("resolves local NFT contract to the mock adapter", () => {
    expect(resolveNftContract(adapterMeta, "hardhat-local")).toBe(ADAPTER);
  });

  it("applies exit slippage with floor of 1", () => {
    expect(applyExitSlippageMin(BigInt(10_000), BigInt(100))).toBe(BigInt(9900));
    expect(applyExitSlippageMin(BigInt(0), BigInt(100))).toBe(BigInt(1));
  });

  it("maps token0/1 amounts into leg A/B order", () => {
    const sorted =
      USDC.toLowerCase() < CBBTC.toLowerCase()
        ? mapAmountsToLegOrder({
            tokenA: USDC,
            tokenB: CBBTC,
            token0: USDC,
            token1: CBBTC,
            amount0: BigInt(11),
            amount1: BigInt(22),
          })
        : mapAmountsToLegOrder({
            tokenA: USDC,
            tokenB: CBBTC,
            token0: CBBTC,
            token1: USDC,
            amount0: BigInt(22),
            amount1: BigInt(11),
          });
    expect(sorted.amountA + sorted.amountB).toBe(BigInt(33));
  });

  it("builds exitAll with skips for missing legs", () => {
    const map = new Map<number, FivePoolPosition>([
      [0, samplePosition(0)],
      [2, samplePosition(2)],
    ]);
    const legs = buildExitAllLegs(map, BigInt(100));
    expect(legs).toHaveLength(5);
    expect(legs[0]!.adapter).toBe(ADAPTER);
    expect(legs[0]!.fullExit).toBe(true);
    expect(legs[1]!.adapter).toBe(ZERO_ADDRESS);
    expect(legs[2]!.fullExit).toBe(true);
    expect(buildSkippedExitLeg(4).fullExit).toBe(true);
  });

  it("buildFullExitLegParams zeroes liquidity and sets mins", () => {
    const legParams = buildFullExitLegParams({
      legIndex: 1,
      adapter: ADAPTER,
      tokenA: USDC,
      tokenB: CBBTC,
      positionTokenId: BigInt(9),
      amountA: BigInt(1000),
      amountB: BigInt(2000),
      slippageBps: BigInt(100),
    });
    expect(legParams.liquidity).toBe(BigInt(0));
    expect(legParams.fullExit).toBe(true);
    expect(legParams.amountAMin).toBe(BigInt(990));
    expect(legParams.amountBMin).toBe(BigInt(1980));
  });

  it("rejects ownership mismatch", () => {
    expect(() =>
      assertWalletOwnsPosition(USER, "0x0000000000000000000000000000000000000001", BigInt(1)),
    ).toThrow(/Ownership mismatch/);
  });

  it("matches mint tokenIds from newest candidate", async () => {
    const id = await matchMintTokenId({
      candidates: [BigInt(1), BigInt(2)],
      user: USER,
      expectedTokenA: USDC,
      expectedTokenB: CBBTC,
      readOwner: async (tokenId) => (tokenId === BigInt(2) ? USER : ZERO_ADDRESS),
      readTokens: async () =>
        USDC.toLowerCase() < CBBTC.toLowerCase()
          ? ([USDC, CBBTC] as const)
          : ([CBBTC, USDC] as const),
      readAmounts: async () => [BigInt(1), BigInt(1)] as const,
    });
    expect(id).toBe(BigInt(2));
  });

  it("collects tokenIds from Transfer logs", () => {
    expect(
      collectTokenIdsFromTransferLogs([
        { args: { tokenId: BigInt(3) } },
        { args: { tokenId: BigInt(7) } },
      ]),
    ).toEqual([BigInt(3), BigInt(7)]);
  });

  it("builds local-mock direct exit plan without NPM calldata", () => {
    const plan = buildDirectNpmExitPlan({
      network: "hardhat-local",
      position: samplePosition(0),
      liquidity: BigInt(10),
      deadlineSec: BigInt(99),
    });
    expect(plan.mode).toBe("local-mock-adapter");
    expect(plan.decreaseLiquidityCalldata).toBeNull();
    expect(plan.disclaimer).toMatch(/not risk-free/i);
  });

  it("builds Base NPM direct exit calldata", () => {
    const pos = samplePosition(0);
    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: {
        ...pos,
        nftContract: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
        npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
      },
      liquidity: BigInt(50),
      deadlineSec: BigInt(1_700_000_000),
    });
    expect(plan.mode).toBe("npm-owner");
    expect(plan.decreaseLiquidityCalldata).toMatch(/^0x/);
    expect(plan.collectCalldata).toMatch(/^0x/);
    expect(plan.burnCalldata).toMatch(/^0x/);
  });
});
