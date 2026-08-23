import type { ProductRisk } from "@/lib/domain/dashboard";
import type {
  DiscoverCatalog,
  IndexType,
  MarketplaceProduct,
  NarrativeId,
} from "@/lib/domain/marketplace";
import type { Portfolio } from "@/lib/domain/types";
import { normalizeProductMetrics } from "@/lib/fixtures/marketplace-metrics";
import {
  INDEXLA_INDEX_CATALOG,
  getTrendingIndexes,
} from "@/lib/fixtures/index-catalog";
import {
  INDEXLA_PORTFOLIO_CATALOG,
  getOfficialPortfolioById,
} from "@/lib/fixtures/portfolio-catalog";
import {
  FIXTURE_LABEL,
  ILLUSTRATIVE_NETWORKS,
  ILLUSTRATIVE_PORTFOLIOS,
} from "@/lib/fixtures/index";
import {
  buildPerformanceChart,
  PRODUCT_STRATEGY_LIBRARY,
  resolveProductStrategy,
  strategyTagsForId,
} from "@/lib/fixtures/product-strategies";
import { APP_ROUTES } from "@/lib/routes";

const PORTFOLIO_INDEX_TYPE: Record<string, IndexType> = {
  "degen-ten-shots": "Crypto",
  "defi-core": "Crypto",
  "rwa-income": "Hybrid",
};

const PORTFOLIO_NARRATIVE: Record<string, NarrativeId> = {
  "degen-ten-shots": "gaming",
  "defi-core": "defi",
  "rwa-income": "rwa-tokenization",
};

const PORTFOLIO_NARRATIVE_LABEL: Record<string, string> = {
  "degen-ten-shots": "Gaming",
  "defi-core": "DeFi",
  "rwa-income": "RWA & Tokenization",
};

const PORTFOLIO_RISK: Record<string, ProductRisk> = {
  "degen-ten-shots": "Extreme",
  "defi-core": "Medium",
  "rwa-income": "Low",
};

const PORTFOLIO_STRATEGY_ID: Record<string, string> = {
  "degen-ten-shots": "degen-guardrails",
  "defi-core": "momentum-alpha",
  "rwa-income": "income-harvest",
};

const PORTFOLIO_VOLUME: Record<string, number> = {
  "degen-ten-shots": 420_000,
  "defi-core": 680_000,
  "rwa-income": 540_000,
};

const PORTFOLIO_ADDED: Record<string, string> = {
  "degen-ten-shots": "2026-01-15",
  "defi-core": "2025-07-10",
  "rwa-income": "2025-08-22",
};

function portfolioHref(portfolio: Portfolio): string {
  return APP_ROUTES.product(portfolio.id);
}

function portfolioStrategy(portfolio: Portfolio) {
  const id = PORTFOLIO_STRATEGY_ID[portfolio.id];
  if (id) return resolveProductStrategy(id);
  const name = portfolio.strategyName;
  const match = Object.values(PRODUCT_STRATEGY_LIBRARY).find(
    (s) => s.name === name,
  );
  if (match) return match;
  return {
    ...resolveProductStrategy("weekly-rebalance"),
    name,
    explanation: `Creator-selected ${name} rules for this portfolio.`,
  };
}

export function portfolioToMarketplaceProduct(
  portfolio: Portfolio,
): MarketplaceProduct {
  const indexType = PORTFOLIO_INDEX_TYPE[portfolio.id] ?? "Crypto";
  const narrative = PORTFOLIO_NARRATIVE[portfolio.id] ?? "all";
  const selectedStrategy = portfolioStrategy(portfolio);
  const strategyId =
    PORTFOLIO_STRATEGY_ID[portfolio.id] ?? selectedStrategy.id;
  return normalizeProductMetrics({
    id: portfolio.id,
    name: portfolio.name,
    kind: "Portfolio",
    indexType,
    narrative,
    narrativeLabel: PORTFOLIO_NARRATIVE_LABEL[portfolio.id] ?? "All",
    creatorName: portfolio.creatorName ?? "Creator",
    creatorHandle: portfolio.creatorHandle ?? "creator",
    verified: true,
    description: portfolio.thesis,
    thesis: portfolio.thesis,
    strategy: selectedStrategy.name,
    strategyTags: strategyTagsForId(strategyId),
    selectedStrategy,
    performance30d: portfolio.performance30d,
    performanceChart: buildPerformanceChart(
      portfolio.aumUsd / 1000,
      portfolio.performance30d,
    ),
    aumUsd: portfolio.aumUsd,
    volumeUsd: PORTFOLIO_VOLUME[portfolio.id] ?? 500_000,
    investors: portfolio.investorCount,
    likes: portfolio.likeCount,
    risk: PORTFOLIO_RISK[portfolio.id] ?? "Medium",
    networkIds: portfolio.networkIds,
    allocations: portfolio.assets.map((a) => ({
      assetId: a.assetId,
      label: a.label,
      percent: a.percent,
    })),
    assetIds: portfolio.assets.map((a) => a.assetId),
    href: portfolioHref(portfolio),
    featured: false,
    isNew: false,
    addedAt: PORTFOLIO_ADDED[portfolio.id] ?? "2025-06-01",
    rankMonthly: portfolio.rankMonthly,
    isIllustrative: portfolio.isIllustrative,
  });
}

export function toMarketplaceProduct(portfolio: Portfolio): MarketplaceProduct {
  return portfolioToMarketplaceProduct(portfolio);
}

export function getCommunityMarketplacePortfolios(): MarketplaceProduct[] {
  return ILLUSTRATIVE_PORTFOLIOS.filter(
    (p) => p.discoveryLabel === "Portfolio",
  ).map(portfolioToMarketplaceProduct);
}

export function getDiscoverCatalog(): DiscoverCatalog {
  const products = [...INDEXLA_INDEX_CATALOG, ...INDEXLA_PORTFOLIO_CATALOG];

  return {
    products,
    featured: INDEXLA_INDEX_CATALOG.filter((p) => p.featured),
    trending: getTrendingIndexes(4),
    networks: ILLUSTRATIVE_NETWORKS.filter((n) => !n.plannedOnly).map((n) => ({
      id: n.id,
      label: n.label,
    })),
    strategies: [
      "Buy Fear / Sell Greed",
      "RSI Oversold / Overbought",
      "Take Profit / Stop Loss",
      "Momentum Trend",
    ],
    risks: ["Low", "Medium", "High", "Extreme"],
  };
}

export function getMarketplaceProductById(
  id: string,
): MarketplaceProduct | undefined {
  const official = getOfficialPortfolioById(id);
  if (official) return official;
  const indexProduct = INDEXLA_INDEX_CATALOG.find((p) => p.id === id);
  if (indexProduct) return indexProduct;
  return getCommunityMarketplacePortfolios().find((p) => p.id === id);
}

export { FIXTURE_LABEL };
