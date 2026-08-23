import { describe, expect, it } from "vitest";
import { INDEXLA_INDEX_CATALOG } from "@/lib/fixtures/index-catalog";
import {
  getCreatorMarketplaceProducts,
  getDiscoverCatalog,
} from "@/lib/fixtures/discover";
import { isIndexlaProduct } from "@/lib/product/product-type";

describe("marketplace catalog", () => {
  it("includes creator products but excludes degen club items", () => {
    const catalog = getDiscoverCatalog();
    const ids = catalog.products.map((p) => p.id);
    expect(ids).not.toContain("degen-ten-shots");
    expect(ids).toContain("defi-core");
    expect(ids).toContain("tokenized-tech");
    expect(
      catalog.products.every((p) => !p.name.toLowerCase().includes("memecoin")),
    ).toBe(true);

    const creators = getCreatorMarketplaceProducts();
    expect(creators.length).toBeGreaterThan(0);
    expect(creators.every((p) => !isIndexlaProduct(p))).toBe(true);
  });

  it("ensures illustrative volume exceeds AUM for indexes with non-zero AUM", () => {
    for (const product of INDEXLA_INDEX_CATALOG) {
      if (product.aumUsd > 0) {
        expect(product.volumeUsd).toBeGreaterThan(product.aumUsd);
      }
    }
  });
});
