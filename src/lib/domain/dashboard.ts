export type ChartPeriod = "7d" | "30d" | "90d" | "1y";

export interface DashboardOverview {
  totalValueUsd: number;
  change30dUsd: number;
  return30dPercent: number;
  investedUsd: number;
  availableUsd: number;
  totalReturnUsd: number;
  totalReturnPercent: number;
  activeAutomations: number;
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
  activePortfolioIds: string[];
  automation: DashboardAutomationSummary;
  recentActivity: DashboardActivityItem[];
  market: MarketSnapshot;
}
