/**
 * Stage 1 private-beta launch configuration — five official Base pools.
 * Automation disabled. No signer addresses.
 */
import {
  getOfficialPoolById,
  isPoolLaunchReady,
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  type OfficialStableClubPool,
} from "@/lib/stable-club/official-pools";
import {
  PRIVATE_BETA_LAUNCH_PARAMS,
  assertNoSignerAddresses,
  isLaunchAutomationDisabled,
  type StableClubLaunchParams,
} from "@/lib/stable-club/launch-params";

/** All five factory-verified official Base catalogue pools approved for private beta. */
export const STAGE1_FIVE_POOL_BETA_POOL_IDS = [
  "USDC-cbBTC-AERO-CL100",
  "USDC-cbBTC-UNI-005",
  "cbBTC-WETH-AERO-CL10",
  "cbBTC-WETH-AERO-CL100",
  "cbBTC-WETH-UNI-005",
] as const;

export type Stage1FivePoolBetaPoolId = (typeof STAGE1_FIVE_POOL_BETA_POOL_IDS)[number];

/** @deprecated Use {@link STAGE1_FIVE_POOL_BETA_POOL_IDS}. Kept for Step-2 automation dev fixtures. */
export const STAGE1_PRIVATE_BETA_POOL_ID = "USDC-cbBTC-UNI-005" as const;

export type Stage1LaunchConfiguration = {
  stage: "stage1-private-beta";
  poolIds: typeof STAGE1_FIVE_POOL_BETA_POOL_IDS;
  pools: OfficialStableClubPool[];
  params: StableClubLaunchParams;
  automationDisabled: true;
};

export function buildStage1LaunchConfiguration(
  params: StableClubLaunchParams = PRIVATE_BETA_LAUNCH_PARAMS,
): Stage1LaunchConfiguration {
  assertNoSignerAddresses(params);
  if (!isLaunchAutomationDisabled(params)) {
    throw new Error("Stage 1 requires harvest/compound/rebalance disabled");
  }
  if (params.stage !== "stage1-private-beta") {
    throw new Error("Stage 1 config requires stage1-private-beta params");
  }

  const pools: OfficialStableClubPool[] = [];
  for (const id of STAGE1_FIVE_POOL_BETA_POOL_IDS) {
    const pool = getOfficialPoolById(id);
    if (!pool) throw new Error(`Stage 1 pool missing from catalogue: ${id}`);
    if (!isPoolLaunchReady(pool)) {
      throw new Error(`Stage 1 pool is not launch-ready: ${id}`);
    }
    pools.push(pool);
  }

  if (pools.length !== OFFICIAL_STABLE_CLUB_BASE_POOLS.length) {
    throw new Error("Stage 1 must include every official Base catalogue pool");
  }

  return {
    stage: "stage1-private-beta",
    poolIds: STAGE1_FIVE_POOL_BETA_POOL_IDS,
    pools,
    params,
    automationDisabled: true,
  };
}

export function isStage1AllowedPoolId(poolId: string): poolId is Stage1FivePoolBetaPoolId {
  return (STAGE1_FIVE_POOL_BETA_POOL_IDS as readonly string[]).includes(poolId);
}
