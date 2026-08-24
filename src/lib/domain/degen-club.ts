import type { NetworkId } from "@/lib/domain/types";

/** Canonical Degen Club risk copy — non-dismissible wherever Degen is active. */
export const DEGEN_RISK_WARNING =
  "Extreme Risk — Memecoins are highly volatile and may lose most or all of their value. Diversification does not remove risk.";

export type DegenDiscoverFilter =
  | "all"
  | "solana"
  | "ethereum"
  | "base"
  | "bnb"
  | "multi-chain";

export type DegenMarketTab = "indexes" | "portfolios";

export type DegenChainLabel =
  | "Solana"
  | "Ethereum"
  | "Base"
  | "BNB Chain"
  | "Multi-Chain";

export interface DegenAllocation {
  assetId: string;
  label: string;
  percent: number;
  /** Full asset name for detail views. */
  name?: string;
  ticker?: string;
  coingeckoId?: string;
  networkLabel?: string;
  /** Populated at runtime from CoinGecko. */
  imageUrl?: string | null;
  priceUsd?: number | null;
}

export interface DegenActivityItem {
  id: string;
  title: string;
  subtitle: string;
  atIso: string;
  isIllustrative: boolean;
}

export interface DegenProduct {
  id: string;
  name: string;
  kind: "Index" | "Portfolio";
  creatorHandle: string;
  creatorName: string;
  verified: boolean;
  thesis: string;
  strategy: string;
  rebalanceRules: string;
  riskLabel: "Extreme";
  volatilityLabel: string;
  chainLabel: DegenChainLabel;
  networkIds: NetworkId[];
  allocations: DegenAllocation[];
  performance30d: number;
  aumUsd: number;
  volumeUsd: number;
  investors: number;
  likes: number;
  featured: boolean;
  trending: boolean;
  isNew: boolean;
  chartSeries: { t: string; v: number }[];
  activity: DegenActivityItem[];
  feeEstimateUsd: number;
  estimatedCostUsd: number;
  href: string;
  isIllustrative: boolean;
}

export interface DegenClubWorkspace {
  products: DegenProduct[];
  featuredIds: string[];
  trendingIds: string[];
  marketDataStale: boolean;
  isIllustrative: boolean;
  hero: {
    title: string;
    headline: string;
    subheadline: string;
    tagline: string;
    points: string[];
    trustBadges: string[];
  };
}
