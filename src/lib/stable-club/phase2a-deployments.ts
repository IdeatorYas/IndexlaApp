/**
 * Phase 2a/2b local deployment payload — CL five-pool stack.
 * Does not invent addresses; validates generated JSON shape only.
 */
import type { Address, Hex } from "viem";
import {
  assertLocalHardhatDeploymentIdentity,
  assertLocalMockPermit2Allowed,
} from "@/lib/stable-club/chain-isolation";
import { isNonZeroAddress, ZERO_ADDRESS } from "@/lib/stable-club/nft-approval";

export type Phase2aAdapterDeployment = {
  poolId: Hex;
  protocol: string;
  adapter: Address;
  tokenA: Address;
  tokenB: Address;
  factory: Address;
  npm: Address;
  router: Address;
};

export type Phase2aRouteDeployment = {
  name: string;
  routeId: Hex;
  enabled: boolean;
};

export type StableClubPhase2aDeployments = {
  chainId: number;
  network: string;
  isTestOnly: true;
  label: string;
  deployedAt: string;
  deployer: Address;
  testUser: Address;
  feeRecipient: Address;
  permissionRegistry: Address;
  strategyRegistry: Address;
  feeRouter: Address;
  swapRouter: Address;
  clExecutor: Address;
  oracleGuard: Address;
  mevGuard: Address;
  safetyController: Address;
  permit2: Address;
  canonicalBasePermit2: Address;
  usdc: Address;
  cbbtc: Address;
  weth: Address;
  poolIds: Hex[];
  adapters: Phase2aAdapterDeployment[];
  routes: Phase2aRouteDeployment[];
  strategyKind: Hex;
  rpcUrl?: string;
  /**
   * Trusted earliest block for NFT Transfer log discovery (must be > 0).
   * Required on non-local networks; optional on hardhat-local 31337 (defaults to 1).
   */
  discoveryStartBlock?: number | string;
};

export function isValidPhase2aDeployments(
  value: StableClubPhase2aDeployments | null | undefined,
): value is StableClubPhase2aDeployments {
  if (!value?.isTestOnly) return false;
  if (value.adapters?.length !== 5 || value.poolIds?.length !== 5) return false;
  const required: (keyof StableClubPhase2aDeployments)[] = [
    "permissionRegistry",
    "strategyRegistry",
    "feeRouter",
    "swapRouter",
    "clExecutor",
    "oracleGuard",
    "mevGuard",
    "safetyController",
    "permit2",
    "usdc",
    "cbbtc",
    "weth",
  ];
  for (const key of required) {
    const addr = value[key];
    if (typeof addr !== "string" || !isNonZeroAddress(addr as Address)) return false;
  }
  for (const a of value.adapters) {
    if (!isNonZeroAddress(a.adapter) || a.adapter === ZERO_ADDRESS) return false;
    if (!isNonZeroAddress(a.tokenA) || !isNonZeroAddress(a.tokenB)) return false;
  }
  try {
    assertLocalHardhatDeploymentIdentity({
      chainId: value.chainId,
      network: value.network,
      isTestOnly: value.isTestOnly,
    });
    assertLocalMockPermit2Allowed({
      chainId: value.chainId,
      network: value.network,
      permit2: value.permit2,
      isTestOnly: value.isTestOnly,
    });
  } catch {
    return false;
  }
  return true;
}

/** Public API payload — no deployer/testUser secrets beyond addresses already on-chain. */
export type StableClubPhase2aPublicDeployments = Omit<
  StableClubPhase2aDeployments,
  "deployer" | "testUser"
> & {
  rpcUrl: string;
};

export function toPublicPhase2aDeploymentsPayload(
  deployments: StableClubPhase2aDeployments,
): StableClubPhase2aPublicDeployments {
  assertLocalHardhatDeploymentIdentity({
    chainId: deployments.chainId,
    network: deployments.network,
    isTestOnly: deployments.isTestOnly,
  });
  assertLocalMockPermit2Allowed({
    chainId: deployments.chainId,
    network: deployments.network,
    permit2: deployments.permit2,
    isTestOnly: deployments.isTestOnly,
  });
  return {
    chainId: deployments.chainId,
    network: deployments.network,
    isTestOnly: deployments.isTestOnly,
    label: deployments.label,
    deployedAt: deployments.deployedAt,
    feeRecipient: deployments.feeRecipient,
    permissionRegistry: deployments.permissionRegistry,
    strategyRegistry: deployments.strategyRegistry,
    feeRouter: deployments.feeRouter,
    swapRouter: deployments.swapRouter,
    clExecutor: deployments.clExecutor,
    oracleGuard: deployments.oracleGuard,
    mevGuard: deployments.mevGuard,
    safetyController: deployments.safetyController,
    permit2: deployments.permit2,
    canonicalBasePermit2: deployments.canonicalBasePermit2,
    usdc: deployments.usdc,
    cbbtc: deployments.cbbtc,
    weth: deployments.weth,
    poolIds: deployments.poolIds,
    adapters: deployments.adapters,
    routes: deployments.routes,
    strategyKind: deployments.strategyKind,
    rpcUrl: deployments.rpcUrl ?? "http://127.0.0.1:8545",
    ...(deployments.discoveryStartBlock !== undefined
      ? { discoveryStartBlock: deployments.discoveryStartBlock }
      : {}),
  };
}

export function isValidPhase2aPublicDeployments(
  value: StableClubPhase2aPublicDeployments | null | undefined,
): value is StableClubPhase2aPublicDeployments {
  return isValidPhase2aDeployments(value as StableClubPhase2aDeployments | null);
}

/**
 * Earliest confirmed contract-deployment receipt block for NFT log discovery.
 * Never returns 0; throws if no valid receipt blocks are provided.
 */
export function earliestDiscoveryStartBlock(
  receiptBlockNumbers: readonly (number | bigint | string)[],
): number {
  if (receiptBlockNumbers.length === 0) {
    throw new Error("discoveryStartBlock requires at least one deployment receipt block");
  }
  let min: number | null = null;
  for (const raw of receiptBlockNumbers) {
    const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid deployment receipt block: ${String(raw)}`);
    }
    if (min === null || n < min) min = n;
  }
  return min!;
}
