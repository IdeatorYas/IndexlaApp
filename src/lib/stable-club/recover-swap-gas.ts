/**
 * Uni recover (approve + SwapRouter02 exactInputSingle) gas policy.
 *
 * Live Base failure — wallet 0xab4e…559F, 2026-09-09 22:06 UTC:
 * - 0xd3db6e66… approve(router, 4879)  limit 43,216  used 42,840  OK  (warm allowance)
 * - 0x90003c99… exactInputSingle 4879  limit 135,948 used 126,724 OK  (allowance → 0)
 * - 0xd48ff77b… approve(router, 6066)  limit 43,216  used 43,030  OOG (cold zero→nonzero)
 */

/** Headroom over a fresh HTTP eth_estimateGas. 6000 = +60%. */
export const RECOVER_GAS_BUFFER_BPS = 6_000;

/** ERC20 approve floor — cold zero→nonzero cbBTC approve measured at 60,761. */
export const RECOVER_APPROVE_GAS_FLOOR = BigInt(120_000);

/** exactInputSingle floor — live cbBTC→USDC used 126,724. */
export const RECOVER_SWAP_GAS_FLOOR = BigInt(320_000);

export const RECOVER_GAS_CEILING = BigInt(2_000_000);

/**
 * Leave 1 wei allowance after the swap so the slot never returns to zero —
 * later approves stay on the warm path (prevents live OOG 0xd48ff77b…).
 */
export const RECOVER_ALLOWANCE_KEEPALIVE_WEI = BigInt(1);

/** Residue below this is unsellable dust — do not block completion. */
export const RECOVER_DUST_EPSILON_BY_SYMBOL = {
  cbBTC: BigInt(20),
  WETH: BigInt(5_000_000_000),
} as const;

export const RECOVER_APPROVE_OOG_USER_MESSAGE =
  "Approving cbBTC/WETH for the Uniswap router ran out of gas — your wallet signed with a stale gas estimate. Nothing was sold. Tap Resume incomplete withdraw; no LP is re-exited. If Gas limit is editable, set it to at least 120000.";

export const RECOVER_SWAP_OOG_USER_MESSAGE =
  "The residue → USDC swap ran out of gas. LP exit already completed. Tap Resume incomplete withdraw to retry only the swap. If Gas limit is editable, set it to at least 320000.";

export function applyRecoverGasBuffer(params: {
  estimateGas: bigint;
  floor: bigint;
}): bigint {
  if (params.estimateGas <= BigInt(0)) {
    throw new Error("Recover estimateGas must be > 0");
  }
  const buffered =
    (params.estimateGas * BigInt(10_000 + RECOVER_GAS_BUFFER_BPS)) /
    BigInt(10_000);
  const withFloor = buffered > params.floor ? buffered : params.floor;
  if (withFloor > RECOVER_GAS_CEILING) {
    throw new Error(
      `Recover gas estimate too high (${withFloor.toString()}). Refresh and retry.`,
    );
  }
  return withFloor;
}

export function isWalletGasEstimateStale(params: {
  walletEstimate: bigint | null;
  freshEstimate: bigint;
}): boolean {
  if (params.walletEstimate == null) return false;
  if (params.walletEstimate <= BigInt(0) || params.freshEstimate <= BigInt(0)) {
    return false;
  }
  return params.walletEstimate * BigInt(100) < params.freshEstimate * BigInt(90);
}

export function isOutOfGasError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /ran out of gas|out of gas/i.test(text);
}
