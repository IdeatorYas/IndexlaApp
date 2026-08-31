import type { Address, Hex } from "viem";
import type { VerifiedClAdapterDeployment } from "@/lib/stable-club/nft-approval";
import { isNonZeroAddress, ZERO_ADDRESS } from "@/lib/stable-club/nft-approval";
import { assertLocalHardhatDeploymentIdentity } from "@/lib/stable-club/chain-isolation";

export type StableClubLocalDeployments = {
  chainId: number;
  network: string;
  isTestOnly: true;
  label: string;
  deployedAt: string;
  deployer: Address;
  testUser: Address;
  feeRecipient: Address;
  permissionRegistry: Address;
  feeRouter: Address;
  executor: Address;
  /** Step 2 automation executor — harvest (local dev / staged rollout). */
  automationExecutor?: Address;
  /** Safety policy reads for harvest preflight (optional). */
  safetyController?: Address;
  testAdapter: Address;
  usdc: Address;
  weth: Address;
  poolId: Hex;
  rpcUrl: string;
  /**
   * Optional Step 2 CL adapters — only entries here may be used as NFT approve spenders.
   * Never hardcode Base mainnet adapters outside this verified registry.
   */
  step2Adapters?: VerifiedClAdapterDeployment[];
  /** Local-only seeded harvest position for dev E2E (optional). */
  harvestDev?: {
    poolCatalogueId: string;
    poolIdHash: Hex;
    adapter: Address;
    npm: Address;
    positionTokenId: string;
    testUser: Address;
  };
};

const ZERO = ZERO_ADDRESS;

export function isValidLocalDeployments(
  value: StableClubLocalDeployments | null,
): value is StableClubLocalDeployments {
  if (!value?.isTestOnly) return false;
  if (
    value.executor === ZERO ||
    value.permissionRegistry === ZERO ||
    value.testAdapter === ZERO ||
    value.usdc === ZERO
  ) {
    return false;
  }
  try {
    assertLocalHardhatDeploymentIdentity({
      chainId: value.chainId,
      network: value.network,
      isTestOnly: value.isTestOnly,
    });
  } catch {
    return false;
  }
  return true;
}

/**
 * Return verified Step 2 adapters for a chain.
 * Rejects missing, zero, or wrong-chain entries. Bytecode is checked at approve time.
 */
export function verifiedStep2Adapters(
  deployments:
    | Pick<StableClubLocalDeployments, "chainId" | "step2Adapters">
    | null
    | undefined,
): VerifiedClAdapterDeployment[] {
  if (!deployments?.step2Adapters?.length) return [];
  return deployments.step2Adapters.filter(
    (a) =>
      a != null &&
      a.chainId === deployments.chainId &&
      isNonZeroAddress(a.adapter) &&
      isNonZeroAddress(a.npm) &&
      typeof a.poolId === "string" &&
      a.poolId.length > 0,
  );
}

/**
 * Public API payload for GET /api/stable-club/deployments.
 * Always includes chain-filtered `step2Adapters` (may be empty).
 */
export function toPublicDeploymentsPayload(deployments: StableClubLocalDeployments): {
  chainId: number;
  network: string;
  isTestOnly: true;
  label: string;
  deployedAt: string;
  permissionRegistry: Address;
  feeRouter: Address;
  executor: Address;
  automationExecutor?: Address;
  safetyController?: Address;
  testAdapter: Address;
  usdc: Address;
  weth: Address;
  poolId: Hex;
  rpcUrl: string;
  step2Adapters: VerifiedClAdapterDeployment[];
  harvestDev?: StableClubLocalDeployments["harvestDev"];
} {
  assertLocalHardhatDeploymentIdentity({
    chainId: deployments.chainId,
    network: deployments.network,
    isTestOnly: deployments.isTestOnly,
  });
  return {
    chainId: deployments.chainId,
    network: deployments.network,
    isTestOnly: deployments.isTestOnly,
    label: deployments.label,
    deployedAt: deployments.deployedAt,
    permissionRegistry: deployments.permissionRegistry,
    feeRouter: deployments.feeRouter,
    executor: deployments.executor,
    automationExecutor: deployments.automationExecutor,
    safetyController: deployments.safetyController,
    testAdapter: deployments.testAdapter,
    usdc: deployments.usdc,
    weth: deployments.weth,
    poolId: deployments.poolId,
    rpcUrl: deployments.rpcUrl,
    step2Adapters: verifiedStep2Adapters(deployments),
    harvestDev: deployments.harvestDev,
  };
}
