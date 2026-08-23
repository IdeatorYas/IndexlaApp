import type {
  DiscoverSort,
  IndexType,
  MarketplaceProduct,
  NarrativeId,
  ProductTab,
} from "@/lib/domain/marketplace";

export type AssetCategory = IndexType | "All";

export const PRODUCT_TABS: { id: ProductTab; label: string }[] = [
  { id: "indexes", label: "Indexes" },
  { id: "portfolios", label: "Portfolios" },
];

export const ASSET_CATEGORY_TABS: { id: AssetCategory; label: string }[] = [
  { id: "All", label: "All" },
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

export const NARRATIVES_FOR_ALL_CATEGORIES: { id: NarrativeId; label: string }[] =
  [{ id: "all", label: "All" }];

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
  assetCategory: AssetCategory;
  narrative: NarrativeId;
  query: string;
  sort: DiscoverSort;
}

export const DEFAULT_FILTER_STATE: MarketplaceFilterState = {
  productTab: "indexes",
  assetCategory: "All",
  narrative: "all",
  query: "",
  sort: "trending",
};

function matchesProductTab(product: MarketplaceProduct, tab: ProductTab) {
  if (tab === "indexes") return product.kind === "Index";
  return product.kind === "Portfolio";
}

function matchesAssetCategory(
  product: MarketplaceProduct,
  assetCategory: AssetCategory,
) {
  if (assetCategory === "All") return true;
  return product.indexType === assetCategory;
}

function matchesNarrative(product: MarketplaceProduct, narrative: NarrativeId) {
  if (narrative === "all") return true;
  return product.narrative === narrative;
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
    if (!matchesAssetCategory(product, state.assetCategory)) return false;
    if (
      state.productTab === "indexes" &&
      !matchesNarrative(product, state.narrative)
    ) {
      return false;
    }
    if (!matchesSearch(product, state.query)) return false;
    return true;
  });
  return sortMarketplaceProducts(list, state.sort);
}

export function narrativeOptionsForCategory(
  assetCategory: AssetCategory,
): { id: NarrativeId; label: string }[] {
  if (assetCategory === "All") return NARRATIVES_FOR_ALL_CATEGORIES;
  return NARRATIVES_BY_INDEX_TYPE[assetCategory];
}

export function narrativeLabel(
  assetCategory: AssetCategory,
  narrative: NarrativeId,
): string {
  const match = narrativeOptionsForCategory(assetCategory).find(
    (n) => n.id === narrative,
  );
  return match?.label ?? narrative;
}
