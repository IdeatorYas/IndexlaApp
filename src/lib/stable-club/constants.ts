import { base } from "viem/chains";

/** Base Mainnet — Step 1 target chain (chainId 8453). */
export const STABLE_CLUB_CHAIN = base;

export const STABLE_CLUB_CHAIN_ID = base.id;

/** Local Hardhat node emulating Base chainId for Step 1 dev only. */
export const STABLE_CLUB_LOCAL_CHAIN = {
  ...base,
  name: "Base (Local Hardhat)",
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
} as const;

export const STABLE_CLUB_LOCAL_RPC_URL = "http://127.0.0.1:8545";

export const STABLE_CLUB_USDC_DECIMALS = 6;

/** Private internal test pool — must not appear in the official five-pool catalogue. */
export const STABLE_CLUB_TEST_POOL_ID =
  "INDEXLA_STABLE_CLUB_TEST_POOL_BASE_INTERNAL_V1";

export const STABLE_CLUB_OFFICIAL_BASE_POOL_COUNT = 5;

export const STABLE_CLUB_EXECUTION_FEE_BPS = 100;
