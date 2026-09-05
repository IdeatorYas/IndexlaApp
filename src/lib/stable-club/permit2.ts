/**
 * Permit2 ERC20 helpers — bounded amount + expiration only.
 * Never encode unlimited approvals (uint160.max / uint256.max).
 *
 * Deposit/swap pulls use two spenders:
 * - FeeRouter pulls `swapAmount` (gross, fee charged)
 * - StableClubExecutor pulls `depositAmount - swapAmount` (remaining stable)
 * Allowances are sized to each spender's need — never duplicate the gross total.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Address,
  type Hex,
} from "viem";
import { LOCAL_HARDHAT_CHAIN_ID } from "@/lib/stable-club/chain-isolation";
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
  {
    type: "error",
    name: "AllowanceExpired",
    inputs: [{ name: "deadline", type: "uint256" }],
  },
  {
    type: "error",
    name: "InsufficientAllowance",
    inputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "error",
    name: "InvalidAmount",
    inputs: [{ name: "maxAmount", type: "uint256" }],
  },
  {
    type: "error",
    name: "LengthMismatch",
    inputs: [],
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
 *
 * SC-F02:
 * - Base mainnet (8453): always canonical. No `localHardhat`, JSON, env, or caller input
 *   may override Permit2 on chainId 8453.
 * - Local Hardhat (31337): requires an explicit mock Permit2 address (never silent Base fallback).
 * - Other non-Base chains: require an explicit non-zero Permit2 address.
 *
 * `localHardhat` is accepted for call-site compatibility but is ignored — it never weakens Base.
 */
export function resolvePermit2Address(params: {
  chainId: number;
  permit2?: Address | null;
  /** @deprecated Ignored. Cannot override Permit2 on Base 8453. */
  localHardhat?: boolean;
}): Address {
  void params.localHardhat;
  const provided = params.permit2 ?? null;
  const zero = "0x0000000000000000000000000000000000000000";

  if (params.chainId === BASE_CHAIN_ID) {
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

  if (provided == null || provided.toLowerCase() === zero) {
    if (params.chainId === LOCAL_HARDHAT_CHAIN_ID) {
      throw new Error("Permit2 address required on local Hardhat (mock)");
    }
    throw new Error(`Permit2 address required for chainId ${params.chainId}`);
  }

  if (params.chainId === LOCAL_HARDHAT_CHAIN_ID && isCanonicalBasePermit2(provided)) {
    throw new Error(
      "Canonical Base Permit2 is not valid on local Hardhat — use the declared MockPermit2",
    );
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
  localHardhat?: boolean;
}) {
  const chainId = params.chainId ?? BASE_CHAIN_ID;
  const permit2 = resolvePermit2Address({
    chainId,
    permit2: params.permit2,
    localHardhat: params.localHardhat,
  });
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
  localHardhat?: boolean;
}) {
  const chainId = params.chainId ?? BASE_CHAIN_ID;
  const permit2 = resolvePermit2Address({
    chainId,
    permit2: params.permit2,
    localHardhat: params.localHardhat,
  });
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

function extractRevertData(err: unknown): Hex | null {
  if (!err || typeof err !== "object") return null;
  const walk = (value: unknown): Hex | null => {
    if (!value || typeof value !== "object") return null;
    const rec = value as Record<string, unknown>;
    if (typeof rec.data === "string" && rec.data.startsWith("0x") && rec.data.length >= 10) {
      return rec.data as Hex;
    }
    if (rec.data && typeof rec.data === "object") {
      const nested = rec.data as Record<string, unknown>;
      if (typeof nested.data === "string" && nested.data.startsWith("0x")) {
        return nested.data as Hex;
      }
    }
    if (typeof rec.raw === "string" && rec.raw.startsWith("0x")) {
      return rec.raw as Hex;
    }
    return null;
  };

  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const data = walk(reverted) ?? walk(reverted.data);
      if (data) return data;
    }
    const direct = walk(err);
    if (direct) return direct;
  }
  return walk(err);
}

/**
 * Decode Permit2 custom errors into a clear user-facing message.
 * Returns null when the error is not a recognized Permit2 revert.
 */
export function formatPermit2UserError(err: unknown): string | null {
  if (!err) return null;

  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const data = reverted.data;
      if (data && typeof data === "object" && "errorName" in data) {
        const named = data as { errorName: string; args?: readonly unknown[] };
        if (named.errorName === "AllowanceExpired") {
          const deadline = named.args?.[0] != null ? String(named.args[0]) : "unknown";
          return (
            `Permit2 AllowanceExpired(${deadline}): the CL Executor allowance is missing or expired` +
            (deadline === "0" ? " (deadline=0 means never approved or revoked)." : ".") +
            " Approve Permit2 → CL Executor for the exact deposit amount with a short non-zero expiry, then retry."
          );
        }
        if (named.errorName === "InsufficientAllowance") {
          const amount = named.args?.[0] != null ? String(named.args[0]) : "unknown";
          return (
            `Permit2 InsufficientAllowance(${amount}): USDC Permit2 allowance to the CL Executor is too low.` +
            " Approve the exact deposit amount, wait for the receipt, then retry."
          );
        }
        if (named.errorName === "InvalidAmount") {
          return "Permit2 InvalidAmount: allowance amount is invalid (unlimited approvals are forbidden).";
        }
        if (named.errorName === "LengthMismatch") {
          return "Permit2 LengthMismatch: malformed batch allowance update.";
        }
      }
    }
  }

  const data = extractRevertData(err);
  if (data) {
    try {
      const decoded = decodeErrorResult({ abi: permit2AllowanceAbi, data });
      if (decoded.errorName === "AllowanceExpired") {
        const deadline = String(decoded.args[0]);
        return (
          `Permit2 AllowanceExpired(${deadline}): the CL Executor allowance is missing or expired` +
          (deadline === "0" ? " (deadline=0 means never approved or revoked)." : ".") +
          " Approve Permit2 → CL Executor for the exact deposit amount with a short non-zero expiry, then retry."
        );
      }
      if (decoded.errorName === "InsufficientAllowance") {
        return (
          `Permit2 InsufficientAllowance(${String(decoded.args[0])}): USDC Permit2 allowance to the CL Executor is too low.` +
          " Approve the exact deposit amount, wait for the receipt, then retry."
        );
      }
      if (decoded.errorName === "InvalidAmount") {
        return "Permit2 InvalidAmount: allowance amount is invalid (unlimited approvals are forbidden).";
      }
      if (decoded.errorName === "LengthMismatch") {
        return "Permit2 LengthMismatch: malformed batch allowance update.";
      }
    } catch {
      // not a Permit2 selector
    }
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (/AllowanceExpired/i.test(msg)) {
    return (
      "Permit2 AllowanceExpired: the CL Executor allowance is missing or expired" +
      (/\(0\)|deadline[=:]?\s*0/i.test(msg)
        ? " (deadline=0 means never approved or revoked)."
        : ".") +
      " Approve Permit2 → CL Executor for the exact deposit amount with a short non-zero expiry, then retry."
    );
  }
  if (/InsufficientAllowance/i.test(msg)) {
    return (
      "Permit2 InsufficientAllowance: USDC Permit2 allowance to the CL Executor is too low." +
      " Approve the exact deposit amount, wait for the receipt, then retry."
    );
  }
  return null;
}
