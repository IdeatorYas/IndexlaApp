import type { MarketplaceCategory } from "@/lib/domain/dashboard";
import type {
  LeaderboardEntry,
  LeaderboardRewardBreakdown,
  LeaderboardWorkspace,
} from "@/lib/domain/leaderboard";
import type { NetworkId } from "@/lib/domain/types";
import { APP_ROUTES } from "@/lib/routes";

type Seed = {
  id: string;
  name: string;
  kind: "Index" | "Portfolio";
  category: MarketplaceCategory;
  creatorHandle: string;
  creatorName: string;
  isIndexlaProduct: boolean;
  performancePercent: number;
  aumUsd: number;
  volumeUsd: number;
  investors: number;
  tipsDexla: number;
  growthPercent: number;
  networkIds: NetworkId[];
  allocations: { assetId: string; label: string; percent: number }[];
  likes: number;
  followers: number;
};

const SEEDS: Seed[] = [
  {
    id: "solana-growth",
    name: "Solana Growth Index",
    kind: "Index",
    category: "Crypto",
    creatorHandle: "indexla",
    creatorName: "INDEXLA",
    isIndexlaProduct: true,
    performancePercent: 21.3,
    aumUsd: 1_850_000,
    volumeUsd: 920_000,
    investors: 76,
    tipsDexla: 2_420,
    growthPercent: 18.6,
    networkIds: ["solana", "ethereum"],
    allocations: [
      { assetId: "sol", label: "SOL", percent: 70 },
      { assetId: "eth", label: "ETH", percent: 20 },
      { assetId: "wif", label: "WIF", percent: 10 },
    ],
    likes: 630,
    followers: 1_200,
  },
  {
    id: "ai-infra-index",
    name: "AI Infrastructure Index",
    kind: "Index",
    category: "AI",
    creatorHandle: "indexla",
    creatorName: "INDEXLA",
    isIndexlaProduct: true,
    performancePercent: 18.4,
    aumUsd: 4_200_000,
    volumeUsd: 1_450_000,
    investors: 128,
    tipsDexla: 1_980,
    growthPercent: 14.2,
    networkIds: ["ethereum", "base", "solana"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 40 },
      { assetId: "sol", label: "SOL", percent: 35 },
      { assetId: "btc", label: "BTC", percent: 25 },
    ],
    likes: 890,
    followers: 2_100,
  },
  {
    id: "macro-diversified",
    name: "Macro Diversified Index",
    kind: "Index",
    category: "Hybrid",
    creatorHandle: "indexla",
    creatorName: "INDEXLA",
    isIndexlaProduct: true,
    performancePercent: 15.2,
    aumUsd: 6_800_000,
    volumeUsd: 2_100_000,
    investors: 210,
    tipsDexla: 1_640,
    growthPercent: 11.8,
    networkIds: ["ethereum", "base"],
    allocations: [
      { assetId: "btc", label: "BTC", percent: 35 },
      { assetId: "eth", label: "ETH", percent: 35 },
      { assetId: "sol", label: "SOL", percent: 30 },
    ],
    likes: 1_200,
    followers: 3_400,
  },
  {
    id: "momentum-bluechip",
    name: "Momentum Bluechip Portfolio",
    kind: "Portfolio",
    category: "Crypto",
    creatorHandle: "quantdesk",
    creatorName: "Quant Desk",
    isIndexlaProduct: false,
    performancePercent: 16.8,
    aumUsd: 3_100_000,
    volumeUsd: 1_280_000,
    investors: 142,
    tipsDexla: 1_520,
    growthPercent: 13.4,
    networkIds: ["ethereum", "arbitrum", "base"],
    allocations: [
      { assetId: "btc", label: "BTC", percent: 45 },
      { assetId: "eth", label: "ETH", percent: 55 },
    ],
    likes: 710,
    followers: 980,
  },
  {
    id: "defi-core",
    name: "DeFi Core Portfolio",
    kind: "Portfolio",
    category: "DeFi",
    creatorHandle: "quantdesk",
    creatorName: "Quant Desk",
    isIndexlaProduct: false,
    performancePercent: 12.8,
    aumUsd: 2_100_000,
    volumeUsd: 880_000,
    investors: 96,
    tipsDexla: 1_180,
    growthPercent: 9.6,
    networkIds: ["ethereum", "base", "arbitrum"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 55 },
      { assetId: "btc", label: "BTC", percent: 45 },
    ],
    likes: 540,
    followers: 860,
  },
  {
    id: "tokenized-tech",
    name: "Tokenized Tech Leaders",
    kind: "Index",
    category: "Tokenized Stocks",
    creatorHandle: "equitydesk",
    creatorName: "Equity Desk",
    isIndexlaProduct: false,
    performancePercent: 11.4,
    aumUsd: 2_600_000,
    volumeUsd: 740_000,
    investors: 88,
    tipsDexla: 940,
    growthPercent: 8.2,
    networkIds: ["ethereum", "base", "solana"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 65 },
      { assetId: "sol", label: "SOL", percent: 35 },
    ],
    likes: 410,
    followers: 620,
  },
  {
    id: "rwa-income",
    name: "Tokenized Income Basket",
    kind: "Portfolio",
    category: "RWAs",
    creatorHandle: "yieldlab",
    creatorName: "Yield Lab",
    isIndexlaProduct: false,
    performancePercent: 8.9,
    aumUsd: 3_400_000,
    volumeUsd: 610_000,
    investors: 154,
    tipsDexla: 860,
    growthPercent: 6.4,
    networkIds: ["ethereum", "base"],
    allocations: [
      { assetId: "btc", label: "BTC", percent: 40 },
      { assetId: "eth", label: "ETH", percent: 60 },
    ],
    likes: 720,
    followers: 1_050,
  },
  {
    id: "base-builders",
    name: "Base Builders Index",
    kind: "Index",
    category: "Crypto",
    creatorHandle: "chainops",
    creatorName: "Chain Ops",
    isIndexlaProduct: false,
    performancePercent: 14.1,
    aumUsd: 1_420_000,
    volumeUsd: 560_000,
    investors: 71,
    tipsDexla: 790,
    growthPercent: 12.1,
    networkIds: ["base", "ethereum"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 70 },
      { assetId: "btc", label: "BTC", percent: 30 },
    ],
    likes: 380,
    followers: 540,
  },
  {
    id: "arb-liquidity",
    name: "Arbitrum Liquidity Portfolio",
    kind: "Portfolio",
    category: "DeFi",
    creatorHandle: "chainops",
    creatorName: "Chain Ops",
    isIndexlaProduct: false,
    performancePercent: 10.6,
    aumUsd: 1_980_000,
    volumeUsd: 690_000,
    investors: 83,
    tipsDexla: 720,
    growthPercent: 7.8,
    networkIds: ["arbitrum", "ethereum"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 80 },
      { assetId: "btc", label: "BTC", percent: 20 },
    ],
    likes: 295,
    followers: 410,
  },
  {
    id: "commodities-lite",
    name: "Commodities Lite Index",
    kind: "Index",
    category: "Commodities",
    creatorHandle: "indexla",
    creatorName: "INDEXLA",
    isIndexlaProduct: true,
    performancePercent: 7.2,
    aumUsd: 1_100_000,
    volumeUsd: 320_000,
    investors: 42,
    tipsDexla: 510,
    growthPercent: 4.1,
    networkIds: ["ethereum"],
    allocations: [
      { assetId: "btc", label: "BTC", percent: 70 },
      { assetId: "eth", label: "ETH", percent: 30 },
    ],
    likes: 190,
    followers: 780,
  },
  {
    id: "solana-ecosystem",
    name: "Solana Ecosystem Portfolio",
    kind: "Portfolio",
    category: "Crypto",
    creatorHandle: "solstack",
    creatorName: "Sol Stack",
    isIndexlaProduct: false,
    performancePercent: 13.5,
    aumUsd: 980_000,
    volumeUsd: 480_000,
    investors: 64,
    tipsDexla: 680,
    growthPercent: 10.9,
    networkIds: ["solana"],
    allocations: [
      { assetId: "sol", label: "SOL", percent: 85 },
      { assetId: "wif", label: "WIF", percent: 15 },
    ],
    likes: 455,
    followers: 690,
  },
  {
    id: "hybrid-growth",
    name: "Hybrid Growth Portfolio",
    kind: "Portfolio",
    category: "Hybrid",
    creatorHandle: "equitydesk",
    creatorName: "Equity Desk",
    isIndexlaProduct: false,
    performancePercent: 9.8,
    aumUsd: 1_560_000,
    volumeUsd: 410_000,
    investors: 59,
    tipsDexla: 440,
    growthPercent: 7.1,
    networkIds: ["ethereum", "base", "solana"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 50 },
      { assetId: "sol", label: "SOL", percent: 30 },
      { assetId: "btc", label: "BTC", percent: 20 },
    ],
    likes: 320,
    followers: 480,
  },
  {
    id: "degen-ten-shots",
    name: "Solana Meme 10-Shots",
    kind: "Portfolio",
    category: "Degen",
    creatorHandle: "memebuilder",
    creatorName: "Meme Builder",
    isIndexlaProduct: false,
    performancePercent: 24.6,
    aumUsd: 850_000,
    volumeUsd: 1_050_000,
    investors: 64,
    tipsDexla: 1_120,
    growthPercent: 22.4,
    networkIds: ["solana"],
    allocations: [
      { assetId: "wif", label: "WIF", percent: 10 },
      { assetId: "sol", label: "SOL", percent: 90 },
    ],
    likes: 210,
    followers: 1_800,
  },
  {
    id: "meme-rotation",
    name: "Meme Rotation Index",
    kind: "Index",
    category: "Degen",
    creatorHandle: "memebuilder",
    creatorName: "Meme Builder",
    isIndexlaProduct: false,
    performancePercent: 19.2,
    aumUsd: 620_000,
    volumeUsd: 780_000,
    investors: 51,
    tipsDexla: 890,
    growthPercent: 16.8,
    networkIds: ["solana", "base"],
    allocations: [
      { assetId: "sol", label: "SOL", percent: 60 },
      { assetId: "wif", label: "WIF", percent: 40 },
    ],
    likes: 860,
    followers: 1_800,
  },
  {
    id: "stable-yield",
    name: "Stable Yield Overlay",
    kind: "Portfolio",
    category: "RWAs",
    creatorHandle: "yieldlab",
    creatorName: "Yield Lab",
    isIndexlaProduct: false,
    performancePercent: 5.4,
    aumUsd: 2_450_000,
    volumeUsd: 290_000,
    investors: 118,
    tipsDexla: 360,
    growthPercent: 3.2,
    networkIds: ["ethereum", "base"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 40 },
      { assetId: "btc", label: "BTC", percent: 60 },
    ],
    likes: 280,
    followers: 1_050,
  },
  {
    id: "ai-agents",
    name: "AI Agents Basket",
    kind: "Portfolio",
    category: "AI",
    creatorHandle: "agentlab",
    creatorName: "Agent Lab",
    isIndexlaProduct: false,
    performancePercent: 17.6,
    aumUsd: 1_120_000,
    volumeUsd: 540_000,
    investors: 67,
    tipsDexla: 610,
    growthPercent: 15.3,
    networkIds: ["ethereum", "base", "solana"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 45 },
      { assetId: "sol", label: "SOL", percent: 40 },
      { assetId: "btc", label: "BTC", percent: 15 },
    ],
    likes: 505,
    followers: 730,
  },
  {
    id: "bnb-core",
    name: "BNB Core Index",
    kind: "Index",
    category: "Crypto",
    creatorHandle: "bnbbuilder",
    creatorName: "BNB Builder",
    isIndexlaProduct: false,
    performancePercent: 8.1,
    aumUsd: 760_000,
    volumeUsd: 250_000,
    investors: 38,
    tipsDexla: 290,
    growthPercent: 5.6,
    networkIds: ["bnb", "ethereum"],
    allocations: [
      { assetId: "btc", label: "BTC", percent: 50 },
      { assetId: "eth", label: "ETH", percent: 50 },
    ],
    likes: 165,
    followers: 290,
  },
  {
    id: "sui-growth",
    name: "Sui Growth Portfolio",
    kind: "Portfolio",
    category: "Crypto",
    creatorHandle: "suistack",
    creatorName: "Sui Stack",
    isIndexlaProduct: false,
    performancePercent: 12.2,
    aumUsd: 540_000,
    volumeUsd: 210_000,
    investors: 29,
    tipsDexla: 240,
    growthPercent: 9.4,
    networkIds: ["sui", "ethereum"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 70 },
      { assetId: "btc", label: "BTC", percent: 30 },
    ],
    likes: 140,
    followers: 210,
  },
  {
    id: "defi-bluechip-index",
    name: "DeFi Bluechip Index",
    kind: "Index",
    category: "DeFi",
    creatorHandle: "indexla",
    creatorName: "INDEXLA",
    isIndexlaProduct: true,
    performancePercent: 6.8,
    aumUsd: 2_050_000,
    volumeUsd: 380_000,
    investors: 94,
    tipsDexla: 410,
    growthPercent: 4.8,
    networkIds: ["ethereum", "arbitrum", "base"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 60 },
      { assetId: "btc", label: "BTC", percent: 40 },
    ],
    likes: 430,
    followers: 2_100,
  },
  {
    id: "tokenized-energy",
    name: "Tokenized Energy Basket",
    kind: "Portfolio",
    category: "Commodities",
    creatorHandle: "rwalabs",
    creatorName: "RWA Labs",
    isIndexlaProduct: false,
    performancePercent: 4.9,
    aumUsd: 890_000,
    volumeUsd: 180_000,
    investors: 33,
    tipsDexla: 190,
    growthPercent: 2.8,
    networkIds: ["ethereum"],
    allocations: [
      { assetId: "btc", label: "BTC", percent: 55 },
      { assetId: "eth", label: "ETH", percent: 45 },
    ],
    likes: 112,
    followers: 250,
  },
  {
    id: "cross-chain-beta",
    name: "Cross-Chain Beta Index",
    kind: "Index",
    category: "Hybrid",
    creatorHandle: "bridgeops",
    creatorName: "Bridge Ops",
    isIndexlaProduct: false,
    performancePercent: 7.6,
    aumUsd: 1_050_000,
    volumeUsd: 340_000,
    investors: 47,
    tipsDexla: 270,
    growthPercent: 5.9,
    networkIds: ["ethereum", "base", "arbitrum", "solana"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 40 },
      { assetId: "btc", label: "BTC", percent: 35 },
      { assetId: "sol", label: "SOL", percent: 25 },
    ],
    likes: 205,
    followers: 360,
  },
  {
    id: "equity-overlay",
    name: "Equity Overlay Portfolio",
    kind: "Portfolio",
    category: "Tokenized Stocks",
    creatorHandle: "equitydesk",
    creatorName: "Equity Desk",
    isIndexlaProduct: false,
    performancePercent: 6.1,
    aumUsd: 1_280_000,
    volumeUsd: 220_000,
    investors: 41,
    tipsDexla: 210,
    growthPercent: 3.9,
    networkIds: ["ethereum", "base"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 75 },
      { assetId: "btc", label: "BTC", percent: 25 },
    ],
    likes: 188,
    followers: 620,
  },
  {
    id: "agent-infra",
    name: "Agent Infra Index",
    kind: "Index",
    category: "AI",
    creatorHandle: "agentlab",
    creatorName: "Agent Lab",
    isIndexlaProduct: false,
    performancePercent: 10.2,
    aumUsd: 710_000,
    volumeUsd: 300_000,
    investors: 36,
    tipsDexla: 330,
    growthPercent: 8.5,
    networkIds: ["ethereum", "base"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 55 },
      { assetId: "sol", label: "SOL", percent: 45 },
    ],
    likes: 275,
    followers: 730,
  },
  {
    id: "liquidity-harvest",
    name: "Liquidity Harvest Portfolio",
    kind: "Portfolio",
    category: "DeFi",
    creatorHandle: "yieldlab",
    creatorName: "Yield Lab",
    isIndexlaProduct: false,
    performancePercent: 5.8,
    aumUsd: 1_670_000,
    volumeUsd: 260_000,
    investors: 72,
    tipsDexla: 180,
    growthPercent: 3.5,
    networkIds: ["ethereum", "arbitrum"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 65 },
      { assetId: "btc", label: "BTC", percent: 35 },
    ],
    likes: 150,
    followers: 1_050,
  },
  {
    id: "robinhood-planned",
    name: "Tokenized Markets Preview",
    kind: "Index",
    category: "Tokenized Stocks",
    creatorHandle: "indexla",
    creatorName: "INDEXLA",
    isIndexlaProduct: true,
    performancePercent: 3.4,
    aumUsd: 420_000,
    volumeUsd: 95_000,
    investors: 18,
    tipsDexla: 95,
    growthPercent: 1.6,
    networkIds: ["ethereum", "robinhood"],
    allocations: [
      { assetId: "eth", label: "ETH", percent: 50 },
      { assetId: "btc", label: "BTC", percent: 50 },
    ],
    likes: 98,
    followers: 2_100,
  },
];

