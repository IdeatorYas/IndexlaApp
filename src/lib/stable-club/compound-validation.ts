import { getAddress, type Address, type Hex } from "viem";
import {
  STABLE_CLUB_PERMISSION_ACTION_BITS,
  type StableClubPermissionScope,
} from "@/lib/stable-club/permissions";
import type { CompoundProposalFields } from "@/lib/stable-club/openserv";

export type CompoundValidationCode =
  | "ok"
  | "opt-in-disabled"
  | "missing-automation-executor"
  | "missing-permission-registry"
  | "missing-deployments"
  | "launch-compound-disabled"
  | "wrong-chain"
  | "wrong-user"
  | "permission-not-registered"
  | "permission-revoked"
  | "permission-paused"
  | "permission-expired"
  | "compound-not-allowed"
  | "wrong-pool-id"
  | "invalid-position-token-id"
  | "missing-adapter"
  | "proposal-null"
  | "proposal-user-mismatch"
  | "proposal-pool-mismatch"
  | "proposal-action-mismatch"
  | "proposal-binding-mismatch"
  | "noop-compound"
  | "missing-live-fees"
  | "missing-token-decimals"
  | "slippage-min-required"
  | "same-token-swap"
  | "circuit-open"
  | "duplicate-idempotency"
  | "rate-limited"
  | "arbitrary-calldata-forbidden"
  | "openserv-unavailable";

export type CompoundValidationResult =
  | { ok: true }
  | { ok: false; code: CompoundValidationCode; reason: string };

export type OnChainPermissionSnapshot = {
  user: Address;
  chainId: bigint;
  poolId: Hex;
  tokenA: Address;
  tokenB: Address;
  allowedActions: bigint;
  maxAmountPerTx: bigint;
  maxAmountPerDay: bigint;
  maxSlippageBps: bigint;
  expiresAt: bigint;
  revoked: boolean;
  paused: boolean;
};

/** External OpenServ publisher/keeper are not wired in this app build. */
export const COMPOUND_OPENSERV_CONNECTED = false;

export function permissionMaskIncludesCompound(allowedActions: bigint): boolean {
  return (allowedActions & BigInt(STABLE_CLUB_PERMISSION_ACTION_BITS.compound)) !== BigInt(0);
}

/**
 * Separate compound opt-in scope: compound bit + control actions.
 * Limits are denominated in permission.tokenA raw units using that token's decimals.
 */
export function buildCompoundOptInPermissionScope(input: {
  user: Address;
  chainId: number;
  poolId: Hex;
  tokenA: Address;
  tokenB: Address;
  /** Decimals of permission.tokenA — required; never assume USDC-6. */
  tokenADecimals: number;
  expiresAtSec?: number;
  maxAmountPerTx?: bigint;
  maxAmountPerDay?: bigint;
  maxSlippageBps?: number;
}): StableClubPermissionScope {
  const now = Math.floor(Date.now() / 1000);
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
    allowedActions: ["compound", "pause-automation", "revoke-permission", "emergency-exit"],
    maxAmountPerTx: input.maxAmountPerTx ?? BigInt(5_000) * unit,
    maxAmountPerDay: input.maxAmountPerDay ?? BigInt(20_000) * unit,
    maxSlippageBps: input.maxSlippageBps ?? 500,
    minTimeBetweenExecutionsSec: 0,
    maxExecutionsPerDay: 50,
    expiresAt: input.expiresAtSec ?? now + 60 * 60 * 24 * 30,
  };
}

export type LiveCollectibleFeeSnapshot = {
  token0: Address;
  token1: Address;
  fee0: bigint;
  fee1: bigint;
};

/** Map pool token0/token1 fees onto permission tokenA/tokenB amounts. */
export function mapCollectibleFeesToTokenAB(input: {
  tokenA: Address;
  tokenB: Address;
  fees: LiveCollectibleFeeSnapshot;
}): { amountA: bigint; amountB: bigint } | null {
  const a = getAddress(input.tokenA).toLowerCase();
  const b = getAddress(input.tokenB).toLowerCase();
  const t0 = getAddress(input.fees.token0).toLowerCase();
  const t1 = getAddress(input.fees.token1).toLowerCase();
  if (a === t0 && b === t1) {
    return { amountA: input.fees.fee0, amountB: input.fees.fee1 };
  }
  if (a === t1 && b === t0) {
    return { amountA: input.fees.fee1, amountB: input.fees.fee0 };
  }
  return null;
}

/**
 * Derive LP-only compound spend from verified live collectible fees.
 * Fail closed when fees are unavailable, mismatched, or both legs are zero.
 */
