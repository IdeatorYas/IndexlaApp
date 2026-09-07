import { decodeFunctionData, getAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { ZERO_ADDRESS } from "@/lib/stable-club/nft-approval";
import {
  applyExitSlippageMin,
  applyNpmExitSlippageMin,
  assertWalletOwnsPosition,
  buildDirectNpmExitPlan,
  buildExitAllLegs,
  buildFullExitLegParams,
  buildPositionDiscoveryBlockRanges,
  buildSkippedExitLeg,
  collectOwnedNftTokenIds,
  collectTokenIdsFromTransferLogs,
  exactPoolBindingExpectations,
  interpretLiveExitAmounts,
  isFullUsdcWithdrawPercent,
  LOCAL_POSITION_DISCOVERY_FROM_BLOCK,
  mapAmountsToLegOrder,
  mapLegMinsToToken01,
  matchExactPoolMintTokenId,
  matchMintTokenId,
  positionNftClaimKey,
  POSITION_DISCOVERY_LOG_CHUNK_SIZE,
  resolveNftContract,
  resolvePositionDiscoveryFromBlock,
  toFivePoolPosition,
  uniswapV3FeeFromCatalogueBps,
  withDiscoveryTimeout,
  type FivePoolPosition,
  type StrategyLegBinding,
} from "@/lib/stable-club/five-pool-positions";
import {
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  USDC_CBBTC_AERO_CL100_POOL,
  USDC_CBBTC_UNI_005_POOL,
} from "@/lib/stable-club/official-pools";
import type { Phase2aAdapterDeployment } from "@/lib/stable-club/phase2a-deployments";

const USDC = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const CBBTC = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as const;
const USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const ADAPTER = "0x70e0bA845a1A0F2DA3359C97E0285013525FFC49" as const;
const NPM = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as const;

const npmDecreaseLiquidityAbi = [
  {
    type: "function",
    name: "decreaseLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "liquidity", type: "uint128" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
] as const;

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
    chainId: 31337,
    tokenId: BigInt(1),
    owner: USER,
    liquidity: BigInt(1000),
    amount0: BigInt(100),
    amount1: BigInt(200),
    adapterApproved: false,
  });
}

function baseNpmPosition(overrides: Partial<FivePoolPosition> = {}): FivePoolPosition {
  const base = samplePosition(0);
  return {
    ...base,
    nftContract: NPM,
      npm: NPM,
    ...overrides,
  };
}

function decodeDecreaseMins(data: `0x${string}`): { amount0Min: bigint; amount1Min: bigint } {
  const decoded = decodeFunctionData({
    abi: npmDecreaseLiquidityAbi,
    data,
  });
  const params = decoded.args[0] as {
    amount0Min: bigint;
    amount1Min: bigint;
  };
  return { amount0Min: params.amount0Min, amount1Min: params.amount1Min };
}

