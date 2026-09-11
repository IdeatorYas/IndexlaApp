import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildPoolApyQuotes,
  clearPoolApyRowsCache,
  computeBlendedStrategyApy,
  fetchDefiLlamaBasePools,
  isCanonicalPoolApyId,
  sanitizeApyPercent,
  type PoolApyQuote,
} from "@/lib/stable-club/pool-apy";
import { STAGE1_FIVE_POOL_BETA_POOL_IDS } from "@/lib/stable-club/stage1-launch";

function quote(poolId: string, apy: number | null, status: "available" | "unavailable" = "available"): PoolApyQuote {
  return {
    poolId,
    poolAddress: "0x0000000000000000000000000000000000000001",
    apyPercent: apy,
    apyBasePercent: apy,
    apyRewardPercent: 0,
    tvlUsd: null,
    source: "defillama-yields",
    updatedAt: new Date().toISOString(),
    status,
  };
}

describe("computeBlendedStrategyApy", () => {
  it("weights five 20% legs equally", () => {
    const quotes = STAGE1_FIVE_POOL_BETA_POOL_IDS.map((id, i) => quote(id, 10 + i));
    const blended = computeBlendedStrategyApy(quotes, new Date().toISOString());
    expect(blended.status).toBe("available");
    expect(blended.apyPercent).toBeCloseTo(12, 5);
    expect(blended.legCount).toBe(5);
  });

  it("returns unavailable when any leg is missing APY", () => {
    const quotes = STAGE1_FIVE_POOL_BETA_POOL_IDS.map((id, i) =>
      quote(id, i === 2 ? null : 5, i === 2 ? "unavailable" : "available"),
    );
    const blended = computeBlendedStrategyApy(quotes, new Date().toISOString());
    expect(blended.status).toBe("unavailable");
    expect(blended.apyPercent).toBeNull();
  });
});

describe("sanitizeApyPercent", () => {
  it("accepts finite non-negative values", () => {
    expect(sanitizeApyPercent(12.5)).toBe(12.5);
    expect(sanitizeApyPercent(0)).toBe(0);
  });

  it("rejects negative, NaN, and non-numbers", () => {
    expect(sanitizeApyPercent(-1)).toBeNull();
    expect(sanitizeApyPercent(Number.NaN)).toBeNull();
    expect(sanitizeApyPercent("5")).toBeNull();
  });
});

describe("isCanonicalPoolApyId", () => {
  it("accepts only the five Stage 1 beta pool IDs", () => {
    for (const id of STAGE1_FIVE_POOL_BETA_POOL_IDS) {
      expect(isCanonicalPoolApyId(id)).toBe(true);
    }
    expect(isCanonicalPoolApyId("not-a-pool")).toBe(false);
  });
});

describe("buildPoolApyQuotes", () => {
  it("returns exactly five canonical pool quotes", () => {
    const quotes = buildPoolApyQuotes([], new Date());
    expect(quotes).toHaveLength(5);
    expect(quotes.map((q) => q.poolId).sort()).toEqual(
      [...STAGE1_FIVE_POOL_BETA_POOL_IDS].sort(),
    );
  });

  it("marks negative APY as unavailable", () => {
    const pool = STAGE1_FIVE_POOL_BETA_POOL_IDS[1]!; // USDC-cbBTC-UNI-005
    const quotes = buildPoolApyQuotes(
      [
        {
          chain: "Base",
          pool: "uuid-usdc-cbbtc-uni",
          project: "uniswap-v3",
          poolMeta: "0.05%",
          underlyingTokens: [
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
          ],
          apy: -5,
          apyBase: -5,
        },
      ],
      new Date(),
    );
    const uni = quotes.find((q) => q.poolId === pool);
    expect(uni?.status).toBe("unavailable");
  });

  it("matches Uniswap by underlying tokens + fee meta (not pool address UUID)", () => {
    const quotes = buildPoolApyQuotes(
      [
        {
          chain: "Base",
          pool: "uuid-usdc-cbbtc-uni",
          project: "uniswap-v3",
          poolMeta: "0.05%",
          underlyingTokens: [
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
          ],
          apy: 5.5,
          apyBase: 5.5,
          tvlUsd: 1_000_000,
        },
      ],
      new Date(),
    );
    const uni = quotes.find((q) => q.poolId === "USDC-cbBTC-UNI-005");
    expect(uni?.status).toBe("available");
    expect(uni?.apyPercent).toBe(5.5);
  });

  it("uses fee APY only — excludes reward-inflated totals", () => {
    const quotes = buildPoolApyQuotes(
      [
        {
          chain: "Base",
          pool: "uuid-weth-cbbtc-cl10",
          project: "aerodrome-slipstream",
          poolMeta: "CL10 - 0.055%",
          underlyingTokens: [
            "0x4200000000000000000000000000000000000006",
            "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
          ],
          apy: 812.08,
          apyBase: 100.8,
          apyReward: 711.28,
        },
      ],
      new Date(),
    );
    const cl10 = quotes.find((q) => q.poolId === "cbBTC-WETH-AERO-CL10");
    expect(cl10?.status).toBe("available");
    expect(cl10?.apyPercent).toBe(100.8);
    expect(cl10?.apyBasePercent).toBe(100.8);
    expect(cl10?.apyRewardPercent).toBe(711.28);
  });

  it("does not match CL100 when looking for CL10 (prefix false-positive)", () => {
    const quotes = buildPoolApyQuotes(
      [
        {
          chain: "Base",
          pool: "uuid-weth-cbbtc-cl100",
          project: "aerodrome-slipstream",
          poolMeta: "CL100 - 0.25%",
          underlyingTokens: [
            "0x4200000000000000000000000000000000000006",
            "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
          ],
          apy: 4.2,
          apyBase: 4.2,
        },
        {
          chain: "Base",
          pool: "uuid-weth-cbbtc-cl10",
          project: "aerodrome-slipstream",
          poolMeta: "CL10 - 0.055%",
          underlyingTokens: [
            "0x4200000000000000000000000000000000000006",
            "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
          ],
          apy: 12.5,
          apyBase: 12.5,
        },
      ],
      new Date(),
    );
    const cl10 = quotes.find((q) => q.poolId === "cbBTC-WETH-AERO-CL10");
    const cl100 = quotes.find((q) => q.poolId === "cbBTC-WETH-AERO-CL100");
    expect(cl10?.status).toBe("available");
    expect(cl10?.apyPercent).toBe(12.5);
    expect(cl100?.status).toBe("available");
    expect(cl100?.apyPercent).toBe(4.2);
  });
});

describe("fetchDefiLlamaBasePools cache", () => {
  beforeEach(() => {
    clearPoolApyRowsCache();
  });

  afterEach(() => {
    clearPoolApyRowsCache();
    vi.unstubAllGlobals();
  });

  it("reuses cached rows within TTL", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ chain: "Base", pool: "0x1", apy: 1 }] }),
    }));
    await fetchDefiLlamaBasePools(fetchMock as unknown as typeof fetch, 1_000);
    await fetchDefiLlamaBasePools(fetchMock as unknown as typeof fetch, 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
