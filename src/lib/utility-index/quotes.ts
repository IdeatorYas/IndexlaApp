/**
 * Off-chain quotes for IndexlaGateway4663 buy/sell (V2/V3/V4).
 * Slippage floors; never returns 0 minOut for a nonzero active amountIn.
 */
import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import { robinhood } from "viem/chains";
import { BASKET, INDEXLA_FEE_BPS, RH_CHAIN_ID, RH_RPC, V2_ROUTER, WETH } from "./constants";

export const QUOTER_V2 = "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7" as Address;
export const V4_QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94" as Address;
export const DEFAULT_SLIPPAGE_BPS = 100;

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const v2RouterAbi = parseAbi([
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
]);
const v4QuoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)",
]);

export type QuotedLeg = {
  symbol: string;
  venue: "v2" | "v3" | "v4";
  amountIn: bigint;
  quotedOut: bigint;
  amountOutMinimum: bigint;
};

export type SellQuoteBundle = {
  slippageBps: number;
  legs: QuotedLeg[];
  quotedGrossEth: bigint;
  minAmountOutEth: bigint;
  quotesOk: boolean;
  errors: string[];
};

export type BuyQuoteBundle = {
  slippageBps: number;
  investableEth: bigint;
  legs: QuotedLeg[];
  quotesOk: boolean;
  errors: string[];
  taxNotes: Record<string, string>;
  activeLegCount: number;
};

export const QUOTE_HEURISTICS = {
  defaultSlippageBps: DEFAULT_SLIPPAGE_BPS,
  v2ExtraSlippageBps: 50,
  multiLegImpactBps: 200,
} as const;

