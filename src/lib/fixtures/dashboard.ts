import type { DashboardData } from "@/lib/domain/dashboard";
import {
  getIllustrativeChartSeries,
  ILLUSTRATIVE_TIMESTAMP,
} from "@/lib/fixtures/chart-series";
import { FIXTURE_LABEL, ILLUSTRATIVE_PORTFOLIOS } from "@/lib/fixtures/index";
import { APP_ROUTES } from "@/lib/routes";

export function getDashboardData(): DashboardData {
  const totalValue = ILLUSTRATIVE_PORTFOLIOS.reduce(
    (sum, p) => sum + p.valueUsd,
    0,
  );

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
      networkIds: ["ethereum", "base", "arbitrum", "solana"],
      chartSeries: getIllustrativeChartSeries(totalValue),
      isIllustrative: true,
    },
    gateways: {
      myPortfolio: {
        activePortfolios: ILLUSTRATIVE_PORTFOLIOS.length,
        assetCount: 8,
        return30d: 8.6,
        automationStatus: "2 active · 1 paused",
      },
      discover: {
        tabPreview: ["All", "Indexes", "Portfolios"],
        productCount: 48,
      },
      indexes: {
        count: 18,
        topName: "AI Infrastructure Index",
      },
      portfolios: {
        count: 30,
        topName: "Macro Diversified Index",
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
        statusLabel: "Creator access available",
        creatorCount: 124,
        href: APP_ROUTES.creators,
      },
    },
    featuredProducts: [
      {
        id: "ai-infra-index",
        name: "AI Infrastructure Index",
        kind: "Index",
        performance30d: 18.4,
        aumUsd: 4_200_000,
        href: `${APP_ROUTES.discover}?tab=indexes&id=ai-infra-index`,
      },
      {
        id: "macro-diversified",
        name: "Macro Diversified Index",
        kind: "Index",
        performance30d: 15.2,
        aumUsd: 6_800_000,
        href: `${APP_ROUTES.discover}?tab=indexes&id=macro-diversified`,
      },
      {
        id: "degen-ten-shots",
        name: "Solana Meme 10-Shots",
        kind: "Portfolio",
        performance30d: -12.5,
        aumUsd: 850_000,
        href: `${APP_ROUTES.degenClub}`,
      },
    ],
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
    notifications: [
      {
        id: "n1",
        title: "Automation scheduled",
        body: "Rebalance for AI Infrastructure Index runs in 6h.",
        createdAt: "2026-08-22T15:00:00.000Z",
        unread: true,
      },
      {
        id: "n2",
        title: "Permission healthy",
        body: "All automation sessions remain within limits.",
        createdAt: "2026-08-22T10:00:00.000Z",
        unread: true,
      },
      {
        id: "n3",
        title: "Reward eligibility",
        body: "Your ranked portfolio is in the Top 10 zone this month.",
        createdAt: "2026-08-21T18:00:00.000Z",
        unread: false,
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
    featuredProducts: [],
    notifications: [],
    automation: {
      ...base.automation,
      activeRules: 0,
      nextScheduledAction: "No scheduled actions",
      permissionHealthLabel: "Connect a portfolio to enable automation",
      lastExecution: "No executions yet",
    },
    recentActivity: [],
  };
}

export { FIXTURE_LABEL };
