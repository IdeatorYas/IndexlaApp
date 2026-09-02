/**
 * Stage-aware pool launch status — separates catalogue verification from on-chain activation.
 * UI/API must never promote configured/verified pools to "Live" without attestation + activation proof.
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
  buildStage1LaunchConfiguration,
  isStage1AllowedPoolId,
  type Stage1LaunchConfiguration,
} from "@/lib/stable-club/stage1-launch";

export type PoolCatalogueVerification = "factory-verified" | "factory-unverified";

export type PoolLaunchPolicyBucket = "stage1-eligible" | "not-in-stage1";

export type PoolOnChainActivation = "activated" | "not-activated";

export type ResolvedPoolLaunchStatus = {
  poolId: string;
  catalogueVerification: PoolCatalogueVerification;
  launchPolicy: PoolLaunchPolicyBucket;
  onChainActivation: PoolOnChainActivation;
  /** User-facing badge — "Live" only when fully activated with trusted deployment proof. */
  publicBadge: string;
  publicDetail: string;
  canAdvertiseAsActive: boolean;
  canAdvertiseAsReadyForActivation: boolean;
};

export type AutomationPublicStatus = {
  kind: "harvest" | "compound" | "rebalance";
  configuredInLaunchParams: true;
  enabledByLaunchPolicy: boolean;
  canAdvertiseAsRunning: boolean;
  publicLabel: string;
};

const STAGE1_CFG = buildStage1LaunchConfiguration();

function launchPolicyForPoolId(poolId: string): PoolLaunchPolicyBucket {
  return isStage1AllowedPoolId(poolId) ? "stage1-eligible" : "not-in-stage1";
}

export function resolvePoolLaunchStatus(
  pool: OfficialStableClubPool,
  opts: {
    activatedOnChainIds?: readonly string[];
    executionTrusted?: boolean;
  } = {},
): ResolvedPoolLaunchStatus {
  const activatedOnChainIds = opts.activatedOnChainIds ?? [];
  const executionTrusted = opts.executionTrusted ?? false;
  const catalogueVerification: PoolCatalogueVerification = isPoolResolvable(pool)
    ? "factory-verified"
    : "factory-unverified";
  const launchPolicy = launchPolicyForPoolId(pool.id);
  const onChainActivation: PoolOnChainActivation = activatedOnChainIds.includes(pool.id)
    ? "activated"
    : "not-activated";

  const canAdvertiseAsActive =
    executionTrusted &&
    onChainActivation === "activated" &&
    launchPolicy === "stage1-eligible";

  const canAdvertiseAsReadyForStage1Activation =
    executionTrusted &&
    launchPolicy === "stage1-eligible" &&
    catalogueVerification === "factory-verified" &&
    onChainActivation === "not-activated";

  let publicBadge: string;
  let publicDetail: string;

  if (catalogueVerification === "factory-unverified") {
    publicBadge = "Unverified";
    publicDetail = "Factory binding missing — not launch-ready. No silent remap.";
  } else if (launchPolicy === "not-in-stage1") {
    publicBadge = "Unavailable";
    publicDetail = "Pool is not in the Stage 1 five-pool beta catalogue.";
  } else if (canAdvertiseAsActive) {
    publicBadge = "Live";
    publicDetail = "Trusted Base deployment attested and on-chain pool activation confirmed.";
  } else if (!executionTrusted) {
    publicBadge = "Ready for activation";
    publicDetail =
      "Factory-verified — awaiting trusted Base manifest attestation and governance activation.";
  } else if (canAdvertiseAsReadyForStage1Activation) {
    publicBadge = "Ready for activation";
    publicDetail = "Trusted deployment attested — awaiting on-chain pool activation.";
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
    canAdvertiseAsReadyForActivation: canAdvertiseAsReadyForStage1Activation,
  };
}

export function resolvePoolLaunchStatusById(
  poolId: string,
  opts: {
    activatedOnChainIds?: readonly string[];
    executionTrusted?: boolean;
  } = {},
): ResolvedPoolLaunchStatus {
  const pool = getOfficialPoolById(poolId);
  if (!pool) throw new Error(`Unknown catalogue pool: ${poolId}`);
  return resolvePoolLaunchStatus(pool, opts);
}

/** Fail closed if any pool is advertised Live without on-chain + trust proof. */
export function assertTruthfulActiveAdvertisement(
  poolId: string,
  opts: { activatedOnChainIds?: readonly string[]; executionTrusted?: boolean },
): void {
  const status = resolvePoolLaunchStatusById(poolId, opts);
  if (!status.canAdvertiseAsActive) {
    throw new Error(
      `Pool ${poolId} cannot be advertised as Live (badge=${status.publicBadge})`,
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
