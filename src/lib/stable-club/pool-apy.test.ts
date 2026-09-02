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
    const pool = STAGE1_FIVE_POOL_BETA_POOL_IDS[1]!;
    const quotes = buildPoolApyQuotes(
      [
        {
          chain: "Base",
          pool: "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef",
          project: "uniswap-v3",
          apy: -5,
        },
      ],
      new Date(),
    );
    const uni = quotes.find((q) => q.poolId === pool);
    expect(uni?.status).toBe("unavailable");
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
