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

export const EXIT_UNWIND_SLIPPAGE_BPS = 100n; // 1%
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
  let usdc = 0n;
  let cbBtc = 0n;
  let weth = 0n;
  for (const p of positions) {
    const add = (token: Address, amount: bigint) => {
      if (amount <= 0n) return;
      if (isUsdc(token)) usdc += amount;
      else if (isCbBtc(token)) cbBtc += amount;
      else if (isWeth(token)) weth += amount;
    };
    add(p.tokenA, p.amountA);
    add(p.tokenB, p.amountB);
  }
  return { usdc, cbBtc, weth };
}

export function applySlippageMin(quoted: bigint, slippageBps: bigint = EXIT_UNWIND_SLIPPAGE_BPS): bigint {
  if (quoted <= 0n) return 0n;
  return (quoted * (10_000n - slippageBps)) / 10_000n;
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
}): ExitToUsdcPreview {
  const { usdc, cbBtc, weth } = aggregateExitProceeds(params.positions);
  const preferred = params.preferredRoute ?? "uni";
  const unwindSwaps: ExitUnwindSwapPlan[] = [];

  const push = (
    symbol: "cbBTC" | "WETH",
    tokenIn: Address,
    amountIn: bigint,
    routeUni: Hex,
    routeAero: Hex,
  ) => {
    if (amountIn <= 0n) return;
    const routeId = preferred === "aero" ? routeAero : routeUni;
    const quotedOut = params.quoteTokenToUsdc(tokenIn, amountIn);
    if (quotedOut <= 0n) {
      throw new Error(`No USDC quote for ${symbol} unwind`);
    }
    unwindSwaps.push({
      routeId,
      tokenIn,
      tokenInSymbol: symbol,
      amountIn,
      quotedOut,
      minOut: applySlippageMin(quotedOut),
      deadline: params.deadline,
    });
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

  const unwindUsdc = unwindSwaps.reduce((acc, s) => acc + s.quotedOut, 0n);
  const estimatedUsdcOut = usdc + unwindUsdc;
  const minUsdcOut = usdc + unwindSwaps.reduce((acc, s) => acc + s.minOut, 0n);

  let priceImpactBps = 0;
  if (params.depositedUsdc && params.depositedUsdc > 0n && estimatedUsdcOut > 0n) {
    const dep = params.depositedUsdc;
    const delta = dep > estimatedUsdcOut ? dep - estimatedUsdcOut : estimatedUsdcOut - dep;
    priceImpactBps = Number((delta * 10_000n) / dep);
  }

  return {
    retainedUsdc: usdc,
    unwindSwaps,
    estimatedUsdcOut,
    minUsdcOut: minUsdcOut > 0n ? minUsdcOut : 1n,
    priceImpactBps,
    nonUsdcSymbols: [
      ...(cbBtc > 0n ? ["cbBTC"] : []),
      ...(weth > 0n ? ["WETH"] : []),
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
      amountIn: 0n,
      minOut: 0n,
      quotedOut: 0n,
      deadline: 0n,
    });
  }
  return out.slice(0, MAX_EXIT_UNWIND_SWAPS);
}

/** Live Base has deposit routes only; reverse routes + new executor fn required. */
export function isExitAllToUsdcAvailable(deployments: {
  network?: string;
  features?: { exitAllToUsdc?: boolean };
} | null): boolean {
  if (!deployments) return false;
  if (deployments.features?.exitAllToUsdc === true) return true;
  if (deployments.network === "hardhat-local") return true;
  return false;
}

/** Re-export deposit route ids for symmetry checks in tests. */
export const DEPOSIT_ROUTE_IDS = STABLE_CLUB_SWAP_ROUTE_IDS;
export const DEPOSIT_ROUTE_LABELS = STABLE_CLUB_SWAP_ROUTE_LABELS;
