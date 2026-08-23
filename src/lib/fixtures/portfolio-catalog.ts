import type { ProductRisk } from "@/lib/domain/dashboard";
import type {
  IndexType,
  MarketplaceProduct,
  NarrativeId,
} from "@/lib/domain/marketplace";
import type { NetworkId } from "@/lib/domain/types";
import { assetLabel } from "@/lib/fixtures/asset-registry";
import { normalizeProductMetrics } from "@/lib/fixtures/marketplace-metrics";
import {
  buildPerformanceChart,
  resolveProductStrategy,
  strategyTagsForId,
} from "@/lib/fixtures/product-strategies";
import { APP_ROUTES } from "@/lib/routes";

interface PortfolioDef {
  id: string;
  name: string;
  description: string;
  indexType: IndexType;
  narrative: NarrativeId;
  narrativeLabel: string;
  assets: string[];
  networkIds: NetworkId[];
  risk: ProductRisk;
  featured?: boolean;
  isNew?: boolean;
  addedAt: string;
  /** Only set when a strategy is explicitly configured for this template. */
  strategyId?: string;
}

function equalAllocations(symbols: string[]) {
  const pct = Math.floor(100 / symbols.length);
  const remainder = 100 - pct * symbols.length;
  return symbols.map((symbol, i) => ({
    assetId: symbol.toLowerCase(),
    label: assetLabel(symbol),
    percent: i === 0 ? pct + remainder : pct,
  }));
}

function buildPortfolio(def: PortfolioDef): MarketplaceProduct {
  const assetIds = def.assets.map((s) => s.toLowerCase());
  const allocations = equalAllocations(def.assets);
  const strategyId = def.strategyId ?? "template-unassigned";
  const selectedStrategy = resolveProductStrategy(strategyId);
  const strategyTags = strategyTagsForId(strategyId);

  return normalizeProductMetrics({
    id: def.id,
    name: def.name,
    kind: "Portfolio",
    indexType: def.indexType,
    narrative: def.narrative,
    narrativeLabel: def.narrativeLabel,
    creatorName: "INDEXLA",
    creatorHandle: "indexla",
    verified: true,
    description: def.description,
    thesis: def.description,
    strategy: selectedStrategy.name,
    strategyTags,
    selectedStrategy,
    performance30d: 0,
    performanceChart: buildPerformanceChart(1000, 0),
    aumUsd: 0,
    volumeUsd: 0,
    investors: 0,
    likes: 0,
    risk: def.risk,
    networkIds: def.networkIds,
    allocations,
    assetIds,
    href: APP_ROUTES.product(def.id),
    featured: def.featured ?? false,
    isNew: def.isNew ?? false,
    addedAt: def.addedAt,
    rankMonthly: null,
    isIllustrative: true,
  });
}

