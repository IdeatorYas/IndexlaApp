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
  | "rwa"
  | "defi"
  | "depin"
  | "ai"
  | "layer-1"
  | "layer-2"
  | "gaming"
  | "oracles"
  | "ai-agents"
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
    id: "rwa",
    label: "RWA",
    description: "Real-world asset linked crypto tokens.",
    coingeckoCategoryId: "real-world-assets-rwa",
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
    id: "ai",
    label: "AI",
    description: "Artificial intelligence and compute narratives.",
    coingeckoCategoryId: "artificial-intelligence",
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
    id: "gaming",
    label: "Gaming",
    description: "Gaming, metaverse and entertainment tokens.",
    coingeckoCategoryId: "gaming",
    isDegen: false,
  },
  {
    id: "oracles",
    label: "Oracles",
    description: "Oracle networks and data infrastructure.",
    coingeckoCategoryId: "oracle",
    isDegen: false,
  },
  {
    id: "ai-agents",
    label: "AI Agents",
    description: "Autonomous AI agent tokens and platforms.",
    coingeckoCategoryId: "ai-agents",
    isDegen: false,
  },
  {
    id: "other",
    label: "Others",
    description:
      "Liquid Staking, Restaking, Privacy, Interoperability, Modular Blockchain, DEX, NFT, and more.",
    coingeckoCategoryId: null,
    isDegen: false,
  },
];

/** Shown first under Others in the Index Builder. */
export const INDEX_OTHER_PINNED_CATEGORIES: {
  category_id: string;
  name: string;
}[] = [
  { category_id: "liquid-staking", name: "Liquid Staking" },
  { category_id: "restaking", name: "Restaking" },
  { category_id: "privacy", name: "Privacy" },
  { category_id: "interoperability", name: "Interoperability" },
  { category_id: "modular-blockchain", name: "Modular Blockchain" },
  { category_id: "decentralized-exchange", name: "DEX" },
  { category_id: "non-fungible-tokens-nft", name: "NFT" },
];

const MAIN_COINGECKO_CATEGORY_IDS = new Set(
  INDEX_CATEGORIES.map((c) => c.coingeckoCategoryId).filter(
    (id): id is string => Boolean(id),
  ),
);

const PINNED_OTHER_IDS = new Set(
  INDEX_OTHER_PINNED_CATEGORIES.map((c) => c.category_id),
);

function isMemeCoinGeckoCategory(categoryId: string, name: string): boolean {
  const hay = `${categoryId} ${name}`.toLowerCase();
  return (
    hay.includes("meme") ||
    categoryId === "meme-token" ||
    categoryId.startsWith("meme")
  );
}

/**
 * Others list for Index Builder: pinned narratives first, then remaining
 * CoinGecko categories (excluding main tiles and memecoins / Degen Club).
 */
export function buildIndexOtherCategories(
  all: { category_id: string; name: string }[],
): { category_id: string; name: string }[] {
  const byId = new Map(all.map((c) => [c.category_id, c]));
  const pinned = INDEX_OTHER_PINNED_CATEGORIES.map(
    (p) => byId.get(p.category_id) ?? p,
  );
  const rest = all
    .filter(
      (c) =>
        !MAIN_COINGECKO_CATEGORY_IDS.has(c.category_id) &&
        !PINNED_OTHER_IDS.has(c.category_id) &&
        !isMemeCoinGeckoCategory(c.category_id, c.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...pinned, ...rest];
}

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
