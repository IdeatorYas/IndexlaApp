/**
 * Permit2 ERC20 helpers — bounded amount + expiration only.
 * Never encode unlimited approvals (uint160.max / uint256.max).
 *
 * Deposit/swap pulls use two spenders:
 * - FeeRouter pulls `swapAmount` (gross, fee charged)
 * - StableClubExecutor pulls `depositAmount - swapAmount` (remaining stable)
 * Allowances are sized to each spender's need — never duplicate the gross total.
 */
import type { Address } from "viem";
import {
  BASE_CHAIN_ID,
  BASE_PERMIT2,
  isCanonicalBasePermit2,
} from "@/lib/stable-club/verified-base-addresses";

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

export type DualSpenderDepositSplit = {
  feeRouterAmount: bigint;
  executorAmount: bigint;
  /** ERC20 approve(Permit2) total — sum of both spenders, not 2× gross. */
  erc20ToPermit2Amount: bigint;
};

/**
 * Resolve Permit2 address for a chain.
 * Base mainnet (8453): always canonical; reject zero / custom / non-canonical.
 * Local/test chains: mocks allowed when explicitly provided.
 */
export function resolvePermit2Address(params: {
  chainId: number;
  permit2?: Address | null;
}): Address {
  const provided = params.permit2 ?? null;
  const zero = "0x0000000000000000000000000000000000000000";
  if (params.chainId === BASE_CHAIN_ID) {
    // Omitted → use canonical. Explicit zero / custom / non-canonical → reject.
    if (provided == null) {
      return BASE_PERMIT2.address;
    }
    if (provided.toLowerCase() === zero || !isCanonicalBasePermit2(provided)) {
      throw new Error(
        `Non-canonical Permit2 rejected on Base: expected ${BASE_PERMIT2.address}, got ${provided}`,
      );
    }
    return BASE_PERMIT2.address;
  }
  // Non-Base (local Hardhat / test): allow explicit mock; default still canonical for safety.
  if (provided == null || provided.toLowerCase() === zero) {
    return BASE_PERMIT2.address;
  }
  return provided;
}

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
 * Split deposit into per-spender Permit2 needs (matches StableClubExecutor.depositAndAddLiquidity).
 * FeeRouter pulls swapAmount; executor pulls depositAmount - swapAmount.
 */
export function splitDepositSpenderAllowances(params: {
  depositAmount: bigint;
  swapAmount: bigint;
}): DualSpenderDepositSplit {
  if (params.depositAmount <= BigInt(0)) throw new Error("depositAmount must be positive");
  if (params.swapAmount < BigInt(0)) throw new Error("swapAmount cannot be negative");
  if (params.swapAmount > params.depositAmount) {
    throw new Error("swapAmount cannot exceed depositAmount");
  }
  const feeRouterAmount = params.swapAmount;
  const executorAmount = params.depositAmount - params.swapAmount;
  return {
    feeRouterAmount,
    executorAmount,
    erc20ToPermit2Amount: feeRouterAmount + executorAmount,
  };
}

/**
 * Build Permit2.approve(token, spender, amount, expiration) — bounded only.
 */
export function buildBoundedPermit2ApproveTx(params: {
  permit2?: Address;
  chainId?: number;
  token: Address;
  spender: Address;
  amount: bigint;
  expiration: number;
  nowSec?: number;
}) {
  const chainId = params.chainId ?? BASE_CHAIN_ID;
  const permit2 = resolvePermit2Address({ chainId, permit2: params.permit2 });
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
  chainId?: number;
}) {
  const chainId = params.chainId ?? BASE_CHAIN_ID;
  const permit2 = resolvePermit2Address({ chainId, permit2: params.permit2 });
  assertBoundedErc20ApproveAmount(params.amount);
  return {
    address: params.token,
    abi: erc20ApproveAbi,
    functionName: "approve" as const,
    args: [permit2, params.amount] as const,
  };
}

export type DualSpenderDepositApprovalPlan = {
  split: DualSpenderDepositSplit;
  expiration: number;
  permit2: Address;
  feeRouter: Address;
  executor: Address;
  erc20ApproveTx: ReturnType<typeof buildBoundedErc20ApproveToPermit2> | null;
  feeRouterPermit2Tx: ReturnType<typeof buildBoundedPermit2ApproveTx> | null;
  executorPermit2Tx: ReturnType<typeof buildBoundedPermit2ApproveTx> | null;
  labels: string[];
};

