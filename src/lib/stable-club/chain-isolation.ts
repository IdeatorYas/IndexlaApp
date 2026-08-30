/**
 * SC-F02 — Chain / environment isolation for Stable Club.
 *
 * Browser and local Hardhat use chainId 31337.
 * Base mainnet is always 8453 and always uses canonical Permit2.
 * Local deployment JSON must never be treated as Base.
 */
import type { Address } from "viem";
import { BASE_CHAIN_ID, isCanonicalBasePermit2 } from "@/lib/stable-club/verified-base-addresses";
import type { DeploymentEnvironment } from "@/lib/stable-club/production-guards";

export const LOCAL_HARDHAT_CHAIN_ID = 31337 as const;
export const LOCAL_HARDHAT_NETWORK = "hardhat-local" as const;

export type LocalDeploymentIdentity = {
  chainId: number;
  network: string;
  isTestOnly: boolean;
};

export function isLocalHardhatNetwork(network: string | null | undefined): boolean {
  return network === LOCAL_HARDHAT_NETWORK;
}

export function isLocalHardhatChainId(chainId: number | null | undefined): boolean {
  return chainId === LOCAL_HARDHAT_CHAIN_ID;
}

/**
 * Dev-only local deployment payloads must declare Hardhat identity (31337 + hardhat-local).
 * Rejects Base chainId 8453 and any other mismatch — fail closed.
 */
export function assertLocalHardhatDeploymentIdentity(params: LocalDeploymentIdentity): void {
  if (!params.isTestOnly) {
    throw new Error("Local deployment payload must set isTestOnly=true");
  }
  if (!isLocalHardhatNetwork(params.network)) {
    throw new Error(
      `Local deployment network must be "${LOCAL_HARDHAT_NETWORK}", got "${params.network}"`,
    );
  }
  if (params.chainId === BASE_CHAIN_ID) {
    throw new Error(
      "Local Hardhat deployment payload rejected on Base chainId 8453 — use chainId 31337",
    );
  }
  if (!isLocalHardhatChainId(params.chainId)) {
    throw new Error(
      `Local Hardhat deployment chainId must be ${LOCAL_HARDHAT_CHAIN_ID}, got ${params.chainId}`,
    );
  }
}

/**
 * Reject mismatches among wallet chain, deployment payload, and selected environment.
 */
export function assertChainEnvironmentMatch(params: {
  walletChainId: number | null | undefined;
  deploymentChainId: number;
  network?: string | null;
  environment?: DeploymentEnvironment | null;
  permit2?: Address | null;
}): void {
  const { walletChainId, deploymentChainId, network, environment, permit2 } = params;

  if (walletChainId == null) {
    throw new Error("Wallet chainId is required");
  }
  if (walletChainId !== deploymentChainId) {
    throw new Error(
      `Chain mismatch: wallet=${walletChainId} deployment=${deploymentChainId}`,
    );
  }

  if (walletChainId === BASE_CHAIN_ID && isLocalHardhatNetwork(network)) {
    throw new Error("Base wallet must not consume local Hardhat deployment JSON");
  }

  if (isLocalHardhatNetwork(network)) {
    assertLocalHardhatDeploymentIdentity({
      chainId: deploymentChainId,
      network: network!,
      isTestOnly: true,
    });
    if (environment === "mainnet") {
      throw new Error("Local Hardhat deployments cannot be used under mainnet environment");
    }
  }

  if (deploymentChainId === BASE_CHAIN_ID) {
    if (environment === "local") {
      throw new Error("Base chainId 8453 cannot be paired with local environment");
    }
    if (permit2 != null && !isCanonicalBasePermit2(permit2)) {
      throw new Error("Non-canonical Permit2 rejected on Base chainId 8453");
    }
  }

  if (
    environment === "mainnet" &&
    (deploymentChainId !== BASE_CHAIN_ID || walletChainId !== BASE_CHAIN_ID)
  ) {
    throw new Error("Mainnet environment requires Base chainId 8453");
  }
}

/**
 * Local Hardhat may use an explicit mock Permit2 only on chain 31337 under the local network gate.
 * Base 8453 never accepts a mock — callers must use resolvePermit2Address.
 */
export function assertLocalMockPermit2Allowed(params: {
  chainId: number;
  network: string;
  permit2: Address;
  isTestOnly: boolean;
}): void {
  assertLocalHardhatDeploymentIdentity({
    chainId: params.chainId,
    network: params.network,
    isTestOnly: params.isTestOnly,
  });
  if (isCanonicalBasePermit2(params.permit2)) {
    throw new Error(
      "Local Hardhat must declare its MockPermit2 address — canonical Base Permit2 is not valid on 31337",
    );
  }
}
