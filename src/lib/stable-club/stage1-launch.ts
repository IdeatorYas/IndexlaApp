/**
 * Stage 1 private-beta launch configuration.
 * Single pool: USDC-cbBTC-UNI-005. Automation disabled. No signer addresses.
 */
import {
  getOfficialPoolById,
  isPoolLaunchReady,
  type OfficialStableClubPool,
} from "@/lib/stable-club/official-pools";
import {
  PRIVATE_BETA_LAUNCH_PARAMS,
  assertNoSignerAddresses,
  isLaunchAutomationDisabled,
  type StableClubLaunchParams,
} from "@/lib/stable-club/launch-params";

export const STAGE1_PRIVATE_BETA_POOL_ID = "USDC-cbBTC-UNI-005" as const;

export type Stage1LaunchConfiguration = {
  stage: "stage1-private-beta";
  poolIds: readonly [typeof STAGE1_PRIVATE_BETA_POOL_ID];
  pools: OfficialStableClubPool[];
  params: StableClubLaunchParams;
  automationDisabled: true;
  /** Explicitly excluded until Stage 2 onboarding + tighter caps + UNI beta evidence. */
  deferredPoolIds: readonly ["cbBTC-WETH-AERO-CL10", "cbBTC-WETH-UNI-005"];
  unavailablePoolIds: readonly ["USDC-cbBTC-AERO-CL100", "cbBTC-WETH-AERO-CL100"];
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

  const pool = getOfficialPoolById(STAGE1_PRIVATE_BETA_POOL_ID);
  if (!pool) throw new Error("Stage 1 pool missing from catalogue");
  if (!isPoolLaunchReady(pool)) {
    throw new Error("Stage 1 pool is not launch-ready");
  }
  if (pool.id !== STAGE1_PRIVATE_BETA_POOL_ID) {
    throw new Error("Stage 1 must be exactly USDC-cbBTC-UNI-005");
  }

  return {
    stage: "stage1-private-beta",
    poolIds: [STAGE1_PRIVATE_BETA_POOL_ID],
    pools: [pool],
    params,
    automationDisabled: true,
    deferredPoolIds: ["cbBTC-WETH-AERO-CL10", "cbBTC-WETH-UNI-005"],
    unavailablePoolIds: ["USDC-cbBTC-AERO-CL100", "cbBTC-WETH-AERO-CL100"],
  };
}

export function isStage1AllowedPoolId(poolId: string): boolean {
  return poolId === STAGE1_PRIVATE_BETA_POOL_ID;
}
