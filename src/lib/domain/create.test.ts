import { describe, expect, it } from "vitest";
import {
  CREATE_STRATEGY_OPTIONS,
  INDEX_CATEGORIES,
  allocationTotal,
  createEmptyDraft,
  equalAllocate,
  migrateWizardStep,
  normalizeAllocations,
  normalizeStrategyConfig,
  strategyIsConfigured,
  wizardStepsFor,
} from "@/lib/domain/create";

describe("create builder helpers", () => {
  it("builds empty draft at Name & Description step", () => {
    const draft = createEmptyDraft();
    expect(draft.step).toBe("basics");
    expect(draft.version).toBe(1);
    expect(draft.allocations).toEqual([]);
  });

  it("uses fixed four-step wizard for index and portfolio", () => {
    expect(wizardStepsFor("index")).toEqual([
      "basics",
      "assets",
      "strategy",
      "review",
    ]);
    expect(wizardStepsFor("portfolio")).toEqual([
      "basics",
      "assets",
      "strategy",
      "review",
    ]);
  });

  it("migrates legacy wizard steps", () => {
    expect(migrateWizardStep("product")).toBe("basics");
    expect(migrateWizardStep("category")).toBe("assets");
    expect(migrateWizardStep("details")).toBe("review");
    expect(migrateWizardStep("strategy")).toBe("strategy");
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

  it("lists all Index narratives flat without Others or memecoins", () => {
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
      "Liquid Staking",
      "Restaking",
      "Privacy",
      "Interoperability",
      "Modular Blockchain",
      "DEX",
      "NFT",
    ]);
    expect(INDEX_CATEGORIES.some((c) => (c.id as string) === "other")).toBe(
      false,
    );
    expect(INDEX_CATEGORIES.some((c) => (c.id as string) === "memecoins")).toBe(
      false,
    );
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

  it("validates strategy configuration for continue", () => {
    expect(
      strategyIsConfigured({
        ...normalizeStrategyConfig({ strategyId: "none" }),
      }),
    ).toBe(true);
    expect(
      strategyIsConfigured({
        ...normalizeStrategyConfig({ strategyId: "rsi", executionPercent: 10 }),
        rsiTimeframe: "weekly",
      }),
    ).toBe(true);
    expect(
      strategyIsConfigured({
        ...normalizeStrategyConfig({ strategyId: "dca", executionPercent: 5 }),
        dcaMode: "calendar",
        dcaDates: [],
      }),
    ).toBe(false);
    expect(
      strategyIsConfigured({
        ...normalizeStrategyConfig({
          strategyId: "take-profit-stop-loss",
        }),
        takeProfitTargetPercent: 20,
        takeProfitSellPercent: 50,
        stopLossTargetPercent: 10,
        stopLossSellPercent: 100,
      }),
    ).toBe(true);
  });
});
