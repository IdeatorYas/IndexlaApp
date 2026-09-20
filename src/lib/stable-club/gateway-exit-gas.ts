/**
 * Ops Gateway exitPercentToUsdc gas policy — same class as five-pool deposit:
 * mobile wallets (Coinbase / in-app) re-estimate or strip dapp gas and fail
 * simulation with "Failed to simulate the results of this request."
 *
 * Mirror deposit: HTTP estimate + 40% + 10M floor, force at EIP-1193 boundary.
 */

/** Extra headroom over eth_estimateGas (basis points). 4000 = +40%. */
export const GATEWAY_EXIT_GAS_BUFFER_BPS = 4_000;

/** Minimum gas for exitPercentToUsdc (5 LP decrease/collect/burn + swaps). */
export const GATEWAY_EXIT_GAS_FLOOR = BigInt(10_000_000);

/**
 * exitPercentToUsdc((address,uint256,uint128,uint256,uint256,bool)[],(address,uint24,uint256,uint256)[],uint256,uint256)
 */
export const GATEWAY_EXIT_PERCENT_TO_USDC_SELECTOR = "0x4a41f906";

export const GATEWAY_EXIT_GAS_CEILING = BigInt(30_000_000);

export const GATEWAY_EXIT_OOG_USER_MESSAGE =
  "Gateway withdraw ran out of gas. Retry and keep gas limit ≥ 10,000,000 (do not accept a tight wallet estimate).";

/**
 * Mobile wallets often return "User rejected the request" after a failed
 * internal simulation (low-gas eth_call), not after a deliberate cancel.
 */
export const GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE =
  "Wallet could not simulate gateway exit (often a low-gas preflight — not a cancel). Keep gas ≥ 10,000,000, do not edit gas manually, and retry Withdraw. LPs are untouched until a tx confirms.";

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

/** True when wallet returned 4001 / UserRejected — often a failed private sim, not cancel. */
export function isGatewayWithdrawWalletRejectError(err: unknown): boolean {
  const msg = collectWalletErrorText(err);
  if (/failed to simulate|simulation failed|could not simulate|internal JSON-RPC/i.test(msg)) {
    return true;
  }
  if (/user rejected|denied|rejected the request|ACTION_REJECTED|code[:\s]*4001|\b4001\b/i.test(msg)) {
    return true;
  }
  const code = (err as { code?: unknown } | null)?.code;
  return code === 4001 || code === "4001" || code === "ACTION_REJECTED";
}

export function formatGatewayWithdrawWalletError(err: unknown): string | null {
  if (!isGatewayWithdrawWalletRejectError(err)) return null;
  // 4001 / "user rejected" after HTTP preflight usually means wallet closed a
  // failed sim sheet — not a deliberate cancel of a healthy confirm.
  return GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE;
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

export function applyGatewayExitGasBuffer(estimateGas: bigint): bigint {
  if (estimateGas <= BigInt(0)) {
    throw new Error("Gateway exit estimateGas must be > 0");
  }
  const buffered =
    (estimateGas * BigInt(10_000 + GATEWAY_EXIT_GAS_BUFFER_BPS)) /
    BigInt(10_000);
  const withFloor =
    buffered > GATEWAY_EXIT_GAS_FLOOR ? buffered : GATEWAY_EXIT_GAS_FLOOR;
  if (withFloor > GATEWAY_EXIT_GAS_CEILING) {
    throw new Error(
      `Gateway exit gas estimate too high (${withFloor.toString()}). Refresh and retry.`,
    );
  }
  return withFloor;
}

export function requireGatewayExitGasLimit(gas: bigint): bigint {
  if (gas < GATEWAY_EXIT_GAS_FLOOR) {
    throw new Error(
      `Gateway exit gas limit ${gas.toString()} is below the required minimum ${GATEWAY_EXIT_GAS_FLOOR.toString()}.`,
    );
  }
  if (gas > GATEWAY_EXIT_GAS_CEILING) {
    throw new Error(
      `Gateway exit gas limit ${gas.toString()} exceeds ceiling ${GATEWAY_EXIT_GAS_CEILING.toString()}.`,
    );
  }
  return gas;
}

export function forceGatewayExitTxGas(params: {
  gas?: string | number | bigint | null;
}): `0x${string}` {
  const fromGas = parseHexGasQuantity(params.gas ?? null);
  const base =
    fromGas != null && fromGas > BigInt(0)
      ? fromGas
      : GATEWAY_EXIT_GAS_FLOOR;
  return toHexGasQuantity(
    requireGatewayExitGasLimit(
      base < GATEWAY_EXIT_GAS_FLOOR ? GATEWAY_EXIT_GAS_FLOOR : base,
    ),
  );
}

export function inflateGatewayExitEstimateGasHex(
  estimateHex: string,
): `0x${string}` {
  const estimate = parseHexGasQuantity(estimateHex);
  if (estimate == null || estimate <= BigInt(0)) {
    return toHexGasQuantity(GATEWAY_EXIT_GAS_FLOOR);
  }
  return toHexGasQuantity(applyGatewayExitGasBuffer(estimate));
}
