/**
 * Five-pool deposit validation, preview, and contract-arg assembly.
 * Permit2 sequence (verified): USDC.approve(Permit2) → Permit2.approve(CL executor) → depositFivePoolStrategy.
 */
import { parseUnits, type Hex } from "viem";
import { STABLE_CLUB_EXECUTION_FEE_BPS, STABLE_CLUB_USDC_DECIMALS } from "@/lib/stable-club/constants";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS, BASE_TOKENS } from "@/lib/stable-club/official-pools";
import {
  FIVE_POOL_ALLOCATION_BPS_PER_LEG,
  FIVE_POOL_LEG_COUNT,
} from "@/lib/stable-club/five-pool-strategy";
import {
  QUOTE_PLAN_MAX_SLIPPAGE_BPS,
  QuotePlanError,
  allocateFivePoolBudgets,
  type DepositLegParams,
  type FivePoolQuotePlan,
  type SwapQuoteInput,
  type FivePoolSwapSlotId,
} from "@/lib/stable-club/quote-plan";
import {
  assertLiveQuoteSourceForSubmission,
  type FivePoolQuoteBundle,
  type QuoteSourceKind,
} from "@/lib/stable-club/five-pool-quotes";
import type { Phase2aAdapterDeployment } from "@/lib/stable-club/phase2a-deployments";

export const FIVE_POOL_DEFAULT_SWAP_SLIPPAGE_BPS = BigInt(100);
export const FIVE_POOL_DEFAULT_LP_SLIPPAGE_BPS = BigInt(100);
export const FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC = 90;
export const FIVE_POOL_DEFAULT_DEADLINE_SEC = 3600;
/**
 * SC-F10 — minimum remaining quote/deadline validity required before any
 * executable wallet write (approval or deposit). Prevents starting a tx when
 * the plan would expire during/immediately after confirmation.
 */
export const FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC = 30;
export const FIVE_POOL_MIN_USDC_HUMAN = PRIVATE_BETA_LAUNCH_PARAMS.capsUsd.minimumPosition;

export type FivePoolDepositProgress =
  | "idle"
  | "preparing-quotes"
  | "awaiting-approval"
  | "awaiting-deposit"
  | "confirmed"
  | "failed";

export type ParsedUsdcAmount =
  | { ok: true; grossUsdc: bigint; human: string }
  | { ok: false; code: string; message: string };

export function parseUsdcDepositInput(raw: string): ParsedUsdcAmount {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, code: "EMPTY", message: "Enter a USDC amount" };
  }
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    return {
      ok: false,
      code: "INVALID_FORMAT",
      message: "Use a non-negative USDC amount with up to 6 decimals",
    };
  }
  let grossUsdc: bigint;
  try {
    grossUsdc = parseUnits(trimmed, STABLE_CLUB_USDC_DECIMALS);
  } catch {
    return { ok: false, code: "INVALID_FORMAT", message: "Invalid USDC amount" };
  }
  if (grossUsdc <= BigInt(0)) {
    return { ok: false, code: "ZERO", message: "Deposit amount must be greater than zero" };
  }
  const minUnits = parseUnits(String(FIVE_POOL_MIN_USDC_HUMAN), STABLE_CLUB_USDC_DECIMALS);
  if (grossUsdc < minUnits) {
    return {
      ok: false,
      code: "BELOW_MINIMUM",
      message: `Minimum deposit is ${FIVE_POOL_MIN_USDC_HUMAN} USDC`,
    };
  }
  try {
    allocateFivePoolBudgets(grossUsdc);
  } catch (e) {
    if (e instanceof QuotePlanError && e.code === "DEPOSIT_NOT_EXACTLY_ALLOCATABLE") {
      return {
        ok: false,
        code: "NOT_ALLOCATABLE",
        message: "Amount must allocate exactly 20% to each of five pools (no remainder)",
      };
    }
    if (e instanceof QuotePlanError) {
      return { ok: false, code: e.code, message: e.message };
    }
    throw e;
  }
  return { ok: true, grossUsdc, human: trimmed };
}

