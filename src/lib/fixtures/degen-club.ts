import type {
  DegenClubWorkspace,
  DegenDiscoverFilter,
  DegenProduct,
} from "@/lib/domain/degen-club";
import type { NetworkId } from "@/lib/domain/types";
import {
  DEGEN_ASSETS,
  equalAllocations,
} from "@/lib/fixtures/degen-asset-registry";
import { APP_ROUTES } from "@/lib/routes";

function series(base: number, drift: number): { t: string; v: number }[] {
  const out: { t: string; v: number }[] = [];
  const start = new Date("2026-08-22T16:00:00.000Z");
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    out.push({
      t: d.toISOString().slice(0, 10),
      v: Math.round(base + (30 - i) * drift + Math.sin(i / 2) * base * 0.04),
    });
  }
  return out;
}

function activity(
  id: string,
  rows: Array<{ title: string; subtitle: string; daysAgo: number }>,
): DegenProduct["activity"] {
  return rows.map((row, i) => {
    const d = new Date("2026-08-22T12:00:00.000Z");
    d.setDate(d.getDate() - row.daysAgo);
    return {
      id: `${id}-act-${i}`,
      title: row.title,
      subtitle: row.subtitle,
      atIso: d.toISOString(),
      isIllustrative: true,
    };
  });
}

function buildProduct(
  spec: Omit<
    DegenProduct,
    "allocations" | "chartSeries" | "activity" | "href" | "isIllustrative"
  > & {
    assetKeys: string[];
    chartBase?: number;
    chartDrift?: number;
    activityRows?: Array<{ title: string; subtitle: string; daysAgo: number }>;
  },
): DegenProduct {
  const {
    assetKeys,
    chartBase = 100,
    chartDrift = 0.2,
    activityRows = [],
    ...rest
  } = spec;
  return {
    ...rest,
    allocations: equalAllocations(assetKeys),
    chartSeries: series(chartBase, chartDrift),
    activity: activity(rest.id, activityRows),
    href: `${APP_ROUTES.degenClub}?id=${rest.id}`,
    isIllustrative: true,
  };
}

