/**
 * Exit-to-USDC planning helpers (Withdraw All → receive USDC only).
 * Normal UI must never call legacy exitAll (underlying tokens).
 */
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { BASE_TOKENS } from "@/lib/stable-club/official-pools";
import {
  STABLE_CLUB_SWAP_ROUTE_IDS,
  STABLE_CLUB_SWAP_ROUTE_LABELS,
} from "@/lib/stable-club/swap-routes";

export const EXIT_UNWIND_SLIPPAGE_BPS = BigInt(100); // 1% — must satisfy MevGuard slipFloor + impact band

export const MAX_EXIT_UNWIND_SWAPS = 8;

/** Reverse route labels (token → USDC). Must be configured on-chain before Base enablement. */
export const STABLE_CLUB_EXIT_UNWIND_ROUTE_LABELS = {
  CBBTC_USDC_UNI: "ROUTE_CBBTC_USDC_UNI_005",
  CBBTC_USDC_AERO_L: "ROUTE_CBBTC_USDC_AERO_LEGACY_100",
  WETH_USDC_UNI: "ROUTE_WETH_USDC_UNI_005",
  WETH_USDC_AERO_L: "ROUTE_WETH_USDC_AERO_LEGACY_100",
} as const;

export const STABLE_CLUB_EXIT_UNWIND_ROUTE_IDS = {
  CBBTC_USDC_UNI: keccak256(stringToHex(STABLE_CLUB_EXIT_UNWIND_ROUTE_LABELS.CBBTC_USDC_UNI)),
  CBBTC_USDC_AERO_L: keccak256(stringToHex(STABLE_CLUB_EXIT_UNWIND_ROUTE_LABELS.CBBTC_USDC_AERO_L)),
  WETH_USDC_UNI: keccak256(stringToHex(STABLE_CLUB_EXIT_UNWIND_ROUTE_LABELS.WETH_USDC_UNI)),
  WETH_USDC_AERO_L: keccak256(stringToHex(STABLE_CLUB_EXIT_UNWIND_ROUTE_LABELS.WETH_USDC_AERO_L)),
} as const;

export type ExitUnwindSwapPlan = {
  routeId: Hex;
  tokenIn: Address;
  tokenInSymbol: "cbBTC" | "WETH";
  amountIn: bigint;
  minOut: bigint;
  quotedOut: bigint;
  deadline: bigint;
};

export type ExitToUsdcPreview = {
  retainedUsdc: bigint;
  unwindSwaps: ExitUnwindSwapPlan[];
  estimatedUsdcOut: bigint;
  minUsdcOut: bigint;
  priceImpactBps: number;
  nonUsdcSymbols: string[];
};

export type PositionExitAmounts = {
  tokenA: Address;
  tokenB: Address;
  tokenASymbol: string;
  tokenBSymbol: string;
  amountA: bigint;
  amountB: bigint;
};

function normalizeSymbol(symbol: string): string {
  const s = symbol.trim();
  // Base catalogue uses cbBTC — never surface WBTC for the Coinbase token.
  if (s.toUpperCase() === "WBTC") return "cbBTC";
  return s;
}

function isUsdc(addr: Address): boolean {
  return addr.toLowerCase() === BASE_TOKENS.USDC.address.toLowerCase();
}

function isCbBtc(addr: Address): boolean {
  return addr.toLowerCase() === BASE_TOKENS.cbBTC.address.toLowerCase();
}

function isWeth(addr: Address): boolean {
  return addr.toLowerCase() === BASE_TOKENS.WETH.address.toLowerCase();
}

