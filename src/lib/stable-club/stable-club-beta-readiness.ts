/**
 * Five-pool Base beta readiness — Live vs Ready for activation.
 * Deposits require trusted manifest + attestation + all pools registered on-chain.
 */
import type { Address, Hex, PublicClient } from "viem";
import {
  STAGE1_FIVE_POOL_BETA_POOL_IDS,
  type Stage1FivePoolBetaPoolId,
} from "@/lib/stable-club/stage1-launch";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { getTrustedPhase2aBaseManifest } from "@/lib/stable-club/phase2a-deployments";

const poolAdaptersAbi = [
  {
    type: "function",
    name: "poolAdapters",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export type StableClubBetaGlobalStatus = "Live" | "Ready for activation";

export type StableClubBetaReadiness = {
  globalStatus: StableClubBetaGlobalStatus;
  depositsEnabled: boolean;
  manifestTrusted: boolean;
  attestationPassed: boolean;
  activatedPoolIds: Stage1FivePoolBetaPoolId[];
  missingActivationPoolIds: Stage1FivePoolBetaPoolId[];
  depositBlockers: string[];
};

export async function readRegisteredCataloguePoolIds(
  publicClient: PublicClient,
  clExecutor: Address,
): Promise<Stage1FivePoolBetaPoolId[]> {
  const activated: Stage1FivePoolBetaPoolId[] = [];
  for (const pool of OFFICIAL_STABLE_CLUB_BASE_POOLS) {
    const adapter = (await publicClient.readContract({
      address: clExecutor,
      abi: poolAdaptersAbi,
      functionName: "poolAdapters",
      args: [pool.poolIdHash as Hex],
    })) as Address;
    if (adapter && adapter !== "0x0000000000000000000000000000000000000000") {
      if ((STAGE1_FIVE_POOL_BETA_POOL_IDS as readonly string[]).includes(pool.id)) {
        activated.push(pool.id as Stage1FivePoolBetaPoolId);
      }
    }
  }
  return activated;
}

export function resolveStableClubDepositBlockers(input: {
  attestationPassed: boolean;
  isBaseProduction: boolean;
  manifestTrusted: boolean;
  missingActivationPoolIds: readonly Stage1FivePoolBetaPoolId[];
}): string[] {
  const blockers: string[] = [];
  if (input.isBaseProduction && !input.manifestTrusted) {
    blockers.push("Trusted Base manifest not available");
  }
  if (!input.attestationPassed) {
    blockers.push("Deployment attestation has not passed");
  }
  for (const poolId of input.missingActivationPoolIds) {
    blockers.push(`Pool not governance-activated on-chain: ${poolId}`);
  }
  return blockers;
}

export function evaluateStableClubBetaReadiness(input: {
  attestationPassed: boolean;
  isBaseProduction: boolean;
  activatedOnChainIds: readonly Stage1FivePoolBetaPoolId[];
}): StableClubBetaReadiness {
  const manifestTrusted = getTrustedPhase2aBaseManifest() != null;
  const attestationPassed = input.attestationPassed;

  const activatedPoolIds = STAGE1_FIVE_POOL_BETA_POOL_IDS.filter((id) =>
    input.activatedOnChainIds.includes(id),
  );
  const missingActivationPoolIds = STAGE1_FIVE_POOL_BETA_POOL_IDS.filter(
    (id) => !input.activatedOnChainIds.includes(id),
  );

  const depositBlockers = resolveStableClubDepositBlockers({
    attestationPassed,
    isBaseProduction: input.isBaseProduction,
    manifestTrusted,
    missingActivationPoolIds,
  });

  const allActivated = missingActivationPoolIds.length === 0;
  const trustOk = input.isBaseProduction ? manifestTrusted && attestationPassed : attestationPassed;
  const depositsEnabled = trustOk && allActivated;
  const globalStatus: StableClubBetaGlobalStatus = depositsEnabled ? "Live" : "Ready for activation";

  return {
    globalStatus,
    depositsEnabled,
    manifestTrusted,
    attestationPassed,
    activatedPoolIds,
    missingActivationPoolIds,
    depositBlockers,
  };
}
