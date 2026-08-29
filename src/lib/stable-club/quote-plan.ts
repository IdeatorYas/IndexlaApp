/**
 * Stable Club five-pool deposit quote planner (Phase 2b).
 *
 * Pure library: converts a USDC deposit + pre-fetched quotes into contract-ready
 * `DepositLegParams[5]` for `StableClubConcentratedLiquidityExecutor.depositFivePoolStrategy`.
 * Does not fetch quotes or call RPC — callers supply quotes, ticks, and adapters.
 *
 * Verified sources:
 * - Catalogue / 20% allocation: `official-pools.ts`, `five-pool-strategy.ts`
 * - Eight-swap plan: `StableClubPhase2aForkDeposit.test.cjs` buildDepositLegs
 * - Route IDs: `scripts/stable-club/phase2a-manifest.cjs`
 * - Fee: FeeRouter FEE_BPS = 100 (quotes are for net USDC after fee)
 * - Executor structs: StableClubConcentratedLiquidityExecutor DepositLegParams / SwapInstruction
 */
import type { Address, Hex } from "viem";
import {
  BASE_TOKENS,
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  type OfficialStableClubPool,
  isPoolResolvable,
} from "@/lib/stable-club/official-pools";
import {
  FIVE_POOL_LEG_COUNT,
  FIVE_POOL_ALLOCATION_BPS_PER_LEG,
  legDepositAmount,
} from "@/lib/stable-club/five-pool-strategy";
import { STABLE_CLUB_EXECUTION_FEE_BPS, STABLE_CLUB_USDC_DECIMALS } from "@/lib/stable-club/constants";
import {
  EMPTY_SWAP_ROUTE_ID,
  STABLE_CLUB_SWAP_ROUTE_IDS,
  type StableClubSwapRouteKey,
} from "@/lib/stable-club/swap-routes";

/** Matches PermissionRegistry / StrategyPermissionRegistry MAX_SLIPPAGE_BPS. */
export const QUOTE_PLAN_MAX_SLIPPAGE_BPS = BigInt(5000);

/** Uniswap V3 / Slipstream tick bounds. */
export const CL_MIN_TICK = -887_272;
export const CL_MAX_TICK = 887_272;

/** Fork-verified default half-width in tick spacings (+/- 10). */
export const DEFAULT_TICK_RANGE_SPACINGS = 10;

/** Fee bps deducted from each swap's gross USDC before router execution. */
export const SWAP_FEE_BPS = BigInt(STABLE_CLUB_EXECUTION_FEE_BPS);

export const BPS_DENOMINATOR = BigInt(10000);

export type QuotePlanErrorCode =
  | "ZERO_DEPOSIT"
  | "DEPOSIT_NOT_EXACTLY_ALLOCATABLE"
  | "UNSUPPORTED_TOKEN"
  | "INVALID_POOL_CONFIG"
  | "INVALID_ADAPTERS"
  | "INVALID_TICKS"
  | "INVALID_SLIPPAGE"
  | "INVALID_LP_SLIPPAGE"
  | "INVALID_DEADLINE"
  | "MISSING_QUOTE"
  | "STALE_QUOTE"
  | "ZERO_QUOTE"
  | "ZERO_MIN_OUT"
  | "INVALID_AMOUNT_MIN"
  | "BUDGET_OVERFLOW";

export class QuotePlanError extends Error {
  readonly code: QuotePlanErrorCode;
  constructor(code: QuotePlanErrorCode, message: string) {
    super(message);
    this.name = "QuotePlanError";
    this.code = code;
  }
}

/** Deterministic swap-slot IDs — exactly eight per full five-pool deposit. */
export type FivePoolSwapSlotId =
  | "leg0-usdc-cbbtc"
  | "leg1-usdc-cbbtc"
  | "leg2-usdc-cbbtc"
  | "leg2-usdc-weth"
  | "leg3-usdc-cbbtc"
  | "leg3-usdc-weth"
  | "leg4-usdc-cbbtc"
  | "leg4-usdc-weth";

