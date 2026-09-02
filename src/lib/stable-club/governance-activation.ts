/**
 * Fail-closed governance activation preflight for Stable Club mainnet cutover.
 * Validates Timelock ownership, Safe/Timelock contract code, Safe Timelock roles,
 * and on-chain delay vs configured minimum. Does not deploy or transfer ownership.
 */
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";
import { MVP_GOVERNANCE_SAFE } from "@/lib/stable-club/mvp-governance";

export const CRITICAL_OWNABLE_CONTRACT_KEYS = [
  "permissionRegistry",
  "feeRouter",
  "executor",
  "oracleGuard",
  "mevGuard",
  "safetyController",
  "openServGate",
  "automation",
] as const;

export type CriticalOwnableContractKey = (typeof CRITICAL_OWNABLE_CONTRACT_KEYS)[number];

export type CriticalContractAddresses = Partial<Record<CriticalOwnableContractKey, Address>>;

export type GovernanceActivationPreflightCode =
  | "invalid-safe-address"
  | "invalid-timelock-address"
  | "missing-safe"
  | "missing-timelock"
  | "zero-safe"
  | "zero-timelock"
  | "safe-mismatch"
  | "safe-not-contract"
  | "timelock-not-contract"
  | "missing-critical-contract"
  | "zero-critical-contract"
  | "owner-mismatch"
  | "safe-missing-proposer-role"
  | "safe-missing-executor-role"
  | "timelock-delay-below-minimum";

export type GovernanceActivationPreflightResult =
  | { ok: true }
  | { ok: false; code: GovernanceActivationPreflightCode; reason: string };