function normalizeScore(value: number, max: number): number {
  if (max <= 0) return 0;
  return value / max;
}

function rankEntries(
  seeds: Seed[],
  winnerZoneSize: number,
): LeaderboardEntry[] {
  const maxPerf = Math.max(...seeds.map((s) => s.performancePercent));
  const maxAum = Math.max(...seeds.map((s) => s.aumUsd));
  const maxVol = Math.max(...seeds.map((s) => s.volumeUsd));
  const maxTips = Math.max(...seeds.map((s) => s.tipsDexla));

  const scored = seeds.map((seed) => {
    const points = Math.round(
      (normalizeScore(seed.performancePercent, maxPerf) * 50 +
        normalizeScore(seed.aumUsd, maxAum) * 25 +
        normalizeScore(seed.volumeUsd, maxVol) * 15 +
        normalizeScore(seed.tipsDexla, maxTips) * 10) *
        100,
    );
    return { seed, points };
  });

  scored.sort((a, b) => b.points - a.points || b.seed.performancePercent - a.seed.performancePercent);

  return scored.map(({ seed, points }, index) => {
    const rank = index + 1;
    return {
      rank,
      portfolioId: seed.id,
      name: seed.name,
      kind: seed.kind,
      category: seed.category,
      creatorHandle: seed.creatorHandle,
      creatorName: seed.creatorName,
      verified: true,
      isIndexlaProduct: seed.isIndexlaProduct,
      points,
      performancePercent: seed.performancePercent,
      aumUsd: seed.aumUsd,
      volumeUsd: seed.volumeUsd,
      investors: seed.investors,
      tipsDexla: seed.tipsDexla,
      growthPercent: seed.growthPercent,
      networkIds: seed.networkIds,
      allocations: seed.allocations,
      likes: seed.likes,
      followers: seed.followers,
      inWinnerZone: rank <= winnerZoneSize,
      href: `${APP_ROUTES.discover}?id=${seed.id}`,
      isIllustrative: true,
    };
  });
}

