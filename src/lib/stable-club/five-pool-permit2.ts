/**
 * CL five-pool Permit2 approval plan — executor-only spender (not FeeRouter).
 * Verified: StableClubPhase2bPermit2.test.cjs / Phase2aForkDeposit approveUsdcViaPermit2.
 */
import type { Address } from "viem";
import {
  buildBoundedErc20ApproveToPermit2,
  buildBoundedPermit2ApproveTx,
  resolvePermit2Address,
} from "@/lib/stable-club/permit2";

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