export const FIVE_POOL_SWAP_SLOT_ORDER: readonly FivePoolSwapSlotId[] = [
  "leg0-usdc-cbbtc",
  "leg1-usdc-cbbtc",
  "leg2-usdc-cbbtc",
  "leg2-usdc-weth",
  "leg3-usdc-cbbtc",
  "leg3-usdc-weth",
  "leg4-usdc-cbbtc",
  "leg4-usdc-weth",
] as const;

export const EXPECTED_SWAP_COUNT = FIVE_POOL_SWAP_SLOT_ORDER.length;

export type SwapQuoteInput = {
  /** Expected tokenOut amount for net USDC after the 1% INDEXLA swap fee. */
  quotedOut: bigint;
  /** Unix seconds when the quote was observed. */
  quotedAtSec: number;
};

export type BuildFivePoolQuotePlanInput = {
  /** Gross USDC (6 decimals). Must allocate exactly across five 20% legs with no remainder. */
  grossUsdc: bigint;
  /** Deployed adapter addresses in catalogue order (length 5). */
  adapters: readonly Address[];
  /** Current pool ticks in catalogue order (length 5). */
  currentTicks: readonly number[];
  /** Quotes keyed by deterministic swap slot id (all eight required). */
  quotes: Readonly<Partial<Record<FivePoolSwapSlotId, SwapQuoteInput>>>;
  /** Slippage bound applied to quotedOut → swap minOut (0 < bps ≤ 5000). */
  slippageBps: bigint;
  /**
   * Slippage bound applied to planned desired LP amounts → amountAMin/amountBMin
   * (0 < bps ≤ 5000). Separate from swap slippage.
   */
  lpSlippageBps: bigint;
  /** Absolute unix deadline for all swap instructions (must be > nowSec). */
  deadline: bigint;
  /** Clock used for quote freshness and deadline checks. */
  nowSec: number;
  /** Reject quotes older than this many seconds. */
  maxQuoteAgeSec: number;
  /** Range half-width in tick spacings (default 10). */
  tickRangeSpacings?: number;
};

/** Mirrors StableClubConcentratedLiquidityExecutor.SwapInstruction. */
export type SwapInstructionParams = {
  routeId: Hex;
  grossUsdcIn: bigint;
  minOut: bigint;
  quotedOut: bigint;
  deadline: bigint;
};

/** Mirrors StableClubConcentratedLiquidityExecutor.DepositLegParams. */
export type DepositLegParams = {
  legIndex: number;
  adapter: Address;
  tokenA: Address;
  tokenB: Address;
  tickLower: number;
  tickUpper: number;
  retainUsdc: bigint;
  swaps: [SwapInstructionParams, SwapInstructionParams];
  swapCount: number;
  amountAMin: bigint;
  amountBMin: bigint;
  slippageBps: bigint;
};

export type PlannedSwapLeg = {
  slotId: FivePoolSwapSlotId;
  legIndex: number;
  swapIndex: number;
  routeKey: StableClubSwapRouteKey;
  routeId: Hex;
  tokenOut: Address;
  tokenOutSymbol: "cbBTC" | "WETH";
  grossUsdcIn: bigint;
  /** USDC amount after FeeRouter 1% (for quote sizing reference). */
  netUsdcIn: bigint;
  quotedOut: bigint;
  minOut: bigint;
  deadline: bigint;
};

export type FivePoolQuotePlan = {
  grossUsdc: bigint;
  depositToken: typeof BASE_TOKENS.USDC;
  poolIds: readonly Hex[];
  legBudgets: readonly bigint[];
  /** Dust that could not be allocated (always 0 when plan succeeds). */
  allocationDust: bigint;
  legs: readonly DepositLegParams[];
  /** Flat eight swaps in deterministic order. */
  swaps: readonly PlannedSwapLeg[];
  /** Planned desired token amounts before LP slippage (catalogue tokenA/tokenB order). */
  legDesiredAmounts: readonly { desiredA: bigint; desiredB: bigint }[];
  slippageBps: bigint;
  lpSlippageBps: bigint;
  deadline: bigint;
};

type LegSwapSpec = {
  slotId: FivePoolSwapSlotId;
  routeKey: StableClubSwapRouteKey;
  tokenOut: typeof BASE_TOKENS.cbBTC | typeof BASE_TOKENS.WETH;
};

