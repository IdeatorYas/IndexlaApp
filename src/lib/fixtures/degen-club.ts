import type {
  DegenClubWorkspace,
  DegenProduct,
} from "@/lib/domain/degen-club";
import type { NetworkId } from "@/lib/domain/types";
import { APP_ROUTES } from "@/lib/routes";

function series(base: number, drift: number): { t: string; v: number }[] {
  const out: { t: string; v: number }[] = [];
  const start = new Date("2026-08-22T16:00:00.000Z");
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    out.push({
      t: d.toISOString().slice(0, 10),
      v: Math.round(
        base + (30 - i) * drift + Math.sin(i / 2) * base * 0.04,
      ),
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

const PRODUCTS: DegenProduct[] = [
  {
    id: "degen-ten-shots",
    name: "Solana Meme 10-Shots",
    kind: "Index",
    creatorHandle: "memebuilder",
    creatorName: "Meme Builder",
    verified: true,
    thesis:
      "Equal-weight basket across ten Solana memecoins — extreme speculation, not a guarantee of offsetting losses.",
    strategy: "Weekly rebalance · hard circuit breaker",
    rebalanceRules:
      "Rebalance weekly when any sleeve drifts > 5%. Pause automation if basket drawdown exceeds illustrative -40% threshold.",
    riskLabel: "Extreme",
    volatilityLabel: "Very high",
    chainLabel: "Solana",
    networkIds: ["solana"],
    allocations: [
      { assetId: "wif", label: "WIF", percent: 10 },
      { assetId: "bonk", label: "BONK", percent: 10 },
      { assetId: "pepe", label: "PEPE", percent: 10 },
      { assetId: "floki", label: "FLOKI", percent: 10 },
      { assetId: "shib", label: "SHIB", percent: 10 },
      { assetId: "doge", label: "DOGE", percent: 10 },
      { assetId: "pengu", label: "PENGU", percent: 10 },
      { assetId: "fart", label: "FART", percent: 10 },
      { assetId: "popcat", label: "POPCAT", percent: 10 },
      { assetId: "sol", label: "SOL", percent: 10 },
    ],
    performance30d: -12.5,
    aumUsd: 850_000,
    volumeUsd: 1_050_000,
    investors: 64,
    likes: 210,
    featured: true,
    trending: true,
    isNew: false,
    chartSeries: series(100, -0.35),
    activity: activity("degen-ten-shots", [
      {
        title: "Weekly rebalance",
        subtitle: "Drift trim · Illustrative",
        daysAgo: 1,
      },
      {
        title: "Investor join",
        subtitle: "+$2,400 · Illustrative",
        daysAgo: 3,
      },
    ]),
    feeEstimateUsd: 18.5,
    estimatedCostUsd: 24.2,
    href: `${APP_ROUTES.degenClub}?id=degen-ten-shots`,
    isIllustrative: true,
  },
  {
    id: "meme-rotation",
    name: "Meme Rotation Index",
    kind: "Index",
    creatorHandle: "memebuilder",
    creatorName: "Meme Builder",
    verified: true,
    thesis:
      "Rotates among high-volume memecoins. Diversification does not guarantee profit or capital preservation.",
    strategy: "Momentum rotation · 7d lookback",
    rebalanceRules:
      "Rotate top-5 volume leaders every 7 days. Cap single sleeve at 25%.",
    riskLabel: "Extreme",
    volatilityLabel: "Extreme",
    chainLabel: "Multi-Chain",
    networkIds: ["solana", "base", "ethereum"],
    allocations: [
      { assetId: "wif", label: "WIF", percent: 20 },
      { assetId: "pepe", label: "PEPE", percent: 20 },
      { assetId: "bonk", label: "BONK", percent: 20 },
      { assetId: "doge", label: "DOGE", percent: 20 },
      { assetId: "eth", label: "ETH", percent: 20 },
    ],
    performance30d: 19.2,
    aumUsd: 620_000,
    volumeUsd: 780_000,
    investors: 51,
    likes: 860,
    featured: true,
    trending: true,
    isNew: false,
    chartSeries: series(100, 0.55),
    activity: activity("meme-rotation", [
      {
        title: "Rotation executed",
        subtitle: "PEPE → BONK · Illustrative",
        daysAgo: 2,
      },
    ]),
    feeEstimateUsd: 14.1,
    estimatedCostUsd: 19.8,
    href: `${APP_ROUTES.degenClub}?id=meme-rotation`,
    isIllustrative: true,
  },
  {
    id: "base-meme-five",
    name: "Base Meme Five",
    kind: "Portfolio",
    creatorHandle: "basedegen",
    creatorName: "Base Degen",
    verified: true,
    thesis:
      "Five Base-chain memecoin sleeves. One success may offset failures — it is not assured.",
    strategy: "Equal weight · monthly rebalance",
    rebalanceRules: "Equal-weight reset on the 1st of each month.",
    riskLabel: "Extreme",
    volatilityLabel: "Very high",
    chainLabel: "Base",
    networkIds: ["base"],
    allocations: [
      { assetId: "pepe", label: "PEPE", percent: 20 },
      { assetId: "brett", label: "BRETT", percent: 20 },
      { assetId: "degen", label: "DEGEN", percent: 20 },
      { assetId: "toshi", label: "TOSHI", percent: 20 },
      { assetId: "eth", label: "ETH", percent: 20 },
    ],
    performance30d: 8.4,
    aumUsd: 310_000,
    volumeUsd: 240_000,
    investors: 38,
    likes: 190,
    featured: false,
    trending: true,
    isNew: true,
    chartSeries: series(100, 0.22),
    activity: activity("base-meme-five", [
      {
        title: "New listing",
        subtitle: "Featured in Degen Club · Illustrative",
        daysAgo: 4,
      },
    ]),
    feeEstimateUsd: 9.4,
    estimatedCostUsd: 12.1,
    href: `${APP_ROUTES.degenClub}?id=base-meme-five`,
    isIllustrative: true,
  },
  {
    id: "eth-meme-core",
    name: "Ethereum Meme Core",
    kind: "Index",
    creatorHandle: "ethmeme",
    creatorName: "ETH Meme Desk",
    verified: true,
    thesis:
      "Concentrated Ethereum memecoin set with a small ETH buffer for gas/liquidity.",
    strategy: "Buy Fear / Sell Greed overlay",
    rebalanceRules:
      "Trim winners above 30% sleeve weight. Add on Fear & Greed < 25 when cash buffer > 5%.",
    riskLabel: "Extreme",
    volatilityLabel: "High",
    chainLabel: "Ethereum",
    networkIds: ["ethereum"],
    allocations: [
      { assetId: "pepe", label: "PEPE", percent: 25 },
      { assetId: "shib", label: "SHIB", percent: 25 },
      { assetId: "floki", label: "FLOKI", percent: 20 },
      { assetId: "doge", label: "DOGE", percent: 15 },
      { assetId: "eth", label: "ETH", percent: 15 },
    ],
    performance30d: 4.1,
    aumUsd: 1_120_000,
    volumeUsd: 460_000,
    investors: 92,
    likes: 440,
    featured: true,
    trending: false,
    isNew: false,
    chartSeries: series(100, 0.12),
    activity: activity("eth-meme-core", [
      {
        title: "Circuit breaker check",
        subtitle: "Healthy · Illustrative",
        daysAgo: 1,
      },
    ]),
    feeEstimateUsd: 22.0,
    estimatedCostUsd: 28.5,
    href: `${APP_ROUTES.degenClub}?id=eth-meme-core`,
    isIllustrative: true,
  },
  {
    id: "bnb-meme-sprint",
    name: "BNB Meme Sprint",
    kind: "Portfolio",
    creatorHandle: "bnbbuilder",
    creatorName: "BNB Builder",
    verified: true,
    thesis:
      "Short-horizon BNB Chain memecoin basket. Illustrative only — no promised outcomes.",
    strategy: "High turnover · 3d cadence",
    rebalanceRules: "Rebalance every 3 days; max 5 assets.",
    riskLabel: "Extreme",
    volatilityLabel: "Extreme",
    chainLabel: "BNB Chain",
    networkIds: ["bnb"],
    allocations: [
      { assetId: "floki", label: "FLOKI", percent: 30 },
      { assetId: "baby", label: "BABYDOGE", percent: 25 },
      { assetId: "snek", label: "SNEK", percent: 25 },
      { assetId: "bnb", label: "BNB", percent: 20 },
    ],
    performance30d: -6.8,
    aumUsd: 180_000,
    volumeUsd: 210_000,
    investors: 27,
    likes: 95,
    featured: false,
    trending: false,
    isNew: true,
    chartSeries: series(100, -0.2),
    activity: activity("bnb-meme-sprint", [
      {
        title: "Cadence rebalance",
        subtitle: "4 sleeves · Illustrative",
        daysAgo: 2,
      },
    ]),
    feeEstimateUsd: 7.2,
    estimatedCostUsd: 9.8,
    href: `${APP_ROUTES.degenClub}?id=bnb-meme-sprint`,
    isIllustrative: true,
  },
  {
    id: "sol-frog-pack",
    name: "Sol Frog Pack",
    kind: "Index",
    creatorHandle: "solstack",
    creatorName: "Sol Stack",
    verified: true,
    thesis:
      "Animal-themed Solana memecoins. Multiple shots ≠ guaranteed recovery of losses.",
    strategy: "Equal weight · biweekly",
    rebalanceRules: "Equal weight every 14 days.",
    riskLabel: "Extreme",
    volatilityLabel: "Very high",
    chainLabel: "Solana",
    networkIds: ["solana"],
    allocations: [
      { assetId: "bonk", label: "BONK", percent: 25 },
      { assetId: "wif", label: "WIF", percent: 25 },
      { assetId: "pengu", label: "PENGU", percent: 25 },
      { assetId: "popcat", label: "POPCAT", percent: 25 },
    ],
    performance30d: 11.6,
    aumUsd: 275_000,
    volumeUsd: 330_000,
    investors: 44,
    likes: 320,
    featured: false,
    trending: true,
    isNew: false,
    chartSeries: series(100, 0.3),
    activity: activity("sol-frog-pack", [
      {
        title: "Like surge",
        subtitle: "Engagement only — not ranking · Illustrative",
        daysAgo: 1,
      },
    ]),
    feeEstimateUsd: 8.5,
    estimatedCostUsd: 11.0,
    href: `${APP_ROUTES.degenClub}?id=sol-frog-pack`,
    isIllustrative: true,
  },
  {
    id: "cross-meme-bridge",
    name: "Cross-Meme Bridge Index",
    kind: "Index",
    creatorHandle: "bridgeops",
    creatorName: "Bridge Ops",
    verified: true,
    thesis:
      "Multi-chain memecoin exposure with small L1 buffers. Bridging adds cost and failure risk.",
    strategy: "Multi-chain rebalance",
    rebalanceRules:
      "Maintain chain sleeves within 10% of target. Skip bridge if estimated bridge fee > 1% of trade.",
    riskLabel: "Extreme",
    volatilityLabel: "Extreme",
    chainLabel: "Multi-Chain",
    networkIds: ["ethereum", "base", "solana", "bnb"],
    allocations: [
      { assetId: "pepe", label: "PEPE", percent: 15 },
      { assetId: "wif", label: "WIF", percent: 15 },
      { assetId: "floki", label: "FLOKI", percent: 15 },
      { assetId: "bonk", label: "BONK", percent: 15 },
      { assetId: "doge", label: "DOGE", percent: 15 },
      { assetId: "eth", label: "ETH", percent: 15 },
      { assetId: "sol", label: "SOL", percent: 10 },
    ],
    performance30d: 2.3,
    aumUsd: 540_000,
    volumeUsd: 410_000,
    investors: 58,
    likes: 260,
    featured: true,
    trending: false,
    isNew: false,
    chartSeries: series(100, 0.05),
    activity: activity("cross-meme-bridge", [
      {
        title: "Bridge quote refreshed",
        subtitle: "Illustrative cost · no execution",
        daysAgo: 0,
      },
    ]),
    feeEstimateUsd: 16.4,
    estimatedCostUsd: 31.2,
    href: `${APP_ROUTES.degenClub}?id=cross-meme-bridge`,
    isIllustrative: true,
  },
  {
    id: "dog-stack",
    name: "Dog Stack Portfolio",
    kind: "Portfolio",
    creatorHandle: "memebuilder",
    creatorName: "Meme Builder",
    verified: true,
    thesis:
      "Dog-themed memecoins across Solana and Ethereum. Extreme risk; illustrative figures only.",
    strategy: "Static basket · manual review",
    rebalanceRules: "No auto-rebalance. Creator reviews monthly.",
    riskLabel: "Extreme",
    volatilityLabel: "Very high",
    chainLabel: "Multi-Chain",
    networkIds: ["solana", "ethereum"],
    allocations: [
      { assetId: "doge", label: "DOGE", percent: 30 },
      { assetId: "shib", label: "SHIB", percent: 25 },
      { assetId: "wif", label: "WIF", percent: 25 },
      { assetId: "floki", label: "FLOKI", percent: 20 },
    ],
    performance30d: -3.2,
    aumUsd: 195_000,
    volumeUsd: 150_000,
    investors: 31,
    likes: 175,
    featured: false,
    trending: false,
    isNew: true,
    chartSeries: series(100, -0.08),
    activity: activity("dog-stack", [
      {
        title: "Published",
        subtitle: "Public portfolio · Illustrative",
        daysAgo: 6,
      },
    ]),
    feeEstimateUsd: 6.8,
    estimatedCostUsd: 9.1,
    href: `${APP_ROUTES.degenClub}?id=dog-stack`,
    isIllustrative: true,
  },
];

export function getDegenClubWorkspace(): DegenClubWorkspace {
  return {
    products: PRODUCTS,
    featuredIds: PRODUCTS.filter((p) => p.featured).map((p) => p.id),
    trendingIds: PRODUCTS.filter((p) => p.trending).map((p) => p.id),
    marketDataStale: true,
    isIllustrative: true,
    hero: {
      title: "Degen Club",
      tagline: "Multiple Shots",
      points: [
        "One memecoin means one concentrated attempt.",
        "A diversified memecoin index provides multiple opportunities.",
        "One successful asset may offset several failures.",
        "Diversification does not guarantee profit.",
      ],
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

/** Networks treated as single-chain filters in Discover. */
export const DEGEN_CHAIN_FILTERS: {
  id: Exclude<
    import("@/lib/domain/degen-club").DegenDiscoverFilter,
    "all" | "featured" | "trending" | "new" | "multi-chain"
  >;
  label: string;
  networkId: NetworkId;
}[] = [
  { id: "solana", label: "Solana", networkId: "solana" },
  { id: "ethereum", label: "Ethereum", networkId: "ethereum" },
  { id: "base", label: "Base", networkId: "base" },
  { id: "bnb", label: "BNB Chain", networkId: "bnb" },
];