const PORTFOLIO_DEFS: PortfolioDef[] = [
  // —— Crypto ——
  {
    id: "crypto-core",
    name: "Crypto Core",
    description:
      "A concentrated foundation of established crypto assets covering digital money, smart contracts, settlement, data and decentralized trading.",
    indexType: "Crypto",
    narrative: "layer-1",
    narrativeLabel: "Layer 1",
    assets: ["BTC", "ETH", "SOL", "LINK", "UNI"],
    networkIds: ["ethereum", "base", "solana"],
    risk: "Medium",
    featured: true,
    addedAt: "2026-08-23",
  },
  {
    id: "crypto-growth",
    name: "Crypto Growth",
    description:
      "A growth-focused portfolio targeting emerging opportunities across AI, decentralized computing, infrastructure, DeFi and tokenization.",
    indexType: "Crypto",
    narrative: "ai",
    narrativeLabel: "AI",
    assets: [
      "PEAQ",
      "INJ",
      "TAO",
      "RENDER",
      "ONDO",
      "AKT",
      "VIRTUAL",
      "VVV",
      "GRT",
      "ATH",
    ],
    networkIds: ["ethereum", "base", "solana"],
    risk: "High",
    isNew: true,
    addedAt: "2026-08-23",
  },
  {
    id: "crypto-balanced",
    name: "Crypto Balanced",
    description:
      "A diversified crypto portfolio combining established networks with selected exposure to AI, DeFi, privacy, tokenization and the Base ecosystem.",
    indexType: "Crypto",
    narrative: "all",
    narrativeLabel: "All",
    assets: [
      "BTC",
      "ETH",
      "SOL",
      "LINK",
      "UNI",
      "ONDO",
      "TAO",
      "ZEC",
      "AERO",
      "NEAR",
    ],
    networkIds: ["ethereum", "base", "solana"],
    risk: "Medium",
    addedAt: "2026-08-23",
  },
  // —— Tokenized Stocks ——
  {
    id: "stock-core",
    name: "Stock Core",
    description:
      "A long-term portfolio of leading technology, payments and financial companies with established global businesses.",
    indexType: "Tokenized Stocks",
    narrative: "mega-tech",
    narrativeLabel: "Mega-Tech",
    assets: ["AAPL", "MSFT", "GOOGL", "AMZN", "V", "MA", "JPM", "BLK"],
    networkIds: ["ethereum", "base"],
    risk: "Low",
    addedAt: "2026-08-23",
  },
  {
    id: "stock-growth",
    name: "Stock Growth",
    description:
      "A growth-focused portfolio covering artificial intelligence, semiconductors, electric vehicles and digital finance.",
    indexType: "Tokenized Stocks",
    narrative: "semiconductors",
    narrativeLabel: "Semiconductors",
    assets: ["NVDA", "TSLA", "PLTR", "AMD", "ARM", "COIN", "HOOD"],
    networkIds: ["ethereum", "base"],
    risk: "High",
    addedAt: "2026-08-23",
  },
  {
    id: "stock-balanced",
    name: "Stock Balanced",
    description:
      "A diversified portfolio combining dominant technology platforms with global payment networks and financial institutions.",
    indexType: "Tokenized Stocks",
    narrative: "mega-tech",
    narrativeLabel: "Mega-Tech",
    assets: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "V", "MA", "JPM"],
    networkIds: ["ethereum", "base"],
    risk: "Medium",
    addedAt: "2026-08-23",
  },
  {
    id: "stock-conviction",
    name: "Stock Conviction",
    description:
      "A concentrated portfolio of technology and innovation leaders positioned for long-term expansion.",
    indexType: "Tokenized Stocks",
    narrative: "mega-tech",
    narrativeLabel: "Mega-Tech",
    assets: ["NVDA", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "PLTR"],
    networkIds: ["ethereum", "base"],
    risk: "High",
    addedAt: "2026-08-23",
  },
  // —— Hybrid ——
  {
    id: "big-5",
    name: "Big 5",
    description:
      "Five essential exposures combining leading crypto assets, tokenized gold and broad US equity markets.",
    indexType: "Hybrid",
    narrative: "all",
    narrativeLabel: "All",
    assets: ["BTC", "ETH", "PAXG", "SPY", "QQQ"],
    networkIds: ["ethereum", "base", "solana"],
    risk: "Medium",
    featured: true,
    addedAt: "2026-08-23",
  },
  {
    id: "bitcoin-metals",
    name: "Bitcoin & Metals",
    description:
      "A clean hard-asset portfolio combining Bitcoin with tokenized gold, silver and copper.",
    indexType: "Hybrid",
    narrative: "metals",
    narrativeLabel: "Metals",
    assets: ["BTC", "PAXG", "SLVon", "CPERon"],
    networkIds: ["ethereum", "base"],
    risk: "Low",
    addedAt: "2026-08-23",
  },
  {
    id: "capital-shield",
    name: "Capital Shield",
    description:
      "A capital-preservation-focused portfolio combining scarce assets, precious metals, broad equities and established financial companies.",
    indexType: "Hybrid",
    narrative: "rwa-tokenization",
    narrativeLabel: "RWA & Tokenization",
    assets: ["BTC", "PAXG", "SLVon", "SPY", "V", "JPM"],
    networkIds: ["ethereum", "base", "solana"],
    risk: "Low",
    addedAt: "2026-08-23",
  },
  {
    id: "next-generation",
    name: "Next Generation",
    description:
      "A concentrated portfolio targeting emerging crypto networks and technology companies with strong long-term expansion potential.",
    indexType: "Hybrid",
    narrative: "ai-compute",
    narrativeLabel: "AI & Compute",
    assets: [
      "PEAQ",
      "INJ",
      "AKT",
      "VIRTUAL",
      "ATH",
      "IONQ",
      "RKLB",
      "ASTS",
      "RGTI",
      "SOFI",
    ],
    networkIds: ["ethereum", "base", "solana"],
    risk: "High",
    isNew: true,
    addedAt: "2026-08-23",
  },
  {
    id: "the-barbell",
    name: "The Barbell",
    description:
      "A two-sided portfolio balancing defensive hard assets and broad equities with selected high-growth crypto and technology opportunities.",
    indexType: "Hybrid",
    narrative: "all",
    narrativeLabel: "All",
    assets: [
      "BTC",
      "PAXG",
      "SLVon",
      "SPY",
      "SOL",
      "TAO",
      "NVDA",
      "COIN",
    ],
    networkIds: ["ethereum", "base", "solana"],
    risk: "Medium",
    addedAt: "2026-08-23",
  },
];

export const INDEXLA_PORTFOLIO_CATALOG: MarketplaceProduct[] =
  PORTFOLIO_DEFS.map(buildPortfolio);

export const OFFICIAL_PORTFOLIO_IDS = new Set(
  PORTFOLIO_DEFS.map((def) => def.id),
);

export function getOfficialPortfolioById(
  id: string,
): MarketplaceProduct | undefined {
  return INDEXLA_PORTFOLIO_CATALOG.find((p) => p.id === id);
}
