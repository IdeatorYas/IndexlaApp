/**
 * Production configuration gates for Stable Club governance + Permit2 cutover.
 * Blocks mainnet launch config while multisig signers remain TBD or admin is an EOA.
 */
import {
  GOVERNANCE_SCAFFOLDING,
  STABLE_CLUB_MULTISIG_SIZE,
  STABLE_CLUB_MULTISIG_THRESHOLD,
  STABLE_CLUB_TIMELOCK_SECONDS,
  type GovernanceScaffoldingConfig,
} from "@/lib/stable-club/governance";
import {
  BASE_CHAIN_ID,
  BASE_PERMIT2,
  isCanonicalBasePermit2,
  oraclesPendingOfficialDocsConfirmation,
} from "@/lib/stable-club/verified-base-addresses";
import { PRIVATE_BETA_LAUNCH_PARAMS, type StableClubLaunchParams } from "@/lib/stable-club/launch-params";

export type DeploymentEnvironment = "local" | "testnet" | "mainnet";

export type ProductionOwnershipCheck = {
  environment: DeploymentEnvironment;
  ownerIsTimelock: boolean;
  timelockDelaySeconds: number;
  governanceSafeAddress: `0x${string}` | null;
  multisigSignersConfigured: boolean;
  permit2Address: `0x${string}` | null;
};

const ZERO = "0x0000000000000000000000000000000000000000";

export function isStage0EoaEnvironment(env: DeploymentEnvironment): boolean {
  return env === "local" || env === "testnet";
}

/**
 * Mainnet must not proceed while signers are TBD in source or governance Safe is unset.
 */
export function assertProductionGovernanceReady(params: {
  environment: DeploymentEnvironment;
  governance?: GovernanceScaffoldingConfig;
  governanceSafeAddress?: `0x${string}` | null;
  ownerAddress?: `0x${string}` | null;
  timelockAddress?: `0x${string}` | null;
}): void {
  const governance = params.governance ?? GOVERNANCE_SCAFFOLDING;
  if (params.environment !== "mainnet") return;

  if (governance.multisig.signersTbd || governance.multisig.signerAddresses.length === 0) {
    throw new Error(
      "Production blocked: multisig signers remain TBD — Stage 0 EOAs are not allowed for mainnet governance",
    );
  }
  if (governance.multisig.threshold !== STABLE_CLUB_MULTISIG_THRESHOLD) {
    throw new Error("Production blocked: multisig threshold must be 3");
  }
  if (governance.multisig.size !== STABLE_CLUB_MULTISIG_SIZE) {
    throw new Error("Production blocked: multisig size must be 5");
  }
  if (governance.timelockMinDelaySeconds !== STABLE_CLUB_TIMELOCK_SECONDS) {
    throw new Error("Production blocked: timelock must be 48 hours");
  }
  if (!params.governanceSafeAddress || params.governanceSafeAddress.toLowerCase() === ZERO) {
    throw new Error("Production blocked: 3-of-5 Safe address required for mainnet governance");
  }
  if (!params.timelockAddress || params.timelockAddress.toLowerCase() === ZERO) {
    throw new Error("Production blocked: 48h Timelock address required");
  }
  if (
    !params.ownerAddress ||
    params.ownerAddress.toLowerCase() !== params.timelockAddress.toLowerCase()
  ) {
    throw new Error("Production blocked: contract owner/admin must be the 48h Timelock (no production admin EOA)");
  }
}

export function assertProductionPermit2Ready(params: {
  environment: DeploymentEnvironment;
  permit2Address: `0x${string}` | null | undefined;
  chainId: number;
}): void {
  if (params.environment !== "mainnet") return;
  if (params.chainId !== BASE_CHAIN_ID) {
    throw new Error("Production blocked: Stable Club mainnet is Base (8453) only");
  }
  if (!params.permit2Address || !isCanonicalBasePermit2(params.permit2Address)) {
    throw new Error(
      `Production blocked: Permit2 must be canonical Base address ${BASE_PERMIT2.address}`,
    );
  }
}

export function assertProductionOracleDocsConfirmed(environment: DeploymentEnvironment): void {
  if (environment !== "mainnet") return;
  const pending = oraclesPendingOfficialDocsConfirmation();
  if (pending.length > 0) {
    throw new Error(
      `Production blocked: Chainlink official docs confirmation pending for: ${pending.join(", ")}`,
    );
  }
}

/** Launch params still keep gasCeilingWei null until evidence-based value is approved. */
export function assertGasCeilingNotHardcoded(
  params: StableClubLaunchParams = PRIVATE_BETA_LAUNCH_PARAMS,
): void {
  if (params.safety.gasCeilingWei != null) {
    throw new Error("gasCeilingWei must remain null until founder approves evidence-based value");
  }
}

export function evaluateMainnetReadiness(check: ProductionOwnershipCheck): {
  ready: boolean;
  blockers: string[];
} {
  if (check.environment !== "mainnet") {
    return { ready: true, blockers: [] };
  }
  const blockers: string[] = [];
  if (!check.multisigSignersConfigured) blockers.push("multisig signers TBD");
  if (!check.governanceSafeAddress) blockers.push("governance Safe unset");
  if (!check.ownerIsTimelock) blockers.push("owner is not Timelock");
  if (check.timelockDelaySeconds !== STABLE_CLUB_TIMELOCK_SECONDS) {
    blockers.push("timelock delay != 48h");
  }
  if (!check.permit2Address || !isCanonicalBasePermit2(check.permit2Address)) {
    blockers.push("Permit2 not canonical");
  }
  const pendingOracles = oraclesPendingOfficialDocsConfirmation();
  if (pendingOracles.length) {
    blockers.push(`oracle docs pending: ${pendingOracles.join(", ")}`);
  }
  return { ready: blockers.length === 0, blockers };
}
