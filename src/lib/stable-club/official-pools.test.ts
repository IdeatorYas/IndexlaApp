import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  BASE_DEX_AERODROME_CURRENT,
  BASE_DEX_AERODROME_LEGACY,
  BASE_DEX_UNISWAP_V3,
  CBBTC_WETH_AERO_CL100_POOL,
  CBBTC_WETH_AERO_CL10_POOL,
  CBBTC_WETH_UNI_005_POOL,
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  USDC_CBBTC_AERO_CL100_POOL,
  USDC_CBBTC_UNI_005_POOL,
  VERIFIED_LEGACY_AERO_CL100_FACTORY_POOLS,
  assertNoSilentCl100Remap,
  getOfficialPoolById,
  isPoolLaunchReady,
  isPoolResolvable,
  listUnavailableOfficialPools,
  resolvePoolInfrastructure,
  type OfficialStableClubPool,
} from "@/lib/stable-club/official-pools";
import { QuotePlanError } from "@/lib/stable-club/quote-plan";

/**
 * REAUDIT-F02 on-chain evidence (Base mainnet, blastapi forkless eth_call, 2026-08-31).
 * Direct factory getPool on each pool's bound infrastructure generation.
 */
const REAUDIT_F02_FACTORY_EVIDENCE = {
  "USDC-cbBTC-AERO-CL100": {
    factory: BASE_DEX_AERODROME_LEGACY.factory,
    altFactory: BASE_DEX_AERODROME_CURRENT.factory,
    factoryPool: USDC_CBBTC_AERO_CL100_POOL,
    altFactoryPool: "0x0000000000000000000000000000000000000000" as const,
    tickSpacing: 100,
  },
  "USDC-cbBTC-UNI-005": {
    factory: BASE_DEX_UNISWAP_V3.factory,
    factoryPool: USDC_CBBTC_UNI_005_POOL,
    fee: 500,
  },
  "cbBTC-WETH-AERO-CL10": {
    factory: BASE_DEX_AERODROME_CURRENT.factory,
    altFactory: BASE_DEX_AERODROME_LEGACY.factory,
    factoryPool: CBBTC_WETH_AERO_CL10_POOL,
    tickSpacing: 10,
  },
  "cbBTC-WETH-AERO-CL100": {
    factory: BASE_DEX_AERODROME_LEGACY.factory,
    altFactory: BASE_DEX_AERODROME_CURRENT.factory,
    factoryPool: CBBTC_WETH_AERO_CL100_POOL,
    altFactoryPool: "0x0000000000000000000000000000000000000000" as const,
    tickSpacing: 100,
  },
  "cbBTC-WETH-UNI-005": {
    factory: BASE_DEX_UNISWAP_V3.factory,
    factoryPool: CBBTC_WETH_UNI_005_POOL,
    fee: 500,
  },
} as const;

function cl100Pools(): OfficialStableClubPool[] {
  return OFFICIAL_STABLE_CLUB_BASE_POOLS.filter(
    (p) => p.feeOrTick.kind === "tickSpacing" && p.feeOrTick.tickSpacing === 100,
  );
}

describe("REAUDIT-F02 — official Base pool catalogue", () => {
  it("binds CL100 Aero pools to legacy infrastructure only", () => {
    for (const pool of cl100Pools()) {
      expect(pool.infrastructure.generation).toBe("aerodrome-legacy");
      expect(pool.infrastructure.factory).toBe(BASE_DEX_AERODROME_LEGACY.factory);
      expect(pool.infrastructure.factory).not.toBe(BASE_DEX_AERODROME_CURRENT.factory);
      expect(pool.feeOrTick).toEqual({ kind: "tickSpacing", tickSpacing: 100 });
    }
  });

  it("matches catalogue poolAddress to direct legacy-factory evidence", () => {
    for (const [id, evidence] of Object.entries(VERIFIED_LEGACY_AERO_CL100_FACTORY_POOLS)) {
      const pool = getOfficialPoolById(id);
      expect(pool?.poolAddress).toBe(evidence);
      expect(
        getAddress(evidence),
      ).toBe(getAddress(REAUDIT_F02_FACTORY_EVIDENCE[id as keyof typeof REAUDIT_F02_FACTORY_EVIDENCE].factoryPool));
    }
  });

  it("documents that current-generation Aero factory does not register CL100", () => {
    for (const pool of cl100Pools()) {
      const evidence = REAUDIT_F02_FACTORY_EVIDENCE[pool.id as keyof typeof REAUDIT_F02_FACTORY_EVIDENCE];
      expect("altFactoryPool" in evidence && evidence.altFactoryPool).toBe(
        "0x0000000000000000000000000000000000000000",
      );
    }
  });

  it("marks resolvable catalogue pools with non-zero bound addresses", () => {
    expect(listUnavailableOfficialPools()).toHaveLength(0);
    for (const pool of OFFICIAL_STABLE_CLUB_BASE_POOLS) {
      expect(isPoolResolvable(pool)).toBe(true);
      expect(isPoolLaunchReady(pool)).toBe(true);
      expect(pool.poolAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      const infra = resolvePoolInfrastructure(pool);
      expect(infra.factory).toMatch(/^0x[a-fA-F0-9]{40}$/);
    }
  });

  it("refuses silent CL100 tickSpacing remaps", () => {
    expect(() => assertNoSilentCl100Remap("USDC-cbBTC-AERO-CL100", 10)).toThrow(/silent remap/);
    expect(() => assertNoSilentCl100Remap("cbBTC-WETH-AERO-CL100", 50)).toThrow(/silent remap/);
    expect(() => assertNoSilentCl100Remap("USDC-cbBTC-AERO-CL100", 100)).not.toThrow();
  });

  it("fail-closes when a catalogue pool is marked unavailable or unbound", () => {
    const blocked = {
      ...OFFICIAL_STABLE_CLUB_BASE_POOLS[0]!,
      availability: "unavailable-factory-missing" as const,
      poolAddress: null,
    };
    expect(isPoolResolvable(blocked)).toBe(false);
    expect(isPoolLaunchReady(blocked)).toBe(false);

    const err = new QuotePlanError(
      "INVALID_POOL_CONFIG",
      `Pool ${blocked.id} is not resolvable`,
    );
    expect(err.code).toBe("INVALID_POOL_CONFIG");
    expect(err.message).toMatch(/not resolvable/);
  });
});