describe("five-pool-positions", () => {
  it("resolves local NFT contract to the mock adapter", () => {
    expect(resolveNftContract(adapterMeta, "hardhat-local")).toBe(ADAPTER);
  });

  it("applies exit slippage without forcing empty side to 1", () => {
    expect(applyExitSlippageMin(BigInt(10_000), BigInt(100))).toBe(BigInt(9900));
    expect(applyExitSlippageMin(BigInt(0), BigInt(100))).toBe(BigInt(0));
  });

  describe("REAUDIT-F01 — preserve zero min on empty exit side", () => {
    const slippageBps = BigInt(100);

    it("(positive, 0) → percentage min on A, zero min on B", () => {
      const legParams = buildFullExitLegParams({
        legIndex: 0,
        adapter: ADAPTER,
        tokenA: USDC,
        tokenB: CBBTC,
        positionTokenId: BigInt(1),
        amountA: BigInt(10_000),
        amountB: BigInt(0),
        slippageBps,
      });
      expect(legParams.amountAMin).toBe(BigInt(9900));
      expect(legParams.amountBMin).toBe(BigInt(0));
      expect(applyExitSlippageMin(BigInt(10_000), slippageBps)).toBe(BigInt(9900));
      expect(applyExitSlippageMin(BigInt(0), slippageBps)).toBe(BigInt(0));
    });

    it("(0, positive) → zero min on A, percentage min on B", () => {
      const legParams = buildFullExitLegParams({
        legIndex: 1,
        adapter: ADAPTER,
        tokenA: USDC,
        tokenB: CBBTC,
        positionTokenId: BigInt(2),
        amountA: BigInt(0),
        amountB: BigInt(20_000),
        slippageBps,
      });
      expect(legParams.amountAMin).toBe(BigInt(0));
      expect(legParams.amountBMin).toBe(BigInt(19_800));
    });

    it("both positive → percentage mins on both sides", () => {
      const legParams = buildFullExitLegParams({
        legIndex: 2,
        adapter: ADAPTER,
        tokenA: USDC,
        tokenB: CBBTC,
        positionTokenId: BigInt(3),
        amountA: BigInt(10_000),
        amountB: BigInt(20_000),
        slippageBps,
      });
      expect(legParams.amountAMin).toBe(BigInt(9900));
      expect(legParams.amountBMin).toBe(BigInt(19_800));
    });

    it("both zero fails closed before calldata", () => {
      expect(() =>
        buildFullExitLegParams({
          legIndex: 3,
          adapter: ADAPTER,
          tokenA: USDC,
          tokenB: CBBTC,
          positionTokenId: BigInt(4),
          amountA: BigInt(0),
          amountB: BigInt(0),
          slippageBps,
        }),
      ).toThrow(/both zero/i);

      const map = new Map<number, FivePoolPosition>([[0, samplePosition(0)]]);
      const liveAmountsByLeg = new Map<number, { amountA: bigint; amountB: bigint }>([
        [0, { amountA: BigInt(0), amountB: BigInt(0) }],
      ]);
      expect(() => buildExitAllLegs(map, liveAmountsByLeg, slippageBps)).toThrow(/both zero/i);
    });

    it("reversed token ordering maps one-sided mins to token0/token1", () => {
      const tokenA = CBBTC;
      const tokenB = USDC;
      expect(getAddress(tokenA).toLowerCase() > getAddress(tokenB).toLowerCase()).toBe(true);

      const amountA = BigInt(5_000);
      const amountB = BigInt(0);
      const amountAMin = applyExitSlippageMin(amountA, slippageBps);
      const amountBMin = applyExitSlippageMin(amountB, slippageBps);
      expect(amountAMin).toBe(BigInt(4950));
      expect(amountBMin).toBe(BigInt(0));

      const mapped = mapLegMinsToToken01({
        tokenA,
        tokenB,
        amountAMin,
        amountBMin,
      });
      // token0=USDC=B side (empty), token1=CBBTC=A side
      expect(mapped.amount0Min).toBe(BigInt(0));
      expect(mapped.amount1Min).toBe(BigInt(4950));

      const flipped = buildFullExitLegParams({
        legIndex: 0,
        adapter: ADAPTER,
        tokenA,
        tokenB,
        positionTokenId: BigInt(7),
        amountA: BigInt(0),
        amountB: BigInt(8_000),
        slippageBps,
      });
      const flipped01 = mapLegMinsToToken01({
        tokenA,
        tokenB,
        amountAMin: flipped.amountAMin,
        amountBMin: flipped.amountBMin,
      });
      expect(flipped.amountAMin).toBe(BigInt(0));
      expect(flipped.amountBMin).toBe(BigInt(7920));
      expect(flipped01.amount0Min).toBe(BigInt(7920));
      expect(flipped01.amount1Min).toBe(BigInt(0));
    });
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
    const liveAmountsByLeg = new Map<number, { amountA: bigint; amountB: bigint }>([
      [0, { amountA: map.get(0)!.amountA, amountB: map.get(0)!.amountB }],
      [2, { amountA: map.get(2)!.amountA, amountB: map.get(2)!.amountB }],
    ]);
    const legs = buildExitAllLegs(map, liveAmountsByLeg, BigInt(100));
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
      amountA: BigInt(100),
      amountB: BigInt(200),
      liquidity: BigInt(10),
      deadlineSec: BigInt(99),
    });
    expect(plan.mode).toBe("local-mock-adapter");
    expect(plan.decreaseLiquidityCalldata).toBeNull();
    expect(plan.disclaimer).toMatch(/not risk-free/i);
  });

  it("builds Base NPM direct exit calldata", () => {
    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: baseNpmPosition(),
      amountA: BigInt(100),
      amountB: BigInt(200),
      liquidity: BigInt(50),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps: BigInt(100),
    });
    expect(plan.mode).toBe("npm-owner");
    expect(plan.decreaseLiquidityCalldata).toMatch(/^0x/);
    expect(plan.collectCalldata).toMatch(/^0x/);
    expect(plan.burnCalldata).toMatch(/^0x/);
  });
});

