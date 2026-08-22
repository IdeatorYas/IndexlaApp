export type ChartPeriod = "7d" | "30d" | "90d" | "1y";

export type MarketplaceTab = "All" | "Indexes" | "Portfolios";

export type MarketplaceCategory =
  | "Crypto"
  | "AI"
  | "DeFi"
  | "RWAs"
  | "Tokenized Stocks"
  | "Commodities"
  | "Hybrid"
  | "Degen";

export type ProductRisk = "Low" | "Medium" | "High" | "Extreme";

export interface DashboardOverview {
  totalValueUsd: number;
  change30dUsd: number;
  return30dPercent: number;
  investedUsd: number;
  availableUsd: number;
  totalReturnUsd: number;
  totalReturnPercent: number;
  activeAutomations: number;
  activePortfolioCount: number;
  claimableRewardsUsd: number | null;
  networkIds: string[];
  chartSeries: Record<ChartPeriod, { t: string; v: number }[]>;
  isIllustrative: boolean;
}

export type ActivityType =
  | "portfolio-buy"
  | "automated-execution"
  | "rebalance"
  | "tip"
  | "strategy-access";

export interface DashboardActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  amountUsd: number | null;
  amountDexla: number | null;
  status: "confirmed" | "pending" | "failed";
  timestamp: string;
  isIllustrative: boolean;
}

export interface DashboardAutomationSummary {
  activeRules: number;
  nextScheduledAction: string;
  permissionHealth: "healthy" | "expiring" | "degraded";
  permissionHealthLabel: string;
  lastExecution: string;
  isIllustrative: boolean;
}

export interface MarketSnapshot {
  fearGreedIndex: number;
  fearGreedLabel: string;
  btcDominancePercent: number;
  totalMarketTrendPercent: number;
  totalMarketTrendDirection: "up" | "down" | "flat";
  dataTimestamp: string;
  isIllustrative: boolean;
}

export interface LeaderboardPreviewEntry {
  rank: number;
  portfolioId: string;
  portfolioName: string;
  performance30d: number;
}

export interface AllocationPreview {
  assetId: string;
  label: string;
  percent: number;
}

export interface FeaturedProductPreview {
  id: string;
  name: string;
  kind: "Index" | "Portfolio";
  creatorHandle: string;
  creatorName: string;
  verified: boolean;
  thesis: string;
  strategy: string;
  performance30d: number;
  aumUsd: number;
  investors: number;
  risk: ProductRisk;
  allocations: AllocationPreview[];
  assetIds: string[];
  href: string;
}

export interface MarketplaceProductPreview {
  id: string;
  name: string;
  kind: "Index" | "Portfolio";
  category: MarketplaceCategory;
  creatorName: string;
  creatorHandle: string;
  verified: boolean;
  performance30d: number;
  aumUsd: number;
  investors: number;
  allocations: AllocationPreview[];
  assetIds: string[];
  href: string;
  isNew?: boolean;
}

export interface MarketplacePreview {
  trending: MarketplaceProductPreview[];
  mostInvested: MarketplaceProductPreview[];
  newThisWeek: MarketplaceProductPreview[];
}

export interface ProductPathway {
  id: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  accent: "blue" | "violet" | "magenta" | "emerald" | "amber" | "rose";
}

export interface NotificationPreviewItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
}

/** Legacy gateway stats retained for Discover previews and tests */
export interface ProductGatewayStats {
  myPortfolio: {
    activePortfolios: number;
    assetCount: number;
    return30d: number;
    automationStatus: string;
  };
  discover: {
    tabPreview: ("All" | "Indexes" | "Portfolios")[];
    productCount: number;
  };
  indexes: {
    count: number;
    topName: string;
  };
  portfolios: {
    count: number;
    topName: string;
  };
  degenClub: {
    tagline: string;
    indexCount: number;
  };
  strategies: {
    available: number;
    active: number;
  };
  leaderboard: {
    topThree: LeaderboardPreviewEntry[];
    userBestRank: number | null;
    topTenMessage: string;
  };
  creatorHub: {
    statusLabel: string;
    creatorCount: number;
    href: string;
  };
}

export interface DashboardData {
  nickname: string;
  overview: DashboardOverview;
  gateways: ProductGatewayStats;
  featuredProducts: FeaturedProductPreview[];
  marketplace: MarketplacePreview;
  pathways: ProductPathway[];
  categories: MarketplaceCategory[];
  activePortfolioIds: string[];
  automation: DashboardAutomationSummary;
  recentActivity: DashboardActivityItem[];
  notifications: NotificationPreviewItem[];
  market: MarketSnapshot;
}
