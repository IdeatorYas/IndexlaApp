import { describe, expect, it } from "vitest";
import {
  allocationTotal,
  createEmptyDraft,
  equalAllocate,
  normalizeAllocations,
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
});
