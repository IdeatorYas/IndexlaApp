/**
 * Cross-source Stable Club Base pool catalogue consistency checks.
 * Canonical catalogue: official-pools.ts (chainId 8453).
 * Local Hardhat manifests: chainId 31337 only.
 */
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import {
  BASE_DEX_AERODROME_CURRENT,
  BASE_DEX_AERODROME_LEGACY,
  BASE_DEX_UNISWAP_V3,
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  VERIFIED_LEGACY_AERO_CL100_FACTORY_POOLS,
  type OfficialStableClubPool,
} from "@/lib/stable-club/official-pools";
import { LOCAL_HARDHAT_CHAIN_ID } from "@/lib/stable-club/chain-isolation";
import { BASE_CHAIN_ID } from "@/lib/stable-club/verified-base-addresses";
import {
  STAGE1_PRIVATE_BETA_POOL_ID,
  buildStage1LaunchConfiguration,
} from "@/lib/stable-club/stage1-launch";

export type CanonicalPoolRow = {
  id: string;
  poolIdHash: Hex;
  chainId: number;
  poolAddress: Address | null;
  protocol: string;
  infrastructureGeneration: string;
  factory: Address;
  npm: Address;
  swapRouter: Address;
  tokenASymbol: string;
  tokenBSymbol: string;
  feeOrTickLabel: string;
  catalogueVerified: boolean;
  stage1Policy: "activated-candidate" | "excluded-cl100" | "deferred-stage2";
};

const INDEXLA_POOL_PREFIX = "INDEXLA_STABLE_CLUB_BASE_";

function expectedPoolIdHash(catalogueId: string): Hex {
  const slug = catalogueId.replace(/-/g, "_");
  return keccak256(stringToHex(`${INDEXLA_POOL_PREFIX}${slug}`));
}

function stage1PolicyFor(id: string): CanonicalPoolRow["stage1Policy"] {
  const cfg = buildStage1LaunchConfiguration();
  if (id === STAGE1_PRIVATE_BETA_POOL_ID) return "activated-candidate";
  if ((cfg.unavailablePoolIds as readonly string[]).includes(id)) return "excluded-cl100";
  if ((cfg.deferredPoolIds as readonly string[]).includes(id)) return "deferred-stage2";
  throw new Error(`Unknown pool id for stage1 policy: ${id}`);
}

function feeOrTickLabel(pool: OfficialStableClubPool): string {
  if (pool.feeOrTick.kind === "fee") return `feeBps=${pool.feeOrTick.feeBps} (Uni on-chain fee=500)`;
  return `tickSpacing=${pool.feeOrTick.tickSpacing}`;
}

/** Authoritative per-pool comparison row derived from official-pools.ts + Stage 1 policy. */
export function buildCanonicalPoolComparisonTable(): readonly CanonicalPoolRow[] {
  return OFFICIAL_STABLE_CLUB_BASE_POOLS.map((pool) => ({
    id: pool.id,
    poolIdHash: pool.poolIdHash,
    chainId: pool.chainId,
    poolAddress: pool.poolAddress,
    protocol: pool.protocol,
    infrastructureGeneration: pool.infrastructure.generation,
    factory: pool.infrastructure.factory,
    npm: pool.infrastructure.npm,
    swapRouter: pool.infrastructure.swapRouter,
    tokenASymbol: pool.tokenA.symbol,
    tokenBSymbol: pool.tokenB.symbol,
    feeOrTickLabel: feeOrTickLabel(pool),
    catalogueVerified: pool.availability === "available" && pool.poolAddress != null,
    stage1Policy: stage1PolicyFor(pool.id),
  }));
}