describe("SC-F05 — live amounts for exit mins", () => {
  const slippageBps = BigInt(100);
  const [token0, token1] =
    getAddress(USDC).toLowerCase() < getAddress(CBBTC).toLowerCase()
      ? ([USDC, CBBTC] as const)
      : ([CBBTC, USDC] as const);

  it("cached amounts differ from live → encoded mins use live values", () => {
    const cachedA = BigInt(1_000);
    const cachedB = BigInt(2_000);
    const liveA = BigInt(50_000);
    const liveB = BigInt(70_000);
    const pos = baseNpmPosition({
      amountA: cachedA,
      amountB: cachedB,
      amount0: cachedA,
      amount1: cachedB,
    });

    const executorLeg = buildFullExitLegParams({
      legIndex: pos.legIndex,
      adapter: pos.adapter,
      tokenA: pos.tokenA,
      tokenB: pos.tokenB,
      positionTokenId: pos.positionTokenId,
      amountA: liveA,
      amountB: liveB,
      slippageBps,
    });
    expect(executorLeg.amountAMin).toBe(applyExitSlippageMin(liveA, slippageBps));
    expect(executorLeg.amountBMin).toBe(applyExitSlippageMin(liveB, slippageBps));
    expect(executorLeg.amountAMin).not.toBe(applyExitSlippageMin(cachedA, slippageBps));
    expect(executorLeg.amountBMin).not.toBe(applyExitSlippageMin(cachedB, slippageBps));
    // Cached 1000@1% → 990; live 50000@1% → 49500
    expect(executorLeg.amountAMin).toBe(BigInt(49_500));
    expect(executorLeg.amountBMin).toBe(BigInt(69_300));

    const liveMap = new Map([[0, { amountA: liveA, amountB: liveB }]]);
    const legs = buildExitAllLegs(new Map([[0, pos]]), liveMap, slippageBps);
    expect(legs[0]!.amountAMin).toBe(BigInt(49_500));
    expect(legs[0]!.amountBMin).toBe(BigInt(69_300));

    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: pos,
      amountA: liveA,
      amountB: liveB,
      liquidity: BigInt(50),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps,
    });
    const mins = decodeDecreaseMins(plan.decreaseLiquidityCalldata!);
    expect(mins.amount0Min).toBe(applyNpmExitSlippageMin(liveA, slippageBps));
    expect(mins.amount1Min).toBe(applyNpmExitSlippageMin(liveB, slippageBps));
    expect(mins.amount0Min).toBe(BigInt(49_500));
    expect(mins.amount1Min).toBe(BigInt(69_300));
  });

  it("tick/composition → token0-only yields valid one-sided mins", () => {
    const live = interpretLiveExitAmounts({
      tokenA: USDC,
      tokenB: CBBTC,
      token0,
      token1,
      amount0: token0 === USDC ? BigInt(12_000) : BigInt(0),
      amount1: token1 === USDC ? BigInt(12_000) : BigInt(0),
      liquidity: BigInt(10),
    });
    expect(live.amountA === BigInt(0) || live.amountB === BigInt(0)).toBe(true);
    expect(live.amountA + live.amountB).toBe(BigInt(12_000));

    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: baseNpmPosition({ amountA: BigInt(5_000), amountB: BigInt(5_000) }),
      amountA: live.amountA,
      amountB: live.amountB,
      liquidity: BigInt(10),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps,
    });
    const mins = decodeDecreaseMins(plan.decreaseLiquidityCalldata!);
    if (token0 === USDC) {
      expect(mins.amount0Min).toBe(BigInt(11_880));
      expect(mins.amount1Min).toBe(BigInt(0));
    } else {
      expect(mins.amount0Min).toBe(BigInt(0));
      expect(mins.amount1Min).toBe(BigInt(11_880));
    }
  });

  it("tick/composition → token1-only yields valid one-sided mins", () => {
    const live = interpretLiveExitAmounts({
      tokenA: USDC,
      tokenB: CBBTC,
      token0,
      token1,
      amount0: token0 === CBBTC ? BigInt(9_000) : BigInt(0),
      amount1: token1 === CBBTC ? BigInt(9_000) : BigInt(0),
      liquidity: BigInt(10),
    });
    expect(live.amountA === BigInt(0) || live.amountB === BigInt(0)).toBe(true);

    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: baseNpmPosition({ amountA: BigInt(1_000), amountB: BigInt(1_000) }),
      amountA: live.amountA,
      amountB: live.amountB,
      liquidity: BigInt(10),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps,
    });
    const mins = decodeDecreaseMins(plan.decreaseLiquidityCalldata!);
    if (token1 === CBBTC) {
      expect(mins.amount0Min).toBe(BigInt(0));
      expect(mins.amount1Min).toBe(BigInt(8_910));
    } else {
      expect(mins.amount0Min).toBe(BigInt(8_910));
      expect(mins.amount1Min).toBe(BigInt(0));
    }
  });

  it("live valuation failure blocks executor exit (no legs / no mins)", () => {
    const pos = samplePosition(0);
    const map = new Map([[0, pos]]);
    expect(() => buildExitAllLegs(map, new Map(), slippageBps)).toThrow(
      /Missing live exit amounts/,
    );
    expect(() =>
      interpretLiveExitAmounts({
        tokenA: USDC,
        tokenB: CBBTC,
        token0,
        token1,
        amount0: BigInt(0),
        amount1: BigInt(0),
        liquidity: BigInt(100),
      }),
    ).toThrow(/zero amounts with non-zero liquidity/);
  });

  it("live valuation failure blocks direct NPM exit (no calldata)", () => {
    expect(() =>
      interpretLiveExitAmounts({
        tokenA: USDC,
        tokenB: CBBTC,
        token0,
        token1,
        amount0: BigInt(0),
        amount1: BigInt(0),
        liquidity: BigInt(0),
      }),
    ).toThrow(/zero token amounts/);

    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: baseNpmPosition(),
      amountA: BigInt(0),
      amountB: BigInt(0),
      liquidity: BigInt(10),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps,
    });
    expect(plan.decreaseLiquidityCalldata).toBeNull();
    expect(plan.collectCalldata).toBeNull();
    expect(plan.burnCalldata).toBeNull();
  });

  it("malformed / wrong-position response fails closed", () => {
    expect(() =>
      interpretLiveExitAmounts({
        tokenA: USDC,
        tokenB: CBBTC,
        token0: "0x00000000000000000000000000000000000000Ab" as Address,
        token1: CBBTC,
        amount0: BigInt(1),
        amount1: BigInt(2),
        liquidity: BigInt(1),
      }),
    ).toThrow(/token pair does not match/);

    expect(() =>
      interpretLiveExitAmounts({
        tokenA: USDC,
        tokenB: CBBTC,
        token0,
        token1,
        amount0: BigInt(-1),
        amount1: BigInt(2),
        liquidity: BigInt(1),
      }),
    ).toThrow(/malformed/);
  });

  it("failure paths produce no approval/tx inputs (no calldata / no exit legs)", () => {
    // Hook orders: readLiveExitAmountsForPosition → then approve → then writeContract.
    // Lib contract: failed/missing live amounts never yield executable exit calldata.
    expect(() =>
      interpretLiveExitAmounts({
        tokenA: USDC,
        tokenB: CBBTC,
        token0,
        token1,
        amount0: BigInt(0),
        amount1: BigInt(0),
        liquidity: BigInt(5),
      }),
    ).toThrow();

    expect(() =>
      buildExitAllLegs(new Map([[0, samplePosition(0)]]), new Map(), slippageBps),
    ).toThrow(/Missing live/);

    const closed = buildDirectNpmExitPlan({
      network: "base",
      position: baseNpmPosition({ amountA: BigInt(99), amountB: BigInt(99) }),
      amountA: BigInt(0),
      amountB: BigInt(0),
      liquidity: BigInt(5),
      deadlineSec: BigInt(1),
      slippageBps,
    });
    expect(closed.decreaseLiquidityCalldata).toBeNull();
    expect(closed.collectCalldata).toBeNull();
    expect(closed.burnCalldata).toBeNull();
  });

  it("existing token-order reversal remains correct with live amounts", () => {
    const tokenA = CBBTC;
    const tokenB = USDC;
    const liveA = BigInt(5_000);
    const liveB = BigInt(8_000);
    expect(getAddress(tokenA).toLowerCase() > getAddress(tokenB).toLowerCase()).toBe(true);

    const mapped = mapLegMinsToToken01({
      tokenA,
      tokenB,
      amountAMin: applyNpmExitSlippageMin(liveA, BigInt(200)),
      amountBMin: applyNpmExitSlippageMin(liveB, BigInt(200)),
    });
    expect(mapped.amount0Min).toBe(applyNpmExitSlippageMin(liveB, BigInt(200)));
    expect(mapped.amount1Min).toBe(applyNpmExitSlippageMin(liveA, BigInt(200)));

    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: baseNpmPosition({
        tokenA,
        tokenB,
        amountA: BigInt(1),
        amountB: BigInt(1),
        amount0: liveB,
        amount1: liveA,
      }),
      amountA: liveA,
      amountB: liveB,
      liquidity: BigInt(10),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps: BigInt(200),
    });
    const mins = decodeDecreaseMins(plan.decreaseLiquidityCalldata!);
    expect(mins.amount0Min).toBe(BigInt(7840));
    expect(mins.amount1Min).toBe(BigInt(4900));
  });
});

