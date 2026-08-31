import { getAddress, type Address, type Hex } from "viem";
import type { OpenServProposal } from "@/lib/stable-club/openserv";
import {
  STABLE_CLUB_PERMISSION_ACTION_BITS,
  type StableClubPermissionScope,
} from "@/lib/stable-club/permissions";

export type HarvestValidationCode =
  | "ok"
  | "opt-in-disabled"
  | "missing-automation-executor"
  | "missing-permission-registry"
  | "missing-deployments"
  | "launch-harvest-disabled"
  | "wrong-chain"
  | "wrong-user"
  | "permission-not-registered"
  | "permission-revoked"
  | "permission-paused"
  | "permission-expired"
  | "harvest-not-allowed"
  | "wrong-pool-id"
  | "invalid-position-token-id"
  | "missing-adapter"
  | "proposal-null"
  | "proposal-user-mismatch"
  | "proposal-pool-mismatch"
  | "proposal-action-mismatch"
  | "fees-below-gas"
  | "circuit-open"
  | "duplicate-idempotency"
  | "rate-limited"
  | "arbitrary-calldata-forbidden";

export type HarvestValidationResult =
  | { ok: true }
  | { ok: false; code: HarvestValidationCode; reason: string };

export type OnChainPermissionSnapshot = {
  user: Address;
  chainId: bigint;
  poolId: Hex;
  tokenA: Address;
  tokenB: Address;
  allowedActions: bigint;
  expiresAt: bigint;
  revoked: boolean;
  paused: boolean;
};

export function permissionMaskIncludesHarvest(allowedActions: bigint): boolean {
  return (allowedActions & BigInt(STABLE_CLUB_PERMISSION_ACTION_BITS.harvest)) !== BigInt(0);
}

export function buildHarvestOptInPermissionScope(input: {
  user: Address;
  chainId: number;
  poolId: Hex;
  tokenA: Address;
  tokenB: Address;
  expiresAtSec?: number;
}): StableClubPermissionScope {
  const now = Math.floor(Date.now() / 1000);
  return {
    user: input.user,
    chainId: input.chainId,
    poolId: input.poolId,
    tokenA: input.tokenA,
    tokenB: input.tokenB,
    allowedActions: ["harvest", "pause-automation", "revoke-permission", "emergency-exit"],
    maxAmountPerTx: BigInt(0),
    maxAmountPerDay: BigInt(0),
    maxSlippageBps: 0,
    minTimeBetweenExecutionsSec: 0,
    maxExecutionsPerDay: 50,
    expiresAt: input.expiresAtSec ?? now + 60 * 60 * 24 * 30,
  };
}

export function validateHarvestPermissionSnapshot(
  perm: OnChainPermissionSnapshot,
  expected: {
    user: Address;
    chainId: number;
    poolId: Hex;
  },
  nowSec: number,
): HarvestValidationResult {
  if (perm.user.toLowerCase() !== expected.user.toLowerCase()) {
    return { ok: false, code: "wrong-user", reason: "Permission user mismatch" };
  }
  if (Number(perm.chainId) !== expected.chainId) {
    return { ok: false, code: "wrong-chain", reason: "Permission chainId mismatch" };
  }
  if (perm.poolId.toLowerCase() !== expected.poolId.toLowerCase()) {
    return { ok: false, code: "wrong-pool-id", reason: "Permission poolId mismatch" };
  }
  if (perm.revoked) {
    return { ok: false, code: "permission-revoked", reason: "Permission revoked" };
  }
  if (perm.paused) {
    return { ok: false, code: "permission-paused", reason: "Permission paused" };
  }
  if (Number(perm.expiresAt) <= nowSec) {
    return { ok: false, code: "permission-expired", reason: "Permission expired" };
  }
  if (!permissionMaskIncludesHarvest(perm.allowedActions)) {
    return { ok: false, code: "harvest-not-allowed", reason: "Harvest action not permitted" };
  }
  return { ok: true };
}

export function validateHarvestProposalBinding(
  proposal: OpenServProposal,
  expected: {
    user: Address;
    permissionId: Hex;
    poolId: Hex;
    positionTokenId: string;
  },
): HarvestValidationResult {
  if (proposal.action !== "harvest") {
    return { ok: false, code: "proposal-action-mismatch", reason: "Not a harvest proposal" };
  }
  if (proposal.user.toLowerCase() !== expected.user.toLowerCase()) {
    return { ok: false, code: "proposal-user-mismatch", reason: "Proposal user mismatch" };
  }
  if (proposal.permissionId.toLowerCase() !== expected.permissionId.toLowerCase()) {
    return {
      ok: false,
      code: "proposal-pool-mismatch",
      reason: "Proposal permissionId mismatch",
    };
  }
  if (proposal.poolId.toLowerCase() !== expected.poolId.toLowerCase()) {
    return { ok: false, code: "proposal-pool-mismatch", reason: "Proposal poolId mismatch" };
  }
  if (proposal.positionTokenId !== expected.positionTokenId) {
    return {
      ok: false,
      code: "invalid-position-token-id",
      reason: "Proposal positionTokenId mismatch",
    };
  }
  return { ok: true };
}

export function parsePositionTokenId(value: string): bigint | null {
  if (!/^\d+$/.test(value) || value.length === 0) return null;
  try {
    const n = BigInt(value);
    if (n <= BigInt(0)) return null;
    return n;
  } catch {
    return null;
  }
}

export function sortedTokenPair(tokenA: Address, tokenB: Address): readonly [Address, Address] {
  return getAddress(tokenA).toLowerCase() < getAddress(tokenB).toLowerCase()
    ? [getAddress(tokenA), getAddress(tokenB)]
    : [getAddress(tokenB), getAddress(tokenA)];
}