const PRODUCTS: DegenProduct[] = [
  buildProduct({
    id: "solana-memecoin-index",
    name: "Solana Memecoin Index",
    kind: "Index",
    creatorHandle: "indexla-meme",
    creatorName: "INDEXLA Meme Desk",
    verified: true,
    thesis:
      "Top Solana memecoins by market cap. Pure degen exposure to the highest-volume and most established meme tokens on the fastest chain.",
    strategy: "Equal weight · weekly rebalance",
    rebalanceRules:
      "Maintain 10% target weights across all sleeves. Rebalance weekly when drift exceeds 2%.",
    riskLabel: "Extreme",
    volatilityLabel: "Very high",
    chainLabel: "Solana",
    networkIds: ["solana"],
    performance30d: 18.4,
    aumUsd: 1_240_000,
    volumeUsd: 2_180_000,
    investors: 412,
    likes: 1840,
    featured: true,
    trending: true,
    isNew: false,
    feeEstimateUsd: 22.5,
    estimatedCostUsd: 28.0,
    assetKeys: [
      "pengu",
      "wif",
      "bonk",
      "fartcoin",
      "popcat",
      "useless",
      "troll",
      "pnut",
      "moodeng",
      "giga",
    ],
    chartDrift: 0.45,
    activityRows: [
      { title: "Weekly rebalance", subtitle: "Illustrative", daysAgo: 1 },
      { title: "New investor", subtitle: "+$4,200 · Illustrative", daysAgo: 2 },
    ],
  }),
  buildProduct({
    id: "ethereum-memecoin-index",
    name: "Ethereum Memecoin Index",
    kind: "Index",
    creatorHandle: "indexla-meme",
    creatorName: "INDEXLA Meme Desk",
    verified: true,
    thesis:
      "Blue-chip Ethereum memecoins ranked by market cap. The original meme layer—dogs, frogs, and cultural icons with the deepest liquidity.",
    strategy: "Equal weight · Fear & Greed overlay",
    rebalanceRules:
      "Equal 10% targets. Trim on Greed > 60; add on Fear < 25 when buffer allows.",
    riskLabel: "Extreme",
    volatilityLabel: "High",
    chainLabel: "Ethereum",
    networkIds: ["ethereum"],
    performance30d: 9.2,
    aumUsd: 2_080_000,
    volumeUsd: 1_640_000,
    investors: 528,
    likes: 2210,
    featured: true,
    trending: true,
    isNew: false,
    feeEstimateUsd: 26.0,
    estimatedCostUsd: 32.5,
    assetKeys: [
      "shib",
      "pepe",
      "spx",
      "floki",
      "mog",
      "turbo",
      "npc",
      "neiro",
      "meme",
      "wojak",
    ],
    chartDrift: 0.28,
    activityRows: [
      { title: "Circuit check", subtitle: "Healthy · Illustrative", daysAgo: 0 },
    ],
  }),
  buildProduct({
    id: "bnb-memecoin-index",
    name: "BNB Chain Memecoin Index",
    kind: "Index",
    creatorHandle: "bnbmeme",
    creatorName: "BNB Meme Lab",
    verified: true,
    thesis:
      "The strongest BNB community memecoins. Cultural and narrative-driven tokens with real mindshare, lasting communities, and the highest staying power on the chain.",
    strategy: "Equal weight · community momentum",
    rebalanceRules:
      "Equal 10% sleeves. Monthly review with optional narrative rotation preview.",
    riskLabel: "Extreme",
    volatilityLabel: "Extreme",
    chainLabel: "BNB Chain",
    networkIds: ["bnb"],
    performance30d: 14.6,
    aumUsd: 890_000,
    volumeUsd: 1_120_000,
    investors: 296,
    likes: 980,
    featured: true,
    trending: false,
    isNew: true,
    feeEstimateUsd: 18.2,
    estimatedCostUsd: 23.4,
    assetKeys: [
      "binancelife",
      "floki",
      "bananas31",
      "babydoge",
      "broccoli",
      "tut",
      "hajimi",
      "cheems",
      "memecore",
      "tst",
    ],
    chartDrift: 0.38,
  }),
  buildProduct({
    id: "base-memecoin-index",
    name: "Base Memecoin Index",
    kind: "Index",
    creatorHandle: "basedegen",
    creatorName: "Base Degen",
    verified: true,
    thesis:
      "The strongest Base community memecoins. True cultural flagships of Coinbase L2—frogs, degens, cats, and the most battle-tested holder communities on the chain.",
    strategy: "Equal weight · biweekly",
    rebalanceRules: "Reset to 10% targets every 14 days.",
    riskLabel: "Extreme",
    volatilityLabel: "Very high",
    chainLabel: "Base",
    networkIds: ["base"],
    performance30d: 22.1,
    aumUsd: 760_000,
    volumeUsd: 940_000,
    investors: 341,
    likes: 1320,
    featured: true,
    trending: true,
    isNew: false,
    feeEstimateUsd: 16.8,
    estimatedCostUsd: 21.0,
    assetKeys: [
      "toshi",
      "brett",
      "degen",
      "drb",
      "bald",
      "ponke",
      "keycat",
      "doginme",
      "benji",
      "miggles",
    ],
    chartDrift: 0.52,
  }),
  buildProduct({
    id: "blue-chip-memecoin-portfolio",
    name: "Blue Chip Memecoin Portfolio",
    kind: "Portfolio",
    creatorHandle: "memebuilder",
    creatorName: "Meme Builder",
    verified: true,
    thesis:
      "The strongest blue-chip memecoins across chains. Highest liquidity, brand power, and lasting communities.",
    strategy: "Multi-chain equal weight",
    rebalanceRules:
      "Maintain 10% per sleeve across chains. Bridge only when estimated cost < 1% of trade.",
    riskLabel: "Extreme",
    volatilityLabel: "High",
    chainLabel: "Multi-Chain",
    networkIds: ["solana", "ethereum", "bnb", "base"],
    performance30d: 11.3,
    aumUsd: 3_420_000,
    volumeUsd: 2_760_000,
    investors: 892,
    likes: 4120,
    featured: true,
    trending: true,
    isNew: false,
    feeEstimateUsd: 32.0,
    estimatedCostUsd: 48.5,
    assetKeys: [
      "pengu",
      "wif",
      "bonk",
      "shib",
      "pepe",
      "spx",
      "binancelife",
      "floki",
      "toshi",
      "brett",
    ],
    chartDrift: 0.32,
  }),
  buildProduct({
    id: "explosive-memecoin-portfolio",
    name: "Explosive Memecoin Portfolio",
    kind: "Portfolio",
    creatorHandle: "degensignal",
    creatorName: "Degen Signal",
    verified: true,
    thesis:
      "High-upside mid-tier memecoins with real volume and community momentum. Built for bigger swings.",
    strategy: "Momentum rotation · 7d",
    rebalanceRules:
      "Equal 10% targets with weekly momentum review. Max single sleeve 15%.",
    riskLabel: "Extreme",
    volatilityLabel: "Extreme",
    chainLabel: "Multi-Chain",
    networkIds: ["solana", "ethereum", "bnb", "base"],
    performance30d: 28.7,
    aumUsd: 540_000,
    volumeUsd: 1_880_000,
    investors: 267,
    likes: 1560,
    featured: false,
    trending: true,
    isNew: true,
    feeEstimateUsd: 19.5,
    estimatedCostUsd: 36.2,
    assetKeys: [
      "popcat",
      "useless",
      "troll",
      "mog",
      "turbo",
      "npc",
      "babydoge",
      "broccoli",
      "degen",
      "bald",
    ],
    chartDrift: 0.62,
  }),
  buildProduct({
    id: "moonshot-memecoin-portfolio",
    name: "Moonshot Memecoin Portfolio",
    kind: "Portfolio",
    creatorHandle: "moonbag",
    creatorName: "Moonbag Ops",
    verified: true,
    thesis:
      "Pure degen moonshots. Small-cap, high-risk, high-reward plays with active communities.",
    strategy: "High beta · manual review",
    rebalanceRules:
      "Equal 12.5% targets across eight sleeves. Creator review monthly; no auto-rebalance in preview.",
    riskLabel: "Extreme",
    volatilityLabel: "Extreme",
    chainLabel: "Multi-Chain",
    networkIds: ["ethereum", "solana", "base"],
    performance30d: -8.4,
    aumUsd: 210_000,
    volumeUsd: 890_000,
    investors: 118,
    likes: 640,
    featured: false,
    trending: false,
    isNew: true,
    feeEstimateUsd: 12.4,
    estimatedCostUsd: 22.8,
    assetKeys: [
      "wojak",
      "bitty",
      "kitty",
      "fwog",
      "mask",
      "cupsey",
      "purple",
      "bald",
    ],
    chartDrift: -0.22,
  }),
];

