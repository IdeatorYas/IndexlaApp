/**
 * Permit2 ERC20 helpers — bounded amount + expiration only.
 * Never encode unlimited approvals (uint160.max / uint256.max).
 */
import type { Address } from "viem";
import { BASE_PERMIT2, isCanonicalBasePermit2 } from "@/lib/stable-club/verified-base-addresses";

/** Permit2 packed amount ceiling — uint160.max is treated as forbidden unlimited. */
export const PERMIT2_UNLIMITED_AMOUNT = (BigInt(2) ** BigInt(160)) - BigInt(1);
export const ERC20_UNLIMITED_APPROVAL = (BigInt(2) ** BigInt(256)) - BigInt(1);

export const permit2AllowanceAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
] as const;

export const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export type BoundedPermit2Allowance = {
  token: Address;
  spender: Address;
  amount: bigint;
  expiration: number;
};

export function assertBoundedPermit2Amount(amount: bigint): void {
  if (amount <= BigInt(0)) throw new Error("Permit2 amount must be positive");
  if (amount >= PERMIT2_UNLIMITED_AMOUNT) {
    throw new Error("Unlimited Permit2 allowance forbidden");
  }
}

export function assertBoundedErc20ApproveAmount(amount: bigint): void {
  if (amount <= BigInt(0)) throw new Error("ERC20 approve amount must be positive");
  if (amount >= ERC20_UNLIMITED_APPROVAL) {
    throw new Error("Unlimited ERC20 approve forbidden");
  }
}

export function assertFutureExpiration(expiration: number, nowSec = Math.floor(Date.now() / 1000)): void {
  if (!Number.isInteger(expiration) || expiration <= nowSec) {
    throw new Error("Permit2 expiration must be a future unix timestamp");
  }
  if (expiration > 2 ** 48 - 1) {
    throw new Error("Permit2 expiration exceeds uint48");
  }
}

/**
 * Build Permit2.approve(token, spender, amount, expiration) — bounded only.
 * Spender should be FeeRouter / Executor (not arbitrary).
 */
export function buildBoundedPermit2ApproveTx(params: {
  permit2?: Address;
  token: Address;
  spender: Address;
  amount: bigint;
  expiration: number;
  nowSec?: number;
}) {
  const permit2 = params.permit2 ?? BASE_PERMIT2.address;
  if (!isCanonicalBasePermit2(permit2) && params.permit2 === undefined) {
    throw new Error("Non-canonical Permit2");
  }
  assertBoundedPermit2Amount(params.amount);
  assertFutureExpiration(params.expiration, params.nowSec);
  return {
    address: permit2,
    abi: permit2AllowanceAbi,
    functionName: "approve" as const,
    args: [params.token, params.spender, params.amount, params.expiration] as const,
  };
}

/** One-time ERC20 approve of Permit2 itself — still must be bounded. */
export function buildBoundedErc20ApproveToPermit2(params: {
  token: Address;
  amount: bigint;
  permit2?: Address;
}) {
  const permit2 = params.permit2 ?? BASE_PERMIT2.address;
  assertBoundedErc20ApproveAmount(params.amount);
  return {
    address: params.token,
    abi: erc20ApproveAbi,
    functionName: "approve" as const,
    args: [permit2, params.amount] as const,
  };
}

export function isExpiredPermit2Allowance(params: {
  expiration: number;
  nowSec?: number;
}): boolean {
  const now = params.nowSec ?? Math.floor(Date.now() / 1000);
  return params.expiration <= now;
}

export function isForbiddenUnlimitedApproval(amount: bigint): boolean {
  return amount >= PERMIT2_UNLIMITED_AMOUNT || amount >= ERC20_UNLIMITED_APPROVAL;
}

/**
 * Explicit revoke: amount 0 is allowed only for revocation (not a spend allowance).
 */
export function buildPermit2ZeroAllowanceRevokeTx(params: {
  permit2?: Address;
  token: Address;
  spender: Address;
  nowSec?: number;
}) {
  const permit2 = params.permit2 ?? BASE_PERMIT2.address;
  const now = params.nowSec ?? Math.floor(Date.now() / 1000);
  const expiration = now + 1;
  return {
    address: permit2,
    abi: permit2AllowanceAbi,
    functionName: "approve" as const,
    args: [params.token, params.spender, BigInt(0), expiration] as const,
  };
}

export function describePermit2Allowance(params: {
  amount: bigint;
  expiration: number;
  nowSec?: number;
}): { status: "active" | "expired" | "revoked"; label: string } {
  const now = params.nowSec ?? Math.floor(Date.now() / 1000);
  if (params.amount === BigInt(0)) return { status: "revoked", label: "Revoked (zero allowance)" };
  if (params.expiration <= now) return { status: "expired", label: "Expired" };
  const mins = Math.max(1, Math.floor((params.expiration - now) / 60));
  return { status: "active", label: `Active · ${params.amount.toString()} · ~${mins}m left` };
}
