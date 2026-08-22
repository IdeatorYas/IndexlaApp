/** Shared INDEXLA app domain models — normalized across screens. */

export type NetworkId =
  | "ethereum"
  | "base"
  | "arbitrum"
  | "bnb"
  | "solana"
  | "sui"
  | "robinhood";

export type PortfolioType = "personal" | "public-portfolio" | "rules-based-index";

export type DiscoveryTab = "all" | "indexes" | "portfolios";

export type WalletConnectionState =
  | "disconnected"
  | "connected"
  | "wrong-network"
  | "reconnect";

export type DexlaSaveTier = "none" | "10" | "20" | "30";

export type PortfolioFeeType = "creator-portfolio" | "indexla-portfolio";

export type AdapterStatus = "available" | "disabled" | "unavailable";

export interface UserAccount {
  id: string;
  nickname: string;
  walletAddress: string | null;
}

export interface WalletConnection {
  state: WalletConnectionState;
  address: string | null;
  networkId: NetworkId | null;
  shortenedAddress: string | null;
}

export interface DexlaBalanceAndTier {
  balance: number;
  tier: DexlaSaveTier;
  discountPercent: number;
  nextTier: DexlaSaveTier | null;
  balanceToNextTier: number | null;
  isDemo: boolean;
}

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  category:
    | "crypto"
    | "tokenized-stock"
    | "tokenized-commodity"
    | "tokenized-real-estate"
    | "rwa"
    | "stablecoin"
    | "memecoin";
  networkIds: NetworkId[];
}

export interface Network {
  id: NetworkId;
  label: string;
  executable: boolean;
  plannedOnly: boolean;
}

export interface PortfolioAllocation {
  assetId: string;
  label: string;
  percent: number;
}

export interface Portfolio {
  id: string;
  name: string;
  type: PortfolioType;
  discoveryLabel: "Index" | "Portfolio";
  creatorHandle: string | null;
  creatorName: string | null;
  thesis: string;
  assets: PortfolioAllocation[];
  networkIds: NetworkId[];
  strategyName: string;
  valueUsd: number;
  performance30d: number;
  aumUsd: number;
  investorCount: number;
  tipCountDexla: number;
  likeCount: number;
  rankMonthly: number | null;
  automationActive: boolean;
  isIllustrative: boolean;
}

export interface PortfolioHolding {
  portfolioId: string;
  assetId: string;
  networkId: NetworkId;
  balance: number;
  valueUsd: number;
  allocationPercent: number;
  targetPercent: number;
  performance24h: number;
  performanceTotal: number;
}

export interface PortfolioPerformance {
  portfolioId: string;
  period: "7d" | "30d" | "90d" | "1y";
  points: { t: string; v: number }[];
}

export interface PortfolioRanking {
  portfolioId: string;
  rank: number;
  points: number;
  performanceScore: number;
  aumScore: number;
  volumeScore: number;
  tipsScore: number;
  period: "monthly" | "all-time";
  isUserOwned: boolean;
}

export interface Strategy {
  id: string;
  name: string;
  creatorHandle: string;
  description: string;
  accessPriceDexla: number | null;
  isIndexlaCore: boolean;
  isPrivate: boolean;
  riskLevel: "low" | "medium" | "high" | "extreme";
  compatiblePortfolioTypes: PortfolioType[];
  activeCreatorUsers: number;
  isIllustrative: boolean;
}

export interface AutomationRule {
  id: string;
  portfolioId: string;
  strategyId: string;
  status: "active" | "paused" | "degraded" | "revoked";
  conditionSummary: string;
  actionSummary: string;
  nextExecutionAt: string | null;
  lastExecutionAt: string | null;
  slippageLimitBps: number;
  sessionExpiry: string;
}

export interface PermissionSession {
  id: string;
  portfolioId: string;
  allowedAssets: string[];
  allowedNetworks: NetworkId[];
  allowedActions: ("swap" | "bridge" | "rebalance")[];
  spendingLimitUsd: number;
  expiresAt: string;
  status: "active" | "paused" | "revoked" | "expired";
}

export interface ExecutionQuote {
  id: string;
  expiresAt: string;
  routeProvider: "cow" | "lifi" | "across" | "none";
  mevAware: boolean;
  sourceNetworkId: NetworkId;
  destinationNetworkId: NetworkId;
  estimatedGasUsd: number;
  estimatedBridgeUsd: number;
  estimatedSlippageBps: number;
  status: "valid" | "expired" | "unavailable";
}

export interface ExecutionRoute {
  quoteId: string;
  provider: "cow" | "lifi" | "across";
  label: string;
  status: AdapterStatus;
}

export interface ExecutionRecord {
  id: string;
  portfolioId: string;
  type: "buy" | "sell" | "swap" | "rebalance" | "bridge" | "dca" | "tip" | "strategy-access";
  status: "pending" | "confirmed" | "failed" | "refunded" | "delayed";
  indexlaFeeUsd: number;
  gasUsd: number;
  bridgeUsd: number;
  routeProvider: string;
  txHash: string | null;
  createdAt: string;
}

export interface CreatorProfile {
  handle: string;
  displayName: string;
  bio: string;
  verified: boolean;
  followerCount: number;
  publicPortfolioCount: number;
  totalAumUsd: number;
  bestPortfolioRank: number | null;
  creatorSince: string;
  activationStatus: "locked" | "in-progress" | "awaiting-verification" | "approved" | "needs-changes";
}

export interface CreatorRevenue {
  creatorHandle: string;
  lifetimeUsd: number;
  availableUsd: number;
  claimedUsd: number;
  streams: {
    portfolioExecutionFees: number;
    privateStrategyRevenue: number;
    dexlaTips: number;
    monthlyRewards: number;
  };
  isIllustrative: boolean;
}

export interface RewardEligibility {
  portfolioId: string;
  winningPortfolioName: string;
  invested: boolean;
  tippedDexla: boolean;
  heldSevenDays: boolean;
  eligible: boolean;
  investorWeightInvested: number;
  investorWeightTipped: number;
  missingRequirements: string[];
}

export interface RewardClaim {
  id: string;
  portfolioId: string;
  status: "idle" | "pending" | "success" | "failed";
  underlyingAssets: { symbol: string; amount: number }[];
  creatorSharePercent: 50;
  investorSharePercent: 50;
}

export interface FeaturePlacement {
  portfolioId: string;
  active: boolean;
  costDexla: 2500;
  durationDays: 7;
  burnPercent: 100;
  remainingMs: number | null;
}

export interface Notification {
  id: string;
  type:
    | "strategy-triggered"
    | "execution-completed"
    | "execution-failed"
    | "drift"
    | "permission-expiry"
    | "low-gas"
    | "reward-eligibility"
    | "reward-ready"
    | "security";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface CreatorFollow {
  creatorHandle: string;
  following: boolean;
  notifyOnNewPortfolio: boolean;
}

export interface PortfolioLike {
  portfolioId: string;
  liked: boolean;
  likeCount: number;
}

export interface CreatorNotificationPreference {
  creatorHandle: string;
  notifyOnNewPortfolio: boolean;
}

export interface AppScreenMeta {
  number: number;
  slug: string;
  title: string;
  route: string;
  purpose: string;
}
