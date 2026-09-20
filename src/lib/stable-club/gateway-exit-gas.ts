/**
 * Ops Gateway exitPercentToUsdc gas policy.
 *
 * MetaMask Mobile privately simulates with its own fee padding and does NOT
 * run the dapp EIP-1193 wrap. Inflating gasLimit (1.5M / 10M floors) makes
 * gasLimit × padded maxFee exceed low ETH balances → "Failed to simulate"
 * with Close-only (no Confirm). Use HTTP estimate × buffer, then clamp to
 * what the wallet can afford at a conservative padded maxFee.
 */

/** Extra headroom over eth_estimateGas (basis points). 4000 = +40%. */
export const GATEWAY_EXIT_GAS_BUFFER_BPS = 4_000;

/**
 * Historical full-exit floor (deposit-class). Kept for tests/legacy callers;
 * wallet-visible exit gas must NOT force this — use resolveGatewayExitGas.
 */
export const GATEWAY_EXIT_GAS_FLOOR = BigInt(10_000_000);

/**
 * Historical single-LP chunk floor. Kept for tests/legacy; do not force on
 * wallet-visible gas (friend ETH ~0.006 fails at 5 gwei × 1.5M).
 */
export const GATEWAY_EXIT_CHUNK_GAS_FLOOR = BigInt(1_500_000);

/**
 * exitPercentToUsdc((address,uint256,uint128,uint256,uint256,bool)[],(address,uint24,uint256,uint256)[],uint256,uint256)
 */
export const GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR = "0x4a41f906";

export const GATEWAY_EXIT_GAS_CEILING = BigInt(30_000_000);

/** Absolute minimum gas we will send (below typical single-LP estimate). */
export const GATEWAY_EXIT_GAS_ABSOLUTE_MIN = BigInt(300_000);

/** MetaMask-style fee pad floor used for affordability clamp (5 gwei). */
export const GATEWAY_EXIT_CONSERVATIVE_MAX_FEE_WEI = BigInt(5_000_000_000);

/** Multiplier on network maxFee when computing conservative pad. */
export const GATEWAY_EXIT_FEE_PAD_MULT = BigInt(12);

/** Spend at most this fraction of ETH on gas reserve (bps). 9000 = 90%. */
export const GATEWAY_EXIT_ETH_BUDGET_BPS = BigInt(9_000);

export const GATEWAY_EXIT_OOG_USER_MESSAGE =
  "Gateway withdraw ran out of gas. Retry Withdraw without lowering the gas limit.";

export const GATEWAY_EXIT_CHUNK_OOG_USER_MESSAGE =
  "Gateway exit chunk ran out of gas. Retry without lowering the gas limit.";

/**
 * Only for proven wallet/RPC simulation failures — never for 4001 / user reject.
 */
export const GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE =
  "Wallet could not simulate gateway exit (often gasLimit × fee reserve exceeds ETH). Keep the dapp gas limit, do not edit gas manually, and retry Withdraw. LPs are untouched until a tx confirms.";

function collectWalletErrorText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (typeof err !== "object") return String(err);
  const e = err as {
    message?: unknown;
    shortMessage?: unknown;
    details?: unknown;
    code?: unknown;
    name?: unknown;
    cause?: unknown;
  };
  const parts = [
    e.name,
    e.code != null ? `code:${String(e.code)}` : null,
    e.shortMessage,
    e.message,
    e.details,
    collectWalletErrorText(e.cause),
  ];
  return parts.filter((p) => typeof p === "string" && p.length > 0).join(" | ");
}

/** Explicit simulation / RPC failure — not user cancel. */
export function isGatewayWithdrawSimulationError(err: unknown): boolean {
  const msg = collectWalletErrorText(err);
  return /failed to simulate|simulation failed|could not simulate|internal JSON-RPC/i.test(
    msg,
  );
}

/** Genuine wallet cancel / reject — must not be remapped to sim guidance. */
export function isGatewayWithdrawUserRejectError(err: unknown): boolean {
  if (isGatewayWithdrawSimulationError(err)) return false;
  const msg = collectWalletErrorText(err);
  if (/user rejected|denied the request|rejected the request|ACTION_REJECTED|\b4001\b/i.test(msg)) {
    return true;
  }
  const code = (err as { code?: unknown } | null)?.code;
  return code === 4001 || code === "4001" || code === "ACTION_REJECTED";
}

/**
 * @deprecated Prefer isGatewayWithdrawSimulationError / isGatewayWithdrawUserRejectError.
 */
export function isGatewayWithdrawWalletRejectError(err: unknown): boolean {
  return isGatewayWithdrawSimulationError(err);
}

export function formatGatewayWithdrawWalletError(err: unknown): string | null {
  if (isGatewayWithdrawSimulationError(err)) {
    return GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE;
  }
  // Never remap bare 4001 / user rejected to sim-preflight — surface wallet text.
  return null;
}

export function parseHexGasQuantity(
  value: string | number | bigint | null | undefined,
): bigint | null {
  if (value == null) return null;
  try {
    if (typeof value === "bigint") return value > BigInt(0) ? value : null;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value <= 0) return null;
      return BigInt(Math.floor(value));
    }
    const raw = value.trim().toLowerCase();
    if (!raw) return null;
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export function toHexGasQuantity(gas: bigint): `0x${string}` {
  return `0x${gas.toString(16)}` as `0x${string}`;
}

