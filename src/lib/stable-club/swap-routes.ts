/**
 * Canonical Stable Club USDC swap route IDs — must match Phase 2a/2b manifests and fork tests.
 * Four unique routes cover the eight fee-bearing swaps in a full five-pool deposit.
 */
import { keccak256, stringToHex, type Hex } from "viem";

export const STABLE_CLUB_SWAP_ROUTE_LABELS = {
  USDC_CBBTC_UNI: "ROUTE_USDC_CBBTC_UNI_005",
  USDC_CBBTC_AERO_L: "ROUTE_USDC_CBBTC_AERO_LEGACY_100",
  USDC_WETH_UNI: "ROUTE_USDC_WETH_UNI_005",
  USDC_WETH_AERO_L: "ROUTE_USDC_WETH_AERO_LEGACY_100",
} as const;

export type StableClubSwapRouteKey = keyof typeof STABLE_CLUB_SWAP_ROUTE_LABELS;

export const STABLE_CLUB_SWAP_ROUTE_IDS: Record<StableClubSwapRouteKey, Hex> = {
  USDC_CBBTC_UNI: keccak256(stringToHex(STABLE_CLUB_SWAP_ROUTE_LABELS.USDC_CBBTC_UNI)),
  USDC_CBBTC_AERO_L: keccak256(stringToHex(STABLE_CLUB_SWAP_ROUTE_LABELS.USDC_CBBTC_AERO_L)),
  USDC_WETH_UNI: keccak256(stringToHex(STABLE_CLUB_SWAP_ROUTE_LABELS.USDC_WETH_UNI)),
  USDC_WETH_AERO_L: keccak256(stringToHex(STABLE_CLUB_SWAP_ROUTE_LABELS.USDC_WETH_AERO_L)),
};

/** Empty SwapInstruction pad (second slot unused when swapCount === 1). */
export const EMPTY_SWAP_ROUTE_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
