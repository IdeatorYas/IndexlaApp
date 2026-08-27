/**
 * Capped Base mainnet MVP governance — public addresses only.
 * Never store private keys or seed phrases in this module or elsewhere in-repo.
 */
import type { Address } from "viem";
import { getAddress, isAddress } from "viem";

export const MVP_TIMELOCK_SECONDS = 48 * 60 * 60;
export const MVP_CHAIN_ID = 8453 as const;

/** Governance Safe (Base). Verified on-chain: threshold 2, three owners below. */
export const MVP_GOVERNANCE_SAFE = getAddress(
  "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910",
) as Address;

export const MVP_SIGNERS = [
  getAddress("0x977e7055D097bE5924fBdAd7e5a330405820f168"),
  getAddress("0xd31a835ec10932919e7Dd471e915F1cF97d98f1b"),
  getAddress("0xF133d2AafD456359A6e2c9F0492c19aEDF7E8720"),
] as const satisfies readonly Address[];

/** INDEXLA fee wallet — receives fees only; never protocol owner/admin. */
export const MVP_FEE_RECIPIENT = getAddress(
  "0x9d269f7A3d3f781740081D35F086D68a4a21442D",
) as Address;

export const MVP_MULTISIG_THRESHOLD = 2;
export const MVP_MULTISIG_SIZE = 3;

export type MvpGovernanceConfig = {
  chainId: typeof MVP_CHAIN_ID;
  multisig: {
    safeAddress: Address;
    threshold: typeof MVP_MULTISIG_THRESHOLD;
    size: typeof MVP_MULTISIG_SIZE;
    signerAddresses: readonly Address[];
    signersTbd: false;
  };
  timelock: {
    minDelaySeconds: typeof MVP_TIMELOCK_SECONDS;
    /** Safe is sole proposer / executor / canceller controller of the Timelock. */
    controlledBySafe: true;
    /** Timelock address filled after deploy — null until then. */
    timelockAddress: Address | null;
  };
  ownership: {
    /** All protocol admin `owner` roles must be the Timelock. */
    protocolOwnerIsTimelock: true;
    noProductionAdminEoa: true;
  };
  feeRecipient: {
    address: Address;
    receivesIndexlaFeesOnly: true;
    neverProtocolOwner: true;
  };
};

export const MVP_GOVERNANCE: MvpGovernanceConfig = {
  chainId: MVP_CHAIN_ID,
  multisig: {
    safeAddress: MVP_GOVERNANCE_SAFE,
    threshold: MVP_MULTISIG_THRESHOLD,
    size: MVP_MULTISIG_SIZE,
    signerAddresses: MVP_SIGNERS,
    signersTbd: false,
  },
  timelock: {
    minDelaySeconds: MVP_TIMELOCK_SECONDS,
    controlledBySafe: true,
    timelockAddress: null,
  },
  ownership: {
    protocolOwnerIsTimelock: true,
    noProductionAdminEoa: true,
  },
  feeRecipient: {
    address: MVP_FEE_RECIPIENT,
    receivesIndexlaFeesOnly: true,
    neverProtocolOwner: true,
  },
};

export function assertValidBaseAddress(value: string, label: string): Address {
  if (!isAddress(value)) throw new Error(`Invalid address for ${label}`);
  const checksummed = getAddress(value);
  if (checksummed === "0x0000000000000000000000000000000000000000") {
    throw new Error(`${label} must be non-zero`);
  }
  return checksummed;
}

export function assertMvpGovernanceConfigured(
  config: MvpGovernanceConfig = MVP_GOVERNANCE,
): void {
  assertValidBaseAddress(config.multisig.safeAddress, "governance Safe");
  assertValidBaseAddress(config.feeRecipient.address, "fee recipient");
  if (config.multisig.threshold !== 2 || config.multisig.size !== 3) {
    throw new Error("MVP governance must be 2-of-3");
  }
  if (config.multisig.signerAddresses.length !== 3) {
    throw new Error("MVP requires exactly 3 signer addresses");
  }
  if (config.multisig.signersTbd) {
    throw new Error("MVP signers must be configured (not TBD)");
  }
  const unique = new Set(config.multisig.signerAddresses.map((a) => a.toLowerCase()));
  if (unique.size !== 3) throw new Error("MVP signers must be unique");
  for (const [i, s] of config.multisig.signerAddresses.entries()) {
    assertValidBaseAddress(s, `signer ${i + 1}`);
  }
  if (config.timelock.minDelaySeconds !== MVP_TIMELOCK_SECONDS) {
    throw new Error("Timelock delay must be 48 hours");
  }
  if (
    config.feeRecipient.address.toLowerCase() === config.multisig.safeAddress.toLowerCase()
  ) {
    throw new Error("Fee recipient must not be the governance Safe");
  }
  if (
    config.multisig.signerAddresses.some(
      (s) => s.toLowerCase() === config.feeRecipient.address.toLowerCase(),
    )
  ) {
    throw new Error("Fee recipient must not be a governance signer");
  }
}

/** Timelock roles for MVP: Safe proposes and executes; Safe is temporary admin. */
export function buildMvpTimelockRoleArrays(safeAddress: Address = MVP_GOVERNANCE_SAFE): {
  proposers: Address[];
  executors: Address[];
  admin: Address;
  minDelay: number;
} {
  return {
    proposers: [safeAddress],
    executors: [safeAddress],
    admin: safeAddress,
    minDelay: MVP_TIMELOCK_SECONDS,
  };
}

/**
 * Reject accidental secret material in governance config objects.
 * Public addresses only.
 */
export function assertNoPrivateKeyMaterial(obj: unknown): void {
  const forbidden = /privatekey|private_key|seedphrase|seed_phrase|mnemonic|secretkey|secret_key/i;
  const walk = (v: unknown, path: string): void => {
    if (v == null) return;
    if (typeof v === "string") {
      if (forbidden.test(path) || forbidden.test(v)) {
        throw new Error(`Forbidden secret material at ${path}`);
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (forbidden.test(k)) throw new Error(`Forbidden key ${k}`);
        walk(val, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(obj, "");
}

/** Pure threshold check used by tests and UI (does not touch chain). */
export function canExecuteWithConfirmations(params: {
  threshold: number;
  confirmations: number;
}): boolean {
  return params.confirmations >= params.threshold && params.confirmations > 0;
}
