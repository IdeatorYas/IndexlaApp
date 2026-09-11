import { describe, expect, it } from "vitest";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";
import {
  DEFAULT_FILTER_STATE,
  filterMarketplaceProducts,
  parseChainFilter,
  type MarketplaceFilterState,
} from "@/lib/domain/marketplace-filters";

function product(
  partial: Partial<MarketplaceProduct> &
    Pick<MarketplaceProduct, "id" | "name" | "indexType" | "networkIds">,
): MarketplaceProduct {
  return {
    kind: "Index",
    narrative: "layer-1",
    narrativeLabel: "Layer 1",
    description: "Test",
    creatorName: "INDEXLA",
    creatorHandle: "indexla",
    verified: true,
    performance30d: 1,
    aumUsd: 1_000_000,
    volumeUsd: 10_000,
    investors: 10,
    likes: 10,
    risk: "Medium",
    allocations: [],
    assetIds: [],
    href: `/app/product/${partial.id}`,
    featured: false,
    isNew: false,
    addedAt: "2026-01-01",
    rankMonthly: null,
    isIllustrative: true,
    ...partial,
  };
}

const catalog: MarketplaceProduct[] = [
  product({
    id: "eth-l1",
    name: "ETH L1",
    indexType: "Crypto",
    narrative: "layer-1",
    networkIds: ["ethereum", "base"],
  }),
  product({
    id: "sol-ai",
    name: "Sol AI",
    indexType: "Crypto",
    narrative: "ai",
    networkIds: ["solana"],
  }),
  product({
    id: "stock-ai",
    name: "Stock AI",
    indexType: "Tokenized Stocks",
    narrative: "ai",
    networkIds: ["ethereum"],
  }),
];

function state(
  patch: Partial<MarketplaceFilterState> = {},
): MarketplaceFilterState {
  return { ...DEFAULT_FILTER_STATE, assetCategory: "Crypto", ...patch };
}

describe("parseChainFilter", () => {
  it("accepts known chains and defaults to all", () => {
    expect(parseChainFilter("robinhood")).toBe("robinhood");
    expect(parseChainFilter("bnb")).toBe("bnb");
    expect(parseChainFilter("nope")).toBe("all");
    expect(parseChainFilter(null)).toBe("all");
  });
});

describe("filterMarketplaceProducts chain + narrative", () => {
  it("defaults to all chains under Crypto", () => {
    const ids = filterMarketplaceProducts(catalog, state()).map((p) => p.id);
    expect(ids).toEqual(["eth-l1", "sol-ai"]);
  });

  it("filters by chain membership", () => {
    const ids = filterMarketplaceProducts(
      catalog,
      state({ chain: "solana" }),
    ).map((p) => p.id);
    expect(ids).toEqual(["sol-ai"]);
  });

  it("combines chain and narrative", () => {
    const ids = filterMarketplaceProducts(
      catalog,
      state({ chain: "ethereum", narrative: "layer-1" }),
    ).map((p) => p.id);
    expect(ids).toEqual(["eth-l1"]);

    const empty = filterMarketplaceProducts(
      catalog,
      state({ chain: "ethereum", narrative: "ai" }),
    );
    expect(empty).toHaveLength(0);
  });

  it("shows empty for Robinhood Chain with no matching indexes", () => {
    const empty = filterMarketplaceProducts(
      catalog,
      state({ chain: "robinhood" }),
    );
    expect(empty).toHaveLength(0);
  });

  it("ignores chain when asset category is not Crypto", () => {
    const ids = filterMarketplaceProducts(
      catalog,
      state({
        assetCategory: "Tokenized Stocks",
        chain: "solana",
        narrative: "ai",
      }),
    ).map((p) => p.id);
    expect(ids).toEqual(["stock-ai"]);
  });
});
