import { describe, expect, it } from "vitest";
import {
  FIVE_POOL_ALLOCATION_BPS_PER_LEG,
  FIVE_POOL_LEG_COUNT,
  FIVE_POOL_TOTAL_ALLOCATION_BPS,
  STABLE_CLUB_FIVE_POOL_STRATEGY,
  assertFivePoolAllocationSum,
  legDepositAmount,
  validateCanonicalFivePoolStrategy,
} from "@/lib/stable-club/five-pool-strategy";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";

describe("five-pool strategy configuration", () => {
  it("defines exactly five legs at 2_000 bps each totaling 10_000 bps", () => {
    expect(STABLE_CLUB_FIVE_POOL_STRATEGY.legs).toHaveLength(FIVE_POOL_LEG_COUNT);
    assertFivePoolAllocationSum(STABLE_CLUB_FIVE_POOL_STRATEGY.legs);
    const sum = STABLE_CLUB_FIVE_POOL_STRATEGY.legs.reduce(
      (acc, leg) => acc + leg.allocationBps,
      0,
    );
    expect(sum).toBe(FIVE_POOL_TOTAL_ALLOCATION_BPS);
    for (const leg of STABLE_CLUB_FIVE_POOL_STRATEGY.legs) {
      expect(leg.allocationBps).toBe(FIVE_POOL_ALLOCATION_BPS_PER_LEG);
    }
  });

  it("maps every official catalogue pool exactly once", () => {
    validateCanonicalFivePoolStrategy();
    const catalogueIds = OFFICIAL_STABLE_CLUB_BASE_POOLS.map((p) => p.id).sort();
    const strategyIds = STABLE_CLUB_FIVE_POOL_STRATEGY.legs.map((l) => l.catalogueId).sort();
    expect(strategyIds).toEqual(catalogueIds);
  });

  it("splits gross deposit equally across legs", () => {
    const gross = BigInt(10_000_000);
    let allocated = BigInt(0);
    for (let i = 0; i < FIVE_POOL_LEG_COUNT; i++) {
      const leg = legDepositAmount(gross, i);
      expect(leg).toBe(BigInt(2_000_000));
      allocated += leg;
    }
    expect(allocated).toBe(gross);
  });
});