type LegPlanSpec = {
  dualSwap: boolean;
  /** Single-swap USDC/cbBTC legs use the catalogue-matching venue route. */
  swaps: readonly LegSwapSpec[];
};

/**
 * Per-leg swap blueprint matching fork `buildDepositLegs`:
 * - Legs 0–1 (USDC/cbBTC): retain half USDC + 1 swap to cbBTC (Aero legacy / Uni).
 * - Legs 2–4 (cbBTC/WETH): 0 retain + 2 swaps USDC→cbBTC and USDC→WETH via Uni routes.
 */
const LEG_SWAP_SPECS: readonly LegPlanSpec[] = [
  {
    dualSwap: false,
    swaps: [
      {
        slotId: "leg0-usdc-cbbtc",
        routeKey: "USDC_CBBTC_AERO_L",
        tokenOut: BASE_TOKENS.cbBTC,
      },
    ],
  },
  {
    dualSwap: false,
    swaps: [
      {
        slotId: "leg1-usdc-cbbtc",
        routeKey: "USDC_CBBTC_UNI",
        tokenOut: BASE_TOKENS.cbBTC,
      },
    ],
  },
  {
    dualSwap: true,
    swaps: [
      {
        slotId: "leg2-usdc-cbbtc",
        routeKey: "USDC_CBBTC_UNI",
        tokenOut: BASE_TOKENS.cbBTC,
      },
      {
        slotId: "leg2-usdc-weth",
        routeKey: "USDC_WETH_UNI",
        tokenOut: BASE_TOKENS.WETH,
      },
    ],
  },
  {
    dualSwap: true,
    swaps: [
      {
        slotId: "leg3-usdc-cbbtc",
        routeKey: "USDC_CBBTC_UNI",
        tokenOut: BASE_TOKENS.cbBTC,
      },
      {
        slotId: "leg3-usdc-weth",
        routeKey: "USDC_WETH_UNI",
        tokenOut: BASE_TOKENS.WETH,
      },
    ],
  },
  {
    dualSwap: true,
    swaps: [
      {
        slotId: "leg4-usdc-cbbtc",
        routeKey: "USDC_CBBTC_UNI",
        tokenOut: BASE_TOKENS.cbBTC,
      },
      {
        slotId: "leg4-usdc-weth",
        routeKey: "USDC_WETH_UNI",
        tokenOut: BASE_TOKENS.WETH,
      },
    ],
  },
] as const;

const EMPTY_SWAP: SwapInstructionParams = {
  routeId: EMPTY_SWAP_ROUTE_ID,
  grossUsdcIn: BigInt(0),
  minOut: BigInt(0),
  quotedOut: BigInt(0),
  deadline: BigInt(0),
};

/** Uni V3 fee tier 500 (0.05%) → tickSpacing 10. Catalogue `feeBps: 5` means 5 bps = 0.05%. */
export function tickSpacingForPool(pool: OfficialStableClubPool): number {
  if (pool.feeOrTick.kind === "tickSpacing") {
    return pool.feeOrTick.tickSpacing;
  }
  // Uniswap V3: fee = feeBps * 100 (hundredths of a bip). 5 bps → fee 500 → spacing 10.
  if (pool.feeOrTick.feeBps === 5) return 10;
  throw new QuotePlanError(
    "INVALID_POOL_CONFIG",
    `Unsupported Uniswap feeBps ${pool.feeOrTick.feeBps} for ${pool.id}`,
  );
}

/** Toward-zero tick alignment (matches Hardhat fork helpers). */
export function alignTick(tick: number, spacing: number): number {
  if (!Number.isInteger(spacing) || spacing <= 0) {
    throw new QuotePlanError("INVALID_TICKS", `Invalid tick spacing: ${spacing}`);
  }
  if (!Number.isFinite(tick) || !Number.isInteger(tick)) {
    throw new QuotePlanError("INVALID_TICKS", `Invalid tick: ${tick}`);
  }
  return Math.trunc(tick / spacing) * spacing;
}