describe("SC-F06 — slippage-protected direct NPM exit", () => {
  it("two-sided position produces percentage-based token0/token1 minimums", () => {
    const amountA = BigInt(10_000);
    const amountB = BigInt(20_000);
    const slippageBps = BigInt(100);
    const pos = baseNpmPosition({ amountA, amountB, amount0: amountA, amount1: amountB });
    expect(getAddress(USDC).toLowerCase() < getAddress(CBBTC).toLowerCase()).toBe(true);

    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: pos,
      amountA,
      amountB,
      liquidity: BigInt(50),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps,
    });
    expect(plan.decreaseLiquidityCalldata).toBeTruthy();
    const mins = decodeDecreaseMins(plan.decreaseLiquidityCalldata!);
    expect(mins.amount0Min).toBe(applyNpmExitSlippageMin(amountA, slippageBps));
    expect(mins.amount1Min).toBe(applyNpmExitSlippageMin(amountB, slippageBps));
    expect(mins.amount0Min).toBe(BigInt(9900));
    expect(mins.amount1Min).toBe(BigInt(19800));
  });

  it("reversed token ordering maps minimums correctly", () => {
    const tokenA = CBBTC;
    const tokenB = USDC;
    const amountA = BigInt(5_000);
    const amountB = BigInt(8_000);
    const slippageBps = BigInt(200);
    expect(getAddress(tokenA).toLowerCase() > getAddress(tokenB).toLowerCase()).toBe(true);

    const mapped = mapLegMinsToToken01({
      tokenA,
      tokenB,
      amountAMin: applyNpmExitSlippageMin(amountA, slippageBps),
      amountBMin: applyNpmExitSlippageMin(amountB, slippageBps),
    });
    expect(mapped.amount0Min).toBe(applyNpmExitSlippageMin(amountB, slippageBps));
    expect(mapped.amount1Min).toBe(applyNpmExitSlippageMin(amountA, slippageBps));

    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: baseNpmPosition({
        tokenA,
        tokenB,
        amountA,
        amountB,
        amount0: amountB,
        amount1: amountA,
      }),
      amountA,
      amountB,
      liquidity: BigInt(10),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps,
    });
    const mins = decodeDecreaseMins(plan.decreaseLiquidityCalldata!);
    expect(mins.amount0Min).toBe(mapped.amount0Min);
    expect(mins.amount1Min).toBe(mapped.amount1Min);
    expect(mins.amount0Min).toBe(BigInt(7840));
    expect(mins.amount1Min).toBe(BigInt(4900));
  });

  it("one-sided token0 position produces non-zero amount0Min and zero amount1Min", () => {
    const amountA = BigInt(10_000);
    const amountB = BigInt(0);
    const slippageBps = BigInt(100);
    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: baseNpmPosition({
        amountA,
        amountB,
        amount0: amountA,
        amount1: BigInt(0),
      }),
      amountA,
      amountB,
      liquidity: BigInt(10),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps,
    });
    const mins = decodeDecreaseMins(plan.decreaseLiquidityCalldata!);
    expect(mins.amount0Min).toBe(BigInt(9900));
    expect(mins.amount1Min).toBe(BigInt(0));
  });

  it("one-sided token1 position produces zero amount0Min and non-zero amount1Min", () => {
    const amountA = BigInt(0);
    const amountB = BigInt(10_000);
    const slippageBps = BigInt(100);
    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: baseNpmPosition({
        amountA,
        amountB,
        amount0: BigInt(0),
        amount1: amountB,
      }),
      amountA,
      amountB,
      liquidity: BigInt(10),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps,
    });
    const mins = decodeDecreaseMins(plan.decreaseLiquidityCalldata!);
    expect(mins.amount0Min).toBe(BigInt(0));
    expect(mins.amount1Min).toBe(BigInt(9900));
  });

  it("both expected amounts zero fails closed", () => {
    const plan = buildDirectNpmExitPlan({
      network: "base",
      position: baseNpmPosition({
        amountA: BigInt(0),
        amountB: BigInt(0),
        amount0: BigInt(0),
        amount1: BigInt(0),
      }),
      amountA: BigInt(0),
      amountB: BigInt(0),
      liquidity: BigInt(10),
      deadlineSec: BigInt(1_700_000_000),
      slippageBps: BigInt(100),
    });
    expect(plan.decreaseLiquidityCalldata).toBeNull();
    expect(plan.collectCalldata).toBeNull();
    expect(plan.burnCalldata).toBeNull();
    expect(plan.steps.join(" ")).toMatch(/unavailable/i);
  });

  it("no generated decreaseLiquidity calldata contains the old fixed 1/1 minimums", () => {
    const cases: Array<{ position: FivePoolPosition; amountA: bigint; amountB: bigint }> = [
      {
        position: baseNpmPosition({ amountA: BigInt(10_000), amountB: BigInt(20_000) }),
        amountA: BigInt(10_000),
        amountB: BigInt(20_000),
      },
      {
        position: baseNpmPosition({ amountA: BigInt(10_000), amountB: BigInt(0) }),
        amountA: BigInt(10_000),
        amountB: BigInt(0),
      },
      {
        position: baseNpmPosition({ amountA: BigInt(0), amountB: BigInt(10_000) }),
        amountA: BigInt(0),
        amountB: BigInt(10_000),
      },
      {
        position: baseNpmPosition({
          tokenA: CBBTC,
          tokenB: USDC,
          amountA: BigInt(1_000),
          amountB: BigInt(2_000),
        }),
        amountA: BigInt(1_000),
        amountB: BigInt(2_000),
      },
    ];
    for (const { position, amountA, amountB } of cases) {
      const plan = buildDirectNpmExitPlan({
        network: "base",
        position,
        amountA,
        amountB,
        liquidity: BigInt(50),
        deadlineSec: BigInt(1_700_000_000),
        slippageBps: BigInt(100),
      });
      expect(plan.decreaseLiquidityCalldata).toBeTruthy();
      const mins = decodeDecreaseMins(plan.decreaseLiquidityCalldata!);
      expect(mins.amount0Min === BigInt(1) && mins.amount1Min === BigInt(1)).toBe(false);
    }
  });
});

