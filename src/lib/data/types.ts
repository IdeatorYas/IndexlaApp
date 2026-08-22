import type { DashboardData } from "@/lib/domain/dashboard";
import type { LeaderboardWorkspace } from "@/lib/domain/leaderboard";
import type { DiscoverCatalog, MarketplaceProduct } from "@/lib/domain/marketplace";
import type { MyPortfolioWorkspace } from "@/lib/domain/my-portfolio";
import type { StrategiesWorkspace } from "@/lib/domain/strategies";
import type {
  CreatorProfile,
  DexlaBalanceAndTier,
  Network,
  Portfolio,
  Strategy,
} from "@/lib/domain/types";

export type DataSourceKind = "illustrative-fixtures" | "live" | "testnet";

export type DataAvailability =
  | "populated"
  | "empty"
  | "unavailable"
  | "disabled";

export interface DataResult<T> {
  source: DataSourceKind;
  availability: DataAvailability;
  isIllustrative: boolean;
  data: T;
  reason?: string;
}

export interface IndexlaDataProvider {
  readonly kind: DataSourceKind;
  readonly isIllustrative: boolean;
  getDashboard(): DataResult<DashboardData>;
  getPortfolios(): DataResult<Portfolio[]>;
  getPortfolioById(id: string): DataResult<Portfolio | null>;
  getCreators(): DataResult<CreatorProfile[]>;
  getCreatorByHandle(handle: string): DataResult<CreatorProfile | null>;
  getStrategies(): DataResult<Strategy[]>;
  getNetworks(): DataResult<Network[]>;
  getDexlaBalance(): DataResult<DexlaBalanceAndTier>;
  getDiscoverCatalog(): DataResult<DiscoverCatalog>;
  getMarketplaceProductById(id: string): DataResult<MarketplaceProduct | null>;
  getMyPortfolioWorkspace(): DataResult<MyPortfolioWorkspace>;
  getStrategiesWorkspace(): DataResult<StrategiesWorkspace>;
  getLeaderboardWorkspace(): DataResult<LeaderboardWorkspace>;
  getFixtureLabel(): string;
}
