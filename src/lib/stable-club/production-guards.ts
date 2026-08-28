/**
 * Production configuration gates for Stable Club governance + Permit2 + oracle cutover.
 * Mainnet requires 2-of-3 Safe → 48h Timelock ownership; blocks missing feeds/Permit2.
 */
import {
  GOVERNANCE_SCAFFOLDING,
  STABLE_CLUB_MULTISIG_SIZE,
  STABLE_CLUB_MULTISIG_THRESHOLD,
  STABLE_CLUB_TIMELOCK_SECONDS,
  type GovernanceScaffoldingConfig,
} from "@/lib/stable-club/governance";
import {
  MVP_GOVERNANCE_SAFE,
  assertMvpGovernanceConfigured,
} from "@/lib/stable-club/mvp-governance";
import {
  BASE_CHAIN_ID,
  BASE_PERMIT2,
  isCanonicalBasePermit2,
  stage1OracleFeedsConfigured,
} from "@/lib/stable-club/verified-base-addresses";
import { PRIVATE_BETA_LAUNCH_PARAMS, type StableClubLaunchParams } from "@/lib/stable-club/launch-params";
import {
  APPROVED_GAS_CEILING_WEI,
  assertGasCeilingMatchesApproval,
} from "@/lib/stable-club/gas-ceiling-recommendation";

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

  assertMvpGovernanceConfigured(governance.mvp);

  if (governance.multisig.signersTbd || governance.multisig.signerAddresses.length !== 3) {
    throw new Error("Production blocked: MVP requires 3 configured Safe signers");
  }
  if (governance.multisig.threshold !== STABLE_CLUB_MULTISIG_THRESHOLD) {
    throw new Error("Production blocked: multisig threshold must be 2");
  }
  if (governance.multisig.size !== STABLE_CLUB_MULTISIG_SIZE) {
    throw new Error("Production blocked: multisig size must be 3");
  }
  if (governance.timelockMinDelaySeconds !== STABLE_CLUB_TIMELOCK_SECONDS) {
    throw new Error("Production blocked: timelock must be 48 hours");
  }
  if (!params.governanceSafeAddress || params.governanceSafeAddress.toLowerCase() === ZERO) {
    throw new Error("Production blocked: 2-of-3 Safe address required for mainnet governance");
  }
  if (params.governanceSafeAddress.toLowerCase() !== MVP_GOVERNANCE_SAFE.toLowerCase()) {
    throw new Error("Production blocked: governance Safe must match MVP_GOVERNANCE_SAFE");
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

/**
 * Founder-approved gas ceiling must be encoded and only adjustable via 48h Timelock on-chain.
 */
export function assertGasCeilingFounderApproved(
  params: StableClubLaunchParams = PRIVATE_BETA_LAUNCH_PARAMS,
): void {
  assertGasCeilingMatchesApproval(params.safety.gasCeilingWei);
  if (params.governance.timelockSeconds !== STABLE_CLUB_TIMELOCK_SECONDS) {
    throw new Error("gasCeilingWei adjustments require 48h Timelock governance");
  }
  if (!params.governance.unpauseRequiresTimelock) {
    throw new Error("Timelock-gated config (including gas ceiling) required");
  }
}

/** @deprecated Use assertGasCeilingFounderApproved — ceiling is now founder-encoded. */
export function assertGasCeilingNotHardcoded(
  params: StableClubLaunchParams = PRIVATE_BETA_LAUNCH_PARAMS,
): void {
  assertGasCeilingFounderApproved(params);
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
  assertGasCeilingFounderApproved();
}

export function evaluateMainnetReadiness(check: ProductionOwnershipCheck): {
  ready: boolean;
  blockers: string[];
} {
  if (check.environment !== "mainnet") {
    return { ready: true, blockers: [] };
  }
  const blockers: string[] = [];
  if (!check.multisigSignersConfigured) blockers.push("multisig signers not configured");
  if (!check.governanceSafeAddress) blockers.push("governance Safe unset");
  else if (check.governanceSafeAddress.toLowerCase() !== MVP_GOVERNANCE_SAFE.toLowerCase()) {
    blockers.push("governance Safe mismatch vs MVP");
  }
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
  try {
    assertGasCeilingFounderApproved();
  } catch {
    blockers.push(`gasCeilingWei must be founder-approved ${APPROVED_GAS_CEILING_WEI}`);
  }
  return { ready: blockers.length === 0, blockers };
}

export function codeFreezeBlockers(): string[] {
  const readiness = evaluateMainnetReadiness({
    environment: "mainnet",
    ownerIsTimelock: false,
    timelockDelaySeconds: STABLE_CLUB_TIMELOCK_SECONDS,
    governanceSafeAddress: MVP_GOVERNANCE_SAFE,
    multisigSignersConfigured: true,
    permit2Address: null,
  });
  const blockers = [...readiness.blockers];
  blockers.push("timelock not deployed / owners not wired yet");
  blockers.push("no mainnet deploy authorized yet");
  blockers.push("Bugbot review not clean yet");
  blockers.push("professional audit not started");
  blockers.push("audit-freeze tag deferred until Bugbot clean");
  return [...new Set(blockers)];
}
