/**
 * Official Stable Club Base pool catalogue — Step 2/3 / Phase 2a.
 * Internal test pool must NEVER appear here.
 * Unavailable catalogue entries must never silently remap to a different fee/tickSpacing.
 */
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { STABLE_CLUB_TEST_POOL_ID } from "@/lib/stable-club/constants";

export type StableClubProtocol = "uniswap-v3" | "aerodrome-slipstream";

export type InfrastructureGeneration =
  | "uniswap-v3"
  | "aerodrome-current"
  | "aerodrome-legacy";

/**
 * - available: factory-verified on the pool's infrastructure generation
 * - unavailable-factory-missing: catalogue ID retained but must never resolve/activate
 */
export type OfficialPoolAvailability = "available" | "unavailable-factory-missing";

export type DexInfrastructureBinding = {
  generation: InfrastructureGeneration;
  factory: Address;
  npm: Address;
  swapRouter: Address;
};

export type OfficialStableClubPool = {
  id: string;
  poolIdHash: Hex;
  label: string;
  protocol: StableClubProtocol;
  infrastructure: DexInfrastructureBinding;
  chain: "base";
  chainId: 8453;
  tokenA: { symbol: string; address: Address; decimals: number };
  tokenB: { symbol: string; address: Address; decimals: number };
  feeOrTick: { kind: "fee"; feeBps: number } | { kind: "tickSpacing"; tickSpacing: number };
  poolAddress: Address | null;
  availability: OfficialPoolAvailability;
  unavailableReason?: string;
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

/** Uniswap V3 Base (Gauges V3 era — current Uni deployment). */
export const BASE_DEX_UNISWAP_V3: DexInfrastructureBinding = {
  generation: "uniswap-v3",
  factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
  swapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481",
};

/** Aerodrome Slipstream — Gauges V3 deployment (current). Source: aerodrome-finance/slipstream README. */
export const BASE_DEX_AERODROME_CURRENT: DexInfrastructureBinding = {
  generation: "aerodrome-current",
  factory: "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef",
  npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53",
  swapRouter: "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F",
};

/** Aerodrome Slipstream — initial deployment (legacy CL100 pools). Source: aerodrome-finance/slipstream README. */
export const BASE_DEX_AERODROME_LEGACY: DexInfrastructureBinding = {
  generation: "aerodrome-legacy",
  factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A",
  npm: "0x827922686190790b37229fd06084350e74485b72",
  swapRouter: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5",
};

/** @deprecated Use BASE_DEX_UNISWAP_V3 / BASE_DEX_AERODROME_CURRENT explicitly. */
export const BASE_DEX = {
  uniswapV3: BASE_DEX_UNISWAP_V3,
  aerodromeSlipstream: BASE_DEX_AERODROME_CURRENT,
  aerodromeSlipstreamLegacy: BASE_DEX_AERODROME_LEGACY,
} as const;

export const USDC_CBBTC_UNI_005_POOL =
  "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef" as Address;

export const USDC_CBBTC_AERO_CL100_POOL =
  "0x4e962bb3889bf030368f56810a9c96b83cb3e778" as Address;

export const CBBTC_WETH_AERO_CL10_POOL =
  "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b" as Address;

export const CBBTC_WETH_AERO_CL100_POOL =
  "0x70acdf2ad0bf2402c957154f944c19ef4e1cbae1" as Address;

export const CBBTC_WETH_UNI_005_POOL =
  "0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1" as Address;

function poolKey(label: string): Hex {
  return keccak256(stringToHex(label));
}

export const OFFICIAL_STABLE_CLUB_BASE_POOLS: readonly OfficialStableClubPool[] = [
  {
    id: "USDC-cbBTC-AERO-CL100",
    poolIdHash: poolKey("INDEXLA_STABLE_CLUB_BASE_USDC_cbBTC_AERO_CL100"),
    label: "USDC/cbBTC CL100 — Aerodrome Slipstream (legacy)",
    protocol: "aerodrome-slipstream",
    infrastructure: BASE_DEX_AERODROME_LEGACY,
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.USDC,
    tokenB: BASE_TOKENS.cbBTC,
    feeOrTick: { kind: "tickSpacing", tickSpacing: 100 },
    poolAddress: USDC_CBBTC_AERO_CL100_POOL,
    availability: "available",
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
    infrastructure: BASE_DEX_UNISWAP_V3,
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.USDC,
    tokenB: BASE_TOKENS.cbBTC,
    feeOrTick: { kind: "fee", feeBps: 5 },
    poolAddress: USDC_CBBTC_UNI_005_POOL,
    availability: "available",
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
    infrastructure: BASE_DEX_AERODROME_CURRENT,
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.cbBTC,
    tokenB: BASE_TOKENS.WETH,
    feeOrTick: { kind: "tickSpacing", tickSpacing: 10 },
    poolAddress: CBBTC_WETH_AERO_CL10_POOL,
    availability: "available",
    isOfficialCatalogue: true,
    isTestOnly: false,
    activationRequiresTestPoolValidation: true,
    riskLevel: "high",
  },
  {
    id: "cbBTC-WETH-AERO-CL100",
    poolIdHash: poolKey("INDEXLA_STABLE_CLUB_BASE_cbBTC_WETH_AERO_CL100"),
    label: "cbBTC/WETH CL100 — Aerodrome Slipstream (legacy)",
    protocol: "aerodrome-slipstream",
    infrastructure: BASE_DEX_AERODROME_LEGACY,
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.cbBTC,
    tokenB: BASE_TOKENS.WETH,
    feeOrTick: { kind: "tickSpacing", tickSpacing: 100 },
    poolAddress: CBBTC_WETH_AERO_CL100_POOL,
    availability: "available",
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
    infrastructure: BASE_DEX_UNISWAP_V3,
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.cbBTC,
    tokenB: BASE_TOKENS.WETH,
    feeOrTick: { kind: "fee", feeBps: 5 },
    poolAddress: CBBTC_WETH_UNI_005_POOL,
    availability: "available",
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

export function getOfficialPoolById(id: string): OfficialStableClubPool | undefined {
  return OFFICIAL_STABLE_CLUB_BASE_POOLS.find((p) => p.id === id);
}

export function isPoolResolvable(pool: OfficialStableClubPool): boolean {
  return pool.availability === "available" && pool.poolAddress != null;
}

export function isPoolLaunchReady(pool: OfficialStableClubPool): boolean {
  return isPoolResolvable(pool);
}

export function listUnavailableOfficialPools(): OfficialStableClubPool[] {
  return OFFICIAL_STABLE_CLUB_BASE_POOLS.filter(
    (p) => p.availability === "unavailable-factory-missing",
  );
}

export function assertNoSilentCl100Remap(poolId: string, resolvedTickSpacing: number): void {
  const pool = getOfficialPoolById(poolId);
  if (!pool) throw new Error(`Unknown catalogue pool: ${poolId}`);
  if (
    pool.feeOrTick.kind === "tickSpacing" &&
    pool.feeOrTick.tickSpacing === 100 &&
    resolvedTickSpacing !== 100
  ) {
    throw new Error(
      `Refusing silent remap of ${poolId}: catalogue tickSpacing 100 cannot resolve as ${resolvedTickSpacing}`,
    );
  }
}

export function resolvePoolInfrastructure(pool: OfficialStableClubPool): DexInfrastructureBinding {
  return pool.infrastructure;
}