const TOP_QUALIFY = 10;
const MONTHLY = rankEntries(SEEDS, TOP_QUALIFY);

/** All-Time uses slightly different volume/tips weighting via reordered growth bias */
const ALL_TIME_SEEDS: Seed[] = SEEDS.map((s, i) => ({
  ...s,
  performancePercent: Number((s.performancePercent * 1.35 + (25 - i) * 0.15).toFixed(1)),
  aumUsd: Math.round(s.aumUsd * 1.8),
  volumeUsd: Math.round(s.volumeUsd * 2.4),
  tipsDexla: Math.round(s.tipsDexla * 3.2),
  growthPercent: Number((s.growthPercent * 1.6).toFixed(1)),
}));
const ALL_TIME = rankEntries(ALL_TIME_SEEDS, TOP_QUALIFY).map((e) => ({
  ...e,
  inWinnerZone: false,
}));

const REWARDS_POOL_USD = 125_000;
const EST_PER_WINNER = Math.round(REWARDS_POOL_USD / TOP_QUALIFY);

function buildMonthlyBreakdowns(
  entries: LeaderboardEntry[],
): LeaderboardRewardBreakdown[] {
  return entries
    .filter((e) => e.inWinnerZone)
    .map((e, i) => {
      const estimated = EST_PER_WINNER + (TOP_QUALIFY - e.rank) * 1_250;
      const creatorShare = Math.round(estimated * 0.5);
      const investorPool = estimated - creatorShare;
      const claimEligible = i === 1;
      return {
        portfolioId: e.portfolioId,
        portfolioName: e.name,
        estimatedRewardUsd: estimated,
        creatorShareUsd: creatorShare,
        investorPoolUsd: investorPool,
        eligibleInvestorCount: Math.max(8, Math.round(e.investors * 0.22)),
        claimableUsd: claimEligible ? 186 : null,
        claimEligible,
      };
    });
}

