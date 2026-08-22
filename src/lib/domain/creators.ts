import type { NetworkId } from "@/lib/domain/types";

export type CreatorSpecialty =
  | "AI"
  | "DeFi"
  | "Crypto"
  | "RWAs"
  | "Degen"
  | "Hybrid"
  | "Tokenized Stocks"
  | "Commodities";

/** Viewer status for the smart Creator Hub card */
export type CreatorHubUserStatus =
  | "not-started"
  | "setup-incomplete"
  | "awaiting-verification"
  | "approved";

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
