import { describe, expect, it } from "vitest";
import { keccak256, stringToHex, type Address } from "viem";
import {
  BASE_TOKENS,
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
} from "@/lib/stable-club/official-pools";
import {
  FIVE_POOL_ALLOCATION_BPS_PER_LEG,
  FIVE_POOL_LEG_COUNT,
  legDepositAmount,
} from "@/lib/stable-club/five-pool-strategy";
import {
  EMPTY_SWAP_ROUTE_ID,
  STABLE_CLUB_SWAP_ROUTE_IDS,
  STABLE_CLUB_SWAP_ROUTE_LABELS,
} from "@/lib/stable-club/swap-routes";
import {
  EXPECTED_SWAP_COUNT,
  FIVE_POOL_SWAP_SLOT_ORDER,
  QuotePlanError,
  alignTick,
  allocateFivePoolBudgets,
  applyLpSlippageMin,
  buildFivePoolQuotePlan,
  computeTickRange,
  mapLegDesiredAmounts,
  minOutFromQuote,
  netUsdcAfterSwapFee,
  serializeQuotePlan,
  splitLegUsdc,
  tickSpacingForPool,
  type BuildFivePoolQuotePlanInput,
  type FivePoolSwapSlotId,
  type SwapQuoteInput,
} from "@/lib/stable-club/quote-plan";

const ADAPTERS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
] as const satisfies readonly Address[];

const NOW = 1_700_000_000;
const DEADLINE = BigInt(NOW + 3_600);
const GROSS_1000_USDC = BigInt(1000) * BigInt(10) ** BigInt(6); // 1_000_000_000

function freshQuotes(
  quotedOut: bigint = BigInt(1000000),
): Record<FivePoolSwapSlotId, SwapQuoteInput> {
  const quotes = {} as Record<FivePoolSwapSlotId, SwapQuoteInput>;
  for (const id of FIVE_POOL_SWAP_SLOT_ORDER) {
    quotes[id] = { quotedOut, quotedAtSec: NOW };
  }
  return quotes;
}

function baseInput(
  overrides: Partial<BuildFivePoolQuotePlanInput> = {},
): BuildFivePoolQuotePlanInput {
  return {
    grossUsdc: GROSS_1000_USDC,
    adapters: ADAPTERS,
    currentTicks: [100, -50, 0, 200, -120],
    quotes: freshQuotes(),
    slippageBps: BigInt(100),
    lpSlippageBps: BigInt(100),
    deadline: DEADLINE,
    nowSec: NOW,
    maxQuoteAgeSec: 120,
    ...overrides,
  };
}

describe("swap-routes", () => {
  it("route IDs match Phase 2a/2b keccak labels", () => {
    expect(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_CBBTC_UNI).toBe(
      keccak256(stringToHex(STABLE_CLUB_SWAP_ROUTE_LABELS.USDC_CBBTC_UNI)),
    );
    expect(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_CBBTC_AERO_L).toBe(
      keccak256(stringToHex(STABLE_CLUB_SWAP_ROUTE_LABELS.USDC_CBBTC_AERO_L)),
    );
    expect(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_WETH_UNI).toBe(
      keccak256(stringToHex(STABLE_CLUB_SWAP_ROUTE_LABELS.USDC_WETH_UNI)),
    );
    expect(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_WETH_AERO_L).toBe(
      keccak256(stringToHex(STABLE_CLUB_SWAP_ROUTE_LABELS.USDC_WETH_AERO_L)),
    );
  });
});

