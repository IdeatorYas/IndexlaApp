import type { Address, Hex } from "viem";
import {
  STABLE_CLUB_PERMISSION_ACTION_BITS,
  type StableClubPermissionScope,
} from "@/lib/stable-club/permissions";
import type { RebalanceProposalFields } from "@/lib/stable-club/openserv";
import type { OnChainPermissionSnapshot } from "@/lib/stable-club/compound-validation";

export type RebalanceValidationCode =
  | "ok"
  | "opt-in-disabled"
  | "missing-automation-executor"
  | "missing-permission-registry"
  | "missing-deployments"
  | "launch-rebalance-disabled"
  | "wrong-chain"
  | "wrong-user"
  | "permission-not-registered"
  | "permission-revoked"
  | "permission-paused"
  | "permission-expired"
  | "rebalance-not-allowed"
  | "wrong-pool-id"
  | "invalid-position-token-id"
  | "missing-adapter"
  | "proposal-null"
  | "proposal-user-mismatch"
  | "proposal-pool-mismatch"
  | "proposal-binding-mismatch"
  | "invalid-tick-range"
  | "slippage-min-required"
  | "missing-token-decimals"
  | "circuit-open"
  | "duplicate-idempotency"
  | "rate-limited"
  | "arbitrary-calldata-forbidden"
  | "openserv-unavailable";

export type RebalanceValidationResult =
  | { ok: true }
  | { ok: false; code: RebalanceValidationCode; reason: string };

/** External OpenServ publisher/keeper are not wired in this app build. */
export const REBALANCE_OPENSERV_CONNECTED = false;

export function permissionMaskIncludesRebalance(allowedActions: bigint): boolean {
  return (allowedActions & BigInt(STABLE_CLUB_PERMISSION_ACTION_BITS.rebalance)) !== BigInt(0);
}

export function buildRebalanceOptInPermissionScope(input: {
  user: Address;
  chainId: number;
  poolId: Hex;
  tokenA: Address;
  tokenB: Address;
  tokenADecimals: number;
  expiresAtSec?: number;
  maxAmountPerTx?: bigint;
  maxAmountPerDay?: bigint;
  maxSlippageBps?: number;
}): StableClubPermissionScope {
  if (!Number.isInteger(input.tokenADecimals) || input.tokenADecimals < 0 || input.tokenADecimals > 36) {
    throw new Error("tokenADecimals must be an integer in [0, 36]");
  }
  const unit = BigInt(10) ** BigInt(input.tokenADecimals);
  return {
    user: input.user,
    chainId: input.chainId,
    poolId: input.poolId,
    tokenA: input.tokenA,
    tokenB: input.tokenB,
    allowedActions: ["rebalance", "pause-automation", "revoke-permission", "emergency-exit"],
    maxAmountPerTx: input.maxAmountPerTx ?? BigInt(5_000) * unit,
    maxAmountPerDay: input.maxAmountPerDay ?? BigInt(20_000) * unit,
    maxSlippageBps: input.maxSlippageBps ?? 500,
    minTimeBetweenExecutionsSec: 0,
    maxExecutionsPerDay: 50,
    expiresAt: input.expiresAtSec ?? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };
}

export function validateRebalancePermissionSnapshot(
  perm: OnChainPermissionSnapshot,
  expected: { user: Address; chainId: number; poolId: Hex },
  nowSec: number,
): RebalanceValidationResult {
  if (perm.user.toLowerCase() !== expected.user.toLowerCase()) {
    return { ok: false, code: "wrong-user", reason: "Permission user mismatch" };
  }
  if (Number(perm.chainId) !== expected.chainId) {
    return { ok: false, code: "wrong-chain", reason: "Permission chainId mismatch" };
  }
  if (perm.poolId.toLowerCase() !== expected.poolId.toLowerCase()) {
    return { ok: false, code: "wrong-pool-id", reason: "Permission poolId mismatch" };
  }
  if (perm.revoked) return { ok: false, code: "permission-revoked", reason: "Permission revoked" };
  if (perm.paused) return { ok: false, code: "permission-paused", reason: "Permission paused" };
  if (Number(perm.expiresAt) <= nowSec) {
    return { ok: false, code: "permission-expired", reason: "Permission expired" };
  }
  if (!permissionMaskIncludesRebalance(perm.allowedActions)) {
    return { ok: false, code: "rebalance-not-allowed", reason: "Rebalance action not permitted" };
  }
  return { ok: true };
}

export function validateRebalanceSpendParams(input: {
  newTickLower: number;
  newTickUpper: number;
  swapAmount: bigint;
  minAmountOut: bigint;
  closeAmountAMin: bigint;
  closeAmountBMin: bigint;
}): RebalanceValidationResult {
  if (!Number.isInteger(input.newTickLower) || !Number.isInteger(input.newTickUpper) ||
      input.newTickLower >= input.newTickUpper) {
    return { ok: false, code: "invalid-tick-range", reason: "newTickLower must be below newTickUpper" };
  }
  if (input.closeAmountAMin === BigInt(0) || input.closeAmountBMin === BigInt(0)) {
    return { ok: false, code: "slippage-min-required", reason: "Close amounts require non-zero mins" };
  }
  if (input.swapAmount > BigInt(0) && input.minAmountOut === BigInt(0)) {
    return { ok: false, code: "slippage-min-required", reason: "Swap requires non-zero minAmountOut" };
  }
  return { ok: true };
}

export function validateRebalanceProposalBinding(
  fields: RebalanceProposalFields,
  expected: {
    chainId: number;
    user: Address;
    permissionId: Hex;
    poolId: Hex;
    adapter: Address;
    positionTokenId: bigint;
    executionNonce: bigint;
  },
): RebalanceValidationResult {
  if (Number(fields.chainId) !== expected.chainId) {
    return { ok: false, code: "proposal-binding-mismatch", reason: "Proposal chainId mismatch" };
  }
  if (fields.user.toLowerCase() !== expected.user.toLowerCase()) {
    return { ok: false, code: "proposal-user-mismatch", reason: "Proposal user mismatch" };
  }
  if (fields.permissionId.toLowerCase() !== expected.permissionId.toLowerCase()) {
    return { ok: false, code: "proposal-binding-mismatch", reason: "Proposal permissionId mismatch" };
  }
  if (fields.poolId.toLowerCase() !== expected.poolId.toLowerCase()) {
    return { ok: false, code: "proposal-pool-mismatch", reason: "Proposal poolId mismatch" };
  }
  if (fields.adapter.toLowerCase() !== expected.adapter.toLowerCase()) {
    return { ok: false, code: "proposal-binding-mismatch", reason: "Proposal adapter mismatch" };
  }
  if (fields.positionTokenId !== expected.positionTokenId) {
    return { ok: false, code: "invalid-position-token-id", reason: "Proposal positionTokenId mismatch" };
  }
  if (fields.executionNonce !== expected.executionNonce) {
    return { ok: false, code: "proposal-binding-mismatch", reason: "Proposal executionNonce mismatch" };
  }
  return { ok: true };
}
