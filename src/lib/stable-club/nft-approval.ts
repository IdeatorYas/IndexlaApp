import type { Address } from "viem";

/**
 * Per-position ERC721 approval helpers for Stable Club automation.
 * Protocol requires `npm.approve(adapter, tokenId)` — never `setApprovalForAll`.
 */

export type NpmApprovalStatus = "required" | "approved" | "unavailable";

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

/** Resolve approval status from on-chain getApproved(tokenId). Does not consult setApprovalForAll. */
export function resolvePerTokenApprovalStatus(params: {
  adapter: Address | null | undefined;
  approvedSpender: Address | null | undefined;
}): NpmApprovalStatus {
  const { adapter, approvedSpender } = params;
  if (!adapter || adapter === "0x0000000000000000000000000000000000000000") {
    return "unavailable";
  }
  if (!approvedSpender) return "required";
  if (approvedSpender.toLowerCase() === adapter.toLowerCase()) return "approved";
  return "required";
}

/** Build the only allowed approval tx: ERC721 approve(adapter, tokenId). */
export function buildPerTokenApproveTx(params: {
  npm: Address;
  adapter: Address;
  tokenId: bigint;
}) {
  if (params.adapter === "0x0000000000000000000000000000000000000000") {
    throw new Error("adapter required for per-token NFT approval");
  }
  return {
    address: params.npm,
    abi: erc721PositionAbi,
    functionName: "approve" as const,
    args: [params.adapter, params.tokenId] as const,
  };
}

/** Gate harvest / compound / rebalance until per-token approval is present. */
export function automationRequiresNftApproval(
  status: NpmApprovalStatus,
): boolean {
  return status !== "approved";
}

/** Explicitly reject unlimited operator approvals in the UI layer. */
export function isForbiddenApprovalMethod(method: string): boolean {
  return method === "setApprovalForAll";
}
