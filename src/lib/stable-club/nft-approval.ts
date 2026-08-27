/**
 * Per-position ERC721 approval helpers for Stable Club automation.
 * Protocol requires `npm.approve(adapter, tokenId)` — never `setApprovalForAll`.
 */
import type { Address, Hex } from "viem";

export type NpmApprovalStatus = "required" | "approved" | "unavailable";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export const erc721PositionAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getApproved",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/** Verified, chain-specific adapter entry from deployment configuration. */
export type VerifiedClAdapterDeployment = {
  chainId: number;
  poolId: string;
  adapter: Address;
  npm: Address;
};

export function isNonZeroAddress(value: string | null | undefined): value is Address {
  return Boolean(value) && value!.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
}

export function isDeployedBytecode(code: Hex | null | undefined): boolean {
  return Boolean(code) && code !== "0x" && code !== "0x0";
}

/**
 * Resolve adapter/NPM only from verified deployment config for the active chain + pool.
 * Never invents or hardcodes a spender.
 */
export function resolveVerifiedAdapterForPool(params: {
  deployments: VerifiedClAdapterDeployment[] | null | undefined;
  chainId: number | null | undefined;
  poolId: string;
}): VerifiedClAdapterDeployment | null {
  const { deployments, chainId, poolId } = params;
  if (!deployments?.length || chainId == null) return null;
  const match = deployments.find(
    (d) => d.chainId === chainId && d.poolId === poolId && isNonZeroAddress(d.adapter) && isNonZeroAddress(d.npm),
  );
  return match ?? null;
}

export type ApproveEligibility =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Gate the Approve NFT button. Fail closed on any verification miss.
 * Does not allow setApprovalForAll.
 */
export function evaluateApproveEligibility(params: {
  walletAddress: Address | null | undefined;
  walletChainId: number | null | undefined;
  expectedChainId: number;
  nftOwner: Address | null | undefined;
  positionTokenId: string | null | undefined;
  adapter: Address | null | undefined;
  npm: Address | null | undefined;
  adapterBytecode: Hex | null | undefined;
  npmBytecode: Hex | null | undefined;
  fromVerifiedDeployments: boolean;
}): ApproveEligibility {
  const {
    walletAddress,
    walletChainId,
    expectedChainId,
    nftOwner,
    positionTokenId,
    adapter,
    npm,
    adapterBytecode,
    npmBytecode,
    fromVerifiedDeployments,
  } = params;

  if (!walletAddress) return { ok: false, reason: "Wallet not connected" };
  if (walletChainId !== expectedChainId) {
    return { ok: false, reason: `Wrong chain (need ${expectedChainId})` };
  }
  if (!fromVerifiedDeployments) {
    return { ok: false, reason: "Adapter not in verified deployments" };
  }
  if (!isNonZeroAddress(adapter)) return { ok: false, reason: "Missing adapter address" };
  if (!isNonZeroAddress(npm)) return { ok: false, reason: "Missing NPM address" };
  if (!isDeployedBytecode(adapterBytecode)) {
    return { ok: false, reason: "Adapter has no deployed bytecode" };
  }
  if (!isDeployedBytecode(npmBytecode)) {
    return { ok: false, reason: "NPM has no deployed bytecode" };
  }
  if (!positionTokenId || !/^\d+$/.test(positionTokenId)) {
    return { ok: false, reason: "Invalid position tokenId" };
  }
  if (!nftOwner || nftOwner.toLowerCase() !== walletAddress.toLowerCase()) {
    return { ok: false, reason: "Wallet does not own this NFT" };
  }
  return { ok: true };
}

/** Resolve approval status from on-chain getApproved(tokenId). Does not consult setApprovalForAll. */
export function resolvePerTokenApprovalStatus(params: {
  adapter: Address | null | undefined;
  approvedSpender: Address | null | undefined;
}): NpmApprovalStatus {
  const { adapter, approvedSpender } = params;
  if (!isNonZeroAddress(adapter)) return "unavailable";
  if (!approvedSpender) return "required";
  if (approvedSpender.toLowerCase() === adapter.toLowerCase()) return "approved";
  return "required";
}

/**
 * After approve tx: only mark approved when receipt succeeded AND getApproved matches adapter.
 */
export function resolveStatusAfterApproveConfirmation(params: {
  receiptStatus: "success" | "reverted" | "unknown";
  adapter: Address;
  getApprovedSpender: Address | null | undefined;
}): NpmApprovalStatus {
  if (params.receiptStatus !== "success") return "required";
  return resolvePerTokenApprovalStatus({
    adapter: params.adapter,
    approvedSpender: params.getApprovedSpender,
  });
}

/** Build the only allowed approval tx: ERC721 approve(adapter, tokenId). */
export function buildPerTokenApproveTx(params: {
  npm: Address;
  adapter: Address;
  tokenId: bigint;
}) {
  if (!isNonZeroAddress(params.adapter)) {
    throw new Error("adapter required for per-token NFT approval");
  }
  if (!isNonZeroAddress(params.npm)) {
    throw new Error("npm required for per-token NFT approval");
  }
  return {
    address: params.npm,
    abi: erc721PositionAbi,
    functionName: "approve" as const,
    args: [params.adapter, params.tokenId] as const,
  };
}

/** Gate harvest / compound / rebalance until per-token approval is present. */
export function automationRequiresNftApproval(status: NpmApprovalStatus): boolean {
  return status !== "approved";
}

/** Explicitly reject unlimited operator approvals in the UI layer. */
export function isForbiddenApprovalMethod(method: string): boolean {
  return method === "setApprovalForAll";
}
