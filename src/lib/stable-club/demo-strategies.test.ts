import { describe, expect, it } from "vitest";
import {
  STABLE_CLUB_CATEGORY_COPY,
  STABLE_CLUB_DEMO_POOL_COUNT,
  STABLE_CLUB_DEMO_PRODUCTS,
} from "@/lib/stable-club/demo-strategies";

describe("Stable Club demo strategies catalogue", () => {
  it("defines three upcoming demo products with fifteen pools", () => {
    expect(STABLE_CLUB_DEMO_PRODUCTS).toHaveLength(3);
    expect(STABLE_CLUB_DEMO_POOL_COUNT).toBe(15);
    for (const product of STABLE_CLUB_DEMO_PRODUCTS) {
      expect(product.badge).toBe("UPCOMING · DEMO ONLY · NOT ACTIVE");
      expect(product.pools).toHaveLength(5);
    }
  });

  it("includes the requested live data links", () => {
    const stable = STABLE_CLUB_DEMO_PRODUCTS.find((p) => p.id === "stable-to-stable");
    const mid = STABLE_CLUB_DEMO_PRODUCTS.find((p) => p.id === "stable-to-eth-btc");
    expect(stable?.pools[0]?.liveDataUrl).toContain("e91e23af-9099-45d9-8ba5-ea5b4638e453");
    expect(mid?.pools[0]?.liveDataUrl).toContain("ff82c362-dea1-4946-b3b1-92ebd5100b1e");
  });

  it("keeps Chain Baskets and Coming Soon risk baskets copy", () => {
    expect(STABLE_CLUB_CATEGORY_COPY.chainBaskets.title).toBe("Chain Baskets");
    expect(STABLE_CLUB_CATEGORY_COPY.riskBaskets.title).toBe("Risk-Based Baskets");
    expect(STABLE_CLUB_CATEGORY_COPY.riskBaskets.levels).toHaveLength(3);
    expect(STABLE_CLUB_CATEGORY_COPY.disclaimer).toMatch(/Not financial advice/i);
  });
});