export function validateSlippageBps(raw: string, label: string): { ok: true; bps: bigint } | { ok: false; message: string } {
  if (!/^\d+$/.test(raw.trim())) {
    return { ok: false, message: `${label} must be an integer in basis points` };
  }
  const bps = BigInt(raw.trim());
  if (bps <= BigInt(0) || bps > QUOTE_PLAN_MAX_SLIPPAGE_BPS) {
    return {
      ok: false,
      message: `${label} must be in (0, ${QUOTE_PLAN_MAX_SLIPPAGE_BPS}] bps`,
    };
  }
  return { ok: true, bps };
}

export type FivePoolPreviewRow = {
  legIndex: number;
  poolId: string;
  poolLabel: string;
  allocationBps: number;
  allocationUsdc: bigint;
  tokenASymbol: string;
  tokenBSymbol: string;
  desiredA: bigint;
  desiredB: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
};

export type FivePoolDepositPreview = {
  grossUsdc: bigint;
  feeBps: number;
  feeLabel: string;
  swapSlippageBps: bigint;
  lpSlippageBps: bigint;
  deadline: bigint;
  quotedAtSec: number;
  maxQuoteAgeSec: number;
  quoteSource: QuoteSourceKind;
  pools: FivePoolPreviewRow[];
  swaps: {
    slotId: string;
    legIndex: number;
    routeKey: string;
    tokenOutSymbol: string;
    grossUsdcIn: bigint;
    netUsdcIn: bigint;
    quotedOut: bigint;
    minOut: bigint;
  }[];
  messaging: {
    nonCustodial: string;
    revocable: string;
  };
};

export function buildDepositPreview(params: {
  plan: FivePoolQuotePlan;
  quotedAtSec: number;
  maxQuoteAgeSec: number;
  quoteSource: QuoteSourceKind;
}): FivePoolDepositPreview {
  const pools: FivePoolPreviewRow[] = params.plan.legs.map((leg, i) => {
    const catalogue = OFFICIAL_STABLE_CLUB_BASE_POOLS[i]!;
    const desired = params.plan.legDesiredAmounts[i]!;
    return {
      legIndex: i,
      poolId: catalogue.id,
      poolLabel: catalogue.label,
      allocationBps: FIVE_POOL_ALLOCATION_BPS_PER_LEG,
      allocationUsdc: params.plan.legBudgets[i]!,
      tokenASymbol: catalogue.tokenA.symbol,
      tokenBSymbol: catalogue.tokenB.symbol,
      desiredA: desired.desiredA,
      desiredB: desired.desiredB,
      amountAMin: leg.amountAMin,
      amountBMin: leg.amountBMin,
    };
  });
  return {
    grossUsdc: params.plan.grossUsdc,
    feeBps: STABLE_CLUB_EXECUTION_FEE_BPS,
    feeLabel: `${STABLE_CLUB_EXECUTION_FEE_BPS / 100}% execution fee on each swap (retained USDC is not fee-charged)`,
    swapSlippageBps: params.plan.slippageBps,
    lpSlippageBps: params.plan.lpSlippageBps,
    deadline: params.plan.deadline,
    quotedAtSec: params.quotedAtSec,
    maxQuoteAgeSec: params.maxQuoteAgeSec,
    quoteSource: params.quoteSource,
    pools,
    swaps: params.plan.swaps.map((s) => ({
      slotId: s.slotId,
      legIndex: s.legIndex,
      routeKey: s.routeKey,
      tokenOutSymbol: s.tokenOutSymbol,
      grossUsdcIn: s.grossUsdcIn,
      netUsdcIn: s.netUsdcIn,
      quotedOut: s.quotedOut,
      minOut: s.minOut,
    })),
    messaging: {
      nonCustodial:
        "Non-custodial: USDC stays in your wallet until you sign Permit2 allowances and the deposit transaction. INDEXLA never holds your keys.",
      revocable:
        "Permissions are revocable: you can revoke strategy permissions and Permit2 allowances at any time. Bounded allowances expire automatically.",
    },
  };
}

