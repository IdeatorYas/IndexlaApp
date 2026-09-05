/**
 * Five-pool deposit gas policy — wallet eth_estimateGas alone underestimates
 * complex CL multi-leg deposits and can OOG with gasLimit ≈ estimate.
 *
 * Failed Base example: 0x1e76759c… gasLimit=gasUsed=6588409 (out of gas);
 * eth_call with 15M gas at the same block succeeds.
 */

/** Extra headroom over eth_estimateGas (basis points). 4000 = +40%. */
export const FIVE_POOL_DEPOSIT_GAS_BUFFER_BPS = 4_000;

/** Minimum gas limit for depositFivePoolStrategy on Base. */
export const FIVE_POOL_DEPOSIT_GAS_FLOOR = BigInt(10_000_000);

/**
 * Soft ceiling — refuse absurd limits (mis-estimate / RPC glitch) without
 * silently clipping below a safe buffered value in normal cases.
 */
export const FIVE_POOL_DEPOSIT_GAS_CEILING = BigInt(30_000_000);

export function applyFivePoolDepositGasBuffer(estimateGas: bigint): bigint {
  if (estimateGas <= BigInt(0)) {
    throw new Error("estimateGas must be > 0");
  }
  const buffered =
    (estimateGas * BigInt(10_000 + FIVE_POOL_DEPOSIT_GAS_BUFFER_BPS)) /
    BigInt(10_000);
  const withFloor =
    buffered > FIVE_POOL_DEPOSIT_GAS_FLOOR ? buffered : FIVE_POOL_DEPOSIT_GAS_FLOOR;
  if (withFloor > FIVE_POOL_DEPOSIT_GAS_CEILING) {
    throw new Error(
      `Deposit gas estimate too high (${withFloor.toString()}). Refresh quotes and retry.`,
    );
  }
  return withFloor;
}

/**
 * True when a mined tx exhausted its gas limit (classic OOG fingerprint).
 */
export function isOutOfGasReceipt(params: {
  status: "success" | "reverted" | number | null | undefined;
  gasLimit: bigint;
  gasUsed: bigint;
}): boolean {
  const reverted =
    params.status === "reverted" || params.status === 0 || params.status === "0x0";
  if (!reverted) return false;
  if (params.gasLimit <= BigInt(0) || params.gasUsed <= BigInt(0)) return false;
  // Exact match or within 1% (some clients report slight differences)
  if (params.gasUsed === params.gasLimit) return true;
  const delta =
    params.gasLimit > params.gasUsed
      ? params.gasLimit - params.gasUsed
      : params.gasUsed - params.gasLimit;
  return delta * BigInt(100) < params.gasLimit;
}

export const FIVE_POOL_DEPOSIT_OOG_USER_MESSAGE =
  "Deposit ran out of gas. Increase gas limit (or retry — the app now buffers estimateGas) and try again.";