describe("quote-plan helpers", () => {
  it("allocates five equal 20% budgets for 1000 USDC with zero dust", () => {
    const { legBudgets, allocationDust } = allocateFivePoolBudgets(GROSS_1000_USDC);
    expect(allocationDust).toBe(BigInt(0));
    expect(legBudgets).toHaveLength(5);
    for (const b of legBudgets) {
      expect(b).toBe(BigInt(200) * BigInt(10) ** BigInt(6));
      expect(b).toBe(legDepositAmount(GROSS_1000_USDC, 0));
    }
    expect(legBudgets.reduce((a, b) => a + b, BigInt(0))).toBe(GROSS_1000_USDC);
  });

  it("rejects deposits that leave allocation dust", () => {
    expect(() => allocateFivePoolBudgets(BigInt(1000000001))).toThrow(QuotePlanError);
    try {
      allocateFivePoolBudgets(BigInt(1000000001));
    } catch (e) {
      expect((e as QuotePlanError).code).toBe("DEPOSIT_NOT_EXACTLY_ALLOCATABLE");
    }
  });

  it("splits odd leg budgets with deterministic remainder (no float)", () => {
    const single = splitLegUsdc(BigInt(201), false);
    expect(single.retainUsdc + single.swapGrosses[0]!).toBe(BigInt(201));
    expect(single.swapGrosses[0]).toBe(BigInt(100));
    expect(single.retainUsdc).toBe(BigInt(101));

    const dual = splitLegUsdc(BigInt(201), true);
    expect(dual.retainUsdc).toBe(BigInt(0));
    expect(dual.swapGrosses[0]! + dual.swapGrosses[1]!).toBe(BigInt(201));
    expect(dual.swapGrosses[0]).toBe(BigInt(100));
    expect(dual.swapGrosses[1]).toBe(BigInt(101));
  });

  it("computes minOut with integer slippage floor", () => {
    expect(minOutFromQuote(BigInt(10000), BigInt(100))).toBe(BigInt(9900));
    expect(minOutFromQuote(BigInt(100), BigInt(100))).toBe(BigInt(99));
    expect(() => minOutFromQuote(BigInt(1), BigInt(10000))).toThrow(QuotePlanError);
    expect(() => minOutFromQuote(BigInt(0), BigInt(100))).toThrow(QuotePlanError);
    // MevGuard slipFloor uses fresh oracle — stale minOut fails when oracle ticks up 1 wei.
    const staleQuoted = BigInt(2521);
    const staleMin = minOutFromQuote(staleQuoted, BigInt(100));
    const freshExpected = BigInt(2522);
    const slipFloor = (freshExpected * BigInt(9900)) / BigInt(10000);
    expect(staleMin).toBe((staleQuoted * BigInt(9900)) / BigInt(10000));
    expect(staleMin < slipFloor).toBe(true);
  });

  it("netUsdcAfterSwapFee applies 1% floor fee", () => {
    expect(netUsdcAfterSwapFee(BigInt(10000))).toBe(BigInt(9900));
    expect(netUsdcAfterSwapFee(BigInt(100))).toBe(BigInt(99));
  });

  it("aligns ticks toward zero and builds valid ranges", () => {
    expect(alignTick(105, 10)).toBe(100);
    expect(alignTick(-105, 10)).toBe(-100);
    expect(alignTick(100, 100)).toBe(100);
    const { tickLower, tickUpper } = computeTickRange(55, 10, 10);
    expect(tickLower).toBe(-40); // align(55-100)=align(-45)=-40
    expect(tickUpper).toBe(150); // align(55+100)=150
    expect(tickLower % 10 === 0).toBe(true);
    expect(tickUpper % 10 === 0).toBe(true);
    expect(tickLower).toBeLessThan(tickUpper);
  });

  it("maps catalogue pools to verified tick spacings", () => {
    expect(tickSpacingForPool(OFFICIAL_STABLE_CLUB_BASE_POOLS[0]!)).toBe(100);
    expect(tickSpacingForPool(OFFICIAL_STABLE_CLUB_BASE_POOLS[1]!)).toBe(10);
    expect(tickSpacingForPool(OFFICIAL_STABLE_CLUB_BASE_POOLS[2]!)).toBe(10);
    expect(tickSpacingForPool(OFFICIAL_STABLE_CLUB_BASE_POOLS[3]!)).toBe(100);
    expect(tickSpacingForPool(OFFICIAL_STABLE_CLUB_BASE_POOLS[4]!)).toBe(10);
  });
});

