import { describe, expect, it } from "vitest";
import {
  INDEXLA_PORTFOLIO_CATALOG,
  OFFICIAL_PORTFOLIO_IDS,
} from "@/lib/fixtures/portfolio-catalog";
import { INDEXLA_INDEX_CATALOG } from "@/lib/fixtures/index-catalog";
import { getDiscoverCatalog, getCommunityMarketplacePortfolios } from "@/lib/fixtures/discover";

describe("INDEXLA portfolio catalog", () => {
  it("contains exactly 12 official templates", () => {
    expect(INDEXLA_PORTFOLIO_CATALOG).toHaveLength(12);
    expect(OFFICIAL_PORTFOLIO_IDS.size).toBe(12);
  });

  it("covers Crypto, Tokenized Stocks and Hybrid categories", () => {
    const types = new Set(
      INDEXLA_PORTFOLIO_CATALOG.map((p) => p.indexType),
    );
    expect(types.has("Crypto")).toBe(true);
    expect(types.has("Tokenized Stocks")).toBe(true);
    expect(types.has("Hybrid")).toBe(true);
  });

  it("allocations sum to 100% for every template", () => {
    for (const product of INDEXLA_PORTFOLIO_CATALOG) {
      const total = product.allocations.reduce((s, a) => s + a.percent, 0);
      expect(total).toBe(100);
    }
  });

  it("uses INDEXLA as creator for all official templates", () => {
    for (const product of INDEXLA_PORTFOLIO_CATALOG) {
      expect(product.creatorHandle).toBe("indexla");
      expect(product.creatorName).toBe("INDEXLA");
      expect(product.kind).toBe("Portfolio");
    }
  });

  it("does not invent AUM, volume or investor metrics", () => {
    for (const product of INDEXLA_PORTFOLIO_CATALOG) {
      expect(product.aumUsd).toBe(0);
      expect(product.volumeUsd).toBe(0);
      expect(product.investors).toBe(0);
      expect(product.performance30d).toBe(0);
    }
  });

  it("merges with index catalog and community portfolios in discover", () => {
    const catalog = getDiscoverCatalog();
    const officialInCatalog = catalog.products.filter((p) =>
      OFFICIAL_PORTFOLIO_IDS.has(p.id),
    );
    expect(officialInCatalog).toHaveLength(12);

    const indexCount = catalog.products.filter((p) => p.kind === "Index").length;
    expect(indexCount).toBe(INDEXLA_INDEX_CATALOG.length);

    const community = getCommunityMarketplacePortfolios();
    expect(community.length).toBeGreaterThan(0);
    for (const p of community) {
      expect(OFFICIAL_PORTFOLIO_IDS.has(p.id)).toBe(false);
      expect(catalog.products.some((c) => c.id === p.id)).toBe(true);
    }
  });

  it("includes expected template names", () => {
    const names = INDEXLA_PORTFOLIO_CATALOG.map((p) => p.name);
    expect(names).toContain("Crypto Core");
    expect(names).toContain("Stock Conviction");
    expect(names).toContain("The Barbell");
  });
});