export function assertCatalogueIdentityConsistency(): void {
  if (OFFICIAL_STABLE_CLUB_BASE_POOLS.length !== 5) {
    throw new Error(`Expected 5 official Base pools, got ${OFFICIAL_STABLE_CLUB_BASE_POOLS.length}`);
  }

  for (const pool of OFFICIAL_STABLE_CLUB_BASE_POOLS) {
    if (pool.chainId !== BASE_CHAIN_ID) {
      throw new Error(`Catalogue pool ${pool.id} must use Base chainId ${BASE_CHAIN_ID}`);
    }
    const expectedHash = expectedPoolIdHash(pool.id);
    if (pool.poolIdHash !== expectedHash) {
      throw new Error(`poolIdHash mismatch for ${pool.id}`);
    }
    if (pool.chain !== "base") {
      throw new Error(`Catalogue pool ${pool.id} must declare chain=base`);
    }
  }

  for (const [id, address] of Object.entries(VERIFIED_LEGACY_AERO_CL100_FACTORY_POOLS)) {
    const pool = OFFICIAL_STABLE_CLUB_BASE_POOLS.find((p) => p.id === id);
    if (!pool?.poolAddress || pool.poolAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`CL100 legacy binding mismatch for ${id}`);
    }
    if (pool.infrastructure.generation !== "aerodrome-legacy") {
      throw new Error(`${id} must bind aerodrome-legacy infrastructure`);
    }
  }
}

export function assertManifestPoolIdsMatchCatalogue(manifestPoolIds: readonly Hex[]): void {
  const expected = OFFICIAL_STABLE_CLUB_BASE_POOLS.map((p) => p.poolIdHash).sort();
  const got = [...manifestPoolIds].sort();
  if (expected.length !== got.length || expected.some((h, i) => h !== got[i])) {
    throw new Error("Manifest poolIds do not match official catalogue poolIdHash set");
  }
}

export function assertLocalHardhatManifestIsolation(manifest: {
  chainId: number;
  network?: string;
  isTestOnly?: boolean;
}): void {
  if (manifest.chainId !== LOCAL_HARDHAT_CHAIN_ID) {
    throw new Error(
      `Local manifest chainId must be ${LOCAL_HARDHAT_CHAIN_ID}, got ${manifest.chainId}`,
    );
  }
  if (manifest.isTestOnly !== true) {
    throw new Error("Local manifest must set isTestOnly=true");
  }
}

export function assertStage1ExcludesCl100(): void {
  const cfg = buildStage1LaunchConfiguration();
  for (const id of cfg.unavailablePoolIds) {
    if (!id.includes("CL100")) {
      throw new Error(`Expected CL100 in unavailablePoolIds, got ${id}`);
    }
    if (cfg.poolIds.includes(id as typeof STAGE1_PRIVATE_BETA_POOL_ID)) {
      throw new Error(`CL100 pool ${id} must not appear in Stage 1 poolIds`);
    }
  }
  if (cfg.poolIds.length !== 1 || cfg.poolIds[0] !== STAGE1_PRIVATE_BETA_POOL_ID) {
    throw new Error("Stage 1 must activate exactly USDC-cbBTC-UNI-005");
  }
}

/** Infrastructure bindings used by phase2a-manifest.cjs / deploy-fork-phase2a.cjs — must match official-pools.ts. */
export function assertPhase2aInfraBindingsMatchCatalogue(): void {
  const uni = OFFICIAL_STABLE_CLUB_BASE_POOLS.filter((p) => p.protocol === "uniswap-v3");
  const aeroCurrent = OFFICIAL_STABLE_CLUB_BASE_POOLS.filter(
    (p) => p.infrastructure.generation === "aerodrome-current",
  );
  const aeroLegacy = OFFICIAL_STABLE_CLUB_BASE_POOLS.filter(
    (p) => p.infrastructure.generation === "aerodrome-legacy",
  );

  for (const pool of uni) {
    if (pool.infrastructure.factory !== BASE_DEX_UNISWAP_V3.factory) {
      throw new Error(`Uni pool ${pool.id} factory mismatch vs BASE_DEX_UNISWAP_V3`);
    }
  }
  for (const pool of aeroCurrent) {
    if (pool.infrastructure.factory !== BASE_DEX_AERODROME_CURRENT.factory) {
      throw new Error(`Aero current pool ${pool.id} factory mismatch`);
    }
  }
  for (const pool of aeroLegacy) {
    if (pool.infrastructure.factory !== BASE_DEX_AERODROME_LEGACY.factory) {
      throw new Error(`Aero legacy pool ${pool.id} factory mismatch`);
    }
  }
}
