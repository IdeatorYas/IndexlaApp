/** Create Portfolio / Index builder domain models */

import type { NetworkId } from "@/lib/domain/types";

export type CreateProductType = "index" | "portfolio";

export type CreateVisibility = "personal" | "public";

export type AssetSupportStatus =
  | "supported"
  | "discovery-only"
  | "coming-soon"
  | "unsupported-network";

export type CreateStrategyId =
  | "none"
  | "dca"
  | "rebalance"
  | "buy-fear"
  | "sell-greed"
  | "rsi"
  | "momentum"
  | "take-profit"
  | "stop-loss"
  | "creator-strategy";

export type CreateWizardStep =
  | "product"
  | "category"
  | "assets"
  | "strategy"
  | "details"
  | "review";

export type IndexNarrativeCategory =
  | "ai"
  | "defi"
  | "depin"
  | "layer-1"
  | "layer-2"
  | "memecoins"
  | "gaming"
  | "rwa"
  | "other";

export interface CreateCategoryOption {
  id: IndexNarrativeCategory;
  label: string;
  description: string;
  /** CoinGecko category id when applicable */
  coingeckoCategoryId: string | null;
  isDegen: boolean;
}

export interface MarketAsset {
  id: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  change24hPercent: number | null;
  networkIds: NetworkId[];
  assetType:
    | "crypto"
    | "memecoin"
    | "tokenized-stock"
    | "tokenized-commodity"
    | "tokenized-real-estate"
    | "rwa"
    | "stablecoin";
  contractAddress: string | null;
  supportStatus: AssetSupportStatus;
  source: "coingecko" | "illustrative-fixture";
  categoryIds: string[];
  isIllustrative: boolean;
  stale?: boolean;
}

export interface CreateAllocationRow {
  assetId: string;
  percent: number;
}

export interface CreateStrategyConfig {
  strategyId: CreateStrategyId;
  creatorStrategyId: string | null;
  condition: string;
  action: string;
  frequency: string;
  amountOrPercent: string;
  slippageBps: number;
  tradeLimitUsd: string;
  dailyLimitUsd: string;
  expiry: string;
  circuitBreaker: boolean;
}

export interface CreateDraft {
  version: 1;
  updatedAt: string;
  step: CreateWizardStep;
  productType: CreateProductType | null;
  categoryId: IndexNarrativeCategory | null;
  otherCategoryId: string | null;
  allocations: CreateAllocationRow[];
  strategy: CreateStrategyConfig;
  investmentUsd: number;
  name: string;
  thesis: string;
  visibility: CreateVisibility;
  degenAcknowledged: boolean;
  previewConfirmed: boolean;
}

export const CREATE_DRAFT_STORAGE_KEY = "indexla.create.draft.v1";

export const INDEX_CATEGORIES: CreateCategoryOption[] = [
  {
    id: "ai",
    label: "AI",
    description: "Artificial intelligence and compute narratives.",
    coingeckoCategoryId: "artificial-intelligence",
    isDegen: false,
  },
  {
    id: "defi",
    label: "DeFi",
    description: "Decentralized finance protocols and liquidity.",
    coingeckoCategoryId: "decentralized-finance-defi",
    isDegen: false,
  },
  {
    id: "depin",
    label: "DePIN",
    description: "Decentralized physical infrastructure networks.",
    coingeckoCategoryId: "depin",
    isDegen: false,
  },
  {
    id: "layer-1",
    label: "Layer 1",
    description: "Base-layer blockchain networks.",
    coingeckoCategoryId: "layer-1",
    isDegen: false,
  },
  {
    id: "layer-2",
    label: "Layer 2",
    description: "Scaling and rollup ecosystems.",
    coingeckoCategoryId: "layer-2",
    isDegen: false,
  },
  {
    id: "memecoins",
    label: "Memecoins",
    description: "High-speculation meme narratives — extreme risk.",
    coingeckoCategoryId: "meme-token",
    isDegen: true,
  },
  {
    id: "gaming",
    label: "Gaming",
    description: "Gaming, metaverse and entertainment tokens.",
    coingeckoCategoryId: "gaming",
    isDegen: false,
  },
  {
    id: "rwa",
    label: "RWA",
    description: "Real-world asset linked crypto tokens.",
    coingeckoCategoryId: "real-world-assets-rwa",
    isDegen: false,
  },
  {
    id: "other",
    label: "Other CoinGecko categories",
    description: "Browse additional CoinGecko narrative categories.",
    coingeckoCategoryId: null,
    isDegen: false,
  },
];

export function defaultStrategyConfig(): CreateStrategyConfig {
  return {
    strategyId: "none",
    creatorStrategyId: null,
    condition: "",
    action: "",
    frequency: "weekly",
    amountOrPercent: "",
    slippageBps: 50,
    tradeLimitUsd: "",
    dailyLimitUsd: "",
    expiry: "",
    circuitBreaker: true,
  };
}

export function createEmptyDraft(): CreateDraft {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    step: "product",
    productType: null,
    categoryId: null,
    otherCategoryId: null,
    allocations: [],
    strategy: defaultStrategyConfig(),
    investmentUsd: 1_000,
    name: "",
    thesis: "",
    visibility: "personal",
    degenAcknowledged: false,
    previewConfirmed: false,
  };
}

export function allocationTotal(rows: CreateAllocationRow[]): number {
  return Math.round(rows.reduce((sum, row) => sum + row.percent, 0) * 100) / 100;
}

export function equalAllocate(assetIds: string[]): CreateAllocationRow[] {
  if (assetIds.length === 0) return [];
  const base = Math.floor((100 / assetIds.length) * 100) / 100;
  const rows = assetIds.map((assetId) => ({ assetId, percent: base }));
  const remainder =
    Math.round((100 - rows.reduce((s, r) => s + r.percent, 0)) * 100) / 100;
  rows[0].percent = Math.round((rows[0].percent + remainder) * 100) / 100;
  return rows;
}

export function normalizeAllocations(
  rows: CreateAllocationRow[],
): CreateAllocationRow[] {
  const total = rows.reduce((sum, row) => sum + row.percent, 0);
  if (total <= 0) return equalAllocate(rows.map((r) => r.assetId));
  const scaled = rows.map((row) => ({
    assetId: row.assetId,
    percent: Math.round((row.percent / total) * 10000) / 100,
  }));
  const remainder =
    Math.round((100 - scaled.reduce((s, r) => s + r.percent, 0)) * 100) / 100;
  if (scaled[0]) {
    scaled[0].percent =
      Math.round((scaled[0].percent + remainder) * 100) / 100;
  }
  return scaled;
}

export function wizardStepsFor(
  productType: CreateProductType | null,
): CreateWizardStep[] {
  if (productType === "index") {
    return ["product", "category", "assets", "strategy", "details", "review"];
  }
  return ["product", "assets", "strategy", "details", "review"];
}

export function stepLabel(step: CreateWizardStep): string {
  switch (step) {
    case "product":
      return "Choose Product";
    case "category":
      return "Index Category";
    case "assets":
      return "Assets & Allocations";
    case "strategy":
      return "Strategy & Automation";
    case "details":
      return "Investment & Details";
    case "review":
      return "Review & Confirm";
  }
}
