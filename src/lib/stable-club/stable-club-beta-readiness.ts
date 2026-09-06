/**
 * Five-pool Base beta readiness — Live vs Ready for activation.
 * Deposits require trusted manifest + attestation + all pools registered on-chain
 * AND USDC-only exit (exitAllToUsdc) enabled. If withdrawal is unavailable, deposits are unavailable.
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
  /** Same gate as Withdraw All · Receive USDC — deposits require this true. */
  exitAllToUsdcAvailable: boolean;
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

export const USDC_EXIT_REQUIRED_FOR_DEPOSIT_BLOCKER =
  "USDC-only Withdraw All (exitAllToUsdc) is not enabled — deposits are unavailable until Timelock cutover";

export function resolveStableClubDepositBlockers(input: {
  attestationPassed: boolean;
  isBaseProduction: boolean;
  manifestTrusted: boolean;
  missingActivationPoolIds: readonly Stage1FivePoolBetaPoolId[];
  exitAllToUsdcAvailable: boolean;
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
  if (!input.exitAllToUsdcAvailable) {
    blockers.push(USDC_EXIT_REQUIRED_FOR_DEPOSIT_BLOCKER);
  }
  return blockers;
}

export function evaluateStableClubBetaReadiness(input: {
  attestationPassed: boolean;
  isBaseProduction: boolean;
  activatedOnChainIds: readonly Stage1FivePoolBetaPoolId[];
  /** Must be true for deposits. Defaults false (fail closed). */
  exitAllToUsdcAvailable?: boolean;
}): StableClubBetaReadiness {
  const manifestTrusted = getTrustedPhase2aBaseManifest() != null;
  const attestationPassed = input.attestationPassed;
  const exitAllToUsdcAvailable = input.exitAllToUsdcAvailable === true;

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
    exitAllToUsdcAvailable,
  });

  const allActivated = missingActivationPoolIds.length === 0;
  const trustOk = input.isBaseProduction ? manifestTrusted && attestationPassed : attestationPassed;
  const depositsEnabled = trustOk && allActivated && exitAllToUsdcAvailable;
  const globalStatus: StableClubBetaGlobalStatus = depositsEnabled ? "Live" : "Ready for activation";

  return {
    globalStatus,
    depositsEnabled,
    exitAllToUsdcAvailable,
    manifestTrusted,
    attestationPassed,
    activatedPoolIds,
    missingActivationPoolIds,
    depositBlockers,
  };
}
