import type { NetworkId, PortfolioType } from "@/lib/domain/types";

export type StrategiesTab = "marketplace" | "mine" | "publish";

export type StrategyOwnershipStatus =
  | "draft"
  | "published"
  | "active"
  | "paused";

export type StrategySort =
  | "popular"
  | "most-used"
  | "newest"
  | "performance";

export type StrategyCategory =
  | "Sentiment"
  | "Momentum"
  | "Rebalance"
  | "Risk"
  | "Income"
  | "Degen";

export type StrategyTypeLabel =
  | "Core"
  | "Creator"
  | "Automation"
  | "Risk control";

export interface StrategyPerformancePoint {
  t: string;
  v: number;
}

export interface MarketplaceStrategyCard {
  id: string;
  name: string;
  description: string;
  logicSummary: string;
  creatorHandle: string;
  creatorName: string;
  verified: boolean;
  isIndexlaCore: boolean;
  featured: boolean;
  isNew: boolean;
  category: StrategyCategory;
  strategyType: StrategyTypeLabel;
  riskLevel: "low" | "medium" | "high" | "extreme";
  networkIds: NetworkId[];
  compatibleAssets: string[];
  compatiblePortfolioTypes: PortfolioType[];
  activePortfolios: number;
  activeCreatorUsers: number;
  performance30d: number;
  executions30d: number;
  automationHealth: "healthy" | "degraded" | "paused";
  /** null = free (INDEXLA core) */
  accessPriceDexla: number | null;
  executionFeeSharePercent: number;
  accessSplitCreatorPercent: number;
  accessSplitBurnPercent: number;
  chartSeries: StrategyPerformancePoint[];
  isIllustrative: boolean;
  /** Whether the current demo creator already owns access */
  alreadyOwnedByCreator: boolean;
}

export interface MyStrategyRecord {
  id: string;
  name: string;
  description: string;
  origin: "created" | "purchased" | "copied";
  status: StrategyOwnershipStatus;
  rulesSummary: string;
  compatiblePortfolios: string[];
  performance30d: number;
  executions30d: number;
  activeCreatorUsers: number;
  accessSales: number;
  creatorRevenueDexla: number;
  burnedDexla: number;
  influencedAumUsd: number;
  influencedVolumeUsd: number;
  automationHealth: "healthy" | "degraded" | "paused";
  accessPriceDexla: number | null;
  chartSeries: StrategyPerformancePoint[];
  isIllustrative: boolean;
}

export interface PublishStrategyDraft {
  name: string;
  description: string;
  logic: string;
  conditions: string;
  configurableParameters: string;
  assetCategories: string[];
  networkIds: NetworkId[];
  riskLevel: "low" | "medium" | "high" | "extreme";
  disclosures: string;
  accessPriceDexla: number;
}

export interface StrategiesWorkspace {
  marketplace: MarketplaceStrategyCard[];
  myStrategies: MyStrategyRecord[];
  publishDefaults: PublishStrategyDraft;
  listingFeeDexla: number;
  listingFeeBurnPercent: number;
  accessSplitCreatorPercent: number;
  accessSplitBurnPercent: number;
  defaultExecutionFeeSharePercent: number;
  demoDexlaBalance: number;
  categories: StrategyCategory[];
  strategyTypes: StrategyTypeLabel[];
  risks: Array<"low" | "medium" | "high" | "extreme">;
  networks: NetworkId[];
  isIllustrative: boolean;
}
