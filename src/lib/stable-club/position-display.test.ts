import { describe, expect, it } from "vitest";
import {
  formatPositionTokenAmount,
  positionStatusLabel,
} from "@/lib/stable-club/position-display";

describe("position-display", () => {
  it("formats USDC 6-decimal amounts", () => {
    expect(formatPositionTokenAmount(BigInt(2_000_000), 6)).toBe("2");
    expect(formatPositionTokenAmount(BigInt(2_000_123), 6)).toBe("2.000123");
  });

  it("labels open vs closed", () => {
    expect(
      positionStatusLabel({
        liquidity: BigInt(1),
        amountA: BigInt(1),
        amountB: BigInt(0),
        rangeStatus: "unknown",
      }),
    ).toBe("Open");
    expect(
      positionStatusLabel({
        liquidity: BigInt(0),
        amountA: BigInt(0),
        amountB: BigInt(0),
        rangeStatus: "unknown",
      }),
    ).toBe("Closed");
  });
});
