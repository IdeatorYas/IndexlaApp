import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
  assertQuotesFreshForSubmission,
  buildDepositFivePoolStrategyArgs,
  buildDepositPreview,
  explorerTxUrl,
  formatUsdcUnits,
  parseUsdcDepositInput,
  remapPlanLegsToAdapters,
  validateSlippageBps,
} from "@/lib/stable-club/five-pool-deposit";
import { createMockQuoteAdapter } from "@/lib/stable-club/five-pool-quotes";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { buildFivePoolQuotePlan, QuotePlanError } from "@/lib/stable-club/quote-plan";
import type { Phase2aAdapterDeployment } from "@/lib/stable-club/phase2a-deployments";

const ADAPTERS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
] as const satisfies readonly Address[];

const GROSS = BigInt(1000) * BigInt(10) ** BigInt(6);

function mockAdapters(): Phase2aAdapterDeployment[] {
  return OFFICIAL_STABLE_CLUB_BASE_POOLS.map((p, i) => ({
    poolId: p.poolIdHash,
    protocol: p.protocol,
    adapter: ADAPTERS[i]!,
    tokenA: ADAPTERS[(i + 1) % 5]!,
    tokenB: ADAPTERS[(i + 2) % 5]!,
    factory: ADAPTERS[0]!,
    npm: ADAPTERS[0]!,
    router: ADAPTERS[0]!,
  }));
}

async function buildPlan(nowSec = 1_700_000_000) {
  const bundle = await createMockQuoteAdapter().fetchQuotes({
    grossUsdc: GROSS,
    nowSec,
  });
  const plan = buildFivePoolQuotePlan({
    grossUsdc: GROSS,
    adapters: ADAPTERS,
    currentTicks: [0, 0, 0, 0, 0],
    quotes: bundle.quotes,
    slippageBps: BigInt(100),
    lpSlippageBps: BigInt(100),
    deadline: BigInt(nowSec + 3600),
    nowSec,
    maxQuoteAgeSec: 90,
  });
  return { plan, bundle };
}

describe("parseUsdcDepositInput", () => {
  it("accepts exact five-way amounts and rejects invalid / below min", () => {
    expect(parseUsdcDepositInput("1000").ok).toBe(true);
    expect(parseUsdcDepositInput("").ok).toBe(false);
    expect(parseUsdcDepositInput("abc").ok).toBe(false);
    expect(parseUsdcDepositInput("0").ok).toBe(false);
    expect(parseUsdcDepositInput("20").ok).toBe(true);
    expect(parseUsdcDepositInput("19.999999").ok).toBe(false); // below 20 min
    expect(parseUsdcDepositInput("100").ok).toBe(true); // above new 20 min
    const bad = parseUsdcDepositInput("7");
    expect(bad.ok).toBe(false);
  });
});

describe("slippage validation", () => {
  it("rejects zero and above max", () => {
    expect(validateSlippageBps("0", "Swap").ok).toBe(false);
    expect(validateSlippageBps("5001", "LP").ok).toBe(false);
    expect(validateSlippageBps("100", "Swap")).toEqual({ ok: true, bps: BigInt(100) });
  });
});

describe("SC-F11 — slippage max 500 bps before quote/wallet", () => {
  it("accepts 500 and the existing safe default", () => {
    expect(validateSlippageBps("500", "Swap")).toEqual({ ok: true, bps: BigInt(500) });
    expect(validateSlippageBps("100", "LP")).toEqual({ ok: true, bps: BigInt(100) });
  });

  it("rejects 501 and 5000 without producing a quote plan", () => {
    const reject501 = validateSlippageBps("501", "Swap slippage");
    expect(reject501.ok).toBe(false);
    if (!reject501.ok) {
      expect(reject501.message).toMatch(/\(0, 500]/);
    }
    const reject5000 = validateSlippageBps("5000", "LP slippage");
    expect(reject5000.ok).toBe(false);
    // prepareQuotes returns on validateSlippageBps failure — no wallet writeContract path.
    expect(reject501.ok || reject5000.ok).toBe(false);
  });
});

describe("deposit preview", () => {
  it("shows five 20% rows, eight swaps, fee and slippage", async () => {
    const { plan, bundle } = await buildPlan();
    const preview = buildDepositPreview({
      plan,
      quotedAtSec: bundle.quotedAtSec,
      maxQuoteAgeSec: 90,
      quoteSource: bundle.source,
    });
    expect(preview.pools).toHaveLength(5);
    for (const row of preview.pools) {
      expect(row.allocationBps).toBe(2000);
      expect(row.allocationUsdc).toBe(BigInt(200_000_000));
    }
    expect(preview.swaps).toHaveLength(8);
    expect(preview.feeBps).toBe(100);
    expect(preview.swapSlippageBps).toBe(BigInt(100));
    expect(preview.lpSlippageBps).toBe(BigInt(100));
    expect(preview.messaging.nonCustodial).toMatch(/Non-custodial/i);
    expect(preview.messaging.revocable).toMatch(/revocable/i);
  });
});

describe("stale quote gate", () => {
  it("blocks submission when quotes expire", async () => {
    const { bundle } = await buildPlan(1_000);
    expect(() =>
      assertQuotesFreshForSubmission({
        quotes: bundle.quotes,
        nowSec: 1_000 + 91,
        maxQuoteAgeSec: 90,
      }),
    ).toThrow(QuotePlanError);
  });

  it("allows fresh quotes", async () => {
    const { bundle } = await buildPlan(1_000);
    expect(() =>
      assertQuotesFreshForSubmission({
        quotes: bundle.quotes,
        nowSec: 1_050,
        maxQuoteAgeSec: 90,
      }),
    ).not.toThrow();
  });
});

describe("Permit2 deposit args assembly", () => {
  it("remaps token ordering onto adapters and rejects mock for live submit", async () => {
    const nowSec = 2_000;
    const { plan, bundle } = await buildPlan(nowSec);
    const adapters = mockAdapters();
    const remapped = remapPlanLegsToAdapters(plan, adapters);
    expect(remapped[0]!.tokenA).toBe(adapters[0]!.tokenA);
    expect(remapped[0]!.adapter).toBe(adapters[0]!.adapter);
    expect(remapped[2]!.tokenB).toBe(adapters[2]!.tokenB);

    expect(() =>
      buildDepositFivePoolStrategyArgs({
        plan,
        adapters,
        strategyId: "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex,
        executionNonce: BigInt(1),
        quoteBundle: bundle,
        nowSec,
        maxQuoteAgeSec: 90,
        requireLiveQuotes: true,
      }),
    ).toThrow(/oracle-guard/);

    const args = buildDepositFivePoolStrategyArgs({
      plan,
      adapters,
      strategyId: "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex,
      executionNonce: BigInt(1),
      quoteBundle: bundle,
      nowSec,
      maxQuoteAgeSec: 90,
      requireLiveQuotes: false,
    });
    expect(args.legs).toHaveLength(5);
    expect(args.poolIds).toHaveLength(5);
    expect(args.grossUsdc).toBe(GROSS);
    expect(args.legs[0]!.amountAMin).toBeGreaterThan(BigInt(1));
  });
});

describe("helpers", () => {
  it("formats USDC and explorer links", () => {
    expect(formatUsdcUnits(BigInt(1_000_000_000))).toBe("1000");
    expect(explorerTxUrl(8453, "0xabc" as Hex)).toContain("basescan.org");
    expect(explorerTxUrl(31337, "0xabc" as Hex)).toBeNull();
  });
});
