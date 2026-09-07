/**
 * Five-pool deposit gas policy — wallet eth_estimateGas alone underestimates
 * complex CL multi-leg deposits and can OOG with gasLimit ≈ estimate.
 *
 * Failed Base examples:
 * - 0x1e76759c… gasLimit=gasUsed≈6588409 (out of gas)
 * - 0xac64ff1b… gasLimit=6561716 gasUsed=6554393 (wallet substituted below 10M floor;
 *   eth_call with 10M at block-1 succeeds)
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
 * Fail closed unless the final wallet submission gas meets the 10M floor.
 * Call immediately before writeContract so a buggy buffer path cannot under-gas.
 */
export function requireFivePoolDepositGasLimit(gas: bigint): bigint {
  if (gas < FIVE_POOL_DEPOSIT_GAS_FLOOR) {
    throw new Error(
      `Deposit gas limit ${gas.toString()} is below the required minimum ${FIVE_POOL_DEPOSIT_GAS_FLOOR.toString()}.`,
    );
  }
  if (gas > FIVE_POOL_DEPOSIT_GAS_CEILING) {
    throw new Error(
      `Deposit gas estimate too high (${gas.toString()}). Refresh quotes and retry.`,
    );
  }
  return gas;
}

/**
 * Prefer the mined transaction gas limit when detecting wallet-substituted OOG.
 * Fall back to the app-requested limit when the mined tx cannot be loaded.
 */
export function resolveOutOfGasGasLimit(params: {
  minedGasLimit?: bigint | null;
  requestedGasLimit?: bigint | null;
}): bigint | null {
  if (params.minedGasLimit != null && params.minedGasLimit > BigInt(0)) {
    return params.minedGasLimit;
  }
  if (params.requestedGasLimit != null && params.requestedGasLimit > BigInt(0)) {
    return params.requestedGasLimit;
  }
  return null;
}

/**
 * True when a mined tx exhausted its gas limit (classic OOG fingerprint).
 * Always pass the mined tx.gas when available — wallets may substitute a lower
 * limit than the app requested (e.g. 6.56M instead of 10M).
 */
export function isOutOfGasReceipt(params: {
  status: "success" | "reverted" | number | string | null | undefined;
  gasLimit: bigint;
  gasUsed: bigint;
}): boolean {
  const status = params.status;
  const reverted =
    status === "reverted" ||
    status === 0 ||
    status === "0" ||
    status === "0x0";
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
  "Deposit ran out of gas. The wallet may have used a lower gas limit than required (minimum 10M). Retry and approve the full gas limit.";

/**
 * Simulate depositFivePoolStrategy with the final submission gas before the
 * wallet prompt. Fail closed on revert so we never submit under-simulated calldata.
 */
export async function preflightDepositFivePoolStrategyCall(params: {
  call: (args: { gas: bigint }) => Promise<unknown>;
  gas: bigint;
}): Promise<void> {
  const gas = requireFivePoolDepositGasLimit(params.gas);
  await params.call({ gas });
}