export function assertQuotesFreshForSubmission(params: {
  quotes: Readonly<Partial<Record<FivePoolSwapSlotId, SwapQuoteInput>>>;
  nowSec: number;
  maxQuoteAgeSec: number;
}): void {
  for (const [slot, q] of Object.entries(params.quotes)) {
    if (!q) {
      throw new QuotePlanError("MISSING_QUOTE", `Missing quote for ${slot}`);
    }
    if (params.nowSec < q.quotedAtSec) {
      throw new QuotePlanError("STALE_QUOTE", `Quote ${slot} is from the future — refresh required`);
    }
    if (params.nowSec - q.quotedAtSec > params.maxQuoteAgeSec) {
      throw new QuotePlanError(
        "STALE_QUOTE",
        `Quote ${slot} expired — refresh quotes before signing`,
      );
    }
  }
}

/**
 * SC-F10 — fail closed unless quotes and deadline retain at least
 * `minRemainingSec` of validity from `nowSec` (default:
 * FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC).
 */
export function assertExecutableQuotePlanValidity(params: {
  quotes: Readonly<Partial<Record<FivePoolSwapSlotId, SwapQuoteInput>>>;
  deadline: bigint;
  nowSec: number;
  maxQuoteAgeSec: number;
  minRemainingSec?: number;
}): void {
  const minRemaining =
    params.minRemainingSec ?? FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC;
  if (
    !Number.isFinite(minRemaining) ||
    minRemaining < 0 ||
    !Number.isInteger(minRemaining)
  ) {
    throw new QuotePlanError("STALE_QUOTE", "Invalid minRemainingSec for executable quotes");
  }
  if (params.maxQuoteAgeSec < minRemaining) {
    throw new QuotePlanError(
      "STALE_QUOTE",
      `Quote max age ${params.maxQuoteAgeSec}s is below executable buffer ${minRemaining}s — refresh quotes`,
    );
  }
  assertQuotesFreshForSubmission({
    quotes: params.quotes,
    nowSec: params.nowSec,
    maxQuoteAgeSec: params.maxQuoteAgeSec - minRemaining,
  });
  const deadlineSec = Number(params.deadline);
  if (!Number.isFinite(deadlineSec)) {
    throw new QuotePlanError("INVALID_DEADLINE", "Invalid deposit deadline");
  }
  if (deadlineSec - params.nowSec < minRemaining) {
    throw new QuotePlanError(
      "INVALID_DEADLINE",
      `Deposit deadline remaining validity below ${minRemaining}s — refresh plan`,
    );
  }
}

/**
 * SC-F10 — one approval write gated by executable quote TTL before and after
 * successful receipt confirmation (SC-F01). Does not auto-retry or re-quote.
 */
export async function runQuoteTtlGuardedApproval(params: {
  nowSec: () => number;
  assertExecutable: (nowSec: number) => void;
  writeApproval: () => Promise<Hex>;
  waitForSuccess: (hash: Hex) => Promise<unknown>;
}): Promise<Hex> {
  params.assertExecutable(params.nowSec());
  const hash = await params.writeApproval();
  await params.waitForSuccess(hash);
  params.assertExecutable(params.nowSec());
  return hash;
}

/**
 * SC-F10 — sequential Permit2 approval steps with TTL rechecks.
 * Pass `null` for a step to skip it (existing on-chain allowance still usable).
 */
export async function runFivePoolDepositApprovalSequence(params: {
  nowSec: () => number;
  quotes: Readonly<Partial<Record<FivePoolSwapSlotId, SwapQuoteInput>>>;
  deadline: bigint;
  maxQuoteAgeSec: number;
  minRemainingSec?: number;
  erc20Approve: (() => Promise<Hex>) | null;
  permit2Approve: (() => Promise<Hex>) | null;
  waitForSuccess: (hash: Hex) => Promise<unknown>;
}): Promise<Hex[]> {
  const minRemaining =
    params.minRemainingSec ?? FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC;
  const assertExecutable = (atSec: number) => {
    assertExecutableQuotePlanValidity({
      quotes: params.quotes,
      deadline: params.deadline,
      nowSec: atSec,
      maxQuoteAgeSec: params.maxQuoteAgeSec,
      minRemainingSec: minRemaining,
    });
  };

  const hashes: Hex[] = [];
  if (params.erc20Approve) {
    hashes.push(
      await runQuoteTtlGuardedApproval({
        nowSec: params.nowSec,
        assertExecutable,
        writeApproval: params.erc20Approve,
        waitForSuccess: params.waitForSuccess,
      }),
    );
  }
  if (params.permit2Approve) {
    hashes.push(
      await runQuoteTtlGuardedApproval({
        nowSec: params.nowSec,
        assertExecutable,
        writeApproval: params.permit2Approve,
        waitForSuccess: params.waitForSuccess,
      }),
    );
  }
  return hashes;
}

