import type {
  AllocationPreview,
  MarketplaceCategory,
  ProductRisk,
} from "@/lib/domain/dashboard";
import type { NetworkId } from "@/lib/domain/types";

/** Shared product card model for Dashboard + Discover. */
export interface MarketplaceProduct {
  id: string;
  name: string;
  kind: "Index" | "Portfolio";
  category: MarketplaceCategory;
  creatorName: string;
  creatorHandle: string;
  verified: boolean;
  thesis: string;
  strategy: string;
  performance30d: number;
  aumUsd: number;
  investors: number;
  likes: number;
  risk: ProductRisk;
  networkIds: NetworkId[];
  allocations: AllocationPreview[];
  assetIds: string[];
  href: string;
  featured: boolean;
  isNew: boolean;
  rankMonthly: number | null;
  isIllustrative: boolean;
}

export type DiscoverSort =
  | "trending"
  | "most-invested"
  | "best-performance"
  | "newest";

export type DiscoverTab = "all" | "indexes" | "portfolios";

export interface DiscoverCatalog {
  products: MarketplaceProduct[];
  featured: MarketplaceProduct[];
  trending: MarketplaceProduct[];
  categories: MarketplaceCategory[];
  networks: { id: NetworkId; label: string }[];
  strategies: string[];
  risks: ProductRisk[];
}
