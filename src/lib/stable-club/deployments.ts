import type { Address, Hex } from "viem";
import type { VerifiedClAdapterDeployment } from "@/lib/stable-club/nft-approval";

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
};

const ZERO = "0x0000000000000000000000000000000000000000";

export function isValidLocalDeployments(
  value: StableClubLocalDeployments | null,
): value is StableClubLocalDeployments {
  if (!value?.isTestOnly) return false;
  return (
    value.executor !== ZERO &&
    value.permissionRegistry !== ZERO &&
    value.testAdapter !== ZERO &&
    value.usdc !== ZERO
  );
}

/** Return verified Step 2 adapters for a chain (empty if none configured). */
export function verifiedStep2Adapters(
  deployments: StableClubLocalDeployments | null | undefined,
): VerifiedClAdapterDeployment[] {
  if (!deployments?.step2Adapters?.length) return [];
  return deployments.step2Adapters.filter(
    (a) =>
      a.chainId === deployments.chainId &&
      a.adapter !== ZERO &&
      a.npm !== ZERO &&
      Boolean(a.poolId),
  );
}
