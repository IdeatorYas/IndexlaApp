import { describe, expect, it } from "vitest";
import {
  DEGEN_SOLANA_BASKET,
  DEGEN_SOLANA_PRODUCT_ID,
  splitLegsIntoSignBatches,
} from "@/lib/degen-solana/constants";
import { equalLamportSplits, weightedLamportSplits } from "@/lib/degen-solana/jupiter";
import { getDegenClubWorkspace } from "@/lib/fixtures/degen-club";

describe("degen solana basket constants", () => {
  it("pins exactly 10 user-specified mints", () => {
    expect(DEGEN_SOLANA_BASKET).toHaveLength(10);
    expect(DEGEN_SOLANA_BASKET.map((m) => m.ticker)).toEqual([
      "PENGU",
      "WIF",
      "BONK",
      "FARTCOIN",
      "POPCAT",
      "USELESS",
      "TROLL",
      "PNUT",
      "MOODENG",
      "GIGA",
    ]);
    expect(DEGEN_SOLANA_BASKET[0]?.mint).toBe(
      "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
    );
    expect(DEGEN_SOLANA_BASKET[9]?.mint).toBe(
      "63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9",
    );
  });

  it("matches fixture asset keys for solana-memecoin-index", () => {
    const ws = getDegenClubWorkspace();
    const product = ws.products.find((p) => p.id === DEGEN_SOLANA_PRODUCT_ID);
    expect(product).toBeTruthy();
    const keys = product!.allocations.map((a) => a.assetId);
    expect(keys).toEqual(DEGEN_SOLANA_BASKET.map((m) => m.key));
  });

  it("keeps 10 one-tx legs in a single signAll batch by default", () => {
    const legs = DEGEN_SOLANA_BASKET.map((m) => m.key);
    const batches = splitLegsIntoSignBatches(legs);
    expect(batches).toHaveLength(1);
    expect(batches.flat()).toHaveLength(10);
  });

  it("equal lamport splits conserve total", () => {
    const total = BigInt(1_000_000_000);
    const parts = equalLamportSplits(total, 10);
    expect(parts).toHaveLength(10);
    expect(parts.reduce((a, b) => a + b, BigInt(0))).toBe(total);
  });

  it("weighted lamport splits conserve total and require 100%", () => {
    const total = BigInt(1_000_000_000);
    const weights = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    const parts = weightedLamportSplits(total, weights);
    expect(parts).toHaveLength(10);
    expect(parts.reduce((a, b) => a + b, BigInt(0))).toBe(total);
    expect(() => weightedLamportSplits(total, [50, 40])).toThrow(/100%/);
  });
});