const CATEGORIES: MarketplaceCategory[] = [
  "Crypto",
  "AI",
  "DeFi",
  "RWAs",
  "Tokenized Stocks",
  "Commodities",
  "Hybrid",
  "Degen",
];

const NETWORKS: { id: NetworkId; label: string }[] = [
  { id: "ethereum", label: "Ethereum" },
  { id: "base", label: "Base" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "bnb", label: "BNB Chain" },
  { id: "solana", label: "Solana" },
  { id: "sui", label: "Sui" },
  { id: "robinhood", label: "Robinhood" },
];

export function getLeaderboardWorkspace(): LeaderboardWorkspace {
  return {
    period: "monthly",
    monthlyEntries: MONTHLY,
    allTimeEntries: ALL_TIME,
    rewardsPoolUsd: REWARDS_POOL_USD,
    /** Illustrative countdown target — ~12 days from fixture stamp */
    resetAtIso: "2026-09-01T00:00:00.000Z",
    rankingWeights: {
      performance: 50,
      aum: 25,
      volume: 15,
      tips: 10,
    },
    rewards: {
      creatorSharePercent: 50,
      investorSharePercent: 50,
      investorWeightInvestedPercent: 80,
      investorWeightTippedPercent: 20,
      minHoldingDays: 7,
      topQualifyCount: TOP_QUALIFY,
      estimatedRewardPerWinnerUsd: EST_PER_WINNER,
      monthlyBreakdowns: buildMonthlyBreakdowns(MONTHLY),
    },
    categories: CATEGORIES,
    networks: NETWORKS,
    productKinds: ["Index", "Portfolio"],
    marketDataStale: true,
    isIllustrative: true,
  };
}

export function getEmptyLeaderboardWorkspace(): LeaderboardWorkspace {
  const base = getLeaderboardWorkspace();
  return {
    ...base,
    monthlyEntries: [],
    allTimeEntries: [],
    rewards: {
      ...base.rewards,
      monthlyBreakdowns: [],
    },
    marketDataStale: false,
  };
}
