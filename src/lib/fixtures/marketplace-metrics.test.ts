import { describe, expect, it } from "vitest";
import { normalizeIllustrativeVolume } from "@/lib/fixtures/marketplace-metrics";

describe("normalizeIllustrativeVolume", () => {
  it("returns zero when AUM is zero", () => {
    expect(normalizeIllustrativeVolume(0, 500_000)).toBe(0);
  });

  it("raises volume above AUM when needed", () => {
    expect(normalizeIllustrativeVolume(10_000_000, 4_000_000)).toBeGreaterThan(
      10_000_000,
    );
  });

  it("preserves volume that already exceeds AUM", () => {
    expect(normalizeIllustrativeVolume(5_000_000, 12_000_000)).toBe(
      12_000_000,
    );
  });
});
