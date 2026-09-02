/**
 * Five-pool quote adapter — live OracleGuard path (verified in fork deposit tests).
 * Mock adapters are test-only and must never reach production submission.
 */
import type { Address } from "viem";
import { oracleGuardAbi } from "@/lib/stable-club/abis";
import { BASE_TOKENS } from "@/lib/stable-club/official-pools";
import {
  EXPECTED_SWAP_COUNT,
  FIVE_POOL_SWAP_SLOT_ORDER,
  QuotePlanError,
  buildFivePoolSwapQuoteRequests,
  type FivePoolSwapQuoteRequest,
  type FivePoolSwapSlotId,
  type SwapQuoteInput,
} from "@/lib/stable-club/quote-plan";

export type QuoteSourceKind = "oracle-guard" | "mock-test-only";

export type FivePoolQuoteBundle = {
  source: QuoteSourceKind;
  quotedAtSec: number;
  requests: readonly FivePoolSwapQuoteRequest[];
  quotes: Readonly<Record<FivePoolSwapSlotId, SwapQuoteInput>>;
};

export type FivePoolQuoteAdapter = {
  readonly source: QuoteSourceKind;
  fetchQuotes(params: {
    grossUsdc: bigint;
    nowSec: number;
  }): Promise<FivePoolQuoteBundle>;
};

export type OracleGuardTokenMap = {
  usdc: Address;
  cbbtc: Address;
  weth: Address;
};

/** Map catalogue tokenOut (Base addresses) → deployment token for oracle calls. */
export function resolveQuoteTokenOut(
  catalogueTokenOut: Address,
  tokens: OracleGuardTokenMap,
): Address {
  const cat = catalogueTokenOut.toLowerCase();
  if (cat === BASE_TOKENS.cbBTC.address.toLowerCase()) return tokens.cbbtc;
  if (cat === BASE_TOKENS.WETH.address.toLowerCase()) return tokens.weth;
  if (cat === BASE_TOKENS.USDC.address.toLowerCase()) return tokens.usdc;
  throw new QuotePlanError(
    "UNSUPPORTED_TOKEN",
    `Cannot map catalogue tokenOut ${catalogueTokenOut} to deployment tokens`,
  );
}

/**
 * Live adapter: OracleGuard.expectedAmountOut for net USDC after fee.
 * Matches StableClubPhase2aForkDeposit / Phase2aFivePool oracleQuote helpers.
 */
export function createOracleGuardQuoteAdapter(params: {
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof oracleGuardAbi;
      functionName: "expectedAmountOut";
      args: readonly [Address, Address, bigint, number, number];
    }) => Promise<bigint>;
  };
  oracleGuard: Address;
  tokens: OracleGuardTokenMap;
}): FivePoolQuoteAdapter {
  return {
    source: "oracle-guard",
    async fetchQuotes({ grossUsdc, nowSec }) {
      const requests = buildFivePoolSwapQuoteRequests(grossUsdc);
      const quotes = {} as Record<FivePoolSwapSlotId, SwapQuoteInput>;

      for (const req of requests) {
        const tokenOut = resolveQuoteTokenOut(req.tokenOut, params.tokens);
        const quotedOut = await params.publicClient.readContract({
          address: params.oracleGuard,
          abi: oracleGuardAbi,
          functionName: "expectedAmountOut",
          args: [
            params.tokens.usdc,
            tokenOut,
            req.netUsdcIn,
            6,
            req.decimalsOut,
          ],
        });
        if (quotedOut <= BigInt(0)) {
          throw new QuotePlanError(
            "ZERO_QUOTE",
            `OracleGuard returned zero for ${req.slotId}`,
          );
        }
        quotes[req.slotId] = { quotedOut, quotedAtSec: nowSec };
      }

      if (Object.keys(quotes).length !== EXPECTED_SWAP_COUNT) {
        throw new QuotePlanError("MISSING_QUOTE", "Incomplete eight-quote fetch");
      }
      for (const slot of FIVE_POOL_SWAP_SLOT_ORDER) {
        if (!quotes[slot]) {
          throw new QuotePlanError("MISSING_QUOTE", `Missing quote for ${slot}`);
        }
      }

      return {
        source: "oracle-guard",
        quotedAtSec: nowSec,
        requests,
        quotes,
      };
    },
  };
}

/**
 * TEST ONLY — deterministic quotes. Must never be passed to production submit.
 */
export function createMockQuoteAdapter(
  quotedOutBySlot?: Partial<Record<FivePoolSwapSlotId, bigint>>,
  defaultQuotedOut: bigint = BigInt(1_000_000),
): FivePoolQuoteAdapter {
  return {
    source: "mock-test-only",
    async fetchQuotes({ grossUsdc, nowSec }) {
      const requests = buildFivePoolSwapQuoteRequests(grossUsdc);
      const quotes = {} as Record<FivePoolSwapSlotId, SwapQuoteInput>;
      for (const req of requests) {
        quotes[req.slotId] = {
          quotedOut: quotedOutBySlot?.[req.slotId] ?? defaultQuotedOut,
          quotedAtSec: nowSec,
        };
      }
      return {
        source: "mock-test-only",
        quotedAtSec: nowSec,
        requests,
        quotes,
      };
    },
  };
}

export function assertLiveQuoteSourceForSubmission(source: QuoteSourceKind): void {
  if (source !== "oracle-guard") {
    throw new Error(
      `Refusing submission with quote source "${source}" — production path requires oracle-guard`,
    );
  }
}

export function assertQuoteBundleComplete(bundle: FivePoolQuoteBundle): void {
  if (bundle.requests.length !== EXPECTED_SWAP_COUNT) {
    throw new QuotePlanError("MISSING_QUOTE", "Quote bundle request count != 8");
  }
  for (const slot of FIVE_POOL_SWAP_SLOT_ORDER) {
    const q = bundle.quotes[slot];
    if (!q || q.quotedOut <= BigInt(0)) {
      throw new QuotePlanError("MISSING_QUOTE", `Incomplete/zero quote for ${slot}`);
    }
  }
}
