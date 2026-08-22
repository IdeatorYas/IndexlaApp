import type { NetworkId } from "@/lib/domain/types";
import type { ProductRisk } from "@/lib/domain/dashboard";

export type CreatorSpecialty =
  | "AI"
  | "DeFi"
  | "Crypto"
  | "RWAs"
  | "Degen"
  | "Hybrid"
  | "Tokenized Stocks"
  | "Commodities";

/** Viewer status for the smart Creator Hub card (SCREEN 11 lifecycle) */
export type CreatorHubUserStatus =
  | "locked"
  | "in-progress"
  | "awaiting-verification"
  | "approved"
  | "needs-changes";

export type CreatorHubSort = "newest" | "most-followed" | "highest-aum";

export interface CreatorDirectoryEntry {
  handle: string;
  displayName: string;
  bio: string;
  avatarInitials: string;
  /** 0–360 for illustrative avatar tint */
  avatarHue: number;
  verified: boolean;
  specialty: CreatorSpecialty;
  networkIds: NetworkId[];
  followerCount: number;
  notificationSubscriberCount: number;
  publicProductCount: number;
  bestPerformancePercent: number;
  totalAumUsd: number;
  investorsCopiers: number;
  growthPercent: number;
  featured: boolean;
  creatorSince: string;
  initiallyFollowing: boolean;
  initiallyNotify: boolean;
  discoveryRank: number;
  isIllustrative: boolean;
}

export interface CreatorsWorkspace {
  creators: CreatorDirectoryEntry[];
  featuredHandles: string[];
  viewerHubStatus: CreatorHubUserStatus;
  specialties: CreatorSpecialty[];
  networks: { id: NetworkId; label: string }[];
  isIllustrative: boolean;
}

export interface CreatorSocialLink {
  platform: "X" | "Website" | "Discord" | "YouTube";
  label: string;
  url: string;
}

export interface CreatorProfileAllocation {
  assetId: string;
  label: string;
  percent: number;
}

export interface CreatorPublicProduct {
  id: string;
  name: string;
  kind: "Index" | "Portfolio";
  verified: boolean;
  thesis: string;
  strategy: string;
  risk: ProductRisk;
  networkIds: NetworkId[];
  allocations: CreatorProfileAllocation[];
  aumUsd: number;
  volumeUsd: number;
  investors: number;
  performance30d: number;
  likes: number;
  portfolioLeaderboardRank: number | null;
  href: string;
  isIllustrative: boolean;
}

export interface CreatorPublicStrategy {
  id: string;
  name: string;
  logicSummary: string;
  riskLevel: "low" | "medium" | "high" | "extreme";
  compatibleAssets: string[];
  networkIds: NetworkId[];
  performance30d: number;
  activePortfolios: number;
  /** null = free / INDEXLA core style; number = creator access price */
  accessPriceDexla: number | null;
  href: string;
  isIllustrative: boolean;
}

export interface CreatorActivityItem {
  id: string;
  title: string;
  subtitle: string;
  atIso: string;
  kind: "product" | "strategy" | "update";
  isIllustrative: boolean;
}

export interface CreatorPublicProfile {
  handle: string;
  displayName: string;
  bio: string;
  avatarInitials: string;
  avatarHue: number;
  verified: boolean;
  specialty: CreatorSpecialty;
  creatorSince: string;
  socials: CreatorSocialLink[];
  followerCount: number;
  notificationSubscriberCount: number;
  totalAumUsd: number;
  totalVolumeUsd: number;
  investorsCopiers: number;
  liveProductCount: number;
  bestPortfolioLeaderboardRank: number | null;
  bestPerformancePercent: number;
  totalLikes: number;
  growthPercent: number;
  initiallyFollowing: boolean;
  initiallyNotify: boolean;
  products: CreatorPublicProduct[];
  strategies: CreatorPublicStrategy[];
  performanceSeries: { t: string; v: number }[];
  aumSeries: { t: string; v: number }[];
  investorSeries: { t: string; v: number }[];
  activity: CreatorActivityItem[];
  disclosures: string[];
  marketDataStale: boolean;
  isIllustrative: boolean;
}

export const CREATOR_FUNDS_DISCLOSURE =
  "Creators never control investor funds. You hold the underlying assets directly in your wallet.";
