import { describe, expect, it } from "vitest";
import { INDEXLA_INDEX_CATALOG } from "@/lib/fixtures/index-catalog";
import { getDiscoverCatalog } from "@/lib/fixtures/discover";

describe("marketplace catalog", () => {
  it("excludes community and degen products from standard catalog", () => {
    const catalog = getDiscoverCatalog();
    const ids = catalog.products.map((p) => p.id);
    expect(ids).not.toContain("degen-ten-shots");
    expect(ids).not.toContain("defi-core");
    expect(ids).not.toContain("rwa-income");
    expect(catalog.products.every((p) => !p.name.toLowerCase().includes("memecoin"))).toBe(
      true,
    );
  });

  it("ensures illustrative volume exceeds AUM for indexes with non-zero AUM", () => {
    for (const product of INDEXLA_INDEX_CATALOG) {
      if (product.aumUsd > 0) {
        expect(product.volumeUsd).toBeGreaterThan(product.aumUsd);
      }
    }
  });
});
