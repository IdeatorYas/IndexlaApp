import { describe, expect, it } from "vitest";
import {
  getCreatorDashboardWorkspace,
  getEmptyCreatorDashboardWorkspace,
} from "@/lib/fixtures/creator-dashboard";

describe("creator dashboard fixtures", () => {
  it("populates identity, separate USD/$DEXLA earnings and per-product ranks", () => {
    const ws = getCreatorDashboardWorkspace("indexla");
    expect(ws.identity.handle).toBe("indexla");
    expect(ws.identity.socials).toHaveLength(3);
    expect(ws.liveProducts.length).toBeGreaterThan(0);
    expect(ws.usdEarnings.totalEarnedUsd).toBeGreaterThan(0);
    expect(ws.dexlaEarnings.totalEarnedDexla).toBeGreaterThan(0);
    expect(ws.leaderboardRows).toHaveLength(ws.liveProducts.length);
    for (const row of ws.leaderboardRows) {
      expect(row.productId).toBeTruthy();
    }
    expect(
      ws.liveProducts[0]?.featurePlacement.costDexla,
    ).toBe(2500);
    expect(ws.isIllustrative).toBe(true);
  });

  it("empty workspace has no live products or earnings", () => {
    const empty = getEmptyCreatorDashboardWorkspace();
    expect(empty.liveProducts).toHaveLength(0);
    expect(empty.usdEarnings.availableUsd).toBe(0);
    expect(empty.dexlaEarnings.availableDexla).toBe(0);
  });
});