export function getDegenClubWorkspace(): DegenClubWorkspace {
  return {
    products: PRODUCTS,
    featuredIds: PRODUCTS.filter((p) => p.featured).map((p) => p.id),
    trendingIds: PRODUCTS.filter((p) => p.trending).map((p) => p.id),
    marketDataStale: true,
    isIllustrative: true,
    hero: {
      title: "DEGEN CLUB",
      headline: "The New Way To Play Memecoins.",
      subheadline: "Stop Betting Everything On One Coin.",
      tagline: "Multiple shots. Rules-based baskets. Extreme risk by design.",
      points: [
        "One memecoin is one concentrated bet.",
        "A diversified memecoin index gives you multiple shots.",
        "One winner may offset several losers—but diversification does not remove risk.",
      ],
      trustBadges: ["Non-custodial", "Multi-chain", "Rules-based"],
    },
  };
}

export function getEmptyDegenClubWorkspace(): DegenClubWorkspace {
  const base = getDegenClubWorkspace();
  return {
    ...base,
    products: [],
    featuredIds: [],
    trendingIds: [],
    marketDataStale: false,
  };
}

export function getDegenProductById(id: string): DegenProduct | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** All unique CoinGecko ids across Degen Club products. */
export function getAllDegenCoingeckoIds(): string[] {
  return [
    ...new Set(
      Object.values(DEGEN_ASSETS).map((a) => a.coingeckoId),
    ),
  ];
}

/** Networks treated as single-chain filters in Discover. */
export const DEGEN_CHAIN_FILTERS: {
  id: Exclude<DegenDiscoverFilter, "all" | "multi-chain">;
  label: string;
  networkId: NetworkId;
}[] = [
  { id: "solana", label: "Solana", networkId: "solana" },
  { id: "ethereum", label: "Ethereum", networkId: "ethereum" },
  { id: "bnb", label: "BNB", networkId: "bnb" },
  { id: "base", label: "Base", networkId: "base" },
];

export const DEGEN_MARKET_TABS: {
  id: import("@/lib/domain/degen-club").DegenMarketTab;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "indexes", label: "Memecoin Indexes" },
  { id: "portfolios", label: "Memecoin Portfolios" },
];
