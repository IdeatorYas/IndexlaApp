/**
 * Stable Club position dashboard model — on-chain ownership is authoritative.
 */
import type { NpmApprovalStatus } from "@/lib/stable-club/nft-approval";

export type StableClubPositionStatus =
  | "in-range"
  | "out-of-range"
  | "pending-verification"
  | "closed";

export type StableClubPosition = {
  id: string;
  poolId: string;
  poolLabel: string;
  protocol: "uniswap-v3" | "aerodrome-slipstream" | "test-only";
  chainId: number;
  owner: `0x${string}`;
  positionTokenId: string;
  /** NPM (position manager) that must receive per-token approve(adapter, tokenId). */
  npmAddress: `0x${string}` | null;
  /** Adapter that must be the approved spender for harvest/compound/rebalance. */
  adapterAddress: `0x${string}` | null;
  npmApprovalStatus: NpmApprovalStatus;
  tokenASymbol: string;
  tokenBSymbol: string;
  liquidity: string;
  feesEarnedUsd: string;
  rewardsEarnedUsd: string;
  rangeStatus: StableClubPositionStatus;
  tickLower?: number;
  tickUpper?: number;
  lastUpdated: number;
  automation: {
    harvest: boolean;
    compound: boolean;
    rebalance: boolean;
    paused: boolean;
  };
  dataVerifiedOnChain: boolean;
};

export type StableClubDashboardSnapshot = {
  positions: StableClubPosition[];
  officialPoolsActive: number;
  officialPoolsTotal: number;
  openservCircuitBroken: boolean;
  pendingProposals: number;
};

export function emptyDashboardSnapshot(
  officialPoolsTotal: number,
): StableClubDashboardSnapshot {
  return {
    positions: [],
    officialPoolsActive: 0,
    officialPoolsTotal,
    openservCircuitBroken: false,
    pendingProposals: 0,
  };
}

/** Demo / local fixture positions for Step 2 UI when no indexer is connected.
 *  Adapter/NPM are null until verified deployments + on-chain ownership are present.
 *  Never embeds live mainnet approve targets or dummy spenders.
 */
export function buildIllustrativePositions(owner: `0x${string}`): StableClubPosition[] {
  return [
    {
      id: "illust-1",
      poolId: "USDC-cbBTC-AERO-CL100",
      poolLabel: "USDC/cbBTC CL100 — Aerodrome Slipstream",
      protocol: "aerodrome-slipstream",
      chainId: 8453,
      owner,
      positionTokenId: "",
      npmAddress: null,
      adapterAddress: null,
      npmApprovalStatus: "unavailable",
      tokenASymbol: "USDC",
      tokenBSymbol: "cbBTC",
      liquidity: "1250000000",
      feesEarnedUsd: "12.40",
      rewardsEarnedUsd: "3.10",
      rangeStatus: "pending-verification",
      tickLower: -200000,
      tickUpper: -180000,
      lastUpdated: Math.floor(Date.now() / 1000),
      automation: {
        harvest: true,
        compound: false,
        rebalance: false,
        paused: false,
      },
      dataVerifiedOnChain: false,
    },
  ];
}