/** Remap catalogue token addresses onto deployment adapter bindings for contract submission. */
export function remapPlanLegsToAdapters(
  plan: FivePoolQuotePlan,
  adapters: readonly Phase2aAdapterDeployment[],
): DepositLegParams[] {
  if (adapters.length !== FIVE_POOL_LEG_COUNT) {
    throw new Error("Exactly five adapters required");
  }
  return plan.legs.map((leg, i) => {
    const a = adapters[i]!;
    if (a.poolId.toLowerCase() !== plan.poolIds[i]!.toLowerCase()) {
      throw new Error(`Adapter poolId mismatch at leg ${i}`);
    }
    return {
      ...leg,
      adapter: a.adapter,
      tokenA: a.tokenA,
      tokenB: a.tokenB,
    };
  });
}

export type DepositFivePoolStrategyArgs = {
  strategyId: Hex;
  executionNonce: bigint;
  grossUsdc: bigint;
  poolIds: readonly [Hex, Hex, Hex, Hex, Hex];
  deadline: bigint;
  legs: DepositLegParams[];
};

export function buildDepositFivePoolStrategyArgs(params: {
  plan: FivePoolQuotePlan;
  adapters: readonly Phase2aAdapterDeployment[];
  strategyId: Hex;
  executionNonce: bigint;
  quoteBundle: FivePoolQuoteBundle;
  nowSec: number;
  maxQuoteAgeSec: number;
  /** When true (production UI), reject mock quote sources. */
  requireLiveQuotes: boolean;
  /** SC-F10 executable remaining-validity buffer (defaults to shared constant). */
  minRemainingSec?: number;
}): DepositFivePoolStrategyArgs {
  if (params.requireLiveQuotes) {
    assertLiveQuoteSourceForSubmission(params.quoteBundle.source);
  }
  assertExecutableQuotePlanValidity({
    quotes: params.quoteBundle.quotes,
    deadline: params.plan.deadline,
    nowSec: params.nowSec,
    maxQuoteAgeSec: params.maxQuoteAgeSec,
    minRemainingSec: params.minRemainingSec,
  });
  const legs = remapPlanLegsToAdapters(params.plan, params.adapters);
  const poolIds = params.plan.poolIds;
  if (poolIds.length !== 5) throw new Error("Expected 5 pool ids");
  return {
    strategyId: params.strategyId,
    executionNonce: params.executionNonce,
    grossUsdc: params.plan.grossUsdc,
    poolIds: [poolIds[0]!, poolIds[1]!, poolIds[2]!, poolIds[3]!, poolIds[4]!],
    deadline: params.plan.deadline,
    legs,
  };
}

export function explorerTxUrl(chainId: number, hash: Hex): string | null {
  if (chainId === 8453) return `https://basescan.org/tx/${hash}`;
  return null;
}

export function formatUsdcUnits(amount: bigint): string {
  const neg = amount < BigInt(0);
  const abs = neg ? -amount : amount;
  const whole = abs / BigInt(10 ** STABLE_CLUB_USDC_DECIMALS);
  const frac = abs % BigInt(10 ** STABLE_CLUB_USDC_DECIMALS);
  const fracStr = frac.toString().padStart(STABLE_CLUB_USDC_DECIMALS, "0").replace(/0+$/, "");
  const body = fracStr.length ? `${whole}.${fracStr}` : whole.toString();
  return neg ? `-${body}` : body;
}

export { BASE_TOKENS };
