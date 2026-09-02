import { describe, expect, it } from "vitest";
import {
  FIVE_POOL_SWAP_SLOT_ORDER,
  allocateFivePoolBudgets,
  buildFivePoolQuotePlan,
  buildFivePoolSwapQuoteRequests,
} from "@/lib/stable-club/quote-plan";
import {
  assertLiveQuoteSourceForSubmission,
  assertQuoteBundleComplete,
  createMockQuoteAdapter,
  resolveQuoteTokenOut,
} from "@/lib/stable-club/five-pool-quotes";
import { BASE_TOKENS } from "@/lib/stable-club/official-pools";
import type { Address } from "viem";

describe("five-pool-quotes adapter", () => {
  it("requests exactly eight quotes in catalogue order for 1000 USDC", async () => {
    const gross = BigInt(1000) * BigInt(10) ** BigInt(6);
    const requests = buildFivePoolSwapQuoteRequests(gross);
    expect(requests).toHaveLength(8);
    expect(requests.map((r) => r.slotId)).toEqual([...FIVE_POOL_SWAP_SLOT_ORDER]);

    const adapter = createMockQuoteAdapter();
    const bundle = await adapter.fetchQuotes({ grossUsdc: gross, nowSec: 1_700_000_000 });
    expect(bundle.source).toBe("mock-test-only");
    expect(Object.keys(bundle.quotes)).toHaveLength(8);
    assertQuoteBundleComplete(bundle);

    for (const req of requests) {
      expect(req.netUsdcIn).toBe((req.grossUsdcIn * BigInt(9900)) / BigInt(10000));
      expect(req.netUsdcIn).toBeLessThan(req.grossUsdcIn);
    }
  });

  it("maps catalogue tokenOut onto deployment tokens", () => {
    const tokens = {
      usdc: "0x1111111111111111111111111111111111111111" as Address,
      cbbtc: "0x2222222222222222222222222222222222222222" as Address,
      weth: "0x3333333333333333333333333333333333333333" as Address,
    };
    expect(resolveQuoteTokenOut(BASE_TOKENS.cbBTC.address, tokens)).toBe(tokens.cbbtc);
    expect(resolveQuoteTokenOut(BASE_TOKENS.WETH.address, tokens)).toBe(tokens.weth);
  });

  it("refuses mock quotes for production submission", () => {
    expect(() => assertLiveQuoteSourceForSubmission("mock-test-only")).toThrow(
      /oracle-guard/,
    );
    expect(() => assertLiveQuoteSourceForSubmission("oracle-guard")).not.toThrow();
  });

  it("sizes quote nets from equal 20% legs", () => {
    const gross = BigInt(1000) * BigInt(10) ** BigInt(6);
    const { legBudgets } = allocateFivePoolBudgets(gross);
    const requests = buildFivePoolSwapQuoteRequests(gross);
    // Legs 0–1: half of 200 USDC swap gross
    expect(requests[0]!.grossUsdcIn).toBe(legBudgets[0]! / BigInt(2));
    // Legs 2–4: two halves
    expect(requests[2]!.grossUsdcIn + requests[3]!.grossUsdcIn).toBe(legBudgets[2]!);
  });
});

describe("mock adapter cannot build live submission path", () => {
  it("mock bundle source is never oracle-guard", async () => {
    const adapter = createMockQuoteAdapter({ "leg0-usdc-cbbtc": BigInt(42) });
    const bundle = await adapter.fetchQuotes({
      grossUsdc: BigInt(1000) * BigInt(10) ** BigInt(6),
      nowSec: 100,
    });
    expect(bundle.quotes["leg0-usdc-cbbtc"]!.quotedOut).toBe(BigInt(42));
    expect(bundle.source).not.toBe("oracle-guard");
    expect(() => assertLiveQuoteSourceForSubmission(bundle.source)).toThrow();
  });

  it("plan still builds from mock for unit tests only", async () => {
    const adapters = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
      "0x4444444444444444444444444444444444444444",
      "0x5555555555555555555555555555555555555555",
    ] as const;
    const gross = BigInt(1000) * BigInt(10) ** BigInt(6);
    const bundle = await createMockQuoteAdapter().fetchQuotes({
      grossUsdc: gross,
      nowSec: 50,
    });
    const plan = buildFivePoolQuotePlan({
      grossUsdc: gross,
      adapters,
      currentTicks: [0, 0, 0, 0, 0],
      quotes: bundle.quotes,
      slippageBps: BigInt(100),
      lpSlippageBps: BigInt(100),
      deadline: BigInt(1000),
      nowSec: 50,
      maxQuoteAgeSec: 120,
    });
    expect(plan.swaps).toHaveLength(8);
  });
});
