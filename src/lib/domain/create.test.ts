import { describe, expect, it } from "vitest";
import {
  CREATE_STRATEGY_OPTIONS,
  INDEX_CATEGORIES,
  INDEX_OTHER_PINNED_CATEGORIES,
  allocationTotal,
  buildIndexOtherCategories,
  createEmptyDraft,
  equalAllocate,
  normalizeAllocations,
  normalizeStrategyConfig,
  wizardStepsFor,
} from "@/lib/domain/create";

describe("create builder helpers", () => {
  it("builds empty draft at product step", () => {
    const draft = createEmptyDraft();
    expect(draft.step).toBe("product");
    expect(draft.version).toBe(1);
    expect(draft.allocations).toEqual([]);
  });

  it("includes category step only for indexes", () => {
    expect(wizardStepsFor("index")).toContain("category");
    expect(wizardStepsFor("portfolio")).not.toContain("category");
  });

  it("equal-allocates and normalizes to 100%", () => {
    const equal = equalAllocate(["a", "b", "c"]);
    expect(allocationTotal(equal)).toBe(100);
    const normalized = normalizeAllocations([
      { assetId: "a", percent: 10 },
      { assetId: "b", percent: 30 },
    ]);
    expect(allocationTotal(normalized)).toBe(100);
  });

  it("lists main Index Builder categories in the required order without memecoins", () => {
    expect(INDEX_CATEGORIES.map((c) => c.label)).toEqual([
      "RWA",
      "DeFi",
      "DePIN",
      "AI",
      "Layer 1",
      "Layer 2",
      "Gaming",
      "Oracles",
      "AI Agents",
      "Others",
    ]);
    expect(INDEX_CATEGORIES.some((c) => (c.id as string) === "memecoins")).toBe(
      false,
    );
  });

  it("pins Others narratives first and excludes memecoins", () => {
    const built = buildIndexOtherCategories([
      { category_id: "meme-token", name: "Meme" },
      { category_id: "privacy", name: "Privacy" },
      { category_id: "liquid-staking", name: "Liquid Staking" },
      { category_id: "layer-1", name: "Layer 1 (L1)" },
      { category_id: "solana-meme-coins", name: "Solana Meme" },
      { category_id: "storage", name: "Storage" },
    ]);
    expect(built.slice(0, INDEX_OTHER_PINNED_CATEGORIES.length).map((c) => c.category_id)).toEqual(
      INDEX_OTHER_PINNED_CATEGORIES.map((c) => c.category_id),
    );
    expect(built.some((c) => c.category_id.includes("meme"))).toBe(false);
    expect(built.some((c) => c.category_id === "layer-1")).toBe(false);
    expect(built.some((c) => c.category_id === "storage")).toBe(true);
  });

  it("exposes combined Create strategies without split fear/greed or TP/SL", () => {
    const ids = CREATE_STRATEGY_OPTIONS.map((s) => s.id);
    expect(ids).toContain("fear-greed");
    expect(ids).toContain("take-profit-stop-loss");
    expect(ids).toContain("rsi");
    expect(ids).toContain("momentum");
    expect(ids).not.toContain("buy-fear");
    expect(ids).not.toContain("sell-greed");
    expect(ids).not.toContain("take-profit");
    expect(ids).not.toContain("stop-loss");
  });

  it("normalizes legacy strategy ids into combined strategies", () => {
    expect(
      normalizeStrategyConfig({ strategyId: "buy-fear" as never }).strategyId,
    ).toBe("fear-greed");
    expect(
      normalizeStrategyConfig({ strategyId: "stop-loss" as never }).strategyId,
    ).toBe("take-profit-stop-loss");
  });
});
