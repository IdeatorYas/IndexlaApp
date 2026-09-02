import type { OfficialStableClubPool } from "@/lib/stable-club/official-pools";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";

export type StableClubPoolProductCategory = "Stable" | "Stable-Weighted" | "Growth";

export function resolvePoolProductCategory(poolId: string): StableClubPoolProductCategory {
  if (poolId.includes("WETH")) return "Growth";
  if (poolId.includes("UNI")) return "Stable-Weighted";
  return "Stable";
}

export function formatProtocolLabel(protocol: OfficialStableClubPool["protocol"]): string {
  return protocol === "uniswap-v3" ? "Uniswap V3" : "Aerodrome Slipstream";
}

export function formatFeeOrTick(pool: OfficialStableClubPool): string {
  if (pool.feeOrTick.kind === "fee") {
    return `${(pool.feeOrTick.feeBps / 100).toFixed(2)}% fee`;
  }
  return `CL${pool.feeOrTick.tickSpacing} (tick ${pool.feeOrTick.tickSpacing})`;
}

export function formatRiskLabel(level: OfficialStableClubPool["riskLevel"]): string {
  return level === "medium" ? "Medium" : "High";
}

export const STABLE_CLUB_MIN_DEPOSIT_USD = PRIVATE_BETA_LAUNCH_PARAMS.capsUsd.minimumPosition;

export const TOKEN_LOGO_URLS: Record<string, string> = {
  USDC: "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png",
  WETH: "https://coin-images.coingecko.com/coins/images/2518/small/weth.png",
  cbBTC: "https://coin-images.coingecko.com/coins/images/40143/small/cbbtc.webp",
};
