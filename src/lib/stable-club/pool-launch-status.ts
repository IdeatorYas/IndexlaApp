/**
 * Stage-aware pool launch status — separates catalogue verification from Stage 1 policy
 * and on-chain activation. UI/API must never promote configured/verified pools to "Active"
 * without authoritative activation state.
 */
import {
  PRIVATE_BETA_LAUNCH_PARAMS,
  isLaunchAutomationDisabled,
  type StableClubLaunchParams,
} from "@/lib/stable-club/launch-params";
import {
  getOfficialPoolById,
  isPoolResolvable,
  type OfficialStableClubPool,
} from "@/lib/stable-club/official-pools";
import {
  STAGE1_PRIVATE_BETA_POOL_ID,
  buildStage1LaunchConfiguration,
  type Stage1LaunchConfiguration,
} from "@/lib/stable-club/stage1-launch";

export type PoolCatalogueVerification = "factory-verified" | "factory-unverified";

export type PoolLaunchPolicyBucket =
  | "stage1-eligible"
  | "stage1-excluded-cl100"
  | "stage2-deferred";

export type PoolOnChainActivation = "activated" | "not-activated";

export type ResolvedPoolLaunchStatus = {
  poolId: string;
  catalogueVerification: PoolCatalogueVerification;
  launchPolicy: PoolLaunchPolicyBucket;
  onChainActivation: PoolOnChainActivation;
  /** User-facing badge — never "Active" unless on-chain activated for a Stage-1-eligible pool. */
  publicBadge: string;
  publicDetail: string;
  canAdvertiseAsActive: boolean;
  canAdvertiseAsReadyForStage1Activation: boolean;
};

export type AutomationPublicStatus = {
  kind: "harvest" | "compound" | "rebalance";
  configuredInLaunchParams: true;
  enabledByLaunchPolicy: boolean;
  /** True only when launch flag is true — never true in Stage 1 private beta defaults. */
  canAdvertiseAsRunning: boolean;
  publicLabel: string;
};

const STAGE1_CFG = buildStage1LaunchConfiguration();

function launchPolicyForPoolId(poolId: string): PoolLaunchPolicyBucket {
  if (poolId === STAGE1_PRIVATE_BETA_POOL_ID) return "stage1-eligible";
  if ((STAGE1_CFG.unavailablePoolIds as readonly string[]).includes(poolId)) {
    return "stage1-excluded-cl100";
  }
  if ((STAGE1_CFG.deferredPoolIds as readonly string[]).includes(poolId)) {
    return "stage2-deferred";
  }
  throw new Error(`Unknown catalogue pool launch policy: ${poolId}`);
}

export function resolvePoolLaunchStatus(
  pool: OfficialStableClubPool,
  opts: { activatedOnChainIds?: readonly string[] } = {},
): ResolvedPoolLaunchStatus {
  const activatedOnChainIds = opts.activatedOnChainIds ?? [];
  const catalogueVerification: PoolCatalogueVerification = isPoolResolvable(pool)
    ? "factory-verified"
    : "factory-unverified";
  const launchPolicy = launchPolicyForPoolId(pool.id);
  const onChainActivation: PoolOnChainActivation = activatedOnChainIds.includes(pool.id)
    ? "activated"
    : "not-activated";

  const canAdvertiseAsActive =
    onChainActivation === "activated" && launchPolicy === "stage1-eligible";

  const canAdvertiseAsReadyForStage1Activation =
    launchPolicy === "stage1-eligible" &&
    catalogueVerification === "factory-verified" &&
    onChainActivation === "not-activated";

  let publicBadge: string;
  let publicDetail: string;

  if (catalogueVerification === "factory-unverified") {
    publicBadge = "Unverified";
    publicDetail = "Factory binding missing — not launch-ready. No silent remap.";
  } else if (launchPolicy === "stage1-excluded-cl100") {
    publicBadge = "Excluded (Stage 1)";
    publicDetail =
      "Legacy Aerodrome CL100 factory-verified on Base catalogue only — must not activate in Stage 1.";
  } else if (launchPolicy === "stage2-deferred") {
    publicBadge = "Deferred (Stage 2)";
    publicDetail = "Catalogue verified — Stage 2 onboarding required before activation.";
  } else if (canAdvertiseAsActive) {
    publicBadge = "Activated";
    publicDetail = "On-chain official pool activation confirmed for Stage 1.";
  } else if (canAdvertiseAsReadyForStage1Activation) {
    publicBadge = "Verified · Stage 1 eligible";
    publicDetail = "Factory-verified — eligible for Stage 1 activation after governance preflight.";
  } else {
    publicBadge = "Verified";
    publicDetail = "Factory-verified on catalogue infrastructure generation.";
  }

  return {
    poolId: pool.id,
    catalogueVerification,
    launchPolicy,
    onChainActivation,
    publicBadge,
    publicDetail,
    canAdvertiseAsActive,
    canAdvertiseAsReadyForStage1Activation,
  };
}

export function resolvePoolLaunchStatusById(
  poolId: string,
  opts: { activatedOnChainIds?: readonly string[] } = {},
): ResolvedPoolLaunchStatus {
  const pool = getOfficialPoolById(poolId);
  if (!pool) throw new Error(`Unknown catalogue pool: ${poolId}`);
  return resolvePoolLaunchStatus(pool, opts);
}

/** Fail closed if CL100 pools appear in a Stage-1 activation list. */
export function assertCl100NotStage1Active(poolIds: readonly string[]): void {
  for (const id of poolIds) {
    const status = resolvePoolLaunchStatusById(id);
    if (status.launchPolicy === "stage1-excluded-cl100") {
      throw new Error(`Stage 1 must not activate CL100 catalogue pool: ${id}`);
    }
  }
}

/** Fail closed if any pool is advertised active without on-chain + policy proof. */
export function assertTruthfulActiveAdvertisement(
  poolId: string,
  opts: { activatedOnChainIds?: readonly string[] },
): void {
  const status = resolvePoolLaunchStatusById(poolId, opts);
  if (!status.canAdvertiseAsActive) {
    throw new Error(
      `Pool ${poolId} cannot be advertised as Active (badge=${status.publicBadge})`,
    );
  }
}

export function describeLaunchAutomationPublicStatus(
  params: StableClubLaunchParams = PRIVATE_BETA_LAUNCH_PARAMS,
): AutomationPublicStatus[] {
  const disabled = isLaunchAutomationDisabled(params);
  const kinds = ["harvest", "compound", "rebalance"] as const;
  return kinds.map((kind) => {
    const enabled =
      kind === "harvest"
        ? params.automation.harvestEnabled
        : kind === "compound"
          ? params.automation.compoundEnabled
          : params.automation.rebalanceEnabled;
    return {
      kind,
      configuredInLaunchParams: true,
      enabledByLaunchPolicy: enabled,
      canAdvertiseAsRunning: enabled,
      publicLabel: enabled
        ? `${kind} automation enabled by launch policy`
        : disabled
          ? `${kind} automation disabled by launch policy (Stage 1 private beta)`
          : `${kind} automation disabled`,
    };
  });
}

export function getStage1LaunchConfiguration(): Stage1LaunchConfiguration {
  return STAGE1_CFG;
}
