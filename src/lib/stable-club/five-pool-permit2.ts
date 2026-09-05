/**
 * CL five-pool Permit2 approval plan — executor-only spender (not FeeRouter).
 * Verified: StableClubPhase2bPermit2.test.cjs / Phase2aForkDeposit approveUsdcViaPermit2.
 *
 * Live deposit path must check both:
 * 1) USDC.allowance(user, Permit2)
 * 2) Permit2.allowance(user, USDC, CL Executor) amount + expiry
 * then approve any gaps with the exact deposit amount and a short non-zero expiry,
 * wait for receipts, refresh, and only then call depositFivePoolStrategy.
 */
import type { Address } from "viem";
import {
  assertFutureExpiration,
  buildBoundedErc20ApproveToPermit2,
  buildBoundedPermit2ApproveTx,
  resolvePermit2Address,
} from "@/lib/stable-club/permit2";

/** Short non-zero Permit2 allowance window for five-pool deposits (30 minutes). */
export const FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC = 30 * 60;

export type ClFivePoolPermit2Plan = {
  permit2: Address;
  clExecutor: Address;
  token: Address;
  grossUsdc: bigint;
  expiration: number;
  erc20ApproveTx: ReturnType<typeof buildBoundedErc20ApproveToPermit2>;
  permit2ApproveTx: ReturnType<typeof buildBoundedPermit2ApproveTx>;
  labels: string[];
};

export type ClFivePoolPermit2LiveAllowances = {
  /** USDC.allowance(user, Permit2) */
  erc20AllowanceToPermit2: bigint;
  /** Permit2.allowance amount for CL Executor */
  permit2AmountToExecutor: bigint;
  /** Permit2.allowance expiration for CL Executor (unix seconds) */
  permit2ExpirationToExecutor: number;
};

/** Compute a short future Permit2 expiration; never returns 0. */
export function computeClFivePoolPermit2Expiration(
  nowSec: number,
  ttlSec: number = FIVE_POOL_PERMIT2_ALLOWANCE_TTL_SEC,
): number {
  if (!Number.isInteger(nowSec) || nowSec < 0) {
    throw new Error("nowSec must be a non-negative integer");
  }
  if (!Number.isInteger(ttlSec) || ttlSec <= 0) {
    throw new Error("Permit2 allowance TTL must be a positive integer");
  }
  const expiration = nowSec + ttlSec;
  assertFutureExpiration(expiration, nowSec);
  return expiration;
}

export function needsUsdcAllowanceToPermit2(
  currentAllowance: bigint,
  requiredGrossUsdc: bigint,
): boolean {
  if (requiredGrossUsdc <= BigInt(0)) {
    throw new Error("requiredGrossUsdc must be > 0");
  }
  return currentAllowance < requiredGrossUsdc;
}

/**
 * True when Permit2 → CL Executor amount/expiry cannot cover the deposit.
 * Expiration 0 is always treated as expired (Permit2 AllowanceExpired(0)).
 */
export function needsPermit2AllowanceToClExecutor(params: {
  amount: bigint;
  expiration: number | bigint;
  requiredGrossUsdc: bigint;
  nowSec: number;
}): boolean {
  if (params.requiredGrossUsdc <= BigInt(0)) {
    throw new Error("requiredGrossUsdc must be > 0");
  }
  const expiration = Number(params.expiration);
  if (!Number.isFinite(expiration) || !Number.isInteger(expiration)) {
    return true;
  }
  if (expiration <= 0) {
    return true;
  }
  if (expiration <= params.nowSec) {
    return true;
  }
  if (params.amount < params.requiredGrossUsdc) {
    return true;
  }
  return false;
}

export function evaluateClFivePoolPermit2Readiness(params: {
  requiredGrossUsdc: bigint;
  nowSec: number;
  allowances: ClFivePoolPermit2LiveAllowances;
}): {
  needsErc20Approve: boolean;
  needsPermit2Approve: boolean;
  ready: boolean;
} {
  const needsErc20Approve = needsUsdcAllowanceToPermit2(
    params.allowances.erc20AllowanceToPermit2,
    params.requiredGrossUsdc,
  );
  const needsPermit2Approve = needsPermit2AllowanceToClExecutor({
    amount: params.allowances.permit2AmountToExecutor,
    expiration: params.allowances.permit2ExpirationToExecutor,
    requiredGrossUsdc: params.requiredGrossUsdc,
    nowSec: params.nowSec,
  });
  return {
    needsErc20Approve,
    needsPermit2Approve,
    ready: !needsErc20Approve && !needsPermit2Approve,
  };
}

/**
 * Fail closed unless both USDC→Permit2 and Permit2→CL Executor cover the deposit.
 * Call after refreshing on-chain allowances, immediately before depositFivePoolStrategy.
 */
