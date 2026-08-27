import type { Address, Hex } from "viem";

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