describe("SC-F04 — bounded discovery + exact NFT/pool binding", () => {
  const uniPool = OFFICIAL_STABLE_CLUB_BASE_POOLS.find((p) => p.id === "USDC-cbBTC-UNI-005")!;
  const aeroPool = OFFICIAL_STABLE_CLUB_BASE_POOLS.find((p) => p.id === "USDC-cbBTC-AERO-CL100")!;
  const BASE_USDC = uniPool.tokenA.address;
  const BASE_CBBTC = uniPool.tokenB.address;
  const [sorted0, sorted1] =
    BASE_USDC.toLowerCase() < BASE_CBBTC.toLowerCase()
      ? ([BASE_USDC, BASE_CBBTC] as const)
      : ([BASE_CBBTC, BASE_USDC] as const);
  const OTHER = "0x00000000000000000000000000000000000000Ab" as Address;

  it("non-local discovery never uses fromBlock 0 when start block is trusted", () => {
    const from = resolvePositionDiscoveryFromBlock({
      network: "base",
      chainId: 8453,
      discoveryStartBlock: 12_345_678,
    });
    expect(from).toBe(BigInt(12_345_678));
    expect(from).not.toBe(BigInt(0));
  });

  it("missing trusted non-local start block fails closed", () => {
    expect(() =>
      resolvePositionDiscoveryFromBlock({
        network: "base",
        chainId: 8453,
        discoveryStartBlock: undefined,
      }),
    ).toThrow(/Missing trusted discoveryStartBlock/);
    expect(() =>
      resolvePositionDiscoveryFromBlock({
        network: "base",
        chainId: 8453,
        discoveryStartBlock: 0,
      }),
    ).toThrow(/greater than 0/);
  });

  it("local 31337 defaults to bounded start block 1 (never 0)", () => {
    expect(
      resolvePositionDiscoveryFromBlock({
        network: "hardhat-local",
        chainId: 31337,
      }),
    ).toBe(LOCAL_POSITION_DISCOVERY_FROM_BLOCK);
    expect(LOCAL_POSITION_DISCOVERY_FROM_BLOCK).toBe(BigInt(1));
  });

  it("log queries are split into bounded ranges", () => {
    const ranges = buildPositionDiscoveryBlockRanges(BigInt(100), BigInt(5_100));
    expect(POSITION_DISCOVERY_LOG_CHUNK_SIZE).toBe(BigInt(2_000));
    expect(ranges).toEqual([
      { fromBlock: BigInt(100), toBlock: BigInt(2_099) },
      { fromBlock: BigInt(2_100), toBlock: BigInt(4_099) },
      { fromBlock: BigInt(4_100), toBlock: BigInt(5_100) },
    ]);
    expect(() => buildPositionDiscoveryBlockRanges(BigInt(0), BigInt(10))).toThrow(
      /fromBlock must be greater than 0/,
    );
  });

  it("collectOwnedNftTokenIds enumerates balanceOf indices", async () => {
    const ids = await collectOwnedNftTokenIds({
      owner: USER,
      balanceOf: async () => BigInt(3),
      tokenOfOwnerByIndex: async (_o, i) => BigInt(100) + i,
    });
    expect(ids).toEqual([BigInt(100), BigInt(101), BigInt(102)]);
  });

  it("withDiscoveryTimeout resolves before deadline", async () => {
    await expect(
      withDiscoveryTimeout(Promise.resolve(42), 1_000, "fast"),
    ).resolves.toBe(42);
  });

  it("withDiscoveryTimeout rejects after deadline", async () => {
    await expect(
      withDiscoveryTimeout(
        new Promise(() => undefined),
        20,
        "slow-leg",
      ),
    ).rejects.toThrow(/slow-leg timed out/);
  });

  it("isFullUsdcWithdrawPercent only accepts 100", () => {
    expect(isFullUsdcWithdrawPercent(100)).toBe(true);
    expect(isFullUsdcWithdrawPercent(99)).toBe(false);
    expect(isFullUsdcWithdrawPercent(50)).toBe(false);
  });

  it("correct Uni tokenId binds to its exact pool", async () => {
    const expectedFee = uniswapV3FeeFromCatalogueBps(5);
    const id = await matchExactPoolMintTokenId({
      candidates: [BigInt(1), BigInt(9)],
      user: USER,
      expectedTokenA: BASE_USDC,
      expectedTokenB: BASE_CBBTC,
      protocol: "uniswap-v3",
      expectedPool: USDC_CBBTC_UNI_005_POOL,
      factory: uniPool.infrastructure.factory,
      nftContract: NPM,
      expectedFee,
      claimedTokenIds: new Set(),
      readOwner: async () => USER,
      readNpmPosition: async (tokenId) => ({
        token0: sorted0,
        token1: sorted1,
        fee: expectedFee,
        liquidity: tokenId === BigInt(9) ? BigInt(10) : BigInt(1),
      }),
      resolveFactoryPool: async ({ fee }) => {
        expect(fee).toBe(expectedFee);
        return USDC_CBBTC_UNI_005_POOL;
      },
      readAmounts: async () => [BigInt(1), BigInt(1)] as const,
    });
    expect(id).toBe(BigInt(9));
  });

  it("same Uni token pair with wrong fee is rejected", async () => {
    const id = await matchExactPoolMintTokenId({
      candidates: [BigInt(3)],
      user: USER,
      expectedTokenA: BASE_USDC,
      expectedTokenB: BASE_CBBTC,
      protocol: "uniswap-v3",
      expectedPool: USDC_CBBTC_UNI_005_POOL,
      factory: uniPool.infrastructure.factory,
      nftContract: NPM,
      expectedFee: 500,
      claimedTokenIds: new Set(),
      readOwner: async () => USER,
      readNpmPosition: async () => ({
        token0: sorted0,
        token1: sorted1,
        fee: 3000,
        liquidity: BigInt(10),
      }),
      resolveFactoryPool: async () => USDC_CBBTC_UNI_005_POOL,
      readAmounts: async () => [BigInt(1), BigInt(1)] as const,
    });
    expect(id).toBeNull();
  });

  it("correct Aero tokenId binds using tickSpacing/factory pool resolution", async () => {
    const id = await matchExactPoolMintTokenId({
      candidates: [BigInt(4)],
      user: USER,
      expectedTokenA: BASE_USDC,
      expectedTokenB: BASE_CBBTC,
      protocol: "aerodrome-slipstream",
      expectedPool: USDC_CBBTC_AERO_CL100_POOL,
      factory: aeroPool.infrastructure.factory,
      nftContract: NPM,
      expectedTickSpacing: 100,
      claimedTokenIds: new Set(),
      readOwner: async () => USER,
      readNpmPosition: async () => ({
        token0: sorted0,
        token1: sorted1,
        tickSpacing: 100,
        liquidity: BigInt(5),
      }),
      resolveFactoryPool: async ({ tickSpacing }) => {
        expect(tickSpacing).toBe(100);
        return USDC_CBBTC_AERO_CL100_POOL;
      },
      readAmounts: async () => [BigInt(2), BigInt(2)] as const,
    });
    expect(id).toBe(BigInt(4));
  });

  it("same Aero pair with wrong tickSpacing/pool is rejected", async () => {
    const wrongSpacing = await matchExactPoolMintTokenId({
      candidates: [BigInt(5)],
      user: USER,
      expectedTokenA: BASE_USDC,
      expectedTokenB: BASE_CBBTC,
      protocol: "aerodrome-slipstream",
      expectedPool: USDC_CBBTC_AERO_CL100_POOL,
      factory: aeroPool.infrastructure.factory,
      nftContract: NPM,
      expectedTickSpacing: 100,
      claimedTokenIds: new Set(),
      readOwner: async () => USER,
      readNpmPosition: async () => ({
        token0: sorted0,
        token1: sorted1,
        tickSpacing: 10,
        liquidity: BigInt(5),
      }),
      resolveFactoryPool: async () => USDC_CBBTC_AERO_CL100_POOL,
      readAmounts: async () => [BigInt(2), BigInt(2)] as const,
    });
    expect(wrongSpacing).toBeNull();

    const wrongPool = await matchExactPoolMintTokenId({
      candidates: [BigInt(5)],
      user: USER,
      expectedTokenA: BASE_USDC,
      expectedTokenB: BASE_CBBTC,
      protocol: "aerodrome-slipstream",
      expectedPool: USDC_CBBTC_AERO_CL100_POOL,
      factory: aeroPool.infrastructure.factory,
      nftContract: NPM,
      expectedTickSpacing: 100,
      claimedTokenIds: new Set(),
      readOwner: async () => USER,
      readNpmPosition: async () => ({
        token0: sorted0,
        token1: sorted1,
        tickSpacing: 100,
        liquidity: BigInt(5),
      }),
      resolveFactoryPool: async () => "0x1111111111111111111111111111111111111111" as Address,
      readAmounts: async () => [BigInt(2), BigInt(2)] as const,
    });
    expect(wrongPool).toBeNull();
  });

  it("NFT owned by another address is rejected", async () => {
    const id = await matchExactPoolMintTokenId({
      candidates: [BigInt(6)],
      user: USER,
      expectedTokenA: BASE_USDC,
      expectedTokenB: BASE_CBBTC,
      protocol: "uniswap-v3",
      expectedPool: USDC_CBBTC_UNI_005_POOL,
      factory: uniPool.infrastructure.factory,
      nftContract: NPM,
      expectedFee: 500,
      claimedTokenIds: new Set(),
      readOwner: async () => OTHER,
      readNpmPosition: async () => ({
        token0: sorted0,
        token1: sorted1,
        fee: 500,
        liquidity: BigInt(10),
      }),
      resolveFactoryPool: async () => USDC_CBBTC_UNI_005_POOL,
      readAmounts: async () => [BigInt(1), BigInt(1)] as const,
    });
    expect(id).toBeNull();
  });

  it("one tokenId cannot bind to two legs", async () => {
    const claimed = new Set<string>();
    const bind = () =>
      matchExactPoolMintTokenId({
        candidates: [BigInt(7)],
        user: USER,
        expectedTokenA: BASE_USDC,
        expectedTokenB: BASE_CBBTC,
        protocol: "uniswap-v3",
        expectedPool: USDC_CBBTC_UNI_005_POOL,
        factory: uniPool.infrastructure.factory,
        nftContract: NPM,
      expectedFee: 500,
        claimedTokenIds: claimed,
        readOwner: async () => USER,
        readNpmPosition: async () => ({
          token0: sorted0,
          token1: sorted1,
          fee: 500,
          liquidity: BigInt(10),
        }),
        resolveFactoryPool: async () => USDC_CBBTC_UNI_005_POOL,
        readAmounts: async () => [BigInt(1), BigInt(1)] as const,
      });
    const first = await bind();
    expect(first).toBe(BigInt(7));
    claimed.add(positionNftClaimKey(NPM, first!));
    const second = await bind();
    expect(second).toBeNull();
  });

  it("same tokenId on different NFT contracts can both bind", async () => {
    const claimed = new Set<string>();
    const ADAPTER_B = "0x71C95911E9a5D330f4D62181467028e998fF717e" as Address;
    const bind = (nft: Address) =>
      matchExactPoolMintTokenId({
        candidates: [BigInt(1)],
        user: USER,
        expectedTokenA: BASE_USDC,
        expectedTokenB: BASE_CBBTC,
        protocol: "uniswap-v3",
        expectedPool: USDC_CBBTC_UNI_005_POOL,
        factory: uniPool.infrastructure.factory,
        nftContract: nft,
        expectedFee: 500,
        claimedTokenIds: claimed,
        readOwner: async () => USER,
        readNpmPosition: async () => ({
          token0: sorted0,
          token1: sorted1,
          fee: 500,
          liquidity: BigInt(10),
        }),
        resolveFactoryPool: async () => USDC_CBBTC_UNI_005_POOL,
        readAmounts: async () => [BigInt(1), BigInt(1)] as const,
      });
    const first = await bind(ADAPTER);
    expect(first).toBe(BigInt(1));
    claimed.add(positionNftClaimKey(ADAPTER, first!));
    const second = await bind(ADAPTER_B);
    expect(second).toBe(BigInt(1));
  });

  it("token-pair-only matching is impossible under exact pool binding", async () => {
    // Same tokens + owner + amounts, but factory resolves to a different pool → reject.
    const id = await matchExactPoolMintTokenId({
      candidates: [BigInt(8)],
      user: USER,
      expectedTokenA: BASE_USDC,
      expectedTokenB: BASE_CBBTC,
      protocol: "uniswap-v3",
      expectedPool: USDC_CBBTC_UNI_005_POOL,
      factory: uniPool.infrastructure.factory,
      nftContract: NPM,
      expectedFee: 500,
      claimedTokenIds: new Set(),
      readOwner: async () => USER,
      readNpmPosition: async () => ({
        token0: sorted0,
        token1: sorted1,
        fee: 500,
        liquidity: BigInt(10),
      }),
      resolveFactoryPool: async () => USDC_CBBTC_AERO_CL100_POOL,
      readAmounts: async () => [BigInt(100), BigInt(100)] as const,
    });
    expect(id).toBeNull();
    // Contrast: legacy token-pair matcher would accept this candidate.
    const legacy = await matchMintTokenId({
      candidates: [BigInt(8)],
      user: USER,
      expectedTokenA: BASE_USDC,
      expectedTokenB: BASE_CBBTC,
      readOwner: async () => USER,
      readTokens: async () => [sorted0, sorted1] as const,
      readAmounts: async () => [BigInt(100), BigInt(100)] as const,
    });
    expect(legacy).toBe(BigInt(8));
  });

  it("valid discovered positions still render and produce the existing exit path", () => {
    const expectations = exactPoolBindingExpectations(uniPool.poolIdHash);
    expect(expectations?.expectedPool).toBe(getAddress(USDC_CBBTC_UNI_005_POOL));
    expect(expectations?.expectedFee).toBe(500);

    const pos = toFivePoolPosition({
      legIndex: 1,
      leg: {
        ...leg,
        poolId: uniPool.poolIdHash,
        tokenA: BASE_USDC,
        tokenB: BASE_CBBTC,
      },
      adapterMeta: {
        ...adapterMeta,
        poolId: uniPool.poolIdHash,
        protocol: "uniswap-v3",
        tokenA: BASE_USDC,
        tokenB: BASE_CBBTC,
      },
      network: "base",
      chainId: 8453,
      tokenId: BigInt(42),
      owner: USER,
      liquidity: BigInt(1000),
      amount0: BigInt(100),
      amount1: BigInt(200),
      adapterApproved: true,
    });
    expect(pos.positionTokenId).toBe(BigInt(42));
    expect(pos.protocol).toBe("uniswap-v3");

    const exitParams = buildFullExitLegParams({
      legIndex: pos.legIndex,
      adapter: pos.adapter,
      tokenA: pos.tokenA,
      tokenB: pos.tokenB,
      positionTokenId: pos.positionTokenId,
      amountA: pos.amountA,
      amountB: pos.amountB,
      slippageBps: BigInt(100),
    });
    expect(exitParams.fullExit).toBe(true);
    expect(exitParams.positionTokenId).toBe(BigInt(42));
    expect(exitParams.amountAMin).toBeGreaterThan(BigInt(0));
  });
});
