/**
 * Official Stable Club Base pool catalogue — Step 2.
 * Internal test pool must NEVER appear here.
 */
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { STABLE_CLUB_TEST_POOL_ID } from "@/lib/stable-club/constants";

export type StableClubProtocol = "uniswap-v3" | "aerodrome-slipstream";

export type OfficialStableClubPool = {
  id: string;
  poolIdHash: Hex;
  label: string;
  protocol: StableClubProtocol;
  chain: "base";
  chainId: 8453;
  tokenA: { symbol: string; address: Address; decimals: number };
  tokenB: { symbol: string; address: Address; decimals: number };
  feeOrTick: { kind: "fee"; feeBps: number } | { kind: "tickSpacing"; tickSpacing: number };
  /** Verified on Base; may be resolved via factory if zero during local bootstrap. */
  poolAddress: Address | null;
  isOfficialCatalogue: true;
  isTestOnly: false;
  activationRequiresTestPoolValidation: true;
  riskLevel: "medium" | "high";
};

/** Base Mainnet canonical token addresses. */
export const BASE_TOKENS = {
  USDC: {
    symbol: "USDC",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    decimals: 6,
  },
  cbBTC: {
    symbol: "cbBTC",
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    decimals: 8,
  },
  WETH: {
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006" as Address,
    decimals: 18,
  },
} as const;

export const BASE_DEX = {
  uniswapV3: {
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as Address,
    npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as Address,
    swapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  },
  aerodromeSlipstream: {
    factory: "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef" as Address,
    npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53" as Address,
    swapRouter: "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F" as Address,
  },
} as const;

function poolKey(label: string): Hex {
  return keccak256(stringToHex(label));
}

export const OFFICIAL_STABLE_CLUB_BASE_POOLS: readonly OfficialStableClubPool[] = [
  {
    id: "USDC-cbBTC-AERO-CL100",
    poolIdHash: poolKey("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
    label: "USDC/cbBTC CL100 — Aerodrome Slipstream",
    protocol: "aerodrome-slipstream",
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.USDC,
    tokenB: BASE_TOKENS.cbBTC,
    feeOrTick: { kind: "tickSpacing", tickSpacing: 100 },
    poolAddress: null,
    isOfficialCatalogue: true,
    isTestOnly: false,
    activationRequiresTestPoolValidation: true,
    riskLevel: "medium",
  },
  {
    id: "USDC-cbBTC-UNI-005",
    poolIdHash: poolKey("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_UNI_005"),
    label: "USDC/cbBTC 0.05% — Uniswap V3",
    protocol: "uniswap-v3",
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.USDC,
    tokenB: BASE_TOKENS.cbBTC,
    feeOrTick: { kind: "fee", feeBps: 5 },
    poolAddress: null,
    isOfficialCatalogue: true,
    isTestOnly: false,
    activationRequiresTestPoolValidation: true,
    riskLevel: "medium",
  },
  {
    id: "cbBTC-WETH-AERO-CL10",
    poolIdHash: poolKey("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL10"),
    label: "cbBTC/WETH CL10 — Aerodrome Slipstream",
    protocol: "aerodrome-slipstream",
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.cbBTC,
    tokenB: BASE_TOKENS.WETH,
    feeOrTick: { kind: "tickSpacing", tickSpacing: 10 },
    poolAddress: null,
    isOfficialCatalogue: true,
    isTestOnly: false,
    activationRequiresTestPoolValidation: true,
    riskLevel: "high",
  },
  {
    id: "cbBTC-WETH-AERO-CL100",
    poolIdHash: poolKey("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL100"),
    label: "cbBTC/WETH CL100 — Aerodrome Slipstream",
    protocol: "aerodrome-slipstream",
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.cbBTC,
    tokenB: BASE_TOKENS.WETH,
    feeOrTick: { kind: "tickSpacing", tickSpacing: 100 },
    poolAddress: null,
    isOfficialCatalogue: true,
    isTestOnly: false,
    activationRequiresTestPoolValidation: true,
    riskLevel: "high",
  },
  {
    id: "cbBTC-WETH-UNI-005",
    poolIdHash: poolKey("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_UNI_005"),
    label: "cbBTC/WETH 0.05% — Uniswap V3",
    protocol: "uniswap-v3",
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.cbBTC,
    tokenB: BASE_TOKENS.WETH,
    feeOrTick: { kind: "fee", feeBps: 5 },
    poolAddress: null,
    isOfficialCatalogue: true,
    isTestOnly: false,
    activationRequiresTestPoolValidation: true,
    riskLevel: "high",
  },
] as const;

export function isOfficialCataloguePoolId(id: string): boolean {
  return OFFICIAL_STABLE_CLUB_BASE_POOLS.some((p) => p.id === id);
}

export function assertTestPoolNotInOfficialCatalogue(): boolean {
  return !OFFICIAL_STABLE_CLUB_BASE_POOLS.some(
    (p) => p.id === STABLE_CLUB_TEST_POOL_ID || p.label.includes("TEST"),
  );
}
