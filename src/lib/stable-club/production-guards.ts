/**
 * Production configuration gates for Stable Club governance + Permit2 + oracle cutover.
 * Mainnet requires 3-of-5 Safe → 48h Timelock ownership; blocks missing feeds/Permit2/signers.
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
  stage1OracleFeedsConfigured,
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
  oracleFeedsConfigured?: boolean;
};

const ZERO = "0x0000000000000000000000000000000000000000";

export function isStage0EoaEnvironment(env: DeploymentEnvironment): boolean {
  return env === "local" || env === "testnet";
}

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
    throw new Error(
      "Production blocked: contract owner/admin must be the 48h Timelock (no production admin EOA)",
    );
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

export function assertProductionOracleFeedsReady(environment: DeploymentEnvironment): void {
  if (environment !== "mainnet") return;
  if (!stage1OracleFeedsConfigured()) {
    throw new Error(
      "Production blocked: Stage 1 oracle feeds (USDC/USD, cbBTC/USD, BTC/USD peg) not verified",
    );
  }
}

/** @deprecated Use assertProductionOracleFeedsReady */
export function assertProductionOracleDocsConfirmed(environment: DeploymentEnvironment): void {
  assertProductionOracleFeedsReady(environment);
}

export function assertGasCeilingNotHardcoded(
  params: StableClubLaunchParams = PRIVATE_BETA_LAUNCH_PARAMS,
): void {
  if (params.safety.gasCeilingWei != null) {
    throw new Error("gasCeilingWei must remain null until founder approves evidence-based value");
  }
}

export function assertMainnetHardeningComplete(params: {
  environment: DeploymentEnvironment;
  governanceSafeAddress: `0x${string}` | null;
  timelockAddress: `0x${string}` | null;
  ownerAddress: `0x${string}` | null;
  permit2Address: `0x${string}` | null;
  chainId: number;
}): void {
  assertProductionGovernanceReady(params);
  assertProductionPermit2Ready(params);
  assertProductionOracleFeedsReady(params.environment);
  assertGasCeilingNotHardcoded();
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
  const oraclesOk =
    check.oracleFeedsConfigured === undefined
      ? stage1OracleFeedsConfigured()
      : check.oracleFeedsConfigured;
  if (!oraclesOk) blockers.push("oracle feeds missing/unverified");
  if (PRIVATE_BETA_LAUNCH_PARAMS.safety.gasCeilingWei != null) {
    blockers.push("gas ceiling unexpectedly hardcoded");
  } else {
    // gas ceiling TBD is expected — not a blocker, but freeze note
  }
  return { ready: blockers.length === 0, blockers };
}

export function codeFreezeBlockers(): string[] {
  const readiness = evaluateMainnetReadiness({
    environment: "mainnet",
    ownerIsTimelock: false,
    timelockDelaySeconds: STABLE_CLUB_TIMELOCK_SECONDS,
    governanceSafeAddress: null,
    multisigSignersConfigured: false,
    permit2Address: null,
  });
  const blockers = [...readiness.blockers];
  blockers.push("gasCeilingWei TBD (measure on fork; Timelock-configurable)");
  blockers.push("governance Safe instance address TBD (never invent)");
  blockers.push("professional audit not started");
  return blockers;
}
