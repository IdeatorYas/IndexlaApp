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
  | "fear-greed"
  | "rsi"
  | "momentum"
  | "take-profit-stop-loss"
  | "creator-strategy";

export type MomentumTimeframe = "daily" | "weekly";
export type RsiTimeframe = "daily" | "weekly";
export type DcaMode = "calendar" | "schedule";
export type DcaSchedule = "daily" | "weekly";

export type CreateWizardStep = "basics" | "assets" | "strategy" | "review";

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
  | "liquid-staking"
  | "restaking"
  | "privacy"
  | "interoperability"
  | "modular-blockchain"
  | "dex"
  | "nft";

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
  /** Legacy fields retained for draft compatibility — not shown in simplified UI. */
  condition: string;
  action: string;
  frequency: string;
  /** Percentage of deposited wallet balance used per execution (1–100). */
  executionPercent: number;
  amountOrPercent: string;
  slippageBps: number;
  tradeLimitUsd: string;
  dailyLimitUsd: string;
  expiry: string;
  circuitBreaker: boolean;
  /** Momentum only: Daily or Weekly trend. */
  momentumTimeframe: MomentumTimeframe;
  /** RSI only: Daily or Weekly RSI. */
  rsiTimeframe: RsiTimeframe;
  takeProfitTargetPercent: number;
  takeProfitSellPercent: number;
  stopLossTargetPercent: number;
  stopLossSellPercent: number;
  dcaMode: DcaMode;
  /** ISO date strings (YYYY-MM-DD) when dcaMode is calendar. */
  dcaDates: string[];
  dcaSchedule: DcaSchedule;
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
    id: "liquid-staking",
    label: "Liquid Staking",
    description: "Liquid staking tokens and protocols.",
    coingeckoCategoryId: "liquid-staking",
    isDegen: false,
  },
  {
    id: "restaking",
    label: "Restaking",
    description: "Restaking protocols and related assets.",
    coingeckoCategoryId: "restaking",
    isDegen: false,
  },
  {
    id: "privacy",
    label: "Privacy",
    description: "Privacy-focused networks and coins.",
    coingeckoCategoryId: "privacy",
    isDegen: false,
  },
  {
    id: "interoperability",
    label: "Interoperability",
    description: "Cross-chain and interoperability protocols.",
    coingeckoCategoryId: "interoperability",
    isDegen: false,
  },
  {
    id: "modular-blockchain",
    label: "Modular Blockchain",
    description: "Modular blockchain infrastructure.",
    coingeckoCategoryId: "modular-blockchain",
    isDegen: false,
  },
  {
    id: "dex",
    label: "DEX",
    description: "Decentralized exchange protocols.",
    coingeckoCategoryId: "decentralized-exchange",
    isDegen: false,
  },
  {
    id: "nft",
    label: "NFT",
    description: "NFT marketplaces and related tokens.",
    coingeckoCategoryId: "non-fungible-tokens-nft",
    isDegen: false,
  },
];

/** @deprecated Prefer INDEX_CATEGORIES — kept for legacy Other-list helpers. */
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
    executionPercent: 0,
    amountOrPercent: "",
    slippageBps: 50,
    tradeLimitUsd: "",
    dailyLimitUsd: "",
    expiry: "",
    circuitBreaker: true,
    momentumTimeframe: "daily",
    rsiTimeframe: "daily",
    takeProfitTargetPercent: 0,
    takeProfitSellPercent: 0,
    stopLossTargetPercent: 0,
    stopLossSellPercent: 0,
    dcaMode: "schedule",
    dcaDates: [],
    dcaSchedule: "weekly",
  };
}

