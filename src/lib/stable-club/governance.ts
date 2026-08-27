/**
 * Multisig-compatible governance configuration scaffolding.
 * Production signer addresses remain TBD — never invent or hardcode them.
 */

export const STABLE_CLUB_TIMELOCK_SECONDS = 48 * 60 * 60;
export const STABLE_CLUB_MULTISIG_THRESHOLD = 3;
export const STABLE_CLUB_MULTISIG_SIZE = 5;

export type GovernanceSignerConfig = {
  /** Always true in-repo until founder supplies addresses via secure, non-committed channel. */
  signersTbd: true;
  threshold: typeof STABLE_CLUB_MULTISIG_THRESHOLD;
  size: typeof STABLE_CLUB_MULTISIG_SIZE;
  /** Empty by design. */
  signerAddresses: readonly [];
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
    /** Mainnet: owner/admin = Timelock; Timelock proposers/executors = 3-of-5 Safe. No production admin EOA. */
    mainnetOwnerMustBeTimelock: true;
    stage0EoaOnlyLocalOrTestnet: true;
  };
};

export const GOVERNANCE_SCAFFOLDING: GovernanceScaffoldingConfig = {
  timelockMinDelaySeconds: STABLE_CLUB_TIMELOCK_SECONDS,
  multisig: {
    signersTbd: true,
    threshold: STABLE_CLUB_MULTISIG_THRESHOLD,
    size: STABLE_CLUB_MULTISIG_SIZE,
    signerAddresses: [],
  },
  roles: {
    emergencyGuardianCanPauseImmediately: true,
    unpauseRequiresTimelock: true,
    configChangesRequireTimelock: true,
    coreContractsImmutable: true,
    adaptersReplaceableOnlyViaGovernedRegistry: true,
    mainnetOwnerMustBeTimelock: true,
    stage0EoaOnlyLocalOrTestnet: true,
  },
};

export function assertGovernanceSignersTbd(
  config: GovernanceScaffoldingConfig = GOVERNANCE_SCAFFOLDING,
): void {
  if (!config.multisig.signersTbd || config.multisig.signerAddresses.length > 0) {
    throw new Error("Multisig signer addresses must remain TBD in source");
  }
  if (config.multisig.threshold !== 3 || config.multisig.size !== 5) {
    throw new Error("Production multisig must be 3-of-5");
  }
  if (config.timelockMinDelaySeconds !== STABLE_CLUB_TIMELOCK_SECONDS) {
    throw new Error("Timelock delay must be 48 hours");
  }
}

/**
 * Local/test helper: build proposer/executor arrays for TimelockController.
 * Production must inject real multisig address — never default it here.
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
      "Timelock role addresses must be supplied explicitly (multisig TBD in production)",
    );
  }
  return {
    proposers: [params.proposer],
    executors: [params.executor],
    admin: params.admin,
    minDelay: STABLE_CLUB_TIMELOCK_SECONDS,
  };
}
