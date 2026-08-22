import { describe, expect, it } from "vitest";
import {
  allocationTotals100,
  calculateFees,
  getFeeAllocationSplit,
  resolveSaveTier,
  saveDiscountPercentForTier,
} from "@/lib/fees/fee-calculator";

describe("fee-calculator", () => {
  it("applies no discount below 2,500 $DEXLA", () => {
    expect(resolveSaveTier(0)).toBe("none");
    expect(saveDiscountPercentForTier("none")).toBe(0);
  });

  it("applies tier discounts at boundaries", () => {
    expect(resolveSaveTier(2_500)).toBe("10");
    expect(resolveSaveTier(5_000)).toBe("20");
    expect(resolveSaveTier(10_000)).toBe("30");
  });

  it("calculates final fee separately from gas and bridge", () => {
    const result = calculateFees({
      portfolioType: "creator-portfolio",
      tradeAmountUsd: 10_000,
      dexlaBalance: 5_000,
      estimatedGasUsd: 4.5,
      estimatedBridgeUsd: 0,
      expectedSlippageBps: 50,
    });

    expect(result.baseExecutionFeeUsd).toBe(100);
    expect(result.saveDiscountPercent).toBe(20);
    expect(result.finalIndexlaFeeUsd).toBe(80);
    expect(result.userPaidGasUsd).toBe(4.5);
    expect(result.totalEstimatedTransactionCostUsd).toBe(84.5);
  });

  it("totals allocation splits to 100%", () => {
    expect(allocationTotals100(getFeeAllocationSplit("creator-portfolio"))).toBe(
      true,
    );
    expect(allocationTotals100(getFeeAllocationSplit("indexla-portfolio"))).toBe(
      true,
    );
    expect(getFeeAllocationSplit("indexla-portfolio").creator).toBe(0);
  });
});