/** Migrate legacy strategy ids / fields from older local drafts. */
export function normalizeStrategyConfig(
  raw: Partial<CreateStrategyConfig> & { strategyId?: string },
): CreateStrategyConfig {
  const base = defaultStrategyConfig();
  const rawId = String(raw.strategyId || "none");
  let strategyId: CreateStrategyId = "none";
  if (rawId === "buy-fear" || rawId === "sell-greed") {
    strategyId = "fear-greed";
  } else if (rawId === "take-profit" || rawId === "stop-loss") {
    strategyId = "take-profit-stop-loss";
  } else if (
    (
      [
        "none",
        "dca",
        "rebalance",
        "fear-greed",
        "rsi",
        "momentum",
        "take-profit-stop-loss",
        "creator-strategy",
      ] as string[]
    ).includes(rawId)
  ) {
    strategyId = rawId as CreateStrategyId;
  }

  let executionPercent = Number(raw.executionPercent);
  if (!Number.isFinite(executionPercent) || executionPercent <= 0) {
    const fromLegacy = parseFloat(
      String(raw.amountOrPercent ?? "").replace("%", ""),
    );
    executionPercent =
      Number.isFinite(fromLegacy) && fromLegacy > 0 ? fromLegacy : 0;
  }
  executionPercent = Math.max(0, Math.min(100, executionPercent));

  const momentumTimeframe: MomentumTimeframe =
    raw.momentumTimeframe === "weekly" || raw.frequency === "weekly"
      ? "weekly"
      : "daily";
  const rsiTimeframe: RsiTimeframe =
    raw.rsiTimeframe === "weekly" ? "weekly" : "daily";
  const dcaMode: DcaMode = raw.dcaMode === "calendar" ? "calendar" : "schedule";
  const dcaSchedule: DcaSchedule =
    raw.dcaSchedule === "daily" ? "daily" : "weekly";
  const dcaDates = Array.isArray(raw.dcaDates)
    ? raw.dcaDates.filter((d) => typeof d === "string")
    : [];

  return {
    ...base,
    ...raw,
    strategyId,
    executionPercent,
    amountOrPercent:
      executionPercent > 0 ? String(executionPercent) : raw.amountOrPercent ?? "",
    momentumTimeframe,
    rsiTimeframe,
    takeProfitTargetPercent: Math.max(0, Number(raw.takeProfitTargetPercent) || 0),
    takeProfitSellPercent: Math.max(0, Number(raw.takeProfitSellPercent) || 0),
    stopLossTargetPercent: Math.max(0, Number(raw.stopLossTargetPercent) || 0),
    stopLossSellPercent: Math.max(0, Number(raw.stopLossSellPercent) || 0),
    dcaMode,
    dcaDates,
    dcaSchedule,
  };
}

export const FEAR_GREED_FIXED_RULES = [
  { threshold: "Below 20", label: "Fear" },
  { threshold: "Below 10", label: "Extreme Fear" },
  { threshold: "Above 60", label: "Greed" },
  { threshold: "Above 80", label: "Extreme Greed" },
] as const;

export const CREATE_STRATEGY_OPTIONS: {
  id: CreateStrategyId;
  label: string;
  hint: string;
}[] = [
  { id: "none", label: "None", hint: "Manual management only" },
  { id: "dca", label: "DCA", hint: "Recurring buys on a schedule" },
  { id: "rebalance", label: "Rebalance", hint: "Restore target weights" },
  {
    id: "fear-greed",
    label: "Fear & Greed",
    hint: "Buy during Fear/Extreme Fear and sell during Greed/Extreme Greed.",
  },
  {
    id: "rsi",
    label: "RSI",
    hint: "Buy when oversold and sell when overbought.",
  },
  {
    id: "take-profit-stop-loss",
    label: "Take Profit & Stop Loss",
    hint: "Exit on upside targets and protect on downside limits.",
  },
  {
    id: "momentum",
    label: "Momentum",
    hint: "Buy when the daily or weekly trend turns bullish.",
  },
  {
    id: "creator-strategy",
    label: "Eligible creator strategy",
    hint: "Apply a marketplace strategy",
  },
];

export function createEmptyDraft(): CreateDraft {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    step: "basics",
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

/** Fixed 4-step Create flow for Portfolio and Index. */
export function wizardStepsFor(
  // Kept for call-site compatibility with product-type branching.
  productType?: CreateProductType | null,
): CreateWizardStep[] {
  void productType;
  return ["basics", "assets", "strategy", "review"];
}

export function migrateWizardStep(step: string): CreateWizardStep {
  if (step === "product" || step === "category" || step === "details") {
    if (step === "details") return "review";
    if (step === "category") return "assets";
    return "basics";
  }
  if (
    step === "basics" ||
    step === "assets" ||
    step === "strategy" ||
    step === "review"
  ) {
    return step;
  }
  return "basics";
}

export function stepLabel(step: CreateWizardStep): string {
  switch (step) {
    case "basics":
      return "Name & Description";
    case "assets":
      return "Assets & Allocations";
    case "strategy":
      return "Automation Strategy";
    case "review":
      return "Review & Confirm";
  }
}

export function strategyIsConfigured(strategy: CreateStrategyConfig): boolean {
  const { strategyId, executionPercent, creatorStrategyId } = strategy;
  if (strategyId === "none") return true;
  if (strategyId === "creator-strategy" && !creatorStrategyId) return false;
  if (strategyId === "take-profit-stop-loss") {
    return (
      strategy.takeProfitTargetPercent > 0 &&
      strategy.takeProfitSellPercent > 0 &&
      strategy.stopLossTargetPercent > 0 &&
      strategy.stopLossSellPercent > 0
    );
  }
  if (strategyId === "dca") {
    if (strategy.dcaMode === "calendar") {
      return strategy.dcaDates.length > 0 && executionPercent > 0;
    }
    return executionPercent > 0;
  }
  if (strategyId === "rsi" || strategyId === "momentum") {
    return executionPercent > 0;
  }
  return executionPercent > 0 && executionPercent <= 100;
}
