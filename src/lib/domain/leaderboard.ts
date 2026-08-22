import type { MarketplaceCategory } from "@/lib/domain/dashboard";
import type { NetworkId } from "@/lib/domain/types";

export type LeaderboardPeriod = "monthly" | "all-time";

export type LeaderboardProductKind = "Index" | "Portfolio";

export interface LeaderboardAllocation {
  assetId: string;
  label: string;
  percent: number;
}

export interface LeaderboardEntry {
  rank: number;
  portfolioId: string;
  name: string;
  kind: LeaderboardProductKind;
  category: MarketplaceCategory;
  creatorHandle: string;
  creatorName: string;
  verified: boolean;
  isIndexlaProduct: boolean;
  points: number;
  performancePercent: number;
  aumUsd: number;
  volumeUsd: number;
  investors: number;
  tipsDexla: number;
  growthPercent: number;
  networkIds: NetworkId[];
  allocations: LeaderboardAllocation[];
  likes: number;
  followers: number;
  /** Winner Zone ranks 1–10 (monthly only) */
  inWinnerZone: boolean;
  href: string;
  isIllustrative: boolean;
}

export interface LeaderboardRewardBreakdown {
  portfolioId: string;
  portfolioName: string;
  estimatedRewardUsd: number;
  creatorShareUsd: number;
  investorPoolUsd: number;
  eligibleInvestorCount: number;
  /** Demo claimable amount for connected preview user */
  claimableUsd: number | null;
  claimEligible: boolean;
}

export interface LeaderboardWorkspace {
  period: LeaderboardPeriod;
  monthlyEntries: LeaderboardEntry[];
  allTimeEntries: LeaderboardEntry[];
  rewardsPoolUsd: number;
  resetAtIso: string;
  rankingWeights: {
    performance: number;
    aum: number;
    volume: number;
    tips: number;
  };
  rewards: {
    creatorSharePercent: number;
    investorSharePercent: number;
    investorWeightInvestedPercent: number;
    investorWeightTippedPercent: number;
    minHoldingDays: number;
    topQualifyCount: number;
    estimatedRewardPerWinnerUsd: number;
    monthlyBreakdowns: LeaderboardRewardBreakdown[];
  };
  categories: MarketplaceCategory[];
  networks: { id: NetworkId; label: string }[];
  productKinds: LeaderboardProductKind[];
  marketDataStale: boolean;
  isIllustrative: boolean;
}
