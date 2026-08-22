import type {
  Asset,
  CreatorProfile,
  DexlaBalanceAndTier,
  Network,
  Portfolio,
  Strategy,
  WalletConnection,
} from "@/lib/domain/types";

export const FIXTURE_LABEL = "Illustrative";

export const ILLUSTRATIVE_NETWORKS: Network[] = [
  { id: "ethereum", label: "Ethereum", executable: false, plannedOnly: false },
  { id: "base", label: "Base", executable: false, plannedOnly: false },
  { id: "arbitrum", label: "Arbitrum", executable: false, plannedOnly: false },
  { id: "bnb", label: "BNB Chain", executable: false, plannedOnly: false },
  { id: "solana", label: "Solana", executable: false, plannedOnly: false },
  { id: "sui", label: "Sui", executable: false, plannedOnly: false },
  {
    id: "robinhood",
    label: "Robinhood",
    executable: false,
    plannedOnly: true,
  },
];

export const ILLUSTRATIVE_ASSETS: Asset[] = [
  {
    id: "btc",
    symbol: "BTC",
    name: "Bitcoin",
    category: "crypto",
    networkIds: ["ethereum", "base"],
  },
  {
    id: "eth",
    symbol: "ETH",
    name: "Ethereum",
    category: "crypto",
    networkIds: ["ethereum", "base", "arbitrum"],
  },
  {
    id: "sol",
    symbol: "SOL",
    name: "Solana",
    category: "crypto",
    networkIds: ["solana"],
  },
  {
    id: "wif",
    symbol: "WIF",
    name: "dogwifhat",
    category: "memecoin",
    networkIds: ["solana"],
  },
];

export const ILLUSTRATIVE_PORTFOLIOS: Portfolio[] = [
  {
    id: "ai-infra-index",
    name: "AI Infrastructure Index",
    type: "rules-based-index",
    discoveryLabel: "Index",
    creatorHandle: "indexla",
    creatorName: "INDEXLA",
    thesis: "Cross-asset AI infrastructure exposure.",
    assets: [
      { assetId: "eth", label: "ETH", percent: 40 },
      { assetId: "sol", label: "SOL", percent: 35 },
      { assetId: "btc", label: "BTC", percent: 25 },
    ],
    networkIds: ["ethereum", "base", "solana"],
    strategyName: "Buy Fear / Sell Greed",
    valueUsd: 42_000,
    performance30d: 18.4,
    aumUsd: 4_200_000,
    investorCount: 128,
    tipCountDexla: 420,
    likeCount: 890,
    rankMonthly: 2,
    automationActive: true,
    isIllustrative: true,
  },
  {
    id: "degen-ten-shots",
    name: "Solana Meme 10-Shots",
    type: "public-portfolio",
    discoveryLabel: "Portfolio",
    creatorHandle: "memebuilder",
    creatorName: "Meme Builder",
    thesis: "Diversified memecoin basket — extreme risk.",
    assets: [
      { assetId: "wif", label: "WIF", percent: 10 },
      { assetId: "sol", label: "SOL", percent: 90 },
    ],
    networkIds: ["solana"],
    strategyName: "Rebalance",
    valueUsd: 8_500,
    performance30d: -12.5,
    aumUsd: 850_000,
    investorCount: 64,
    tipCountDexla: 95,
    likeCount: 210,
    rankMonthly: null,
    automationActive: false,
    isIllustrative: true,
  },
  {
    id: "macro-diversified",
    name: "Macro Diversified Index",
    type: "rules-based-index",
    discoveryLabel: "Index",
    creatorHandle: "indexla",
    creatorName: "INDEXLA",
    thesis: "Balanced macro exposure across crypto and tokenized assets.",
    assets: [
      { assetId: "btc", label: "BTC", percent: 35 },
      { assetId: "eth", label: "ETH", percent: 35 },
      { assetId: "sol", label: "SOL", percent: 30 },
    ],
    networkIds: ["ethereum", "base"],
    strategyName: "Rebalance",
    valueUsd: 28_000,
    performance30d: 15.2,
    aumUsd: 6_800_000,
    investorCount: 210,
    tipCountDexla: 680,
    likeCount: 1200,
    rankMonthly: 3,
    automationActive: true,
    isIllustrative: true,
  },
];

export const ILLUSTRATIVE_STRATEGIES: Strategy[] = [
  {
    id: "buy-fear-sell-greed",
    name: "Buy Fear / Sell Greed",
    creatorHandle: "indexla",
    description: "Core INDEXLA sentiment strategy framework.",
    accessPriceDexla: null,
    isIndexlaCore: true,
    isPrivate: false,
    riskLevel: "medium",
    compatiblePortfolioTypes: ["personal", "public-portfolio", "rules-based-index"],
    activeCreatorUsers: 0,
    isIllustrative: true,
  },
  {
    id: "momentum-alpha",
    name: "Momentum Alpha",
    creatorHandle: "quantcreator",
    description: "Private creator strategy — marketplace access in $DEXLA.",
    accessPriceDexla: 1500,
    isIndexlaCore: false,
    isPrivate: true,
    riskLevel: "high",
    compatiblePortfolioTypes: ["public-portfolio", "rules-based-index"],
    activeCreatorUsers: 12,
    isIllustrative: true,
  },
];

export const ILLUSTRATIVE_CREATORS: CreatorProfile[] = [
  {
    handle: "indexla",
    displayName: "INDEXLA",
    bio: "Official INDEXLA creator profile.",
    verified: true,
    followerCount: 12_400,
    publicPortfolioCount: 3,
    totalAumUsd: 18_500_000,
    bestPortfolioRank: 1,
    creatorSince: "2025-01-01",
    activationStatus: "approved",
  },
  {
    handle: "memebuilder",
    displayName: "Meme Builder",
    bio: "Degen Club portfolio creator.",
    verified: true,
    followerCount: 2_100,
    publicPortfolioCount: 2,
    totalAumUsd: 1_200_000,
    bestPortfolioRank: 18,
    creatorSince: "2025-06-01",
    activationStatus: "approved",
  },
];

export const DISCONNECTED_WALLET: WalletConnection = {
  state: "disconnected",
  address: null,
  networkId: null,
  shortenedAddress: null,
};

export const ILLUSTRATIVE_DEXLA: DexlaBalanceAndTier = {
  balance: 3_200,
  tier: "10",
  discountPercent: 10,
  nextTier: "20",
  balanceToNextTier: 1_800,
  isDemo: true,
};

export function getPortfolioById(id: string): Portfolio | undefined {
  return ILLUSTRATIVE_PORTFOLIOS.find((p) => p.id === id);
}

export function getCreatorByHandle(handle: string): CreatorProfile | undefined {
  return ILLUSTRATIVE_CREATORS.find((c) => c.handle === handle);
}
