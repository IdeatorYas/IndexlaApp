import { describe, expect, it } from "vitest";
import { getDashboardData } from "@/lib/fixtures/dashboard";
import { getActivePortfolios, formatDexla, formatUsd } from "@/lib/dashboard/data";

describe("dashboard fixtures", () => {
  it("provides all gateway and overview fields", () => {
    const data = getDashboardData();
    expect(data.overview.totalValueUsd).toBeGreaterThan(0);
    expect(data.gateways.leaderboard.topThree).toHaveLength(3);
    expect(data.recentActivity.length).toBeGreaterThan(0);
  });

  it("keeps USD and $DEXLA formatting separate", () => {
    expect(formatUsd(1000)).toContain("$");
    expect(formatDexla(250)).toContain("$DEXLA");
    expect(formatDexla(250)).not.toContain("$250.00");
  });

  it("returns up to three active portfolios", () => {
    const data = getDashboardData();
    const portfolios = getActivePortfolios(data.activePortfolioIds);
    expect(portfolios.length).toBeLessThanOrEqual(3);
    expect(portfolios.length).toBeGreaterThan(0);
  });
});
