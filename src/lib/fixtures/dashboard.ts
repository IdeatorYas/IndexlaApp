import type { DashboardData, MarketplaceCategory } from "@/lib/domain/dashboard";
import type { IndexType } from "@/lib/domain/marketplace";
import {
  getIllustrativeChartSeries,
  ILLUSTRATIVE_TIMESTAMP,
} from "@/lib/fixtures/chart-series";
import { getMarketplaceProductById } from "@/lib/fixtures/discover";
import { FIXTURE_LABEL, ILLUSTRATIVE_PORTFOLIOS } from "@/lib/fixtures/index";
import { INDEXLA_INDEX_CATALOG } from "@/lib/fixtures/index-catalog";
import { APP_ROUTES } from "@/lib/routes";

function productById(id: string) {
  const p = getMarketplaceProductById(id);
  if (!p) throw new Error(`Missing marketplace product: ${id}`);
  return p;
}

function toFeatured(id: string) {
  const p = productById(id);
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    creatorHandle: p.creatorHandle,
    creatorName: p.creatorName,
    verified: p.verified,
    thesis: p.thesis,
    strategy: p.strategy,
    performance30d: p.performance30d,
    aumUsd: p.aumUsd,
    volumeUsd: p.volumeUsd,
    investors: p.investors,
    risk: p.risk,
    allocations: p.allocations,
    assetIds: p.assetIds,
    href: p.href,
  };
}

function indexTypeToCategory(indexType: IndexType): MarketplaceCategory {
  if (indexType === "Tokenized Commodities") return "Commodities";
  return indexType as MarketplaceCategory;
}

function toPreview(id: string, isNew?: boolean) {
  const p = productById(id);
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    category: indexTypeToCategory(p.indexType),
    creatorName: p.creatorName,
    creatorHandle: p.creatorHandle,
    verified: p.verified,
    performance30d: p.performance30d,
    aumUsd: p.aumUsd,
    investors: p.investors,
    allocations: p.allocations,
    assetIds: p.assetIds,
    href: p.href,
    isNew: isNew ?? p.isNew,
  };
}

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
      activePortfolioCount: ILLUSTRATIVE_PORTFOLIOS.length,
      claimableRewardsUsd: 186,
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
        tabPreview: ["Indexes", "Portfolios"],
        productCount:
          INDEXLA_INDEX_CATALOG.length +
          ILLUSTRATIVE_PORTFOLIOS.filter((p) => p.discoveryLabel === "Portfolio")
            .length,
      },
      indexes: {
        count: INDEXLA_INDEX_CATALOG.length,
        topName: "Layer 1 Index",
      },
      portfolios: {
        count: ILLUSTRATIVE_PORTFOLIOS.filter(
          (p) => p.discoveryLabel === "Portfolio",
        ).length,
        topName: "DeFi Core Portfolio",
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
            portfolioId: "layer-1-index",
            portfolioName: "Layer 1 Index",
            performance30d: 14.2,
          },
          {
            rank: 2,
            portfolioId: "ai-index",
            portfolioName: "AI Index",
            performance30d: 22.4,
          },
          {
            rank: 3,
            portfolioId: "ai-agents-index",
            portfolioName: "AI Agents Index",
            performance30d: 31.5,
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
      toFeatured("layer-1-index"),
      toFeatured("ai-index"),
      toFeatured("defi-index"),
    ],
    marketplace: {
      trending: [
        toPreview("ai-agents-index"),
        toPreview("layer-2-index"),
        toPreview("defi-index"),
      ],
      mostInvested: [
        toPreview("layer-1-index"),
        toPreview("tokenized-mega-tech-index"),
        toPreview("defi-index"),
      ],
      newThisWeek: [
        toPreview("ai-index", true),
        toPreview("ai-agents-index", true),
        toPreview("tokenized-crypto-stocks-index", true),
      ],
    },
    pathways: [
      {
        id: "create",
        title: "Create Portfolio / Index",
        description: "Build a rules-based index or public portfolio in minutes.",
        href: APP_ROUTES.create,
        cta: "Start Building",
        accent: "blue",
      },
      {
        id: "degen",
        title: "Degen Club",
        description: "Diversified memecoin indexes — extreme risk, transparent.",
        href: APP_ROUTES.degenClub,
        cta: "Enter Degen Club",
        accent: "rose",
      },
      {
        id: "strategies",
        title: "Strategies",
        description: "Browse and apply creator strategies with clear permissions.",
        href: APP_ROUTES.strategies,
        cta: "Explore Strategies",
        accent: "violet",
      },
      {
        id: "leaderboard",
        title: "Portfolio Leaderboard",
        description: "Top 10 public portfolios compete for monthly rewards.",
        href: APP_ROUTES.leaderboard,
        cta: "View Leaderboard",
        accent: "amber",
      },
      {
        id: "creators",
        title: "Browse Creators",
        description: "Discover verified creators and follow their products.",
        href: APP_ROUTES.creators,
        cta: "Browse Creators",
        accent: "emerald",
      },
    ],
    categories: [
      "Crypto",
      "AI",
      "DeFi",
      "RWAs",
      "Tokenized Stocks",
      "Commodities",
      "Hybrid",
      "Degen",
    ],
    activePortfolioIds: ILLUSTRATIVE_PORTFOLIOS.slice(0, 3).map((p) => p.id),
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
      activePortfolioCount: 0,
      claimableRewardsUsd: null,
      chartSeries: getIllustrativeChartSeries(0),
    },
    activePortfolioIds: [],
    featuredProducts: [],
    marketplace: { trending: [], mostInvested: [], newThisWeek: [] },
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
