import { base } from "viem/chains";
import type { Chain } from "viem";
import { LOCAL_HARDHAT_CHAIN_ID } from "@/lib/stable-club/chain-isolation";

/** Base Mainnet — Step 1 target chain (chainId 8453). */
export const STABLE_CLUB_CHAIN = base;

export const STABLE_CLUB_CHAIN_ID = base.id;

/**
 * Local Hardhat for browser / E2E — distinct chainId 31337 (never Base 8453).
 * SC-F02: Base wallets must not share identity with local deployments.
 */
export const STABLE_CLUB_LOCAL_CHAIN = {
  id: LOCAL_HARDHAT_CHAIN_ID,
  name: "Hardhat Local (Stable Club)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
} as const satisfies Chain;

export const STABLE_CLUB_LOCAL_CHAIN_ID = LOCAL_HARDHAT_CHAIN_ID;

export const STABLE_CLUB_LOCAL_RPC_URL = "http://127.0.0.1:8545";

export const STABLE_CLUB_USDC_DECIMALS = 6;

/** Private internal test pool — must not appear in the official five-pool catalogue. */
export const STABLE_CLUB_TEST_POOL_ID =
  "INDEXLA_STABLE_CLUB_TEST_POOL_BASE_INTERNAL_V1";

export const STABLE_CLUB_OFFICIAL_BASE_POOL_COUNT = 5;

export const STABLE_CLUB_EXECUTION_FEE_BPS = 100;
