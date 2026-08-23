import type { ProductRisk } from "@/lib/domain/dashboard";
import type {
  IndexType,
  MarketplaceProduct,
  NarrativeId,
} from "@/lib/domain/marketplace";
import type { NetworkId } from "@/lib/domain/types";
import { assetLabel } from "@/lib/fixtures/asset-registry";
import {
  buildPerformanceChart,
  resolveProductStrategy,
  strategyIdForIndexOrdinal,
  strategyTagsForId,
} from "@/lib/fixtures/product-strategies";
import { APP_ROUTES } from "@/lib/routes";

interface IndexDef {
  id: string;
  name: string;
  description: string;
  indexType: IndexType;
  narrative: NarrativeId;
  narrativeLabel: string;
  assets: string[];
  risk: ProductRisk;
  networkIds: NetworkId[];
  performance30d: number;
  aumUsd: number;
  volumeUsd: number;
  investors: number;
  likes: number;
  featured?: boolean;
  isNew?: boolean;
  addedAt: string;
  rankMonthly?: number | null;
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

function buildIndex(def: IndexDef, ordinal: number): MarketplaceProduct {
  const assetIds = def.assets.map((s) => s.toLowerCase());
  const allocations = equalAllocations(def.assets);
  const strategyId =
    def.strategyId ?? strategyIdForIndexOrdinal(ordinal);
  const selectedStrategy = resolveProductStrategy(strategyId);
  const strategyTags = strategyTagsForId(strategyId);

  return {
    id: def.id,
    name: def.name,
    kind: "Index",
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
    performance30d: def.performance30d,
    performanceChart: buildPerformanceChart(
      def.aumUsd / 1000,
      def.performance30d,
    ),
    aumUsd: def.aumUsd,
    volumeUsd: def.volumeUsd,
    investors: def.investors,
    likes: def.likes,
    risk: def.risk,
    networkIds: def.networkIds,
    allocations,
    assetIds,
    href: APP_ROUTES.product(def.id),
    featured: def.featured ?? false,
    isNew: def.isNew ?? false,
    addedAt: def.addedAt,
    rankMonthly: def.rankMonthly ?? null,
    isIllustrative: true,
  };
}

const INDEX_DEFS: IndexDef[] = [
  // CRYPTO
  {
    id: "layer-1-index",
    name: "Layer 1 Index",
    description:
      "Leading foundational blockchain networks powering digital assets, applications and onchain settlement.",
    indexType: "Crypto",
    narrative: "layer-1",
    narrativeLabel: "Layer 1",
    assets: ["BTC", "ETH", "XRP", "BNB", "SOL", "TRX", "HYPE", "ADA", "AVAX", "SUI"],
    risk: "Medium",
    networkIds: ["ethereum", "base", "solana", "bnb", "sui"],
    performance30d: 14.2,
    aumUsd: 28_400_000,
    volumeUsd: 4_200_000,
    investors: 1840,
    likes: 3200,
    featured: true,
    addedAt: "2025-11-01",
    rankMonthly: 1,
  },
  {
    id: "layer-2-index",
    name: "Layer 2 Index",
    description:
      "Blockchain scaling networks designed to increase transaction speed and reduce execution costs.",
    indexType: "Crypto",
    narrative: "layer-2",
    narrativeLabel: "Layer 2",
    assets: ["MNT", "POL", "ARB", "OP", "STRK", "IMX", "ZK", "METIS"],
    risk: "High",
    networkIds: ["ethereum", "base", "arbitrum"],
    performance30d: 18.6,
    aumUsd: 9_800_000,
    volumeUsd: 1_650_000,
    investors: 920,
    likes: 1680,
    addedAt: "2025-11-15",
    rankMonthly: 4,
  },
  {
    id: "ai-index",
    name: "AI Index",
    description:
      "Crypto networks powering decentralized artificial intelligence, computing, data and machine learning.",
    indexType: "Crypto",
    narrative: "ai",
    narrativeLabel: "AI",
    assets: ["TAO", "NEAR", "ICP", "RENDER", "FET", "VIRTUAL", "GRT", "THETA", "AR", "AKT"],
    risk: "High",
    networkIds: ["ethereum", "base", "solana"],
    performance30d: 22.4,
    aumUsd: 12_600_000,
    volumeUsd: 2_100_000,
    investors: 1120,
    likes: 2450,
    featured: true,
    isNew: true,
    addedAt: "2026-01-08",
    rankMonthly: 2,
  },
  {
    id: "depin-index",
    name: "DePIN Index",
    description:
      "Decentralized networks delivering real-world computing, storage, connectivity and data infrastructure.",
    indexType: "Crypto",
    narrative: "depin",
    narrativeLabel: "DePIN",
    assets: ["RENDER", "FIL", "HNT", "AKT", "IOTX", "GRASS", "GEOD", "IOTA", "JASMY", "THETA"],
    risk: "High",
    networkIds: ["ethereum", "base", "solana"],
    performance30d: 16.8,
    aumUsd: 7_400_000,
    volumeUsd: 980_000,
    investors: 640,
    likes: 1320,
    addedAt: "2025-12-01",
    rankMonthly: 6,
  },
  {
    id: "crypto-gaming-index",
    name: "Crypto Gaming Index",
    description:
      "Blockchain ecosystems powering digital games, player-owned assets and gaming economies.",
    indexType: "Crypto",
    narrative: "gaming",
    narrativeLabel: "Gaming",
    assets: ["IMX", "SAND", "GALA", "MANA", "APE", "AXS", "BEAM", "RON", "WEMIX", "ENJ"],
    risk: "High",
    networkIds: ["ethereum", "base", "solana"],
    performance30d: 11.3,
    aumUsd: 5_200_000,
    volumeUsd: 720_000,
    investors: 510,
    likes: 980,
    addedAt: "2025-10-20",
  },
  {
    id: "ai-agents-index",
    name: "AI Agents Index",
    description:
      "Protocols powering autonomous AI agents, intelligent applications and agent-based economies.",
    indexType: "Crypto",
    narrative: "ai-agents",
    narrativeLabel: "AI Agents",
    assets: ["VVV", "VIRTUAL", "FET", "KITE", "TRAC", "AWE", "ARC"],
    risk: "Extreme",
    networkIds: ["ethereum", "base", "solana"],
    performance30d: 31.5,
    aumUsd: 4_100_000,
    volumeUsd: 890_000,
    investors: 780,
    likes: 1890,
    isNew: true,
    addedAt: "2026-02-01",
    rankMonthly: 3,
  },
  {
    id: "rwa-index",
    name: "RWA Index",
    description:
      "Blockchain protocols bringing real-world assets, credit and institutional financial products onchain.",
    indexType: "Crypto",
    narrative: "rwa",
    narrativeLabel: "RWA",
    assets: ["LINK", "XLM", "ONDO", "CFG", "MPL", "POLYX", "PLUME"],
    risk: "Medium",
    networkIds: ["ethereum", "base"],
    performance30d: 9.4,
    aumUsd: 8_900_000,
    volumeUsd: 1_120_000,
    investors: 690,
    likes: 1100,
    addedAt: "2025-09-15",
    rankMonthly: 7,
  },
  {
    id: "defi-index",
    name: "DeFi Index",
    description:
      "Leading decentralized platforms for trading, lending, liquidity and onchain financial services.",
    indexType: "Crypto",
    narrative: "defi",
    narrativeLabel: "DeFi",
    assets: ["LINK", "UNI", "AAVE", "HYPE", "ENA", "ONDO", "JUP", "PENDLE", "MORPHO", "CRV"],
    risk: "Medium",
    networkIds: ["ethereum", "base", "arbitrum", "solana"],
    performance30d: 13.7,
    aumUsd: 15_300_000,
    volumeUsd: 2_450_000,
    investors: 1340,
    likes: 2100,
    featured: true,
    addedAt: "2025-08-01",
    rankMonthly: 5,
  },
  {
    id: "privacy-index",
    name: "Privacy Index",
    description:
      "Privacy-focused networks protecting transaction data, identity and confidential onchain activity.",
    indexType: "Crypto",
    narrative: "privacy",
    narrativeLabel: "Privacy",
    assets: ["XMR", "ZEC", "DASH", "DCR", "BDX", "SCRT", "ROSE", "ALEO", "NYM", "ZANO"],
    risk: "High",
    networkIds: ["ethereum"],
    performance30d: 7.2,
    aumUsd: 3_600_000,
    volumeUsd: 540_000,
    investors: 420,
    likes: 760,
    addedAt: "2025-11-28",
  },
  {
    id: "oracle-index",
    name: "Oracle Index",
    description:
      "Decentralized data networks connecting blockchains with reliable real-world information.",
    indexType: "Crypto",
    narrative: "oracles",
    narrativeLabel: "Oracles",
    assets: ["LINK", "PYTH", "BAND", "TRB", "UMA", "RED", "API3", "DIA", "XYO", "WIN"],
    risk: "Medium",
    networkIds: ["ethereum", "base", "arbitrum"],
    performance30d: 10.9,
    aumUsd: 6_700_000,
    volumeUsd: 880_000,
    investors: 580,
    likes: 940,
    addedAt: "2025-10-05",
  },
  // TOKENIZED STOCKS
  {
    id: "tokenized-ai-index",
    name: "Tokenized AI Index",
    description:
      "Public companies leading AI software, cloud computing, data platforms and intelligent applications.",
    indexType: "Tokenized Stocks",
    narrative: "ai",
    narrativeLabel: "AI",
    assets: ["NVDA", "MSFT", "GOOGL", "AMZN", "META", "PLTR", "CRM", "NOW", "SNOW"],
    risk: "Medium",
    networkIds: ["ethereum", "base"],
    performance30d: 19.8,
    aumUsd: 11_200_000,
    volumeUsd: 1_480_000,
    investors: 860,
    likes: 1540,
    featured: true,
    addedAt: "2025-12-10",
    rankMonthly: 2,
  },
  {
    id: "tokenized-semiconductors-index",
    name: "Tokenized Semiconductors Index",
    description:
      "Leading chip designers, manufacturers and equipment companies powering modern computing.",
    indexType: "Tokenized Stocks",
    narrative: "semiconductors",
    narrativeLabel: "Semiconductors",
    assets: ["NVDA", "AMD", "TSM", "AVGO", "ASML", "ARM", "MU", "MRVL"],
    risk: "Medium",
    networkIds: ["ethereum", "base"],
    performance30d: 17.3,
    aumUsd: 9_400_000,
    volumeUsd: 1_220_000,
    investors: 720,
    likes: 1280,
    addedAt: "2025-11-22",
  },
  {
    id: "tokenized-mega-tech-index",
    name: "Tokenized Mega-Tech Index",
    description:
      "The world's most influential technology companies across software, commerce, AI and digital platforms.",
    indexType: "Tokenized Stocks",
    narrative: "mega-tech",
    narrativeLabel: "Mega-Tech",
    assets: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "PLTR"],
    risk: "Low",
    networkIds: ["ethereum", "base"],
    performance30d: 12.1,
    aumUsd: 18_600_000,
    volumeUsd: 2_800_000,
    investors: 1560,
    likes: 2680,
    addedAt: "2025-08-20",
    rankMonthly: 1,
  },
  {
    id: "tokenized-crypto-stocks-index",
    name: "Tokenized Crypto Stocks Index",
    description:
      "Public companies driving crypto adoption through exchanges, payments, mining and digital-asset infrastructure.",
    indexType: "Tokenized Stocks",
    narrative: "crypto-stocks",
    narrativeLabel: "Crypto Stocks",
    assets: ["COIN", "MSTR", "HOOD", "CRCL", "MARA", "RIOT", "IREN"],
    risk: "High",
    networkIds: ["ethereum", "base"],
    performance30d: 24.6,
    aumUsd: 6_300_000,
    volumeUsd: 1_050_000,
    investors: 640,
    likes: 1420,
    isNew: true,
    addedAt: "2026-01-20",
    rankMonthly: 4,
  },
  {
    id: "tokenized-space-quantum-index",
    name: "Tokenized Space & Quantum Index",
    description:
      "High-growth companies developing space infrastructure, satellite communications and quantum computing.",
    indexType: "Tokenized Stocks",
    narrative: "space-quantum",
    narrativeLabel: "Space & Quantum",
    assets: ["RKLB", "ASTS", "IONQ", "RGTI", "PLTR"],
    risk: "Extreme",
    networkIds: ["ethereum", "base"],
    performance30d: 28.4,
    aumUsd: 3_800_000,
    volumeUsd: 620_000,
    investors: 480,
    likes: 1120,
    addedAt: "2026-01-05",
  },
  {
    id: "tokenized-tech-etf-index",
    name: "Tokenized Tech ETF Index",
    description:
      "Diversified ETF exposure across technology, semiconductors, AI and robotics.",
    indexType: "Tokenized Stocks",
    narrative: "tech-etfs",
    narrativeLabel: "Tech ETFs",
    assets: ["QQQ", "XLK", "SMH", "SOXX", "BOTZ"],
    risk: "Low",
    networkIds: ["ethereum", "base"],
    performance30d: 11.8,
    aumUsd: 7_900_000,
    volumeUsd: 940_000,
    investors: 590,
    likes: 870,
    addedAt: "2025-09-28",
  },
  // TOKENIZED COMMODITIES
  {
    id: "tokenized-metals-index",
    name: "Tokenized Metals Index",
    description:
      "Diversified exposure to monetary, industrial and energy-transition metals.",
    indexType: "Tokenized Commodities",
    narrative: "metals",
    narrativeLabel: "Metals",
    assets: ["PAXG", "SLVon", "CPERon", "TXPT", "xU3O8"],
    risk: "Low",
    networkIds: ["ethereum", "base"],
    performance30d: 5.6,
    aumUsd: 5_400_000,
    volumeUsd: 680_000,
    investors: 380,
    likes: 620,
    addedAt: "2025-10-12",
  },
  {
    id: "tokenized-commodities-index",
    name: "Tokenized Commodities Index",
    description:
      "A balanced basket covering precious metals, industrial metals and global energy markets.",
    indexType: "Tokenized Commodities",
    narrative: "diversified-commodities",
    narrativeLabel: "Diversified Commodities",
    assets: ["PAXG", "SLVon", "CPERon", "USOon", "UNGon"],
    risk: "Low",
    networkIds: ["ethereum", "base"],
    performance30d: 4.2,
    aumUsd: 4_600_000,
    volumeUsd: 520_000,
    investors: 310,
    likes: 480,
    addedAt: "2025-11-08",
  },
  // HYBRID
  {
    id: "ai-compute-index",
    name: "AI & Compute Index",
    description:
      "Combines decentralized AI and compute networks with the companies building global AI infrastructure.",
    indexType: "Hybrid",
    narrative: "ai-compute",
    narrativeLabel: "AI & Compute",
    assets: ["TAO", "RENDER", "FET", "AKT", "NVDA", "MSFT", "GOOGL", "AMZN", "PLTR", "ARM"],
    risk: "Medium",
    networkIds: ["ethereum", "base", "solana"],
    performance30d: 21.7,
    aumUsd: 10_800_000,
    volumeUsd: 1_560_000,
    investors: 920,
    likes: 1780,
    featured: true,
    addedAt: "2025-12-18",
    rankMonthly: 1,
  },
  {
    id: "robotics-index",
    name: "Robotics Index",
    description:
      "Exposure to blockchain-powered machine networks and leading global robotics companies.",
    indexType: "Hybrid",
    narrative: "robotics",
    narrativeLabel: "Robotics",
    assets: ["IOTX", "PEAQ", "AUKI", "TSLA", "ISRG", "ABB", "ROK", "SYM"],
    risk: "High",
    networkIds: ["ethereum", "base"],
    performance30d: 15.4,
    aumUsd: 4_900_000,
    volumeUsd: 710_000,
    investors: 540,
    likes: 960,
    addedAt: "2026-01-12",
  },
  {
    id: "blockchain-economy-index",
    name: "Blockchain Economy Index",
    description:
      "Combines leading blockchain networks with public companies driving crypto adoption.",
    indexType: "Hybrid",
    narrative: "blockchain-economy",
    narrativeLabel: "Blockchain Economy",
    assets: ["BTC", "ETH", "SOL", "LINK", "COIN", "MSTR", "HOOD", "CRCL"],
    risk: "Medium",
    networkIds: ["ethereum", "base", "solana"],
    performance30d: 18.9,
    aumUsd: 13_400_000,
    volumeUsd: 2_020_000,
    investors: 1080,
    likes: 1920,
    addedAt: "2025-09-05",
    rankMonthly: 3,
  },
  {
    id: "rwa-tokenization-index",
    name: "RWA & Tokenization Index",
    description:
      "Exposure to onchain tokenization protocols and traditional institutions moving financial markets onchain.",
    indexType: "Hybrid",
    narrative: "rwa-tokenization",
    narrativeLabel: "RWA & Tokenization",
    assets: ["ONDO", "LINK", "XLM", "AVAX", "BLK", "JPM", "NDAQ", "ICE"],
    risk: "Low",
    networkIds: ["ethereum", "base"],
    performance30d: 8.7,
    aumUsd: 8_200_000,
    volumeUsd: 960_000,
    investors: 620,
    likes: 1040,
    addedAt: "2025-10-28",
  },
  {
    id: "hybrid-gaming-index",
    name: "Hybrid Gaming Index",
    description:
      "Combines blockchain gaming ecosystems with leading game developers and interactive entertainment companies.",
    indexType: "Hybrid",
    narrative: "gaming",
    narrativeLabel: "Gaming",
    assets: ["IMX", "RON", "GALA", "BEAM", "AXS", "RBLX", "U", "TTWO", "EA", "NVDA"],
    risk: "High",
    networkIds: ["ethereum", "base", "solana"],
    performance30d: 13.2,
    aumUsd: 5_700_000,
    volumeUsd: 780_000,
    investors: 490,
    likes: 880,
    addedAt: "2025-11-18",
  },
  {
    id: "digital-infrastructure-index",
    name: "Digital Infrastructure Index",
    description:
      "Combines decentralized storage, compute and connectivity with global data-center and networking companies.",
    indexType: "Hybrid",
    narrative: "digital-infrastructure",
    narrativeLabel: "Digital Infrastructure",
    assets: ["FIL", "HNT", "RENDER", "AKT", "IOTX", "EQIX", "VRT", "ANET", "AMT"],
    risk: "Medium",
    networkIds: ["ethereum", "base"],
    performance30d: 10.5,
    aumUsd: 6_100_000,
    volumeUsd: 740_000,
    investors: 450,
    likes: 790,
    addedAt: "2025-12-05",
  },
  {
    id: "future-payments-index",
    name: "Future Payments Index",
    description:
      "Combines blockchain settlement networks with the world's leading digital-payment companies.",
    indexType: "Hybrid",
    narrative: "future-payments",
    narrativeLabel: "Future Payments",
    assets: ["XRP", "XLM", "SOL", "LINK", "V", "MA", "PYPL", "XYZ", "HOOD"],
    risk: "Medium",
    networkIds: ["ethereum", "base", "solana"],
    performance30d: 9.8,
    aumUsd: 7_300_000,
    volumeUsd: 850_000,
    investors: 560,
    likes: 920,
    addedAt: "2025-12-22",
  },
];

export const INDEXLA_INDEX_CATALOG: MarketplaceProduct[] =
  INDEX_DEFS.map((def, i) => buildIndex(def, i));

export function getIndexById(id: string): MarketplaceProduct | undefined {
  return INDEXLA_INDEX_CATALOG.find((p) => p.id === id);
}

export function getFeaturedIndexes(limit = 4): MarketplaceProduct[] {
  return INDEXLA_INDEX_CATALOG.filter((p) => p.featured).slice(0, limit);
}

export function getTrendingIndexes(limit = 4): MarketplaceProduct[] {
  return [...INDEXLA_INDEX_CATALOG]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, limit);
}
