import type {
  CreatorActivityItem,
  CreatorPublicProduct,
  CreatorSpecialty,
} from "@/lib/domain/creators";
import type { FeaturePlacement } from "@/lib/domain/types";
import type { MyStrategyRecord } from "@/lib/domain/strategies";
import type { ActivationSocialPlatform } from "@/lib/domain/creator-activation";

export interface CreatorDashboardIdentity {
  handle: string;
  displayName: string;
  bio: string;
  avatarInitials: string;
  avatarHue: number;
  verified: boolean;
  specialty: CreatorSpecialty;
  creatorSince: string;
  socials: Array<{
    platform: ActivationSocialPlatform;
    handle: string;
    profileUrl: string;
    connected: boolean;
  }>;
}

export interface CreatorDashboardOverviewMetrics {
  totalAumUsd: number;
  volume30dUsd: number;
  followers: number;
  notificationSubscribers: number;
  investorsCopiers: number;
  liveProductCount: number;
  totalTipsDexla: number;
  portfolioLikes: number;
}

/** USD and $DEXLA kept as separate ledgers — never summed together. */
export interface CreatorDashboardUsdEarnings {
  totalEarnedUsd: number;
  availableUsd: number;
  claimedUsd: number;
  portfolioExecutionFeesUsd: number;
  monthlyCreatorRewardsUsd: number;
  chartSeries: { t: string; v: number }[];
  monthlyHistory: Array<{
    month: string;
    executionFeesUsd: number;
    monthlyRewardsUsd: number;
  }>;
}

export interface CreatorDashboardDexlaEarnings {
  totalEarnedDexla: number;
  availableDexla: number;
  claimedDexla: number;
  tipsDexla: number;
  privateStrategyRevenueDexla: number;
  chartSeries: { t: string; v: number }[];
  monthlyHistory: Array<{
    month: string;
    tipsDexla: number;
    privateStrategyDexla: number;
  }>;
}

export interface CreatorDashboardLiveProduct extends CreatorPublicProduct {
  tipsDexla: number;
  generatedFeesUsd: number;
  creatorEarningsUsd: number;
  availableBalanceUsd: number;
  featurePlacement: FeaturePlacement;
}

export interface CreatorDashboardAudience {
  followerSeries: { t: string; v: number }[];
  notificationSeries: { t: string; v: number }[];
  likesSeries: { t: string; v: number }[];
  investorSeries: { t: string; v: number }[];
  topRegions: Array<{ region: string; percent: number }>;
  acquisitionSources: Array<{ source: string; percent: number }>;
  newInvestorsPercent: number;
  returningInvestorsPercent: number;
}

export interface CreatorDashboardLeaderboardRow {
  productId: string;
  productName: string;
  kind: "Index" | "Portfolio";
  rank: number | null;
  points: number;
  performanceContribution: number;
  aumContribution: number;
  volumeContribution: number;
  tipsContribution: number;
  distanceToTop10: number | null;
  monthlyResetDays: number;
}

export interface CreatorDashboardWorkspace {
  identity: CreatorDashboardIdentity;
  overview: CreatorDashboardOverviewMetrics;
  usdEarnings: CreatorDashboardUsdEarnings;
  dexlaEarnings: CreatorDashboardDexlaEarnings;
  liveProducts: CreatorDashboardLiveProduct[];
  audience: CreatorDashboardAudience;
  leaderboardRows: CreatorDashboardLeaderboardRow[];
  strategies: MyStrategyRecord[];
  executionFeeSharePercent: number;
  activity: CreatorActivityItem[];
  marketDataStale: boolean;
  isIllustrative: boolean;
}