/** Aggregate closed-position proceeds by asset. */
export function aggregateExitProceeds(positions: PositionExitAmounts[]): {
  usdc: bigint;
  cbBtc: bigint;
  weth: bigint;
} {
  let usdc = BigInt(0);
  let cbBtc = BigInt(0);
  let weth = BigInt(0);
  for (const p of positions) {
    const add = (token: Address, amount: bigint) => {
      if (amount <= BigInt(0)) return;
      if (isUsdc(token)) usdc += amount;
      else if (isCbBtc(token)) cbBtc += amount;
      else if (isWeth(token)) weth += amount;
    };
    add(p.tokenA, p.amountA);
    add(p.tokenB, p.amountB);
  }
  return { usdc, cbBtc, weth };
}

export function applySlippageMin(
  quoted: bigint,
  slippageBps: bigint = EXIT_UNWIND_SLIPPAGE_BPS,
): bigint {
  if (quoted <= BigInt(0)) return BigInt(0);
  return (quoted * (BigInt(10_000) - slippageBps)) / BigInt(10_000);
}

/**
 * Build unwind swap plans from aggregated non-USDC balances.
 * `quoteTokenToUsdc` must return gross USDC out for the exact amountIn.
 */
export function buildExitToUsdcPreview(params: {
  positions: PositionExitAmounts[];
  quoteTokenToUsdc: (tokenIn: Address, amountIn: bigint) => bigint;
  deadline: bigint;
  preferredRoute?: "uni" | "aero";
  depositedUsdc?: bigint | null;
  /**
   * Pad unwind amountIn as % of estimate (100 = exact).
   * Primary executor delta-caps padded calldata (use 125).
   * Legacy executor spends calldata amountIn exactly (use 100).
   */
  amountInPadPercent?: number;
}): ExitToUsdcPreview {
  const { usdc, cbBtc, weth } = aggregateExitProceeds(params.positions);
  const preferred = params.preferredRoute ?? "uni";
  const padPercent = params.amountInPadPercent ?? 125;
  if (!Number.isFinite(padPercent) || padPercent < 100 || padPercent > 200) {
    throw new Error("amountInPadPercent must be in [100, 200]");
  }
  const unwindSwaps: ExitUnwindSwapPlan[] = [];
  let minUsdcFromUnwind = BigInt(0);

  const push = (
    symbol: "cbBTC" | "WETH",
    tokenIn: Address,
    amountIn: bigint,
    routeUni: Hex,
    routeAero: Hex,
  ) => {
    if (amountIn <= BigInt(0)) return;
    // Primary: pad calldata amountIn (executor delta-caps). Legacy: exact.
    const amountInMax =
      padPercent === 100
        ? amountIn
        : (amountIn * BigInt(padPercent)) / BigInt(100) + BigInt(1);
    const routeId = preferred === "aero" ? routeAero : routeUni;
    const quotedOut = params.quoteTokenToUsdc(tokenIn, amountInMax);
    if (quotedOut <= BigInt(0)) {
      throw new Error(`No USDC quote for ${symbol} unwind`);
    }
    unwindSwaps.push({
      routeId,
      tokenIn,
      tokenInSymbol: symbol,
      amountIn: amountInMax,
      quotedOut,
      minOut: applySlippageMin(quotedOut),
      deadline: params.deadline,
    });
    // Total minUsdcOut uses expected (unpadded) proceeds so pad does not inflate the floor.
    const quotedExact =
      amountInMax === amountIn ? quotedOut : params.quoteTokenToUsdc(tokenIn, amountIn);
    if (quotedExact <= BigInt(0)) {
      throw new Error(`No exact USDC quote for ${symbol} unwind floor`);
    }
    minUsdcFromUnwind += applySlippageMin(quotedExact);
  };

  push(
    "cbBTC",
    BASE_TOKENS.cbBTC.address,
    cbBtc,
    STABLE_CLUB_EXIT_UNWIND_ROUTE_IDS.CBBTC_USDC_UNI,
    STABLE_CLUB_EXIT_UNWIND_ROUTE_IDS.CBBTC_USDC_AERO_L,
  );
  push(
    "WETH",
    BASE_TOKENS.WETH.address,
    weth,
    STABLE_CLUB_EXIT_UNWIND_ROUTE_IDS.WETH_USDC_UNI,
    STABLE_CLUB_EXIT_UNWIND_ROUTE_IDS.WETH_USDC_AERO_L,
  );

  if (unwindSwaps.length > MAX_EXIT_UNWIND_SWAPS) {
    throw new Error("Too many unwind swaps");
  }

  const unwindUsdc = unwindSwaps.reduce((acc, s) => acc + s.quotedOut, BigInt(0));
  const estimatedUsdcOut = usdc + unwindUsdc;
  const minUsdcOut = usdc + minUsdcFromUnwind;

  let priceImpactBps = 0;
  if (
    params.depositedUsdc &&
    params.depositedUsdc > BigInt(0) &&
    estimatedUsdcOut > BigInt(0)
  ) {
    const dep = params.depositedUsdc;
    const delta = dep > estimatedUsdcOut ? dep - estimatedUsdcOut : estimatedUsdcOut - dep;
    priceImpactBps = Number((delta * BigInt(10_000)) / dep);
  }

  return {
    retainedUsdc: usdc,
    unwindSwaps,
    estimatedUsdcOut,
    minUsdcOut: minUsdcOut > BigInt(0) ? minUsdcOut : BigInt(1),
    priceImpactBps,
    nonUsdcSymbols: [
      ...(cbBtc > BigInt(0) ? ["cbBTC"] : []),
      ...(weth > BigInt(0) ? ["WETH"] : []),
    ].map(normalizeSymbol),
  };
}

