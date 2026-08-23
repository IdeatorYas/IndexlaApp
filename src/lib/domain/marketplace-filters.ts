import type { ProductRisk } from "@/lib/domain/dashboard";
import type {
  DiscoverSort,
  IndexType,
  MarketplaceProduct,
  MarketplaceStrategyTag,
  NarrativeId,
  ProductTab,
} from "@/lib/domain/marketplace";
import type { NetworkId } from "@/lib/domain/types";

export const PRODUCT_TABS: { id: ProductTab; label: string }[] = [
  { id: "indexes", label: "Indexes" },
  { id: "portfolios", label: "Portfolios" },
];

export const INDEX_TYPE_TABS: { id: IndexType; label: string }[] = [
  { id: "Crypto", label: "Crypto" },
  { id: "Tokenized Stocks", label: "Tokenized Stocks" },
  { id: "Tokenized Commodities", label: "Tokenized Commodities" },
  { id: "Hybrid", label: "Hybrid" },
];

export const NARRATIVES_BY_INDEX_TYPE: Record<
  IndexType,
  { id: NarrativeId; label: string }[]
> = {
  Crypto: [
    { id: "all", label: "All" },
    { id: "layer-1", label: "Layer 1" },
    { id: "layer-2", label: "Layer 2" },
    { id: "ai", label: "AI" },
    { id: "depin", label: "DePIN" },
    { id: "gaming", label: "Gaming" },
    { id: "ai-agents", label: "AI Agents" },
    { id: "rwa", label: "RWA" },
    { id: "defi", label: "DeFi" },
    { id: "privacy", label: "Privacy" },
    { id: "oracles", label: "Oracles" },
  ],
  "Tokenized Stocks": [
    { id: "all", label: "All" },
    { id: "ai", label: "AI" },
    { id: "semiconductors", label: "Semiconductors" },
    { id: "mega-tech", label: "Mega-Tech" },
    { id: "crypto-stocks", label: "Crypto Stocks" },
    { id: "space-quantum", label: "Space & Quantum" },
    { id: "tech-etfs", label: "Tech ETFs" },
  ],
  "Tokenized Commodities": [
    { id: "all", label: "All" },
    { id: "metals", label: "Metals" },
    { id: "diversified-commodities", label: "Diversified Commodities" },
  ],
  Hybrid: [
    { id: "all", label: "All" },
    { id: "ai-compute", label: "AI & Compute" },
    { id: "robotics", label: "Robotics" },
    { id: "blockchain-economy", label: "Blockchain Economy" },
    { id: "rwa-tokenization", label: "RWA & Tokenization" },
    { id: "gaming", label: "Gaming" },
    { id: "digital-infrastructure", label: "Digital Infrastructure" },
    { id: "future-payments", label: "Future Payments" },
  ],
};

export const RISK_FILTERS: (ProductRisk | "All")[] = [
  "All",
  "Low",
  "Medium",
  "High",
  "Extreme",
];

export const STRATEGY_FILTERS: {
  id: MarketplaceStrategyTag | "All";
  label: string;
}[] = [
  { id: "All", label: "All" },
  { id: "buy-fear-sell-greed", label: "Buy Fear/Sell Greed" },
  { id: "rsi", label: "RSI" },
  { id: "tp-sl", label: "TP/SL" },
  { id: "momentum", label: "Momentum" },
];

export const SORT_OPTIONS: { id: DiscoverSort; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "best-performance", label: "Best Performance" },
  { id: "highest-aum", label: "Highest AUM" },
  { id: "highest-volume", label: "Highest Volume" },
  { id: "most-investors", label: "Most Investors" },
  { id: "recently-added", label: "Recently Added" },
];

export interface MarketplaceFilterState {
  productTab: ProductTab;
  indexType: IndexType;
  narrative: NarrativeId;
  query: string;
  risk: ProductRisk | "All";
  network: NetworkId | "All";
  strategy: MarketplaceStrategyTag | "All";
  sort: DiscoverSort;
}

export const DEFAULT_FILTER_STATE: MarketplaceFilterState = {
  productTab: "indexes",
  indexType: "Crypto",
  narrative: "all",
  query: "",
  risk: "All",
  network: "All",
  strategy: "All",
  sort: "trending",
};

function matchesProductTab(product: MarketplaceProduct, tab: ProductTab) {
  if (tab === "indexes") return product.kind === "Index";
  return product.kind === "Portfolio";
}

function matchesIndexType(product: MarketplaceProduct, indexType: IndexType) {
  return product.indexType === indexType;
}

function matchesNarrative(product: MarketplaceProduct, narrative: NarrativeId) {
  if (narrative === "all") return true;
  return product.narrative === narrative;
}

function matchesRisk(product: MarketplaceProduct, risk: ProductRisk | "All") {
  if (risk === "All") return true;
  return product.risk === risk;
}

function matchesNetwork(
  product: MarketplaceProduct,
  network: NetworkId | "All",
) {
  if (network === "All") return true;
  return product.networkIds.includes(network);
}

function matchesStrategy(
  product: MarketplaceProduct,
  strategy: MarketplaceStrategyTag | "All",
) {
  if (strategy === "All") return true;
  return product.strategyTags.includes(strategy);
}

function matchesSearch(product: MarketplaceProduct, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (product.name.toLowerCase().includes(q)) return true;
  if (product.description.toLowerCase().includes(q)) return true;
  return product.assetIds.some(
    (id) =>
      id.toLowerCase().includes(q) ||
      product.allocations.some(
        (a) =>
          a.assetId.toLowerCase().includes(q) ||
          a.label.toLowerCase().includes(q),
      ),
  );
}

export function sortMarketplaceProducts(
  products: MarketplaceProduct[],
  sort: DiscoverSort,
) {
  const next = [...products];
  switch (sort) {
    case "best-performance":
      return next.sort((a, b) => b.performance30d - a.performance30d);
    case "highest-aum":
      return next.sort((a, b) => b.aumUsd - a.aumUsd);
    case "highest-volume":
      return next.sort((a, b) => b.volumeUsd - a.volumeUsd);
    case "most-investors":
      return next.sort((a, b) => b.investors - a.investors);
    case "recently-added":
      return next.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    case "trending":
    default:
      return next.sort((a, b) => b.likes - a.likes);
  }
}

export function filterMarketplaceProducts(
  products: MarketplaceProduct[],
  state: MarketplaceFilterState,
) {
  const list = products.filter((product) => {
    if (!matchesProductTab(product, state.productTab)) return false;
    if (!matchesIndexType(product, state.indexType)) return false;
    if (!matchesNarrative(product, state.narrative)) return false;
    if (!matchesRisk(product, state.risk)) return false;
    if (!matchesNetwork(product, state.network)) return false;
    if (!matchesStrategy(product, state.strategy)) return false;
    if (!matchesSearch(product, state.query)) return false;
    return true;
  });
  return sortMarketplaceProducts(list, state.sort);
}

export function narrativeLabel(
  indexType: IndexType,
  narrative: NarrativeId,
): string {
  const match = NARRATIVES_BY_INDEX_TYPE[indexType].find((n) => n.id === narrative);
  return match?.label ?? narrative;
}
