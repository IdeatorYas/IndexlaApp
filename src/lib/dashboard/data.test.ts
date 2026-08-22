import { describe, expect, it } from "vitest";
import { getDashboard } from "@/lib/data";
import { getActivePortfolios, formatDexla, formatUsd } from "@/lib/dashboard/data";

describe("dashboard fixtures via data layer", () => {
  it("provides marketplace-first dashboard fields", () => {
    const data = getDashboard().data;
    expect(data.overview.totalValueUsd).toBeGreaterThan(0);
    expect(data.featuredProducts.length).toBeGreaterThanOrEqual(3);
    expect(data.marketplace.trending.length).toBeGreaterThan(0);
    expect(data.pathways).toHaveLength(5);
    expect(data.gateways.leaderboard.topThree).toHaveLength(3);
    expect(data.recentActivity.length).toBeGreaterThan(0);
  });

  it("keeps USD and $DEXLA formatting separate", () => {
    expect(formatUsd(1000)).toContain("$");
    expect(formatDexla(250)).toContain("$DEXLA");
    expect(formatDexla(250)).not.toContain("$250.00");
  });

  it("returns up to three active portfolios", () => {
    const data = getDashboard().data;
    const portfolios = getActivePortfolios(data.activePortfolioIds);
    expect(portfolios.length).toBeLessThanOrEqual(3);
    expect(portfolios.length).toBeGreaterThan(0);
  });
});
