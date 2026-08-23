import type { ProductRisk } from "@/lib/domain/dashboard";
import type {
  DiscoverCatalog,
  IndexType,
  MarketplaceProduct,
  MarketplaceStrategyTag,
  NarrativeId,
} from "@/lib/domain/marketplace";
import type { Portfolio } from "@/lib/domain/types";
import {
  INDEXLA_INDEX_CATALOG,
  getTrendingIndexes,
} from "@/lib/fixtures/index-catalog";
import {
  FIXTURE_LABEL,
  ILLUSTRATIVE_NETWORKS,
  ILLUSTRATIVE_PORTFOLIOS,
} from "@/lib/fixtures/index";
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

const PORTFOLIO_STRATEGY_TAGS: Record<string, MarketplaceStrategyTag[]> = {
  "degen-ten-shots": ["momentum"],
  "defi-core": ["momentum"],
  "rwa-income": ["buy-fear-sell-greed"],
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
  if (portfolio.id === "degen-ten-shots") return APP_ROUTES.degenClub;
  return `${APP_ROUTES.discover}?tab=portfolios&id=${portfolio.id}`;
}

export function portfolioToMarketplaceProduct(
  portfolio: Portfolio,
): MarketplaceProduct {
  const indexType = PORTFOLIO_INDEX_TYPE[portfolio.id] ?? "Crypto";
  const narrative = PORTFOLIO_NARRATIVE[portfolio.id] ?? "all";
  return {
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
    strategy: portfolio.strategyName,
    strategyTags: PORTFOLIO_STRATEGY_TAGS[portfolio.id] ?? ["momentum"],
    strategyComposition: [
      { label: portfolio.strategyName, percent: 100 },
    ],
    performance30d: portfolio.performance30d,
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
    featured: portfolio.id === "degen-ten-shots",
    isNew: portfolio.id === "degen-ten-shots",
    addedAt: PORTFOLIO_ADDED[portfolio.id] ?? "2025-06-01",
    rankMonthly: portfolio.rankMonthly,
    isIllustrative: portfolio.isIllustrative,
  };
}

export function toMarketplaceProduct(portfolio: Portfolio): MarketplaceProduct {
  return portfolioToMarketplaceProduct(portfolio);
}

export function getDiscoverCatalog(): DiscoverCatalog {
  const portfolios = ILLUSTRATIVE_PORTFOLIOS.filter(
    (p) => p.discoveryLabel === "Portfolio",
  ).map(portfolioToMarketplaceProduct);

  const products = [...INDEXLA_INDEX_CATALOG, ...portfolios];

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
  return getDiscoverCatalog().products.find((p) => p.id === id);
}

export { FIXTURE_LABEL };
