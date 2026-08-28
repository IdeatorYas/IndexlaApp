/**
 * Official Stable Club Base pool catalogue — Step 2/3.
 * Internal test pool must NEVER appear here.
 * Unavailable catalogue entries must never silently remap to a different fee/tickSpacing.
 */
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { STABLE_CLUB_TEST_POOL_ID } from "@/lib/stable-club/constants";

export type StableClubProtocol = "uniswap-v3" | "aerodrome-slipstream";

/**
 * - available: factory-verified pool may be considered for launch after governance
 * - unavailable-factory-missing: catalogue ID retained but must never resolve/activate
 * Replacement of unavailable IDs requires formal onboarding + governance — never silent remap.
 */
export type OfficialPoolAvailability =
  | "available"
  | "unavailable-factory-missing";

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
  /**
   * Factory-derived Base address when verified; null when missing or not yet bound.
   * Unavailable pools MUST keep null and never invent a substitute pool.
   */
  poolAddress: Address | null;
  availability: OfficialPoolAvailability;
  /** Human-readable reason when unavailable. */
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

/** Factory-verified Uniswap V3 USDC/cbBTC 0.05% on Base (Step 3 inspection). */
export const USDC_CBBTC_UNI_005_POOL =
  "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef" as Address;

function poolKey(label: string): Hex {
  return keccak256(stringToHex(label));
}

const AERO_CL100_UNAVAILABLE_REASON =
  "Factory getPool(..., tickSpacing=100) returns address(0) on Base. Do not remap to CL10. Formal onboarding required.";

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
    availability: "unavailable-factory-missing",
    unavailableReason: AERO_CL100_UNAVAILABLE_REASON,
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
    chain: "base",
    chainId: 8453,
    tokenA: BASE_TOKENS.cbBTC,
    tokenB: BASE_TOKENS.WETH,
    feeOrTick: { kind: "tickSpacing", tickSpacing: 10 },
    poolAddress: "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b" as Address,
    availability: "available",
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
    availability: "unavailable-factory-missing",
    unavailableReason: AERO_CL100_UNAVAILABLE_REASON,
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
    poolAddress: "0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1" as Address,
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

/** True only when catalogue says available AND a factory address is bound. */
export function isPoolResolvable(pool: OfficialStableClubPool): boolean {
  return pool.availability === "available" && pool.poolAddress != null;
}

/** Never launch-ready if unavailable or missing address. */
export function isPoolLaunchReady(pool: OfficialStableClubPool): boolean {
  return isPoolResolvable(pool);
}

export function listUnavailableOfficialPools(): OfficialStableClubPool[] {
  return OFFICIAL_STABLE_CLUB_BASE_POOLS.filter(
    (p) => p.availability === "unavailable-factory-missing",
  );
}

/**
 * Refuse silent remaps: CL100 IDs must not resolve to a different tickSpacing pool.
 */
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
