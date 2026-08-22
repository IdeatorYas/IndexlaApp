import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getDashboard,
  getDataProvider,
  getDexlaBalance,
  getDiscoverCatalog,
  getCreatorsWorkspace,
  getCreatorPublicProfile,
  getDegenClubWorkspace,
  getLeaderboardWorkspace,
  getMyPortfolioWorkspace,
  getPortfolios,
  getStrategiesWorkspace,
} from "@/lib/data";

const ORIGINAL_ENV = { ...process.env };

describe("data-access layer", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("serves illustrative fixtures when ILLUSTRATIVE_DEMO_DATA is enabled", () => {
    process.env.ILLUSTRATIVE_DEMO_DATA = "true";
    const provider = getDataProvider();
    expect(provider.kind).toBe("illustrative-fixtures");
    expect(provider.isIllustrative).toBe(true);

    const dashboard = getDashboard();
    expect(dashboard.isIllustrative).toBe(true);
    expect(dashboard.availability).toBe("populated");
    expect(dashboard.data.featuredProducts.length).toBeGreaterThan(0);
    expect(getPortfolios().data.length).toBeGreaterThan(0);
    expect(getDexlaBalance().data.balance).toBeGreaterThan(0);
    expect(getDiscoverCatalog().data.products.length).toBeGreaterThan(0);
    expect(getMyPortfolioWorkspace().data.portfolios.length).toBeGreaterThan(0);
    expect(getStrategiesWorkspace().data.marketplace.length).toBeGreaterThan(0);
    expect(getLeaderboardWorkspace().data.monthlyEntries).toHaveLength(25);
    expect(getDegenClubWorkspace().data.products.length).toBeGreaterThan(0);
    expect(getCreatorsWorkspace().data.creators.length).toBeGreaterThanOrEqual(25);
    expect(getCreatorPublicProfile("indexla").data?.handle).toBe("indexla");
    expect(getCreatorPublicProfile("missing-handle-xyz").data).toBeNull();
  });

  it("switches to live provider when illustrative demo data is disabled", () => {
    process.env.ILLUSTRATIVE_DEMO_DATA = "false";
    const provider = getDataProvider();
    expect(provider.kind).toBe("live");
    expect(provider.isIllustrative).toBe(false);

    const dashboard = getDashboard();
    expect(dashboard.availability).toBe("unavailable");
    expect(dashboard.isIllustrative).toBe(false);
    expect(dashboard.data.featuredProducts).toHaveLength(0);
  });
});
