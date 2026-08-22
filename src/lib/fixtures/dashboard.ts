import type { DashboardData } from "@/lib/domain/dashboard";
import { getIllustrativeChartSeries, ILLUSTRATIVE_TIMESTAMP } from "@/lib/fixtures/chart-series";
import { FIXTURE_LABEL, ILLUSTRATIVE_PORTFOLIOS } from "@/lib/fixtures/index";
import { APP_ROUTES } from "@/lib/routes";

export function getDashboardData(): DashboardData {
  const totalValue = ILLUSTRATIVE_PORTFOLIOS.reduce((sum, p) => sum + p.valueUsd, 0);

  return {
    nickname: "Investor",
    overview: {
      totalValueUsd: totalValue,
      change30dUsd: 4_820,
      return30dPercent: 8.6,
      investedUsd: 46_500,
      availableUsd: 4_000,
      totalReturnUsd: 12_400,
      totalReturnPercent: 21.3,
      activeAutomations: 3,
      networkIds: ["ethereum", "base", "solana"],
      chartSeries: getIllustrativeChartSeries(totalValue),
      isIllustrative: true,
    },
    gateways: {
      myPortfolio: {
        activePortfolios: 2,
        assetCount: 6,
        return30d: 8.6,
        automationStatus: "2 active · 1 paused",
      },
      discover: {
        tabPreview: ["All", "Indexes", "Portfolios"],
        productCount: 48,
      },
      degenClub: {
        tagline: "10 Shots > 1 Shot",
        indexCount: 12,
      },
      strategies: {
        available: 14,
        active: 3,
      },
      leaderboard: {
        topThree: [
          {
            rank: 1,
            portfolioId: "ai-infra-index",
            portfolioName: "AI Infrastructure Index",
            performance30d: 18.4,
          },
          {
            rank: 2,
            portfolioId: "macro-diversified",
            portfolioName: "Macro Diversified Index",
            performance30d: 15.2,
          },
          {
            rank: 3,
            portfolioId: "defi-core",
            portfolioName: "DeFi Core Portfolio",
            performance30d: 12.8,
          },
        ],
        userBestRank: 2,
        topTenMessage: "Top 10 portfolios win monthly rewards",
      },
      creatorHub: {
        statusLabel: "Verified creator",
        creatorCount: 124,
        href: APP_ROUTES.creators,
      },
    },
    activePortfolioIds: ILLUSTRATIVE_PORTFOLIOS.map((p) => p.id),
    automation: {
      activeRules: 3,
      nextScheduledAction: "Rebalance · AI Infrastructure Index · in 6h",
      permissionHealth: "healthy",
      permissionHealthLabel: "All permissions healthy",
      lastExecution: "DCA buy · 14h ago · confirmed",
      isIllustrative: true,
    },
    recentActivity: [
      {
        id: "act-1",
        type: "portfolio-buy",
        title: "Portfolio buy",
        subtitle: "AI Infrastructure Index",
        amountUsd: 2_500,
        amountDexla: null,
        status: "confirmed",
        timestamp: "2026-08-22T14:20:00.000Z",
        isIllustrative: true,
      },
      {
        id: "act-2",
        type: "automated-execution",
        title: "Automated execution",
        subtitle: "Buy Fear signal · ETH",
        amountUsd: 420,
        amountDexla: null,
        status: "confirmed",
        timestamp: "2026-08-22T08:05:00.000Z",
        isIllustrative: true,
      },
      {
        id: "act-3",
        type: "rebalance",
        title: "Rebalance",
        subtitle: "Macro Diversified Index",
        amountUsd: null,
        amountDexla: null,
        status: "confirmed",
        timestamp: "2026-08-21T19:40:00.000Z",
        isIllustrative: true,
      },
      {
        id: "act-4",
        type: "tip",
        title: "Creator tip",
        subtitle: "@indexla",
        amountUsd: null,
        amountDexla: 250,
        status: "confirmed",
        timestamp: "2026-08-21T11:15:00.000Z",
        isIllustrative: true,
      },
      {
        id: "act-5",
        type: "strategy-access",
        title: "Strategy access",
        subtitle: "Momentum Alpha · preview",
        amountUsd: null,
        amountDexla: null,
        status: "pending",
        timestamp: "2026-08-20T16:30:00.000Z",
        isIllustrative: true,
      },
    ],
    market: {
      fearGreedIndex: 62,
      fearGreedLabel: "Greed",
      btcDominancePercent: 54.2,
      totalMarketTrendPercent: 2.4,
      totalMarketTrendDirection: "up",
      dataTimestamp: ILLUSTRATIVE_TIMESTAMP,
      isIllustrative: true,
    },
  };
}

export function getEmptyDashboardData(): DashboardData {
  const base = getDashboardData();
  return {
    ...base,
    overview: {
      ...base.overview,
      totalValueUsd: 0,
      change30dUsd: 0,
      return30dPercent: 0,
      investedUsd: 0,
      availableUsd: 0,
      totalReturnUsd: 0,
      totalReturnPercent: 0,
      activeAutomations: 0,
      chartSeries: getIllustrativeChartSeries(0),
    },
    activePortfolioIds: [],
    automation: {
      ...base.automation,
      activeRules: 0,
      nextScheduledAction: "No scheduled actions",
      permissionHealth: "healthy",
      permissionHealthLabel: "Connect a portfolio to enable automation",
      lastExecution: "No executions yet",
    },
    recentActivity: [],
  };
}

export { FIXTURE_LABEL };
