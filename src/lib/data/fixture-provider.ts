import type { DashboardData } from "@/lib/domain/dashboard";
import type { IndexlaDataProvider, DataResult } from "@/lib/data/types";
import { getDashboardData } from "@/lib/fixtures/dashboard";
import {
  getDiscoverCatalog as fixtureDiscoverCatalog,
  getMarketplaceProductById as fixtureMarketplaceProductById,
} from "@/lib/fixtures/discover";
import { getMyPortfolioWorkspace as fixtureMyPortfolioWorkspace } from "@/lib/fixtures/my-portfolio";
import {
  FIXTURE_LABEL,
  ILLUSTRATIVE_CREATORS,
  ILLUSTRATIVE_DEXLA,
  ILLUSTRATIVE_NETWORKS,
  ILLUSTRATIVE_PORTFOLIOS,
  ILLUSTRATIVE_STRATEGIES,
  getCreatorByHandle as fixtureCreatorByHandle,
  getPortfolioById as fixturePortfolioById,
} from "@/lib/fixtures/index";
import type { DiscoverCatalog, MarketplaceProduct } from "@/lib/domain/marketplace";
import type { MyPortfolioWorkspace } from "@/lib/domain/my-portfolio";

function ok<T>(data: T): DataResult<T> {
  return {
    source: "illustrative-fixtures",
    availability: "populated",
    isIllustrative: true,
    data,
  };
}

export const fixtureDataProvider: IndexlaDataProvider = {
  kind: "illustrative-fixtures",
  isIllustrative: true,
  getDashboard() {
    return ok<DashboardData>(getDashboardData());
  },
  getPortfolios() {
    return ok([...ILLUSTRATIVE_PORTFOLIOS]);
  },
  getPortfolioById(id) {
    return ok(fixturePortfolioById(id) ?? null);
  },
  getCreators() {
    return ok([...ILLUSTRATIVE_CREATORS]);
  },
  getCreatorByHandle(handle) {
    return ok(fixtureCreatorByHandle(handle) ?? null);
  },
  getStrategies() {
    return ok([...ILLUSTRATIVE_STRATEGIES]);
  },
  getNetworks() {
    return ok([...ILLUSTRATIVE_NETWORKS]);
  },
  getDexlaBalance() {
    return ok({ ...ILLUSTRATIVE_DEXLA });
  },
  getDiscoverCatalog() {
    return ok<DiscoverCatalog>(fixtureDiscoverCatalog());
  },
  getMarketplaceProductById(id) {
    return ok<MarketplaceProduct | null>(
      fixtureMarketplaceProductById(id) ?? null,
    );
  },
  getMyPortfolioWorkspace() {
    return ok<MyPortfolioWorkspace>(fixtureMyPortfolioWorkspace());
  },
  getFixtureLabel() {
    return FIXTURE_LABEL;
  },
};
