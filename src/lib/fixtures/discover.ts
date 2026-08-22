import type { MarketplaceCategory, ProductRisk } from "@/lib/domain/dashboard";
import type { DiscoverCatalog, MarketplaceProduct } from "@/lib/domain/marketplace";
import type { Portfolio } from "@/lib/domain/types";
import {
  ILLUSTRATIVE_NETWORKS,
  ILLUSTRATIVE_PORTFOLIOS,
} from "@/lib/fixtures/index";
import { APP_ROUTES } from "@/lib/routes";

const CATEGORY_BY_ID: Record<string, MarketplaceCategory> = {
  "ai-infra-index": "AI",
  "macro-diversified": "Hybrid",
  "degen-ten-shots": "Degen",
  "defi-core": "DeFi",
  "rwa-income": "RWAs",
  "commodities-lite": "Commodities",
  "tokenized-tech": "Tokenized Stocks",
  "solana-growth": "Crypto",
};

const RISK_BY_ID: Record<string, ProductRisk> = {
  "ai-infra-index": "Medium",
  "macro-diversified": "Low",
  "degen-ten-shots": "Extreme",
  "defi-core": "Medium",
  "rwa-income": "Low",
  "commodities-lite": "Medium",
  "tokenized-tech": "Medium",
  "solana-growth": "High",
};

const FEATURED_IDS = new Set([
  "ai-infra-index",
  "macro-diversified",
  "degen-ten-shots",
]);

const TRENDING_IDS = [
  "solana-growth",
  "ai-infra-index",
  "defi-core",
  "macro-diversified",
];

const NEW_IDS = new Set([
  "degen-ten-shots",
  "commodities-lite",
  "tokenized-tech",
]);

function portfolioHref(portfolio: Portfolio): string {
  if (portfolio.id === "degen-ten-shots") return APP_ROUTES.degenClub;
  const tab =
    portfolio.discoveryLabel === "Index" ? "indexes" : "portfolios";
  return `${APP_ROUTES.discover}?tab=${tab}&id=${portfolio.id}`;
}

export function toMarketplaceProduct(portfolio: Portfolio): MarketplaceProduct {
  return {
    id: portfolio.id,
    name: portfolio.name,
    kind: portfolio.discoveryLabel,
    category: CATEGORY_BY_ID[portfolio.id] ?? "Crypto",
    creatorName: portfolio.creatorName ?? "Creator",
    creatorHandle: portfolio.creatorHandle ?? "creator",
    verified: true,
    thesis: portfolio.thesis,
    strategy: portfolio.strategyName,
    performance30d: portfolio.performance30d,
    aumUsd: portfolio.aumUsd,
    investors: portfolio.investorCount,
    likes: portfolio.likeCount,
    risk: RISK_BY_ID[portfolio.id] ?? "Medium",
    networkIds: portfolio.networkIds,
    allocations: portfolio.assets.map((a) => ({
      assetId: a.assetId,
      label: a.label,
      percent: a.percent,
    })),
    assetIds: portfolio.assets.map((a) => a.assetId),
    href: portfolioHref(portfolio),
    featured: FEATURED_IDS.has(portfolio.id),
    isNew: NEW_IDS.has(portfolio.id),
    rankMonthly: portfolio.rankMonthly,
    isIllustrative: portfolio.isIllustrative,
  };
}

export function getDiscoverCatalog(): DiscoverCatalog {
  const products = ILLUSTRATIVE_PORTFOLIOS.map(toMarketplaceProduct);
  const byId = new Map(products.map((p) => [p.id, p]));

  return {
    products,
    featured: products.filter((p) => p.featured),
    trending: TRENDING_IDS.map((id) => byId.get(id)).filter(
      (p): p is MarketplaceProduct => Boolean(p),
    ),
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
    networks: ILLUSTRATIVE_NETWORKS.filter((n) => !n.plannedOnly).map((n) => ({
      id: n.id,
      label: n.label,
    })),
    strategies: [
      ...new Set(products.map((p) => p.strategy)),
    ].sort(),
    risks: ["Low", "Medium", "High", "Extreme"],
  };
}

export function getMarketplaceProductById(
  id: string,
): MarketplaceProduct | undefined {
  return ILLUSTRATIVE_PORTFOLIOS.map(toMarketplaceProduct).find(
    (p) => p.id === id,
  );
}
