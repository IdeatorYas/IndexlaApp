import type {
  AllocationPreview,
  ProductRisk,
} from "@/lib/domain/dashboard";
import type { ProductSelectedStrategy } from "@/lib/domain/product-strategy";
import type { NetworkId } from "@/lib/domain/types";

export type IndexType =
  | "Crypto"
  | "Tokenized Stocks"
  | "Tokenized Commodities"
  | "Hybrid";

export type ProductTab = "indexes" | "portfolios";

export type NarrativeId =
  | "all"
  | "layer-1"
  | "layer-2"
  | "ai"
  | "depin"
  | "gaming"
  | "ai-agents"
  | "rwa"
  | "defi"
  | "privacy"
  | "oracles"
  | "semiconductors"
  | "mega-tech"
  | "crypto-stocks"
  | "space-quantum"
  | "tech-etfs"
  | "metals"
  | "diversified-commodities"
  | "ai-compute"
  | "robotics"
  | "blockchain-economy"
  | "rwa-tokenization"
  | "digital-infrastructure"
  | "future-payments";

export type MarketplaceStrategyTag =
  | "buy-fear-sell-greed"
  | "rsi"
  | "tp-sl"
  | "momentum";

export interface StrategyCompositionEntry {
  label: string;
  percent: number;
}

export interface PerformancePoint {
  t: string;
  v: number;
}

/** Shared product card model for Dashboard + Discover. */
export interface MarketplaceProduct {
  id: string;
  name: string;
  kind: "Index" | "Portfolio";
  indexType: IndexType;
  narrative: NarrativeId;
  narrativeLabel: string;
  creatorName: string;
  creatorHandle: string;
  verified: boolean;
  description: string;
  /** @deprecated Use description — kept for legacy references */
  thesis: string;
  /** @deprecated Use selectedStrategy.name */
  strategy: string;
  strategyTags: MarketplaceStrategyTag[];
  /** @deprecated Internal catalog guidance only — never render */
  strategyComposition?: StrategyCompositionEntry[];
  selectedStrategy: ProductSelectedStrategy;
  performance30d: number;
  performanceChart: PerformancePoint[];
  aumUsd: number;
  volumeUsd: number;
  investors: number;
  likes: number;
  risk: ProductRisk;
  networkIds: NetworkId[];
  allocations: AllocationPreview[];
  assetIds: string[];
  href: string;
  featured: boolean;
  isNew: boolean;
  addedAt: string;
  rankMonthly: number | null;
  isIllustrative: boolean;
}

export type DiscoverSort =
  | "trending"
  | "best-performance"
  | "highest-aum"
  | "highest-volume"
  | "most-investors"
  | "recently-added";

/** @deprecated Use ProductTab */
export type DiscoverTab = "all" | "indexes" | "portfolios";

export interface DiscoverCatalog {
  products: MarketplaceProduct[];
  featured: MarketplaceProduct[];
  trending: MarketplaceProduct[];
  networks: { id: NetworkId; label: string }[];
  strategies: string[];
  risks: ProductRisk[];
}
