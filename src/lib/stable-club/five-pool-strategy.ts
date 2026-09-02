/**
 * Canonical Stable Club five-pool strategy — equal 20% allocation per pool.
 */
import { keccak256, encodeAbiParameters, parseAbiParameters, stringToHex, type Address, type Hex } from "viem";
import {
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  type OfficialStableClubPool,
} from "@/lib/stable-club/official-pools";
import { BASE_TOKENS } from "@/lib/stable-club/official-pools";

export const FIVE_POOL_STRATEGY_KIND_LABEL = "STABLE_CLUB_FIVE_POOL_V1" as const;

export const FIVE_POOL_STRATEGY_KIND: Hex = keccak256(stringToHex(FIVE_POOL_STRATEGY_KIND_LABEL));

export const FIVE_POOL_LEG_COUNT = 5 as const;
export const FIVE_POOL_ALLOCATION_BPS_PER_LEG = 2_000 as const;
export const FIVE_POOL_TOTAL_ALLOCATION_BPS = 10_000 as const;

export type FivePoolStrategyLeg = {
  catalogueId: OfficialStableClubPool["id"];
  poolIdHash: Hex;
  allocationBps: typeof FIVE_POOL_ALLOCATION_BPS_PER_LEG;
  infrastructureGeneration: OfficialStableClubPool["infrastructure"]["generation"];
};

export type FivePoolStrategyConfiguration = {
  kind: typeof FIVE_POOL_STRATEGY_KIND_LABEL;
  kindHash: Hex;
  depositToken: typeof BASE_TOKENS.USDC;
  legCount: typeof FIVE_POOL_LEG_COUNT;
  totalAllocationBps: typeof FIVE_POOL_TOTAL_ALLOCATION_BPS;
  legs: readonly FivePoolStrategyLeg[];
};

/** Founder-approved equal-weight five-pool allocation (20% each). */
export const STABLE_CLUB_FIVE_POOL_STRATEGY: FivePoolStrategyConfiguration = {
  kind: FIVE_POOL_STRATEGY_KIND_LABEL,
  kindHash: FIVE_POOL_STRATEGY_KIND,
  depositToken: BASE_TOKENS.USDC,
  legCount: FIVE_POOL_LEG_COUNT,
  totalAllocationBps: FIVE_POOL_TOTAL_ALLOCATION_BPS,
  legs: OFFICIAL_STABLE_CLUB_BASE_POOLS.map((pool) => ({
    catalogueId: pool.id,
    poolIdHash: pool.poolIdHash,
    allocationBps: FIVE_POOL_ALLOCATION_BPS_PER_LEG,
    infrastructureGeneration: pool.infrastructure.generation,
  })),
};

export function assertFivePoolAllocationSum(
  legs: readonly { allocationBps: number }[],
): void {
  if (legs.length !== FIVE_POOL_LEG_COUNT) {
    throw new Error(`Five-pool strategy requires exactly ${FIVE_POOL_LEG_COUNT} legs`);
  }
  let sum = 0;
  for (const leg of legs) {
    if (leg.allocationBps !== FIVE_POOL_ALLOCATION_BPS_PER_LEG) {
      throw new Error(
        `Each leg must allocate exactly ${FIVE_POOL_ALLOCATION_BPS_PER_LEG} bps`,
      );
    }
    sum += leg.allocationBps;
  }
  if (sum !== FIVE_POOL_TOTAL_ALLOCATION_BPS) {
    throw new Error(
      `Five-pool allocation must sum to ${FIVE_POOL_TOTAL_ALLOCATION_BPS} bps (got ${sum})`,
    );
  }
}

export function legDepositAmount(grossDeposit: bigint, legIndex: number): bigint {
  if (legIndex < 0 || legIndex >= FIVE_POOL_LEG_COUNT) {
    throw new Error(`Leg index out of bounds: ${legIndex}`);
  }
  return (grossDeposit * BigInt(FIVE_POOL_ALLOCATION_BPS_PER_LEG)) / BigInt(FIVE_POOL_TOTAL_ALLOCATION_BPS);
}

export function strategyIdForUserOnChain(input: {
  user: Address;
  chainId: number | bigint;
  depositToken?: Address;
}): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256, bytes32, address"), [
      input.user,
      BigInt(input.chainId),
      FIVE_POOL_STRATEGY_KIND,
      input.depositToken ?? BASE_TOKENS.USDC.address,
    ]),
  );
}

export function validateCanonicalFivePoolStrategy(): void {
  assertFivePoolAllocationSum(STABLE_CLUB_FIVE_POOL_STRATEGY.legs);
  const ids = new Set(STABLE_CLUB_FIVE_POOL_STRATEGY.legs.map((l) => l.catalogueId));
  if (ids.size !== FIVE_POOL_LEG_COUNT) {
    throw new Error("Duplicate catalogue IDs in five-pool strategy");
  }
  for (const pool of OFFICIAL_STABLE_CLUB_BASE_POOLS) {
    if (!ids.has(pool.id)) {
      throw new Error(`Missing catalogue pool ${pool.id} from five-pool strategy`);
    }
  }
}

validateCanonicalFivePoolStrategy();