export function padExitUnwindSwaps(
  swaps: ExitUnwindSwapPlan[],
): Array<{
  routeId: Hex;
  amountIn: bigint;
  minOut: bigint;
  quotedOut: bigint;
  deadline: bigint;
}> {
  const out = swaps.map((s) => ({
    routeId: s.routeId,
    amountIn: s.amountIn,
    minOut: s.minOut,
    quotedOut: s.quotedOut,
    deadline: s.deadline,
  }));
  while (out.length < MAX_EXIT_UNWIND_SWAPS) {
    out.push({
      routeId: "0x0000000000000000000000000000000000000000000000000000000000000000",
      amountIn: BigInt(0),
      minOut: BigInt(0),
      quotedOut: BigInt(0),
      deadline: BigInt(0),
    });
  }
  return out.slice(0, MAX_EXIT_UNWIND_SWAPS);
}

/** Live Base has deposit routes only; reverse routes + new executor fn required. */
export function isExitAllToUsdcAvailable(deployments: {
  network?: string;
  features?: { exitAllToUsdc?: boolean; exitPercentToUsdc?: boolean };
} | null): boolean {
  if (!deployments) return false;
  if (deployments.features?.exitAllToUsdc === true) return true;
  if (deployments.network === "hardhat-local") return true;
  return false;
}

/**
 * Partial % (1–99) atomic USDC exit — requires both feature flags.
 * Keep false on live Base until Safe cutover enables exitPercentToUsdc.
 */
export function isExitPercentToUsdcAvailable(deployments: {
  network?: string;
  features?: { exitAllToUsdc?: boolean; exitPercentToUsdc?: boolean };
} | null): boolean {
  if (!deployments) return false;
  return (
    deployments.features?.exitAllToUsdc === true &&
    deployments.features?.exitPercentToUsdc === true
  );
}

/** Re-export — gateway paths are opt-in via split withdraw/deposit flags + address pin. */
export {
  isOpsGatewayAvailable,
  isOpsGatewayWithdrawAvailable,
  isOpsGatewayDepositAvailable,
} from "@/lib/stable-club/ops-gateway";

/** Re-export deposit route ids for symmetry checks in tests. */
export const DEPOSIT_ROUTE_IDS = STABLE_CLUB_SWAP_ROUTE_IDS;
export const DEPOSIT_ROUTE_LABELS = STABLE_CLUB_SWAP_ROUTE_LABELS;