describe("buildFivePoolQuotePlan — 1000 USDC", () => {
  it("produces five 20% legs and exactly eight swaps in expected order", () => {
    const plan = buildFivePoolQuotePlan(baseInput());
    expect(plan.legs).toHaveLength(FIVE_POOL_LEG_COUNT);
    expect(plan.swaps).toHaveLength(EXPECTED_SWAP_COUNT);
    expect(EXPECTED_SWAP_COUNT).toBe(8);

    for (let i = 0; i < 5; i++) {
      expect(plan.legBudgets[i]).toBe(BigInt(200000000));
      expect(plan.legs[i]!.legIndex).toBe(i);
      expect(plan.legs[i]!.slippageBps).toBe(BigInt(100));
      expect(plan.legs[i]!.adapter).toBe(ADAPTERS[i]);
    }

    expect(plan.legs[0]!.swapCount).toBe(1);
    expect(plan.legs[0]!.retainUsdc).toBe(BigInt(100000000));
    expect(plan.legs[1]!.swapCount).toBe(1);
    expect(plan.legs[2]!.swapCount).toBe(2);
    expect(plan.legs[2]!.retainUsdc).toBe(BigInt(0));
    expect(plan.legs[3]!.swapCount).toBe(2);
    expect(plan.legs[4]!.swapCount).toBe(2);

    expect(plan.swaps.map((s) => s.slotId)).toEqual([...FIVE_POOL_SWAP_SLOT_ORDER]);
    expect(plan.swaps[0]!.routeId).toBe(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_CBBTC_AERO_L);
    expect(plan.swaps[1]!.routeId).toBe(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_CBBTC_UNI);
    expect(plan.swaps[2]!.routeId).toBe(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_CBBTC_UNI);
    expect(plan.swaps[3]!.routeId).toBe(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_WETH_UNI);
    expect(plan.swaps[4]!.routeId).toBe(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_CBBTC_UNI);
    expect(plan.swaps[5]!.routeId).toBe(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_WETH_UNI);
    expect(plan.swaps[6]!.routeId).toBe(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_CBBTC_UNI);
    expect(plan.swaps[7]!.routeId).toBe(STABLE_CLUB_SWAP_ROUTE_IDS.USDC_WETH_UNI);
  });

  it("uses catalogue token ordering and pool ids", () => {
    const plan = buildFivePoolQuotePlan(baseInput());
    for (let i = 0; i < 5; i++) {
      const pool = OFFICIAL_STABLE_CLUB_BASE_POOLS[i]!;
      expect(plan.legs[i]!.tokenA).toBe(pool.tokenA.address);
      expect(plan.legs[i]!.tokenB).toBe(pool.tokenB.address);
      expect(plan.poolIds[i]).toBe(pool.poolIdHash);
    }
    expect(plan.depositToken.address).toBe(BASE_TOKENS.USDC.address);
    expect(plan.legs[0]!.tokenA).toBe(BASE_TOKENS.USDC.address);
    expect(plan.legs[2]!.tokenA).toBe(BASE_TOKENS.cbBTC.address);
  });

  it("pads unused swap slots and never exceeds deposit", () => {
    const plan = buildFivePoolQuotePlan(baseInput());
    let planned = BigInt(0);
    for (const leg of plan.legs) {
      planned += leg.retainUsdc;
      for (let s = 0; s < leg.swapCount; s++) {
        planned += leg.swaps[s]!.grossUsdcIn;
      }
      // Unused slot must be empty pad
      if (leg.swapCount === 1) {
        expect(leg.swaps[1]).toEqual({
          routeId: EMPTY_SWAP_ROUTE_ID,
          grossUsdcIn: BigInt(0),
          minOut: BigInt(0),
          quotedOut: BigInt(0),
          deadline: BigInt(0),
        });
      }
    }
    expect(planned).toBe(GROSS_1000_USDC);
    expect(plan.allocationDust).toBe(BigInt(0));
  });

  it("applies minOut from quotedOut and slippage", () => {
    const quotedOut = BigInt(50000000);
    const slippageBps = BigInt(500);
    const plan = buildFivePoolQuotePlan(
      baseInput({ quotes: freshQuotes(quotedOut), slippageBps }),
    );
    const expectedMin = minOutFromQuote(quotedOut, slippageBps);
    for (const swap of plan.swaps) {
      expect(swap.quotedOut).toBe(quotedOut);
      expect(swap.minOut).toBe(expectedMin);
      expect(swap.minOut).toBe((quotedOut * (BigInt(10000) - slippageBps)) / BigInt(10000));
    }
  });

  it("aligns ticks per catalogue spacing", () => {
    const plan = buildFivePoolQuotePlan(
      baseInput({ currentTicks: [1234, -55, 17, -250, 99] }),
    );
    // leg0 spacing 100
    expect(plan.legs[0]!.tickLower).toBe(alignTick(1234 - 100 * 10, 100));
    expect(plan.legs[0]!.tickUpper).toBe(alignTick(1234 + 100 * 10, 100));
    // leg1 spacing 10 (uni 0.05%)
    expect(plan.legs[1]!.tickLower).toBe(alignTick(-55 - 10 * 10, 10));
    expect(plan.legs[1]!.tickUpper).toBe(alignTick(-55 + 10 * 10, 10));
    for (const leg of plan.legs) {
      expect(leg.tickLower).toBeLessThan(leg.tickUpper);
    }
  });

  it("is deterministic for identical inputs", () => {
    const a = buildFivePoolQuotePlan(baseInput());
    const b = buildFivePoolQuotePlan(baseInput());
    expect(serializeQuotePlan(a)).toBe(serializeQuotePlan(b));
  });

  it("derives LP mins from simulated CL mint consumption (not raw desired)", () => {
    const quotedOut = BigInt(50_000_000);
    const lpSlippageBps = BigInt(250);
    const slippageBps = BigInt(100);
    const plan = buildFivePoolQuotePlan(
      baseInput({ quotes: freshQuotes(quotedOut), lpSlippageBps, slippageBps }),
    );
    expect(plan.lpSlippageBps).toBe(lpSlippageBps);
    expect(plan.legDesiredAmounts).toHaveLength(5);

    for (let i = 0; i < 5; i++) {
      const leg = plan.legs[i]!;
      const desired = plan.legDesiredAmounts[i]!;
      // Mins are from LiquidityAmounts at sqrtPrice — typically strictly below raw desired floors.
      const rawA = applyLpSlippageMin(desired.desiredA, lpSlippageBps);
      const rawB = applyLpSlippageMin(desired.desiredB, lpSlippageBps);
      expect(leg.amountAMin + leg.amountBMin).toBeGreaterThan(BigInt(0));
      expect(leg.amountAMin).toBeLessThanOrEqual(rawA);
      expect(leg.amountBMin).toBeLessThanOrEqual(rawB);
      expect(leg.amountAMin === BigInt(1) && leg.amountBMin === BigInt(1)).toBe(false);
    }

    // Legs 0–1: USDC/cbBTC — desiredA = retainUsdc, desiredB = cbBTC quotedOut
    expect(plan.legDesiredAmounts[0]!.desiredA).toBe(plan.legs[0]!.retainUsdc);
    expect(plan.legDesiredAmounts[0]!.desiredB).toBe(quotedOut);
    expect(plan.legDesiredAmounts[1]!.desiredA).toBe(plan.legs[1]!.retainUsdc);
    expect(plan.legDesiredAmounts[1]!.desiredB).toBe(quotedOut);

    // Legs 2–4: cbBTC/WETH — desiredA = cbBTC out, desiredB = WETH out
    for (let i = 2; i < 5; i++) {
      expect(plan.legs[i]!.retainUsdc).toBe(BigInt(0));
      expect(plan.legDesiredAmounts[i]!.desiredA).toBe(quotedOut);
      expect(plan.legDesiredAmounts[i]!.desiredB).toBe(quotedOut);
    }
  });

  it("maps desired amounts to catalogue tokenA/tokenB order", () => {
    const quotedCbBtc = BigInt(111);
    const quotedWeth = BigInt(222);
    const quotes = freshQuotes();
    quotes["leg0-usdc-cbbtc"] = { quotedOut: quotedCbBtc, quotedAtSec: NOW };
    quotes["leg1-usdc-cbbtc"] = { quotedOut: quotedCbBtc, quotedAtSec: NOW };
    quotes["leg2-usdc-cbbtc"] = { quotedOut: quotedCbBtc, quotedAtSec: NOW };
    quotes["leg2-usdc-weth"] = { quotedOut: quotedWeth, quotedAtSec: NOW };
    quotes["leg3-usdc-cbbtc"] = { quotedOut: quotedCbBtc, quotedAtSec: NOW };
    quotes["leg3-usdc-weth"] = { quotedOut: quotedWeth, quotedAtSec: NOW };
    quotes["leg4-usdc-cbbtc"] = { quotedOut: quotedCbBtc, quotedAtSec: NOW };
    quotes["leg4-usdc-weth"] = { quotedOut: quotedWeth, quotedAtSec: NOW };

    const plan = buildFivePoolQuotePlan(baseInput({ quotes }));

    // USDC/cbBTC catalogue: tokenA=USDC, tokenB=cbBTC
    expect(plan.legs[0]!.tokenA).toBe(BASE_TOKENS.USDC.address);
    expect(plan.legs[0]!.tokenB).toBe(BASE_TOKENS.cbBTC.address);
    expect(plan.legDesiredAmounts[0]!.desiredA).toBe(plan.legs[0]!.retainUsdc);
    expect(plan.legDesiredAmounts[0]!.desiredB).toBe(quotedCbBtc);

    // cbBTC/WETH catalogue: tokenA=cbBTC, tokenB=WETH
    expect(plan.legs[2]!.tokenA).toBe(BASE_TOKENS.cbBTC.address);
    expect(plan.legs[2]!.tokenB).toBe(BASE_TOKENS.WETH.address);
    expect(plan.legDesiredAmounts[2]!.desiredA).toBe(quotedCbBtc);
    expect(plan.legDesiredAmounts[2]!.desiredB).toBe(quotedWeth);

    const mapped = mapLegDesiredAmounts({
      tokenA: BASE_TOKENS.cbBTC.address,
      tokenB: BASE_TOKENS.WETH.address,
      usdc: BASE_TOKENS.USDC.address,
      retainUsdc: BigInt(0),
      swaps: [
        { tokenOut: BASE_TOKENS.WETH.address, quotedOut: quotedWeth },
        { tokenOut: BASE_TOKENS.cbBTC.address, quotedOut: quotedCbBtc },
      ],
    });
    // Order of swap list must not matter — amounts follow tokenA/tokenB
    expect(mapped.desiredA).toBe(quotedCbBtc);
    expect(mapped.desiredB).toBe(quotedWeth);
  });

  it("applies integer floor LP slippage (not round)", () => {
    // 10001 * 9900 / 10000 = 9900.99 → floor 9900
    const desired = BigInt(10001);
    const lpSlippageBps = BigInt(100);
    expect(applyLpSlippageMin(desired, lpSlippageBps)).toBe(BigInt(9900));
    expect(applyLpSlippageMin(desired, lpSlippageBps)).not.toBe(BigInt(9901));

    const plan = buildFivePoolQuotePlan(
      baseInput({
        quotes: freshQuotes(desired),
        lpSlippageBps,
      }),
    );
    for (let i = 2; i < 5; i++) {
      // Simulated mint mins ≤ raw desired floors
      expect(plan.legs[i]!.amountAMin).toBeLessThanOrEqual(BigInt(9900));
      expect(plan.legs[i]!.amountBMin).toBeLessThanOrEqual(BigInt(9900));
      expect(plan.legs[i]!.amountAMin + plan.legs[i]!.amountBMin).toBeGreaterThan(BigInt(0));
    }
  });

  it("returns contract-ready DepositLegParams shape", () => {
    const plan = buildFivePoolQuotePlan(baseInput());
    for (const leg of plan.legs) {
      expect(Object.keys(leg).sort()).toEqual(
        [
          "adapter",
          "amountAMin",
          "amountBMin",
          "legIndex",
          "retainUsdc",
          "slippageBps",
          "swapCount",
          "swaps",
          "tickLower",
          "tickUpper",
          "tokenA",
          "tokenB",
        ].sort(),
      );
      expect(leg.swaps).toHaveLength(2);
      for (const sw of leg.swaps.slice(0, leg.swapCount)) {
        expect(Object.keys(sw).sort()).toEqual(
          ["deadline", "grossUsdcIn", "minOut", "quotedOut", "routeId"].sort(),
        );
        expect(sw.grossUsdcIn).toBeGreaterThan(BigInt(0));
        expect(sw.minOut).toBeGreaterThan(BigInt(0));
        expect(sw.quotedOut).toBeGreaterThan(BigInt(0));
        expect(sw.deadline).toBe(DEADLINE);
      }
    }
  });
});