export function applySlippage(quoted: bigint, slippageBps: number): bigint {
  if (quoted === 0n) return 0n;
  const floor = (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
  return floor > 0n ? floor : 1n;
}

export function netAfterFee(grossEth: bigint): bigint {
  return grossEth - (grossEth * BigInt(INDEXLA_FEE_BPS)) / 10_000n;
}

function makeClient(rpcUrl = RH_RPC): PublicClient {
  return createPublicClient({
    chain: { ...robinhood, id: RH_CHAIN_ID },
    transport: http(rpcUrl, { timeout: 60_000 }),
  });
}

async function quoteV3(
  client: PublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number,
): Promise<bigint> {
  const result = await client.simulateContract({
    address: QUOTER_V2,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  return (result.result as [bigint, bigint, number, bigint])[0];
}

async function quoteV2Path(
  client: PublicClient,
  amountIn: bigint,
  path: Address[],
): Promise<bigint> {
  if (amountIn === 0n) return 0n;
  const amounts = await client.readContract({
    address: V2_ROUTER,
    abi: v2RouterAbi,
    functionName: "getAmountsOut",
    args: [amountIn, path],
  });
  return amounts[amounts.length - 1];
}

async function quoteV2Sell(
  client: PublicClient,
  tokenIn: Address,
  amountIn: bigint,
  fotTaxBps = 0,
): Promise<bigint> {
  let effectiveIn = amountIn;
  if (fotTaxBps > 0) {
    effectiveIn = (amountIn * BigInt(10_000 - fotTaxBps)) / 10_000n;
    effectiveIn = (effectiveIn * BigInt(10_000 - fotTaxBps)) / 10_000n;
  }
  return quoteV2Path(client, effectiveIn, [tokenIn, WETH]);
}

async function readPrismTaxBps(
  client: PublicClient,
  token: Address,
  side: "buy" | "sell",
): Promise<{ taxBps: number; source: string }> {
  const fn = side === "buy" ? "buyTaxRate" : "sellTaxRate";
  try {
    const tax = await client.readContract({
      address: token,
      abi: parseAbi([`function ${fn}() view returns (uint256)`]),
      functionName: fn as "buyTaxRate" | "sellTaxRate",
    });
    const n = Number(tax);
    if (!Number.isFinite(n) || n <= 0) return { taxBps: 800, source: `${fn}_zero_default800` };
    if (n <= 10_000) return { taxBps: Math.min(Math.max(n, 100), 2500), source: fn };
    return { taxBps: 800, source: `${fn}_oob_default800` };
  } catch {
    return { taxBps: 800, source: `${fn}_missing_default800` };
  }
}

async function quoteV4Exact(
  client: PublicClient,
  token: Address,
  amountIn: bigint,
  fee: number,
  tickSpacing: number,
  hooks: Address,
  zeroForOne: boolean,
): Promise<bigint> {
  const result = await client.simulateContract({
    address: V4_QUOTER,
    abi: v4QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: {
          currency0: "0x0000000000000000000000000000000000000000",
          currency1: token,
          fee,
          tickSpacing,
          hooks,
        },
        zeroForOne,
        exactAmount: amountIn,
        hookData: "0x",
      },
    ],
  });
  return (result.result as [bigint, bigint])[0];
}

export function basketQuoteTokens() {
  return BASKET.map((t) => ({
    symbol: t.symbol,
    address: t.address,
    venue: t.venue,
    fee: t.fee,
    tickSpacing: "tickSpacing" in t ? t.tickSpacing : undefined,
    weightBps: t.weightBps,
  }));
}

export async function quoteBuyLegs(params: {
  grossEth: bigint;
  slippageBps?: number;
  rpcUrl?: string;
  client?: PublicClient;
}): Promise<BuyQuoteBundle> {
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const client = params.client ?? makeClient(params.rpcUrl);
  const investable = netAfterFee(params.grossEth);
  const legs: QuotedLeg[] = [];
  const errors: string[] = [];
  const taxNotes: Record<string, string> = {};
  const tokens = basketQuoteTokens();

  for (const t of tokens) {
    const amountIn = (investable * BigInt(t.weightBps)) / 10_000n;
    if (amountIn === 0n) {
      legs.push({
        symbol: t.symbol,
        venue: t.venue,
        amountIn: 0n,
        quotedOut: 0n,
        amountOutMinimum: 0n,
      });
      continue;
    }
    try {
      let quotedOut: bigint;
      if (t.venue === "v3") {
        quotedOut = await quoteV3(client, WETH, t.address, amountIn, t.fee);
      } else if (t.venue === "v2") {
        quotedOut = await quoteV2Path(client, amountIn, [WETH, t.address]);
        if (t.symbol === "PRISM") {
          const fot = await readPrismTaxBps(client, t.address, "buy");
          taxNotes.PRISM_BUY = `${fot.source}=${fot.taxBps}`;
          quotedOut = (quotedOut * BigInt(10_000 - fot.taxBps)) / 10_000n;
        }
      } else {
        quotedOut = await quoteV4Exact(
          client,
          t.address,
          amountIn,
          t.fee,
          t.tickSpacing ?? 25,
          "0x0000000000000000000000000000000000000000",
          true,
        );
        if (t.symbol === "PROLOGUE") {
          taxNotes.PROLOGUE_V4 = "zeroForOne=true fee=2500 tickSpacing=25";
        }
      }
      if (quotedOut === 0n) errors.push(`${t.symbol}: buy quote returned 0`);
      const legSlippage = t.venue === "v2" ? slippageBps + 50 : slippageBps;
      const amountOutMinimum = applySlippage(quotedOut, legSlippage);
      if (amountOutMinimum === 0n) errors.push(`${t.symbol}: buy minOut collapsed to 0`);
      legs.push({
        symbol: t.symbol,
        venue: t.venue,
        amountIn,
        quotedOut,
        amountOutMinimum,
      });
    } catch (e) {
      errors.push(
        `${t.symbol}: ${e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160)}`,
      );
      legs.push({
        symbol: t.symbol,
        venue: t.venue,
        amountIn,
        quotedOut: 0n,
        amountOutMinimum: 0n,
      });
    }
  }

  const activeLegCount = legs.filter((l) => l.amountIn > 0n).length;
  if (params.grossEth > 0n && activeLegCount === 0) {
    errors.push(
      "Amount too small: after the 100 bps fee, every basket leg rounds to 0 wei (nothing would swap).",
    );
  }

  return {
    slippageBps,
    investableEth: investable,
    legs,
    quotesOk:
      errors.length === 0 && legs.every((l) => l.amountIn === 0n || l.amountOutMinimum > 0n),
    errors,
    taxNotes,
    activeLegCount,
  };
}

export async function quoteSellLegs(params: {
  amountIns: Record<string, bigint>;
  slippageBps?: number;
  rpcUrl?: string;
  client?: PublicClient;
}): Promise<SellQuoteBundle> {
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const client = params.client ?? makeClient(params.rpcUrl);
  const legs: QuotedLeg[] = [];
  const errors: string[] = [];
  let quotedGross = 0n;
  const tokens = basketQuoteTokens();

  for (const t of tokens) {
    const amountIn = params.amountIns[t.symbol] ?? 0n;
    if (amountIn === 0n) {
      legs.push({
        symbol: t.symbol,
        venue: t.venue,
        amountIn: 0n,
        quotedOut: 0n,
        amountOutMinimum: 0n,
      });
      continue;
    }
    try {
      let quotedOut: bigint;
      if (t.venue === "v3") {
        quotedOut = await quoteV3(client, t.address, WETH, amountIn, t.fee);
      } else if (t.venue === "v2") {
        const fot =
          t.symbol === "PRISM"
            ? await readPrismTaxBps(client, t.address, "sell")
            : { taxBps: 0, source: "none" };
        quotedOut = await quoteV2Sell(client, t.address, amountIn, fot.taxBps);
      } else {
        quotedOut = await quoteV4Exact(
          client,
          t.address,
          amountIn,
          t.fee,
          t.tickSpacing ?? 25,
          "0x0000000000000000000000000000000000000000",
          false,
        );
      }
      if (quotedOut === 0n) errors.push(`${t.symbol}: sell quote returned 0`);
      const legSlippage = t.venue === "v2" ? slippageBps + 50 : slippageBps;
      const amountOutMinimum = applySlippage(quotedOut, legSlippage);
      if (amountOutMinimum === 0n) errors.push(`${t.symbol}: sell minOut collapsed to 0`);
      legs.push({
        symbol: t.symbol,
        venue: t.venue,
        amountIn,
        quotedOut,
        amountOutMinimum,
      });
      quotedGross += quotedOut;
    } catch (e) {
      errors.push(
        `${t.symbol}: ${e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160)}`,
      );
      legs.push({
        symbol: t.symbol,
        venue: t.venue,
        amountIn,
        quotedOut: 0n,
        amountOutMinimum: 0n,
      });
    }
  }

  const quotedNet = netAfterFee(quotedGross);
  const active = legs.filter((l) => l.amountIn > 0n).length;
  const multiLegImpactBps = active >= 2 ? QUOTE_HEURISTICS.multiLegImpactBps : 0;
  const minAmountOutEth = applySlippage(quotedNet, slippageBps + multiLegImpactBps);

  if (active === 0) {
    errors.push("No token balance to sell at this percent.");
  }

  return {
    slippageBps,
    legs,
    quotedGrossEth: quotedGross,
    minAmountOutEth,
    quotesOk:
      errors.length === 0 && legs.every((l) => l.amountIn === 0n || l.amountOutMinimum > 0n),
    errors,
  };
}

export function minOutMap(legs: QuotedLeg[]): Record<string, bigint> {
  const m: Record<string, bigint> = {};
  for (const l of legs) m[l.symbol] = l.amountOutMinimum;
  return m;
}