export type GovernanceActivationPreflightClient = {
  getBytecode: (args: { address: Address }) => Promise<Hex | undefined>;
  readContract: (args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
};

export type GovernanceActivationPreflightInput = {
  /** Configured governance Safe — must match on-chain wiring (MVP Safe on Base). */
  expectedSafeAddress?: Address;
  governanceSafeAddress: Address | null | undefined;
  timelockAddress: Address | null | undefined;
  /** Configured minimum delay (seconds) — on-chain delay must be >= this. */
  minDelaySeconds?: number;
  /** Listed critical contracts whose `owner()` must equal the Timelock. */
  criticalContracts: CriticalContractAddresses;
  publicClient: GovernanceActivationPreflightClient;
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const ownableAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const timelockControllerAbi = [
  {
    type: "function",
    name: "getMinDelay",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "PROPOSER_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "EXECUTOR_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

function normalizeAddress(value: Address | null | undefined): Address | null {
  if (value == null) return null;
  if (!isAddress(value)) return null;
  const checksummed = getAddress(value);
  if (checksummed.toLowerCase() === ZERO.toLowerCase()) return null;
  return checksummed;
}

export function addressHasContractCode(bytecode: Hex | undefined): boolean {
  if (!bytecode || bytecode === "0x") return false;
  return bytecode.length > 2;
}

async function readOwner(
  publicClient: GovernanceActivationPreflightClient,
  contract: Address,
): Promise<Address> {
  const owner = (await publicClient.readContract({
    address: contract,
    abi: ownableAbi,
    functionName: "owner",
  })) as Address;
  return getAddress(owner);
}

export async function runGovernanceActivationPreflight(
  input: GovernanceActivationPreflightInput,
): Promise<GovernanceActivationPreflightResult> {
  const expectedSafe = normalizeAddress(input.expectedSafeAddress ?? MVP_GOVERNANCE_SAFE);
  const safe = normalizeAddress(input.governanceSafeAddress);
  const timelock = normalizeAddress(input.timelockAddress);
  const minDelay =
    input.minDelaySeconds ?? PRIVATE_BETA_LAUNCH_PARAMS.governance.timelockSeconds;

  if (input.governanceSafeAddress == null) {
    return { ok: false, code: "missing-safe", reason: "Governance Safe address is required" };
  }
  if (input.timelockAddress == null) {
    return { ok: false, code: "missing-timelock", reason: "Timelock address is required" };
  }
  if (!isAddress(input.governanceSafeAddress)) {
    return { ok: false, code: "invalid-safe-address", reason: "Governance Safe address is invalid" };
  }
  if (!isAddress(input.timelockAddress)) {
    return {
      ok: false,
      code: "invalid-timelock-address",
      reason: "Timelock address is invalid",
    };
  }
  if (!safe) {
    return { ok: false, code: "zero-safe", reason: "Governance Safe must be non-zero" };
  }
  if (!timelock) {
    return { ok: false, code: "zero-timelock", reason: "Timelock must be non-zero" };
  }
  if (expectedSafe && safe.toLowerCase() !== expectedSafe.toLowerCase()) {
    return {
      ok: false,
      code: "safe-mismatch",
      reason: "Governance Safe does not match configured MVP Safe",
    };
  }

  const safeBytecode = await input.publicClient.getBytecode({ address: safe });
  if (!addressHasContractCode(safeBytecode)) {
    return {
      ok: false,
      code: "safe-not-contract",
      reason: "Configured Safe must contain contract code (EOA rejected)",
    };
  }

  const timelockBytecode = await input.publicClient.getBytecode({ address: timelock });
  if (!addressHasContractCode(timelockBytecode)) {
    return {
      ok: false,
      code: "timelock-not-contract",
      reason: "Configured Timelock must contain contract code (EOA rejected)",
    };
  }

  for (const key of CRITICAL_OWNABLE_CONTRACT_KEYS) {
    const contract = input.criticalContracts[key];
    if (contract == null) {
      return {
        ok: false,
        code: "missing-critical-contract",
        reason: `Critical contract address missing: ${key}`,
      };
    }
    if (!isAddress(contract) || contract.toLowerCase() === ZERO.toLowerCase()) {
      return {
        ok: false,
        code: "zero-critical-contract",
        reason: `Critical contract address must be non-zero: ${key}`,
      };
    }
    const owner = await readOwner(input.publicClient, getAddress(contract));
    if (owner.toLowerCase() !== timelock.toLowerCase()) {
      return {
        ok: false,
        code: "owner-mismatch",
        reason: `${key} owner must equal configured Timelock`,
      };
    }
  }

  const proposerRole = (await input.publicClient.readContract({
    address: timelock,
    abi: timelockControllerAbi,
    functionName: "PROPOSER_ROLE",
  })) as Hex;
  const executorRole = (await input.publicClient.readContract({
    address: timelock,
    abi: timelockControllerAbi,
    functionName: "EXECUTOR_ROLE",
  })) as Hex;

  const safeIsProposer = (await input.publicClient.readContract({
    address: timelock,
    abi: timelockControllerAbi,
    functionName: "hasRole",
    args: [proposerRole, safe],
  })) as boolean;
  if (!safeIsProposer) {
    return {
      ok: false,
      code: "safe-missing-proposer-role",
      reason: "Configured Safe must hold Timelock PROPOSER_ROLE",
    };
  }

  const safeIsExecutor = (await input.publicClient.readContract({
    address: timelock,
    abi: timelockControllerAbi,
    functionName: "hasRole",
    args: [executorRole, safe],
  })) as boolean;
  if (!safeIsExecutor) {
    return {
      ok: false,
      code: "safe-missing-executor-role",
      reason: "Configured Safe must hold Timelock EXECUTOR_ROLE",
    };
  }

  const onChainDelay = (await input.publicClient.readContract({
    address: timelock,
    abi: timelockControllerAbi,
    functionName: "getMinDelay",
  })) as bigint;
  if (onChainDelay < BigInt(minDelay)) {
    return {
      ok: false,
      code: "timelock-delay-below-minimum",
      reason: `Timelock delay ${onChainDelay}s is below configured minimum ${minDelay}s`,
    };
  }

  return { ok: true };
}

export async function assertGovernanceActivationPreflight(
  input: GovernanceActivationPreflightInput,
): Promise<void> {
  const result = await runGovernanceActivationPreflight(input);
  if (!result.ok) {
    throw new Error(`Governance activation blocked: ${result.reason} (${result.code})`);
  }
}