export function assertClFivePoolPermit2Ready(params: {
  requiredGrossUsdc: bigint;
  nowSec: number;
  allowances: ClFivePoolPermit2LiveAllowances;
  permit2: Address;
  clExecutor: Address;
}): void {
  const status = evaluateClFivePoolPermit2Readiness(params);
  if (status.needsErc20Approve) {
    throw new Error(
      `USDC allowance to Permit2 (${params.permit2}) is insufficient:` +
        ` need ${params.requiredGrossUsdc}, have ${params.allowances.erc20AllowanceToPermit2}.` +
        ` Approve USDC → Permit2 for the exact deposit amount, wait for the receipt, then retry.`,
    );
  }
  if (status.needsPermit2Approve) {
    const exp = params.allowances.permit2ExpirationToExecutor;
    if (exp <= 0 || exp <= params.nowSec) {
      throw new Error(
        `Permit2 AllowanceExpired(${exp}): CL Executor (${params.clExecutor}) allowance is missing or expired.` +
          ` Approve Permit2 → CL Executor for ${params.requiredGrossUsdc} USDC units with a short non-zero expiry,` +
          ` wait for the receipt, refresh, then deposit.`,
      );
    }
    throw new Error(
      `Permit2 InsufficientAllowance(${params.allowances.permit2AmountToExecutor}):` +
        ` need ${params.requiredGrossUsdc} for CL Executor (${params.clExecutor}).` +
        ` Approve the exact deposit amount, wait for the receipt, then retry.`,
    );
  }
}

/** Decode Permit2.allowance tuple into the live allowance shape used by readiness checks. */
export function decodeClFivePoolPermit2AllowanceTuple(
  amount: bigint,
  expiration: number | bigint,
): Pick<
  ClFivePoolPermit2LiveAllowances,
  "permit2AmountToExecutor" | "permit2ExpirationToExecutor"
> {
  return {
    permit2AmountToExecutor: amount,
    permit2ExpirationToExecutor: Number(expiration),
  };
}

/**
 * After a confirmed Permit2/ERC20 approval receipt, poll Base RPC until allowances
 * are ready. Wallet EIP-1193 providers often return stale eth_call right after mining.
 */
export async function refetchClFivePoolPermit2AllowancesUntilReady(params: {
  readAllowances: () => Promise<ClFivePoolPermit2LiveAllowances>;
  requiredGrossUsdc: bigint;
  nowSec: () => number;
  permit2: Address;
  clExecutor: Address;
  /** Default 12 attempts (~6s with 500ms delay). */
  maxAttempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ClFivePoolPermit2LiveAllowances> {
  const maxAttempts = params.maxAttempts ?? 12;
  const delayMs = params.delayMs ?? 500;
  const sleep =
    params.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer");
  }

  let last = await params.readAllowances();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const nowSec = params.nowSec();
    const status = evaluateClFivePoolPermit2Readiness({
      requiredGrossUsdc: params.requiredGrossUsdc,
      nowSec,
      allowances: last,
    });
    if (status.ready) {
      assertClFivePoolPermit2Ready({
        requiredGrossUsdc: params.requiredGrossUsdc,
        nowSec,
        allowances: last,
        permit2: params.permit2,
        clExecutor: params.clExecutor,
      });
      return last;
    }
    if (attempt < maxAttempts) {
      await sleep(delayMs);
      last = await params.readAllowances();
    }
  }

  assertClFivePoolPermit2Ready({
    requiredGrossUsdc: params.requiredGrossUsdc,
    nowSec: params.nowSec(),
    allowances: last,
    permit2: params.permit2,
    clExecutor: params.clExecutor,
  });
  return last;
}

/**
 * Bounded USDC → Permit2, then Permit2 → ConcentratedLiquidityExecutor for full grossUsdc.
 * FeeRouter is intentionally NOT a Permit2 spender on this path.
 */
export function buildClFivePoolPermit2Plan(params: {
  chainId: number;
  permit2?: Address;
  token: Address;
  clExecutor: Address;
  grossUsdc: bigint;
  expiration: number;
  nowSec?: number;
  /** @deprecated Ignored. ChainId alone decides Permit2 policy (SC-F02). */
  localHardhat?: boolean;
}): ClFivePoolPermit2Plan {
  if (params.grossUsdc <= BigInt(0)) {
    throw new Error("grossUsdc must be > 0");
  }
  const permit2 = resolvePermit2Address({
    chainId: params.chainId,
    permit2: params.permit2,
  });
  const erc20ApproveTx = buildBoundedErc20ApproveToPermit2({
    token: params.token,
    amount: params.grossUsdc,
    permit2,
    chainId: params.chainId,
  });
  const permit2ApproveTx = buildBoundedPermit2ApproveTx({
    permit2,
    chainId: params.chainId,
    token: params.token,
    spender: params.clExecutor,
    amount: params.grossUsdc,
    expiration: params.expiration,
    nowSec: params.nowSec,
  });
  return {
    permit2,
    clExecutor: params.clExecutor,
    token: params.token,
    grossUsdc: params.grossUsdc,
    expiration: params.expiration,
    erc20ApproveTx,
    permit2ApproveTx,
    labels: [
      `ERC20 approve Permit2 for ${params.grossUsdc} USDC units`,
      `Permit2 approve CL executor for ${params.grossUsdc} USDC units (expiring)`,
    ],
  };
}
