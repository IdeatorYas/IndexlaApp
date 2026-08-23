import { describe, expect, it } from "vitest";
import { getIllustrativeAssetPerformance } from "@/lib/product/illustrative-asset-performance";

describe("getIllustrativeAssetPerformance", () => {
  it("returns stable values for the same asset", () => {
    const a = getIllustrativeAssetPerformance("btc");
    const b = getIllustrativeAssetPerformance("btc");
    expect(a).toEqual(b);
  });

  it("returns distinct values across assets", () => {
    const btc = getIllustrativeAssetPerformance("btc");
    const eth = getIllustrativeAssetPerformance("eth");
    expect(btc).not.toEqual(eth);
  });
});
