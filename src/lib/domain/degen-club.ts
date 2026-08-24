import type { NetworkId } from "@/lib/domain/types";

/** Canonical Degen Club risk copy — non-dismissible wherever Degen is active. */
export const DEGEN_RISK_TITLE = "EXTREME RISK WARNING";

export const DEGEN_RISK_PARAGRAPHS = [
  "Memecoins are highly speculative and extremely volatile. Most memecoins may lose substantial value or go to zero. You may lose your entire investment.",
  "Prices can move rapidly, liquidity can disappear, and assets may be affected by manipulation, scams, abandoned projects or smart-contract vulnerabilities. Diversification and automation do not remove these risks.",
  "INDEXLA provides non-custodial technology—not investment advice, asset recommendations or guaranteed returns. Users invest entirely at their own risk and remain responsible for their decisions, transactions and losses. INDEXLA is not responsible for investment losses.",
  "Only invest funds you can afford to lose. By continuing, you confirm that you understand and accept these risks.",
] as const;

/** Flat string for tests / plain-text surfaces. Prefer DEGEN_RISK_TITLE + paragraphs in UI. */
export const DEGEN_RISK_WARNING = [
  DEGEN_RISK_TITLE,
  ...DEGEN_RISK_PARAGRAPHS,
].join("\n\n");

export type DegenDiscoverFilter =
  | "all"
  | "solana"
  | "ethereum"
  | "base"
  | "bnb"
  | "sui"
  | "robinhood"
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
