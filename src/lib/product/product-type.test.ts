import { describe, expect, it } from "vitest";
import {
  getProductTypeStyle,
  isIndexlaProduct,
  splitMarketplaceByOrigin,
} from "@/lib/product/product-type";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";

function mockProduct(
  partial: Partial<MarketplaceProduct> & Pick<MarketplaceProduct, "id">,
): MarketplaceProduct {
  return {
    name: partial.name ?? partial.id,
    kind: partial.kind ?? "Index",
    indexType: partial.indexType ?? "Crypto",
    narrative: "all",
    narrativeLabel: "All",
    creatorName: partial.creatorName ?? "INDEXLA",
    creatorHandle: partial.creatorHandle ?? "indexla",
    verified: true,
    description: "",
    thesis: "",
    strategy: "",
    strategyTags: [],
    selectedStrategy: {
      id: "weekly-rebalance",
      name: "Weekly Rebalance",
      explanation: "",
      rules: [],
      triggers: [],
      thresholds: [],
      automationStatus: "available",
      permissionsDisclosure: "",
    },
    performance30d: 0,
    performanceChart: [],
    aumUsd: 0,
    volumeUsd: 0,
    investors: 0,
    likes: 0,
    risk: "Medium",
    networkIds: ["ethereum"],
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

describe("product type styles", () => {
  it("maps eight exact badge labels", () => {
    expect(
      getProductTypeStyle({ kind: "Index", indexType: "Crypto" }).label,
    ).toBe("Crypto Index");
    expect(
      getProductTypeStyle({ kind: "Portfolio", indexType: "Tokenized Stocks" })
        .label,
    ).toBe("Stock Portfolio");
    expect(
      getProductTypeStyle({
        kind: "Index",
        indexType: "Tokenized Commodities",
      }).label,
    ).toBe("Commodities Index");
    expect(
      getProductTypeStyle({ kind: "Portfolio", indexType: "Hybrid" }).label,
    ).toBe("Hybrid Portfolio");
  });

  it("assigns distinct product-type palette colors", () => {
    const cryptoIndex = getProductTypeStyle({ kind: "Index", indexType: "Crypto" });
    const stockIndex = getProductTypeStyle({
      kind: "Index",
      indexType: "Tokenized Stocks",
    });
    expect(cryptoIndex.fill).toBe("#D97706");
    expect(stockIndex.fill).toBe("#0284C7");
    expect(cryptoIndex.fill).not.toBe(stockIndex.fill);
  });

  it("splits INDEXLA and creator products", () => {
    const products = [
      mockProduct({ id: "a", creatorHandle: "indexla" }),
      mockProduct({ id: "b", creatorHandle: "quantdesk", creatorName: "Quant Desk" }),
    ];
    const { indexla, creator } = splitMarketplaceByOrigin(products);
    expect(indexla).toHaveLength(1);
    expect(creator).toHaveLength(1);
    expect(isIndexlaProduct(products[0])).toBe(true);
  });
});