export function computeTickRange(
  currentTick: number,
  spacing: number,
  rangeSpacings: number = DEFAULT_TICK_RANGE_SPACINGS,
): { tickLower: number; tickUpper: number } {
  if (!Number.isInteger(rangeSpacings) || rangeSpacings <= 0) {
    throw new QuotePlanError("INVALID_TICKS", `Invalid tick range spacings: ${rangeSpacings}`);
  }
  const tickLower = alignTick(currentTick - spacing * rangeSpacings, spacing);
  const tickUpper = alignTick(currentTick + spacing * rangeSpacings, spacing);
  if (tickLower >= tickUpper) {
    throw new QuotePlanError(
      "INVALID_TICKS",
      `tickLower (${tickLower}) must be < tickUpper (${tickUpper})`,
    );
  }
  if (tickLower < CL_MIN_TICK || tickUpper > CL_MAX_TICK) {
    throw new QuotePlanError(
      "INVALID_TICKS",
      `Tick range [${tickLower}, ${tickUpper}] outside CL bounds`,
    );
  }
  return { tickLower, tickUpper };
}

/** minOut = floor(quotedOut * (BPS - slippage) / BPS). */
export function minOutFromQuote(quotedOut: bigint, slippageBps: bigint): bigint {
  if (quotedOut <= BigInt(0)) {
    throw new QuotePlanError("ZERO_QUOTE", "quotedOut must be > 0");
  }
  if (slippageBps <= BigInt(0) || slippageBps > QUOTE_PLAN_MAX_SLIPPAGE_BPS) {
    throw new QuotePlanError(
      "INVALID_SLIPPAGE",
      `slippageBps must be in (0, ${QUOTE_PLAN_MAX_SLIPPAGE_BPS}]`,
    );
  }
  const minOut = (quotedOut * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR;
  if (minOut <= BigInt(0)) {
    throw new QuotePlanError("ZERO_MIN_OUT", "minOut rounded to zero");
  }
  return minOut;
}

/**
 * LP mint floor: floor(desired * (BPS - lpSlippage) / BPS).
 * Rejects zero results so mint cannot proceed unprotected.
 */
export function applyLpSlippageMin(desiredAmount: bigint, lpSlippageBps: bigint): bigint {
  if (desiredAmount <= BigInt(0)) {
    throw new QuotePlanError("INVALID_AMOUNT_MIN", "desired LP amount must be > 0");
  }
  if (lpSlippageBps <= BigInt(0) || lpSlippageBps > QUOTE_PLAN_MAX_SLIPPAGE_BPS) {
    throw new QuotePlanError(
      "INVALID_LP_SLIPPAGE",
      `lpSlippageBps must be in (0, ${QUOTE_PLAN_MAX_SLIPPAGE_BPS}]`,
    );
  }
  const minAmount = (desiredAmount * (BPS_DENOMINATOR - lpSlippageBps)) / BPS_DENOMINATOR;
  if (minAmount <= BigInt(0)) {
    throw new QuotePlanError("ZERO_MIN_OUT", "LP amount min rounded to zero");
  }
  return minAmount;
}

/**
 * Map retain USDC + swap quotedOuts onto catalogue tokenA/tokenB.
 * Mirrors executor `_allocateUsdcToPair` / `_allocateTokenToPair`.
 */
export function mapLegDesiredAmounts(params: {
  tokenA: Address;
  tokenB: Address;
  usdc: Address;
  retainUsdc: bigint;
  swaps: readonly { tokenOut: Address; quotedOut: bigint }[];
}): { desiredA: bigint; desiredB: bigint } {
  let desiredA = BigInt(0);
  let desiredB = BigInt(0);

  if (params.retainUsdc > BigInt(0)) {
    if (params.tokenA === params.usdc) desiredA += params.retainUsdc;
    else if (params.tokenB === params.usdc) desiredB += params.retainUsdc;
    else {
      throw new QuotePlanError(
        "INVALID_POOL_CONFIG",
        "retainUsdc requires USDC as tokenA or tokenB",
      );
    }
  }

  for (const swap of params.swaps) {
    if (swap.quotedOut <= BigInt(0)) {
      throw new QuotePlanError("ZERO_QUOTE", "swap quotedOut must be > 0 for LP desired amount");
    }
    if (params.tokenA === swap.tokenOut) desiredA += swap.quotedOut;
    else if (params.tokenB === swap.tokenOut) desiredB += swap.quotedOut;
    else {
      throw new QuotePlanError(
        "INVALID_POOL_CONFIG",
        `tokenOut ${swap.tokenOut} is neither tokenA nor tokenB`,
      );
    }
  }

  if (desiredA <= BigInt(0) || desiredB <= BigInt(0)) {
    throw new QuotePlanError(
      "INVALID_AMOUNT_MIN",
      `Leg desired amounts must both be > 0 (got A=${desiredA} B=${desiredB})`,
    );
  }
  return { desiredA, desiredB };
}

export function netUsdcAfterSwapFee(grossUsdcIn: bigint): bigint {
  return grossUsdcIn - (grossUsdcIn * SWAP_FEE_BPS) / BPS_DENOMINATOR;
}

/** One of the eight deterministic swap quote requests for a deposit. */
export type FivePoolSwapQuoteRequest = {
  slotId: FivePoolSwapSlotId;
  legIndex: number;
  swapIndex: number;
  routeKey: StableClubSwapRouteKey;
  tokenOut: Address;
  tokenOutSymbol: "cbBTC" | "WETH";
  decimalsOut: number;
  grossUsdcIn: bigint;
  netUsdcIn: bigint;
};

/**
 * Derive the eight swap quote sizing requests from a gross USDC deposit.
 * Quotes must be fetched for `netUsdcIn` (after 1% fee), matching fork oracleQuote.
 */
export function buildFivePoolSwapQuoteRequests(grossUsdc: bigint): FivePoolSwapQuoteRequest[] {
  const { legBudgets } = allocateFivePoolBudgets(grossUsdc);
  const requests: FivePoolSwapQuoteRequest[] = [];
  for (let i = 0; i < FIVE_POOL_LEG_COUNT; i++) {
    const spec = LEG_SWAP_SPECS[i]!;
    const { swapGrosses } = splitLegUsdc(legBudgets[i]!, spec.dualSwap);
    for (let s = 0; s < spec.swaps.length; s++) {
      const swapSpec = spec.swaps[s]!;
      const grossUsdcIn = swapGrosses[s]!;
      requests.push({
        slotId: swapSpec.slotId,
        legIndex: i,
        swapIndex: s,
        routeKey: swapSpec.routeKey,
        tokenOut: swapSpec.tokenOut.address,
        tokenOutSymbol: swapSpec.tokenOut.symbol as "cbBTC" | "WETH",
        decimalsOut: swapSpec.tokenOut.decimals,
        grossUsdcIn,
        netUsdcIn: netUsdcAfterSwapFee(grossUsdcIn),
      });
    }
  }
  if (requests.length !== EXPECTED_SWAP_COUNT) {
    throw new QuotePlanError(
      "INVALID_POOL_CONFIG",
      `Expected ${EXPECTED_SWAP_COUNT} quote requests, got ${requests.length}`,
    );
  }
  for (let i = 0; i < EXPECTED_SWAP_COUNT; i++) {
    if (requests[i]!.slotId !== FIVE_POOL_SWAP_SLOT_ORDER[i]) {
      throw new QuotePlanError("INVALID_POOL_CONFIG", "Quote request order is not deterministic");
    }
  }
  return requests;
}

/**
 * Split gross USDC into five equal 20% leg budgets.
 * Rejects amounts that leave remainder after five floor divisions (contract requires exact sum).
 */
export function allocateFivePoolBudgets(grossUsdc: bigint): {
  legBudgets: bigint[];
  allocationDust: bigint;
} {
  if (grossUsdc <= BigInt(0)) {
    throw new QuotePlanError("ZERO_DEPOSIT", "grossUsdc must be > 0");
  }
  const legBudgets: bigint[] = [];
  let allocated = BigInt(0);
  for (let i = 0; i < FIVE_POOL_LEG_COUNT; i++) {
    const leg = legDepositAmount(grossUsdc, i);
    if (leg <= BigInt(0)) {
      throw new QuotePlanError("ZERO_DEPOSIT", `Leg ${i} budget is zero`);
    }
    legBudgets.push(leg);
    allocated += leg;
  }
  const allocationDust = grossUsdc - allocated;
  if (allocationDust !== BigInt(0)) {
    throw new QuotePlanError(
      "DEPOSIT_NOT_EXACTLY_ALLOCATABLE",
      `grossUsdc ${grossUsdc} leaves dust ${allocationDust} after ${FIVE_POOL_ALLOCATION_BPS_PER_LEG} bps × 5 (must be exactly divisible)`,
    );
  }
  if (allocated !== grossUsdc) {
    throw new QuotePlanError("BUDGET_OVERFLOW", "Allocated sum exceeds deposit");
  }
  return { legBudgets, allocationDust };
}

/**
 * Within a leg: assign USDC so retain + swap grosses === legBudget exactly.
 * Remainder (odd units) goes to retain (single) or the second swap (dual).
 */
export function splitLegUsdc(
  legBudget: bigint,
  dualSwap: boolean,
): { retainUsdc: bigint; swapGrosses: bigint[] } {
  if (legBudget <= BigInt(1)) {
    throw new QuotePlanError("ZERO_DEPOSIT", "Leg budget too small to split");
  }
  if (!dualSwap) {
    const swapGross = legBudget / BigInt(2);
    const retainUsdc = legBudget - swapGross;
    if (swapGross <= BigInt(0) || retainUsdc <= BigInt(0)) {
      throw new QuotePlanError("ZERO_DEPOSIT", "Single-swap leg split produced zero");
    }
    if (retainUsdc + swapGross !== legBudget) {
      throw new QuotePlanError("BUDGET_OVERFLOW", "Single-swap split mismatch");
    }
    return { retainUsdc, swapGrosses: [swapGross] };
  }
  const first = legBudget / BigInt(2);
  const second = legBudget - first;
  if (first <= BigInt(0) || second <= BigInt(0)) {
    throw new QuotePlanError("ZERO_DEPOSIT", "Dual-swap leg split produced zero");
  }
  if (first + second !== legBudget) {
    throw new QuotePlanError("BUDGET_OVERFLOW", "Dual-swap split mismatch");
  }
  return { retainUsdc: BigInt(0), swapGrosses: [first, second] };
}

function requireCatalogue(): readonly OfficialStableClubPool[] {
  const pools = OFFICIAL_STABLE_CLUB_BASE_POOLS;
  if (pools.length !== FIVE_POOL_LEG_COUNT) {
    throw new QuotePlanError("INVALID_POOL_CONFIG", "Catalogue must have exactly five pools");
  }
  for (const pool of pools) {
    if (!isPoolResolvable(pool)) {
      throw new QuotePlanError(
        "INVALID_POOL_CONFIG",
        `Pool ${pool.id} is not resolvable`,
      );
    }
  }
  return pools;
}

function requireQuote(
  quotes: BuildFivePoolQuotePlanInput["quotes"],
  slotId: FivePoolSwapSlotId,
  nowSec: number,
  maxQuoteAgeSec: number,
): SwapQuoteInput {
  const q = quotes[slotId];
  if (!q) {
    throw new QuotePlanError("MISSING_QUOTE", `Missing quote for ${slotId}`);
  }
  if (q.quotedOut <= BigInt(0)) {
    throw new QuotePlanError("ZERO_QUOTE", `quotedOut is zero for ${slotId}`);
  }
  if (!Number.isFinite(q.quotedAtSec) || !Number.isInteger(q.quotedAtSec)) {
    throw new QuotePlanError("STALE_QUOTE", `Invalid quotedAtSec for ${slotId}`);
  }
  if (maxQuoteAgeSec < 0 || !Number.isFinite(maxQuoteAgeSec)) {
    throw new QuotePlanError("STALE_QUOTE", "Invalid maxQuoteAgeSec");
  }
  if (nowSec < q.quotedAtSec) {
    throw new QuotePlanError("STALE_QUOTE", `Quote ${slotId} is from the future`);
  }
  if (nowSec - q.quotedAtSec > maxQuoteAgeSec) {
    throw new QuotePlanError(
      "STALE_QUOTE",
      `Quote ${slotId} age ${nowSec - q.quotedAtSec}s exceeds max ${maxQuoteAgeSec}s`,
    );
  }
  return q;
}

/**
 * Build a deterministic five-pool / eight-swap deposit plan.
 * Pure: no RPC, no quote fetching.
 */
export function buildFivePoolQuotePlan(input: BuildFivePoolQuotePlanInput): FivePoolQuotePlan {
  const pools = requireCatalogue();

  if (input.grossUsdc <= BigInt(0)) {
    throw new QuotePlanError("ZERO_DEPOSIT", "grossUsdc must be > 0");
  }

  // Deposit token is USDC-only (6 decimals).
  if (STABLE_CLUB_USDC_DECIMALS !== 6 || BASE_TOKENS.USDC.decimals !== 6) {
    throw new QuotePlanError("UNSUPPORTED_TOKEN", "USDC decimals must be 6");
  }

  if (input.adapters.length !== FIVE_POOL_LEG_COUNT) {
    throw new QuotePlanError("INVALID_ADAPTERS", "Exactly five adapters required");
  }
  for (let i = 0; i < FIVE_POOL_LEG_COUNT; i++) {
    const a = input.adapters[i];
    if (!a || a === "0x0000000000000000000000000000000000000000") {
      throw new QuotePlanError("INVALID_ADAPTERS", `Adapter ${i} is zero/missing`);
    }
  }

  if (input.currentTicks.length !== FIVE_POOL_LEG_COUNT) {
    throw new QuotePlanError("INVALID_TICKS", "Exactly five currentTicks required");
  }

  if (input.slippageBps <= BigInt(0) || input.slippageBps > QUOTE_PLAN_MAX_SLIPPAGE_BPS) {
    throw new QuotePlanError(
      "INVALID_SLIPPAGE",
      `slippageBps must be in (0, ${QUOTE_PLAN_MAX_SLIPPAGE_BPS}]`,
    );
  }
  if (input.lpSlippageBps <= BigInt(0) || input.lpSlippageBps > QUOTE_PLAN_MAX_SLIPPAGE_BPS) {
    throw new QuotePlanError(
      "INVALID_LP_SLIPPAGE",
      `lpSlippageBps must be in (0, ${QUOTE_PLAN_MAX_SLIPPAGE_BPS}]`,
    );
  }

  if (!Number.isFinite(input.nowSec) || !Number.isInteger(input.nowSec) || input.nowSec < 0) {
    throw new QuotePlanError("INVALID_DEADLINE", "nowSec must be a non-negative integer");
  }
  if (input.deadline <= BigInt(input.nowSec)) {
    throw new QuotePlanError("INVALID_DEADLINE", "deadline must be > nowSec");
  }

  const rangeSpacings = input.tickRangeSpacings ?? DEFAULT_TICK_RANGE_SPACINGS;
  const { legBudgets, allocationDust } = allocateFivePoolBudgets(input.grossUsdc);

  const legs: DepositLegParams[] = [];
  const flatSwaps: PlannedSwapLeg[] = [];
  const legDesiredAmounts: { desiredA: bigint; desiredB: bigint }[] = [];
  let totalPlannedUsdc = BigInt(0);

  for (let i = 0; i < FIVE_POOL_LEG_COUNT; i++) {
    const pool = pools[i]!;
    const spec = LEG_SWAP_SPECS[i]!;
    const legBudget = legBudgets[i]!;
    const { retainUsdc, swapGrosses } = splitLegUsdc(legBudget, spec.dualSwap);

    if (swapGrosses.length !== spec.swaps.length) {
      throw new QuotePlanError("INVALID_POOL_CONFIG", `Leg ${i} swap count mismatch`);
    }

    const spacing = tickSpacingForPool(pool);
    const { tickLower, tickUpper } = computeTickRange(
      input.currentTicks[i]!,
      spacing,
      rangeSpacings,
    );

    const swapInstructions: SwapInstructionParams[] = [];
    const swapDesiredParts: { tokenOut: Address; quotedOut: bigint }[] = [];
    let plannedUsdc = retainUsdc;

    for (let s = 0; s < spec.swaps.length; s++) {
      const swapSpec = spec.swaps[s]!;
      const grossUsdcIn = swapGrosses[s]!;
      const quote = requireQuote(
        input.quotes,
        swapSpec.slotId,
        input.nowSec,
        input.maxQuoteAgeSec,
      );
      const minOut = minOutFromQuote(quote.quotedOut, input.slippageBps);
      const routeId = STABLE_CLUB_SWAP_ROUTE_IDS[swapSpec.routeKey];
      const instruction: SwapInstructionParams = {
        routeId,
        grossUsdcIn,
        minOut,
        quotedOut: quote.quotedOut,
        deadline: input.deadline,
      };
      swapInstructions.push(instruction);
      plannedUsdc += grossUsdcIn;
      swapDesiredParts.push({
        tokenOut: swapSpec.tokenOut.address,
        quotedOut: quote.quotedOut,
      });

      flatSwaps.push({
        slotId: swapSpec.slotId,
        legIndex: i,
        swapIndex: s,
        routeKey: swapSpec.routeKey,
        routeId,
        tokenOut: swapSpec.tokenOut.address,
        tokenOutSymbol: swapSpec.tokenOut.symbol as "cbBTC" | "WETH",
        grossUsdcIn,
        netUsdcIn: netUsdcAfterSwapFee(grossUsdcIn),
        quotedOut: quote.quotedOut,
        minOut,
        deadline: input.deadline,
      });
    }

    if (plannedUsdc !== legBudget) {
      throw new QuotePlanError(
        "BUDGET_OVERFLOW",
        `Leg ${i} planned USDC ${plannedUsdc} != budget ${legBudget}`,
      );
    }
    totalPlannedUsdc += plannedUsdc;

    const desired = mapLegDesiredAmounts({
      tokenA: pool.tokenA.address,
      tokenB: pool.tokenB.address,
      usdc: BASE_TOKENS.USDC.address,
      retainUsdc,
      swaps: swapDesiredParts,
    });
    const amountAMin = applyLpSlippageMin(desired.desiredA, input.lpSlippageBps);
    const amountBMin = applyLpSlippageMin(desired.desiredB, input.lpSlippageBps);
    legDesiredAmounts.push(desired);

    while (swapInstructions.length < 2) {
      swapInstructions.push({ ...EMPTY_SWAP });
    }

    legs.push({
      legIndex: i,
      adapter: input.adapters[i]!,
      tokenA: pool.tokenA.address,
      tokenB: pool.tokenB.address,
      tickLower,
      tickUpper,
      retainUsdc,
      swaps: [swapInstructions[0]!, swapInstructions[1]!],
      swapCount: spec.swaps.length,
      amountAMin,
      amountBMin,
      slippageBps: input.slippageBps,
    });
  }

  if (flatSwaps.length !== EXPECTED_SWAP_COUNT) {
    throw new QuotePlanError(
      "INVALID_POOL_CONFIG",
      `Expected ${EXPECTED_SWAP_COUNT} swaps, got ${flatSwaps.length}`,
    );
  }
  for (let i = 0; i < EXPECTED_SWAP_COUNT; i++) {
    if (flatSwaps[i]!.slotId !== FIVE_POOL_SWAP_SLOT_ORDER[i]) {
      throw new QuotePlanError("INVALID_POOL_CONFIG", "Swap order is not deterministic");
    }
  }
  if (totalPlannedUsdc !== input.grossUsdc) {
    throw new QuotePlanError(
      "BUDGET_OVERFLOW",
      `Total planned ${totalPlannedUsdc} != gross ${input.grossUsdc}`,
    );
  }

  return {
    grossUsdc: input.grossUsdc,
    depositToken: BASE_TOKENS.USDC,
    poolIds: pools.map((p) => p.poolIdHash),
    legBudgets,
    allocationDust,
    legs,
    swaps: flatSwaps,
    legDesiredAmounts,
    slippageBps: input.slippageBps,
    lpSlippageBps: input.lpSlippageBps,
    deadline: input.deadline,
  };
}

/** Stable JSON for determinism checks (bigints as decimal strings). */
export function serializeQuotePlan(plan: FivePoolQuotePlan): string {
  return JSON.stringify(plan, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}