export function isGatewayExitPercentToUsdcCalldata(
  data: string | null | undefined,
): boolean {
  if (!data || typeof data !== "string") return false;
  return data.trim().toLowerCase().startsWith(GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR);
}

/**
 * estimate × 1.4. Optional floor is for legacy callers; preferred path uses
 * floor = absolute min only (no 1.5M/10M).
 */
export function applyGatewayExitGasBuffer(
  estimateGas: bigint,
  opts?: { floor?: bigint },
): bigint {
  if (estimateGas <= BigInt(0)) {
    throw new Error("Gateway exit estimateGas must be > 0");
  }
  const floor = opts?.floor ?? GATEWAY_EXIT_GAS_ABSOLUTE_MIN;
  const buffered =
    (estimateGas * BigInt(10_000 + GATEWAY_EXIT_GAS_BUFFER_BPS)) /
    BigInt(10_000);
  const withFloor = buffered > floor ? buffered : floor;
  if (withFloor > GATEWAY_EXIT_GAS_CEILING) {
    throw new Error(
      `Gateway exit gas estimate too high (${withFloor.toString()}). Refresh and retry.`,
    );
  }
  return withFloor;
}

export function requireGatewayExitGasLimit(
  gas: bigint,
  opts?: { floor?: bigint },
): bigint {
  const floor = opts?.floor ?? GATEWAY_EXIT_GAS_ABSOLUTE_MIN;
  if (gas < floor) {
    throw new Error(
      `Gateway exit gas limit ${gas.toString()} is below the required minimum ${floor.toString()}.`,
    );
  }
  if (gas > GATEWAY_EXIT_GAS_CEILING) {
    throw new Error(
      `Gateway exit gas limit ${gas.toString()} exceeds ceiling ${GATEWAY_EXIT_GAS_CEILING.toString()}.`,
    );
  }
  return gas;
}

/** Conservative maxFee for MetaMask Mobile fee-reserve checks. */
export function conservativeGatewayExitMaxFee(networkMaxFee: bigint): bigint {
  const padded = networkMaxFee * GATEWAY_EXIT_FEE_PAD_MULT;
  return padded > GATEWAY_EXIT_CONSERVATIVE_MAX_FEE_WEI
    ? padded
    : GATEWAY_EXIT_CONSERVATIVE_MAX_FEE_WEI;
}

/**
 * Cap gas so gas × conservativeMaxFee ≤ ethBudget. Never below rawEstimate
 * (or absolute min). Throws if even rawEstimate is unaffordable.
 */
export function clampGatewayExitGasToAffordability(params: {
  gas: bigint;
  rawEstimate: bigint;
  ethBalance: bigint;
  networkMaxFee: bigint;
}): bigint {
  const minGas =
    params.rawEstimate > GATEWAY_EXIT_GAS_ABSOLUTE_MIN
      ? params.rawEstimate
      : GATEWAY_EXIT_GAS_ABSOLUTE_MIN;
  const fee = conservativeGatewayExitMaxFee(params.networkMaxFee);
  if (fee <= BigInt(0)) {
    return requireGatewayExitGasLimit(params.gas, { floor: minGas });
  }
  const ethBudget =
    (params.ethBalance * GATEWAY_EXIT_ETH_BUDGET_BPS) / BigInt(10_000);
  const maxAffordable = ethBudget / fee;
  if (maxAffordable < minGas) {
    const need = minGas * fee;
    const fmt = (w: bigint) => `${(Number(w) / 1e18).toFixed(6)} ETH`;
    throw new Error(
      `Not enough Base ETH for gateway exit gas reserve: have ${fmt(params.ethBalance)}, ` +
        `need ~${fmt(need)} at conservative ${fee.toString()} wei/gas. Top up ETH and retry. LPs untouched.`,
    );
  }
  const capped = params.gas < maxAffordable ? params.gas : maxAffordable;
  const picked = capped < minGas ? minGas : capped;
  return requireGatewayExitGasLimit(picked, { floor: minGas });
}

/** estimate → buffer → affordability clamp. Primary wallet-visible gas path. */
export function resolveGatewayExitGas(params: {
  estimateGas: bigint;
  ethBalance: bigint;
  networkMaxFee: bigint;
}): bigint {
  const buffered = applyGatewayExitGasBuffer(params.estimateGas);
  return clampGatewayExitGasToAffordability({
    gas: buffered,
    rawEstimate: params.estimateGas,
    ethBalance: params.ethBalance,
    networkMaxFee: params.networkMaxFee,
  });
}

export function forceGatewayExitTxGas(params: {
  gas?: string | number | bigint | null;
}): `0x${string}` {
  const fromGas = parseHexGasQuantity(params.gas ?? null);
  const base =
    fromGas != null && fromGas > BigInt(0)
      ? fromGas
      : GATEWAY_EXIT_GAS_ABSOLUTE_MIN;
  return toHexGasQuantity(
    requireGatewayExitGasLimit(base, { floor: GATEWAY_EXIT_GAS_ABSOLUTE_MIN }),
  );
}

export function inflateGatewayExitEstimateGasHex(
  estimateHex: string,
): `0x${string}` {
  const estimate = parseHexGasQuantity(estimateHex);
  if (estimate == null || estimate <= BigInt(0)) {
    return toHexGasQuantity(GATEWAY_EXIT_GAS_ABSOLUTE_MIN);
  }
  return toHexGasQuantity(applyGatewayExitGasBuffer(estimate));
}
