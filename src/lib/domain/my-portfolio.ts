import type { ChartPeriod } from "@/lib/domain/dashboard";
import type {
  DexlaBalanceAndTier,
  NetworkId,
  Portfolio,
} from "@/lib/domain/types";

export type PortfolioVisibility = "personal" | "public";
export type PortfolioRunStatus = "active" | "paused";
export type MyPortfolioTab =
  | "overview"
  | "assets"
  | "automation"
  | "activity"
  | "notifications";

export type ActivityFilter =
  | "all"
  | "buy"
  | "sell"
  | "swap"
  | "rebalance"
  | "dca"
  | "bridge"
  | "tip"
  | "strategy-access";

export interface OwnedPortfolioSummary {
  id: string;
  name: string;
  kind: "Index" | "Portfolio";
  visibility: PortfolioVisibility;
  status: PortfolioRunStatus;
  valueUsd: number;
  performance30d: number;
  isIllustrative: boolean;
}

export interface PortfolioAssetRow {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  networkId: NetworkId;
  balance: number;
  valueUsd: number;
  allocationPercent: number;
  targetPercent: number;
  driftPercent: number;
  performance24h: number;
  performanceTotal: number;
}

export interface NetworkAllocation {
  networkId: NetworkId;
  label: string;
  percent: number;
  valueUsd: number;
}

export interface PortfolioAutomationDetail {
  strategyName: string;
  status: "active" | "paused" | "degraded";
  condition: string;
  action: string;
  frequency: string;
  nextExecutionAt: string | null;
  lastExecutionAt: string | null;
  slippageBps: number;
  tradeLimitUsd: number;
  dailyLimitUsd: number;
  expiry: string;
  circuitBreaker: boolean;
  permissionScope: string;
  permissionHealth: "healthy" | "expiring" | "expired" | "revoked";
  permissionExpiresAt: string;
}

export interface PortfolioActivityItem {
  id: string;
  type: Exclude<ActivityFilter, "all">;
  title: string;
  assetLabel: string;
  amountUsd: number | null;
  amountDexla: number | null;
  status: "pending" | "confirmed" | "failed" | "delayed";
  timestamp: string;
  provider: "cow" | "lifi" | "across" | "none";
  mevStatus: "protected" | "not-applicable" | "unknown";
  routingStatus: string;
  gasUsd: number;
  bridgeUsd: number;
  routingUsd: number;
  executionFeeUsd: number;
  txLinkPlaceholder: string;
  isIllustrative: boolean;
}

export interface PortfolioNotificationItem {
  id: string;
  category:
    | "execution"
    | "drift"
    | "automation"
    | "permission"
    | "gas"
    | "reward"
    | "creator"
    | "security";
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
  actionable?: "claim-rewards" | "review-permission" | "none";
}

export interface NotificationPreferences {
  executionUpdates: boolean;
  allocationDrift: boolean;
  automationTriggers: boolean;
  permissionExpiry: boolean;
  insufficientGas: boolean;
  rewardEligibility: boolean;
  creatorPublications: boolean;
  securityAlerts: boolean;
}

export interface PortfolioRewards {
  eligible: boolean;
  claimableUsd: number | null;
  rankHint: string;
}

export interface MyPortfolioDetail {
  summary: OwnedPortfolioSummary;
  portfolio: Portfolio;
  investedUsd: number;
  availableUsd: number;
  allTimePnlUsd: number;
  allTimePnlPercent: number;
  periodPerformance: Record<ChartPeriod, number>;
  chartSeries: Record<ChartPeriod, { t: string; v: number }[]>;
  assets: PortfolioAssetRow[];
  networkAllocations: NetworkAllocation[];
  riskSummary: string;
  riskLevel: "Low" | "Medium" | "High" | "Extreme";
  automation: PortfolioAutomationDetail;
  activity: PortfolioActivityItem[];
  estimatedSaveUsd: number;
  rewards: PortfolioRewards;
  marketDataStale: boolean;
}

export interface MyPortfolioWorkspace {
  portfolios: OwnedPortfolioSummary[];
  detailsById: Record<string, MyPortfolioDetail>;
  notifications: PortfolioNotificationItem[];
  notificationPrefs: NotificationPreferences;
  dexla: DexlaBalanceAndTier;
  isIllustrative: boolean;
}
