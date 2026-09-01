/**
 * Runtime deployment parsing — client/API payloads cannot supply test bypass flags.
 */
import type { Address, Hex } from "viem";
import {
  assertLocalHardhatDeploymentIdentity,
  LOCAL_HARDHAT_CHAIN_ID,
  LOCAL_HARDHAT_NETWORK,
} from "@/lib/stable-club/chain-isolation";
import { BASE_CHAIN_ID } from "@/lib/stable-club/verified-base-addresses";
import {
  isValidLocalDeployments,
  verifiedStep2Adapters,
  type StableClubLocalDeployments,
} from "@/lib/stable-club/deployments";
import { isExplicitLocalAutomationBypassAllowed } from "@/lib/stable-club/local-automation-policy";

/** Client-visible local deployments — bypass flags are never accepted from runtime input. */
export type PublicLocalDeployments = Omit<StableClubLocalDeployments, "localAutomationBypass">;

export type LocalDeploymentsApiResponse = {
  configured: true;
  deployments: PublicLocalDeployments;
  /** Server-dev-only attestation; omitted in production builds (dev route 404). */
  automationDevBypass?: true;
};

const FORBIDDEN_RUNTIME_KEYS = ["localAutomationBypass"] as const;

function rejectForbiddenRuntimeKeys(raw: Record<string, unknown>): void {
  for (const key of FORBIDDEN_RUNTIME_KEYS) {
    if (raw[key] === true) {
      throw new Error(`Forbidden client/runtime deployment flag: ${key}`);
    }
  }
}

/**
 * Parse deployments from API/JSON. Forces Hardhat test identity; strips bypass flags.
 */
export function parseClientLocalDeployments(raw: unknown): PublicLocalDeployments | null {
  if (raw == null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  try {
    rejectForbiddenRuntimeKeys(record);
  } catch {
    return null;
  }
  if (record.isTestOnly === false) return null;
  if (record.network != null && record.network !== LOCAL_HARDHAT_NETWORK) return null;
  if (record.chainId != null && Number(record.chainId) === BASE_CHAIN_ID) return null;
  if (record.chainId != null && Number(record.chainId) !== LOCAL_HARDHAT_CHAIN_ID) return null;

  const candidate = {
    ...record,
    isTestOnly: true as const,
    network: LOCAL_HARDHAT_NETWORK,
    chainId: LOCAL_HARDHAT_CHAIN_ID,
  } as StableClubLocalDeployments;

  if (!isValidLocalDeployments(candidate)) return null;

  assertLocalHardhatDeploymentIdentity({
    chainId: candidate.chainId,
    network: candidate.network,
    isTestOnly: true,
  });

  const { localAutomationBypass: _strip, ...publicPayload } = candidate;
  return publicPayload;
}

/**
 * Merge server-dev automation attestation (env-gated on API route only).
 * Production builds never serve the dev route; Base paths never receive this flag.
 */
export function mergeServerAutomationDevBypass(
  deployments: PublicLocalDeployments,
  automationDevBypass: boolean | undefined,
): StableClubLocalDeployments {
  assertLocalHardhatDeploymentIdentity({
    chainId: deployments.chainId,
    network: deployments.network,
    isTestOnly: true,
  });
  return {
    ...deployments,
    isTestOnly: true,
    localAutomationBypass: automationDevBypass === true ? true : undefined,
  };
}

/** Fail closed when runtime tries to smuggle bypass or non-test identity into automation policy. */
export function assertRuntimeAutomationPolicy(deployments: StableClubLocalDeployments | null): void {
  if (!deployments) return;
  assertLocalHardhatDeploymentIdentity({
    chainId: deployments.chainId,
    network: deployments.network,
    isTestOnly: deployments.isTestOnly,
  });
  if (deployments.localAutomationBypass && !isExplicitLocalAutomationBypassAllowed(deployments)) {
    throw new Error("Local automation bypass rejected for this deployment identity");
  }
}

export function buildPublicPayloadFromTrustedFile(
  deployments: StableClubLocalDeployments,
): PublicLocalDeployments {
  assertLocalHardhatDeploymentIdentity({
    chainId: deployments.chainId,
    network: deployments.network,
    isTestOnly: deployments.isTestOnly,
  });
  const { localAutomationBypass: _strip, ...rest } = deployments;
  return {
    ...rest,
    step2Adapters: verifiedStep2Adapters(deployments),
  };
}

export function isServerLocalAutomationDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const flag = process.env.STABLE_CLUB_LOCAL_AUTOMATION_BYPASS?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

export function hydrateLocalDeploymentsFromApi(json: unknown): StableClubLocalDeployments | null {
  if (json == null || typeof json !== "object") return null;
  const body = json as {
    configured?: boolean;
    deployments?: unknown;
    automationDevBypass?: boolean;
  };
  if (!body.configured || body.deployments == null) return null;
  const parsed = parseClientLocalDeployments(body.deployments);
  if (!parsed) return null;
  return mergeServerAutomationDevBypass(parsed, body.automationDevBypass === true);
}

/** Map Phase 2a / Step 3 deployment records to governance critical-contract set. */
export function buildCriticalContractsFromRecord(record: {
  permissionRegistry: Address;
  feeRouter: Address;
  executor: Address;
  oracleGuard: Address;
  mevGuard: Address;
  safetyController: Address;
  openServGate: Address;
  automation: Address;
}): Record<
  "permissionRegistry" | "feeRouter" | "executor" | "oracleGuard" | "mevGuard" | "safetyController" | "openServGate" | "automation",
  Address
> {
  return { ...record };
}

export type MockGovernanceClient = {
  getBytecode: (args: { address: Address }) => Promise<Hex | undefined>;
  readContract: (args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
};
