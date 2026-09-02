/**
 * Canonical Stage 1 official-pool activation — fail-closed governance preflight required.
 */
import type { Address } from "viem";
import {
  assertGovernanceActivationPreflight,
  type CriticalContractAddresses,
  type GovernanceActivationPreflightClient,
} from "@/lib/stable-club/governance-activation";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";
import { MVP_GOVERNANCE, MVP_GOVERNANCE_SAFE } from "@/lib/stable-club/mvp-governance";
import type { DeploymentEnvironment } from "@/lib/stable-club/production-guards";
import { buildStage1LaunchConfiguration } from "@/lib/stable-club/stage1-launch";

export type Stage1PoolActivationInput = {
  /** Internal test-pool validation gate (official-pools activationRequiresTestPoolValidation). */
  testPoolValidated: boolean;
  environment: DeploymentEnvironment;
  governanceSafeAddress?: Address | null;
  timelockAddress?: Address | null;
  criticalContracts: CriticalContractAddresses;
  publicClient: GovernanceActivationPreflightClient;
};

export type Stage1PoolActivationResult = {
  activatedPoolIds: readonly string[];
  stage: "stage1-private-beta";
};

/**
 * Activate Stage 1 catalogue pools after governance preflight.
 * Every activation entrypoint must call this — UI-only state updates are forbidden.
 */
export async function activateStage1OfficialPools(
  input: Stage1PoolActivationInput,
): Promise<Stage1PoolActivationResult> {
  if (!input.testPoolValidated) {
    throw new Error("Stage 1 activation blocked: internal test pool validation required");
  }

  const cfg = buildStage1LaunchConfiguration();

  if (input.environment !== "mainnet" && input.environment !== "testnet") {
    throw new Error(
      "Stage 1 official pool activation blocked: local Hardhat environment cannot activate production catalogue pools",
    );
  }

  await assertGovernanceActivationPreflight({
    expectedSafeAddress: MVP_GOVERNANCE_SAFE,
    governanceSafeAddress:
      input.governanceSafeAddress ?? MVP_GOVERNANCE.multisig.safeAddress,
    timelockAddress: input.timelockAddress ?? MVP_GOVERNANCE.timelock.timelockAddress,
    minDelaySeconds: PRIVATE_BETA_LAUNCH_PARAMS.governance.timelockSeconds,
    criticalContracts: input.criticalContracts,
    publicClient: input.publicClient,
  });

  return {
    activatedPoolIds: cfg.poolIds,
    stage: cfg.stage,
  };
}