describe("buildFivePoolQuotePlan — rejections", () => {
  it("rejects zero / non-allocatable deposit", () => {
    expect(() => buildFivePoolQuotePlan(baseInput({ grossUsdc: BigInt(0) }))).toThrow(QuotePlanError);
    expect(() => buildFivePoolQuotePlan(baseInput({ grossUsdc: BigInt(7) }))).toThrow(QuotePlanError);
  });

  it("rejects invalid swap slippage", () => {
    expect(() => buildFivePoolQuotePlan(baseInput({ slippageBps: BigInt(0) }))).toThrow(QuotePlanError);
    expect(() => buildFivePoolQuotePlan(baseInput({ slippageBps: BigInt(501) }))).toThrow(
      QuotePlanError,
    );
    expect(() => buildFivePoolQuotePlan(baseInput({ slippageBps: BigInt(5000) }))).toThrow(
      QuotePlanError,
    );
  });

  it("rejects invalid LP slippage", () => {
    expect(() => buildFivePoolQuotePlan(baseInput({ lpSlippageBps: BigInt(0) }))).toThrow(
      QuotePlanError,
    );
    expect(() => buildFivePoolQuotePlan(baseInput({ lpSlippageBps: BigInt(501) }))).toThrow(
      QuotePlanError,
    );
    expect(() => buildFivePoolQuotePlan(baseInput({ lpSlippageBps: BigInt(5000) }))).toThrow(
      QuotePlanError,
    );
    try {
      buildFivePoolQuotePlan(baseInput({ lpSlippageBps: BigInt(0) }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(QuotePlanError);
      expect((e as QuotePlanError).code).toBe("INVALID_LP_SLIPPAGE");
    }
  });

  it("rejects deadline not after now", () => {
    expect(() =>
      buildFivePoolQuotePlan(baseInput({ deadline: BigInt(NOW) })),
    ).toThrow(QuotePlanError);
    expect(() =>
      buildFivePoolQuotePlan(baseInput({ deadline: BigInt(NOW - 1) })),
    ).toThrow(QuotePlanError);
  });

  it("rejects missing and stale quotes", () => {
    const missing = freshQuotes();
    delete (missing as Partial<typeof missing>)["leg2-usdc-weth"];
    expect(() => buildFivePoolQuotePlan(baseInput({ quotes: missing }))).toThrow(QuotePlanError);

    const stale = freshQuotes();
    stale["leg0-usdc-cbbtc"] = { quotedOut: BigInt(1), quotedAtSec: NOW - 1_000 };
    expect(() =>
      buildFivePoolQuotePlan(baseInput({ quotes: stale, maxQuoteAgeSec: 60 })),
    ).toThrow(QuotePlanError);

    const zero = freshQuotes(BigInt(0));
    expect(() => buildFivePoolQuotePlan(baseInput({ quotes: zero }))).toThrow(QuotePlanError);
  });

  it("rejects invalid adapters", () => {
    const badAdapters = [...ADAPTERS] as Address[];
    badAdapters[0] = "0x0000000000000000000000000000000000000000";
    expect(() => buildFivePoolQuotePlan(baseInput({ adapters: badAdapters }))).toThrow(
      QuotePlanError,
    );
  });

  it("rejects when swap minOut rounds to zero", () => {
    // quotedOut=1 with any positive slippage → floor to 0
    expect(() =>
      buildFivePoolQuotePlan(baseInput({ quotes: freshQuotes(BigInt(1)), slippageBps: BigInt(100) })),
    ).toThrow(QuotePlanError);
  });

  it("rejects when LP amount min rounds to zero", () => {
    expect(() => applyLpSlippageMin(BigInt(1), BigInt(500))).toThrow(QuotePlanError);
    try {
      applyLpSlippageMin(BigInt(1), BigInt(500));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(QuotePlanError);
      expect((e as QuotePlanError).code).toBe("ZERO_MIN_OUT");
    }
  });
});

describe("SC-F11 — executable slippage max 500 bps", () => {
  it("accepts 500 bps and the existing safe default", () => {
    expect(() =>
      buildFivePoolQuotePlan(baseInput({ slippageBps: BigInt(500), lpSlippageBps: BigInt(500) })),
    ).not.toThrow();
    expect(() =>
      buildFivePoolQuotePlan(baseInput({ slippageBps: BigInt(100), lpSlippageBps: BigInt(100) })),
    ).not.toThrow();
    expect(minOutFromQuote(BigInt(10_000), BigInt(500))).toBe(BigInt(9500));
    expect(applyLpSlippageMin(BigInt(10_000), BigInt(500))).toBe(BigInt(9500));
  });

  it("rejects 501 and 5000 before any plan is built", () => {
    expect(() => buildFivePoolQuotePlan(baseInput({ slippageBps: BigInt(501) }))).toThrow(
      /slippageBps must be in \(0, 500]/,
    );
    expect(() => buildFivePoolQuotePlan(baseInput({ lpSlippageBps: BigInt(501) }))).toThrow(
      /lpSlippageBps must be in \(0, 500]/,
    );
    expect(() => buildFivePoolQuotePlan(baseInput({ slippageBps: BigInt(5000) }))).toThrow(
      QuotePlanError,
    );
    expect(() => applyLpSlippageMin(BigInt(10_000), BigInt(5000))).toThrow(/lpSlippageBps/);
  });
});

describe("LP slippage helpers", () => {
  it("applyLpSlippageMin uses floor division", () => {
    expect(applyLpSlippageMin(BigInt(10000), BigInt(100))).toBe(BigInt(9900));
    expect(applyLpSlippageMin(BigInt(9999), BigInt(100))).toBe(BigInt(9899));
  });
});

describe("quote-plan allocation constants", () => {
  it("keeps 2000 bps × 5 = 10000", () => {
    expect(FIVE_POOL_LEG_COUNT).toBe(5);
    expect(FIVE_POOL_ALLOCATION_BPS_PER_LEG * FIVE_POOL_LEG_COUNT).toBe(10_000);
  });
});
