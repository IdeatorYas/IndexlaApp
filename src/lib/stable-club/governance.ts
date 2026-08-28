/**
 * Multisig-compatible governance scaffolding — MVP is 2-of-3 Safe → 48h Timelock.
 * Private keys / seeds are never stored. Addresses come from founder-confirmed MVP config.
 */
import {
  MVP_GOVERNANCE,
  MVP_GOVERNANCE_SAFE,
  MVP_MULTISIG_SIZE,
  MVP_MULTISIG_THRESHOLD,
  MVP_SIGNERS,
  type MvpGovernanceConfig,
} from "@/lib/stable-club/mvp-governance";

export const STABLE_CLUB_TIMELOCK_SECONDS = 48 * 60 * 60;
export const STABLE_CLUB_MULTISIG_THRESHOLD = MVP_MULTISIG_THRESHOLD;
export const STABLE_CLUB_MULTISIG_SIZE = MVP_MULTISIG_SIZE;

export type GovernanceSignerConfig = {
  signersTbd: false;
  threshold: typeof STABLE_CLUB_MULTISIG_THRESHOLD;
  size: typeof STABLE_CLUB_MULTISIG_SIZE;
  signerAddresses: readonly `0x${string}`[];
  safeAddress: `0x${string}`;
};

export type GovernanceScaffoldingConfig = {
  timelockMinDelaySeconds: typeof STABLE_CLUB_TIMELOCK_SECONDS;
  multisig: GovernanceSignerConfig;
  roles: {
    emergencyGuardianCanPauseImmediately: true;
    unpauseRequiresTimelock: true;
    configChangesRequireTimelock: true;
    coreContractsImmutable: true;
    adaptersReplaceableOnlyViaGovernedRegistry: true;
    /** Mainnet: owner/admin = Timelock; Timelock proposers/executors = 2-of-3 Safe. */
    mainnetOwnerMustBeTimelock: true;
    stage0EoaOnlyLocalOrTestnet: true;
    feeRecipientReceivesFeesOnly: true;
  };
  mvp: MvpGovernanceConfig;
};

export const GOVERNANCE_SCAFFOLDING: GovernanceScaffoldingConfig = {
  timelockMinDelaySeconds: STABLE_CLUB_TIMELOCK_SECONDS,
  multisig: {
    signersTbd: false,
    threshold: STABLE_CLUB_MULTISIG_THRESHOLD,
    size: STABLE_CLUB_MULTISIG_SIZE,
    signerAddresses: [...MVP_SIGNERS],
    safeAddress: MVP_GOVERNANCE_SAFE,
  },
  roles: {
    emergencyGuardianCanPauseImmediately: true,
    unpauseRequiresTimelock: true,
    configChangesRequireTimelock: true,
    coreContractsImmutable: true,
    adaptersReplaceableOnlyViaGovernedRegistry: true,
    mainnetOwnerMustBeTimelock: true,
    stage0EoaOnlyLocalOrTestnet: true,
    feeRecipientReceivesFeesOnly: true,
  },
  mvp: MVP_GOVERNANCE,
};

/** @deprecated Prefer assertMvpGovernanceConfigured — kept name for older call sites. */
export function assertGovernanceSignersTbd(
  config: GovernanceScaffoldingConfig = GOVERNANCE_SCAFFOLDING,
): void {
  if (config.multisig.signersTbd) {
    throw new Error("MVP signers must be configured");
  }
  if (config.multisig.threshold !== 2 || config.multisig.size !== 3) {
    throw new Error("MVP production multisig must be 2-of-3");
  }
  if (config.multisig.signerAddresses.length !== 3) {
    throw new Error("MVP requires 3 configured signer addresses");
  }
  if (config.timelockMinDelaySeconds !== STABLE_CLUB_TIMELOCK_SECONDS) {
    throw new Error("Timelock delay must be 48 hours");
  }
}

/**
 * Local/test helper: build proposer/executor arrays for TimelockController.
 * MVP production wiring: Safe is proposer + executor (+ temporary admin).
 */
export function buildTimelockRoleArrays(params: {
  proposer?: `0x${string}`;
  executor?: `0x${string}`;
  admin?: `0x${string}`;
}): {
  proposers: `0x${string}`[];
  executors: `0x${string}`[];
  admin: `0x${string}`;
  minDelay: number;
} {
  if (!params.proposer || !params.executor || !params.admin) {
    throw new Error(
      "Timelock role addresses must be supplied explicitly (MVP Safe for production)",
    );
  }
  return {
    proposers: [params.proposer],
    executors: [params.executor],
    admin: params.admin,
    minDelay: STABLE_CLUB_TIMELOCK_SECONDS,
  };
}