export function deriveCompoundSpendFromLiveFees(input: {
  rewardToken: Address;
  tokenA: Address;
  tokenB: Address;
  fees: LiveCollectibleFeeSnapshot | null;
  slippageBps?: bigint;
  swapDeadlineSec?: number;
}):
  | {
      ok: true;
      amountA: bigint;
      amountB: bigint;
      amountAMin: bigint;
      amountBMin: bigint;
      swapAmount: bigint;
      minAmountOut: bigint;
      quotedAmountOut: bigint;
      slippageBps: bigint;
      swapDeadline: bigint;
      rewardToken: Address;
      tokenA: Address;
      tokenB: Address;
    }
  | { ok: false; code: "missing-live-fees"; reason: string } {
  if (!input.fees) {
    return {
      ok: false,
      code: "missing-live-fees",
      reason: "Live collectible-fee data unavailable",
    };
  }
  if (input.fees.fee0 === BigInt(0) && input.fees.fee1 === BigInt(0)) {
    return {
      ok: false,
      code: "missing-live-fees",
      reason: "No collectible fees available to compound",
    };
  }
  const mapped = mapCollectibleFeesToTokenAB({
    tokenA: input.tokenA,
    tokenB: input.tokenB,
    fees: input.fees,
  });
  if (!mapped) {
    return {
      ok: false,
      code: "missing-live-fees",
      reason: "Collectible fees do not match permission token pair",
    };
  }
  if (mapped.amountA === BigInt(0) && mapped.amountB === BigInt(0)) {
    return {
      ok: false,
      code: "missing-live-fees",
      reason: "Mapped collectible fees are zero",
    };
  }
  const now = input.swapDeadlineSec ?? Math.floor(Date.now() / 1000) + 600;
  return {
    ok: true,
    rewardToken: input.rewardToken,
    tokenA: input.tokenA,
    tokenB: input.tokenB,
    swapAmount: BigInt(0),
    minAmountOut: BigInt(0),
    quotedAmountOut: BigInt(0),
    amountA: mapped.amountA,
    amountB: mapped.amountB,
    amountAMin: mapped.amountA > BigInt(0) ? BigInt(1) : BigInt(0),
    amountBMin: mapped.amountB > BigInt(0) ? BigInt(1) : BigInt(0),
    slippageBps: input.slippageBps ?? BigInt(150),
    swapDeadline: BigInt(now),
  };
}

export function validateCompoundPermissionSnapshot(
  perm: OnChainPermissionSnapshot,
  expected: {
    user: Address;
    chainId: number;
    poolId: Hex;
  },
  nowSec: number,
): CompoundValidationResult {
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
  if (!permissionMaskIncludesCompound(perm.allowedActions)) {
    return { ok: false, code: "compound-not-allowed", reason: "Compound action not permitted" };
  }
  return { ok: true };
}

export function validateCompoundSpendParams(input: {
  rewardToken: Address;
  tokenA: Address;
  tokenB: Address;
  swapAmount: bigint;
  minAmountOut: bigint;
  amountA: bigint;
  amountB: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
}): CompoundValidationResult {
  if (input.swapAmount === BigInt(0) && input.amountA === BigInt(0) && input.amountB === BigInt(0)) {
    return { ok: false, code: "noop-compound", reason: "Compound spend amounts are all zero" };
  }
  if (
    (input.amountA > BigInt(0) && input.amountAMin === BigInt(0)) ||
    (input.amountB > BigInt(0) && input.amountBMin === BigInt(0))
  ) {
    return {
      ok: false,
      code: "slippage-min-required",
      reason: "Non-zero LP amounts require non-zero mins",
    };
  }
  if (input.swapAmount > BigInt(0) && input.minAmountOut === BigInt(0)) {
    return {
      ok: false,
      code: "slippage-min-required",
      reason: "Swap requires non-zero minAmountOut",
    };
  }
  if (
    input.swapAmount > BigInt(0) &&
    input.rewardToken.toLowerCase() === input.tokenB.toLowerCase()
  ) {
    return {
      ok: false,
      code: "same-token-swap",
      reason: "Cannot swap rewardToken into itself (tokenB)",
    };
  }
  return { ok: true };
}

export function validateCompoundProposalBinding(
  fields: CompoundProposalFields,
  expected: {
    chainId: number;
    user: Address;
    permissionId: Hex;
    poolId: Hex;
    adapter: Address;
    positionTokenId: bigint;
    executionNonce: bigint;
  },
): CompoundValidationResult {
  if (Number(fields.chainId) !== expected.chainId) {
    return { ok: false, code: "proposal-binding-mismatch", reason: "Proposal chainId mismatch" };
  }
  if (fields.user.toLowerCase() !== expected.user.toLowerCase()) {
    return { ok: false, code: "proposal-user-mismatch", reason: "Proposal user mismatch" };
  }
  if (fields.permissionId.toLowerCase() !== expected.permissionId.toLowerCase()) {
    return {
      ok: false,
      code: "proposal-binding-mismatch",
      reason: "Proposal permissionId mismatch",
    };
  }
  if (fields.poolId.toLowerCase() !== expected.poolId.toLowerCase()) {
    return { ok: false, code: "proposal-pool-mismatch", reason: "Proposal poolId mismatch" };
  }
  if (fields.adapter.toLowerCase() !== expected.adapter.toLowerCase()) {
    return { ok: false, code: "proposal-binding-mismatch", reason: "Proposal adapter mismatch" };
  }
  if (fields.positionTokenId !== expected.positionTokenId) {
    return {
      ok: false,
      code: "invalid-position-token-id",
      reason: "Proposal positionTokenId mismatch",
    };
  }
  if (fields.executionNonce !== expected.executionNonce) {
    return {
      ok: false,
      code: "proposal-binding-mismatch",
      reason: "Proposal executionNonce mismatch",
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