/**
 * Build bounded, expiring dual-spender Permit2 plan for deposit (+ optional swap).
 * Only creates approve txs for spenders that need a positive amount.
 */
export function buildDualSpenderDepositApprovalPlan(params: {
  chainId?: number;
  permit2?: Address;
  token: Address;
  feeRouter: Address;
  executor: Address;
  depositAmount: bigint;
  swapAmount: bigint;
  expiration: number;
  nowSec?: number;
}): DualSpenderDepositApprovalPlan {
  if (params.feeRouter.toLowerCase() === params.executor.toLowerCase()) {
    throw new Error("FeeRouter and executor must be distinct spenders");
  }
  const chainId = params.chainId ?? BASE_CHAIN_ID;
  const permit2 = resolvePermit2Address({ chainId, permit2: params.permit2 });
  const split = splitDepositSpenderAllowances({
    depositAmount: params.depositAmount,
    swapAmount: params.swapAmount,
  });
  assertFutureExpiration(params.expiration, params.nowSec);

  const erc20ApproveTx =
    split.erc20ToPermit2Amount > BigInt(0)
      ? buildBoundedErc20ApproveToPermit2({
          token: params.token,
          amount: split.erc20ToPermit2Amount,
          permit2,
          chainId,
        })
      : null;

  const feeRouterPermit2Tx =
    split.feeRouterAmount > BigInt(0)
      ? buildBoundedPermit2ApproveTx({
          permit2,
          chainId,
          token: params.token,
          spender: params.feeRouter,
          amount: split.feeRouterAmount,
          expiration: params.expiration,
          nowSec: params.nowSec,
        })
      : null;

  const executorPermit2Tx =
    split.executorAmount > BigInt(0)
      ? buildBoundedPermit2ApproveTx({
          permit2,
          chainId,
          token: params.token,
          spender: params.executor,
          amount: split.executorAmount,
          expiration: params.expiration,
          nowSec: params.nowSec,
        })
      : null;

  const labels = [
    `Permit2=${permit2}`,
    `FeeRouter spender=${params.feeRouter} amount=${split.feeRouterAmount.toString()} (swap gross only)`,
    `Executor spender=${params.executor} amount=${split.executorAmount.toString()} (deposit − swap)`,
    `ERC20→Permit2 total=${split.erc20ToPermit2Amount.toString()} (sum, not duplicated)`,
    `expiration=${params.expiration}`,
  ];

  return {
    split,
    expiration: params.expiration,
    permit2,
    feeRouter: params.feeRouter,
    executor: params.executor,
    erc20ApproveTx,
    feeRouterPermit2Tx,
    executorPermit2Tx,
    labels,
  };
}

export type LiveSpenderAllowance = {
  spender: Address;
  role: "feeRouter" | "executor";
  required: bigint;
  amount: bigint;
  expiration: number;
};

/**
 * Require both spenders to have sufficient, unexpired Permit2 allowance before swap/deposit.
 * Pass required=0 to skip a spender that is unused for this path.
 */
export function assertDualSpenderAllowancesReady(params: {
  nowSec?: number;
  allowances: LiveSpenderAllowance[];
  expectedExecutor?: Address;
}): void {
  const now = params.nowSec ?? Math.floor(Date.now() / 1000);
  for (const row of params.allowances) {
    if (row.required <= BigInt(0)) continue;
    if (
      params.expectedExecutor &&
      row.role === "executor" &&
      row.spender.toLowerCase() !== params.expectedExecutor.toLowerCase()
    ) {
      throw new Error(
        `Wrong executor spender: expected ${params.expectedExecutor}, got ${row.spender}`,
      );
    }
    if (row.amount === BigInt(0)) {
      throw new Error(`Permit2 allowance revoked for ${row.role} (${row.spender})`);
    }
    if (row.expiration <= now) {
      throw new Error(`Permit2 allowance expired for ${row.role} (${row.spender})`);
    }
    if (row.amount < row.required) {
      throw new Error(
        `Insufficient Permit2 allowance for ${row.role}: need ${row.required}, have ${row.amount}`,
      );
    }
  }
  const fee = params.allowances.find((a) => a.role === "feeRouter");
  const exec = params.allowances.find((a) => a.role === "executor");
  if (!fee || !exec) {
    throw new Error("Both FeeRouter and executor allowance rows are required");
  }
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
  chainId?: number;
  token: Address;
  spender: Address;
  nowSec?: number;
}) {
  const chainId = params.chainId ?? BASE_CHAIN_ID;
  const permit2 = resolvePermit2Address({ chainId, permit2: params.permit2 });
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
