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

/** Absolute floor only when network quotes absurdly low (0.05 gwei). Not 5 gwei. */
export const GATEWAY_EXIT_LIVE_FEE_FLOOR_WEI = BigInt(50_000_000);

/**
 * @deprecated Historical MetaMask-style 5 gwei floor — DO NOT use for affordability.
 * Kept only so old tests/docs can reference the prior bug. Live path uses
 * GATEWAY_EXIT_LIVE_FEE_FLOOR_WEI + network×pad.
 */
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
  "Wallet could not simulate gateway exit (fee reserve or private sim). Keep the dapp gas limit, do not edit gas, and retry. If ETH is low, top up a little Base ETH. LPs stay untouched until a tx confirms.";

/**
 * Mobile wallets (Phantom / MM) often privately reserve gas×~1 gwei+ even on Base.
 * Used only to remap false 4001 → guidance — never as a submitted maxFeePerGas.
 */
export const GATEWAY_EXIT_WALLET_PRIVATE_FEE_FLOOR_WEI = BigInt(1_000_000_000);

function collectWalletErrorText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (typeof err !== "object") return String(err);
  const e = err as {
    message?: unknown;
    shortMessage?: unknown;
    details?: unknown;
    data?: unknown;
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
    e.data != null
      ? typeof e.data === "string"
        ? e.data
        : safeJsonSlice(e.data, 240)
      : null,
    collectWalletErrorText(e.cause),
  ];
  return parts.filter((p) => typeof p === "string" && p.length > 0).join(" | ");
}

function safeJsonSlice(value: unknown, max: number): string {
  try {
    const raw = JSON.stringify(value);
    return raw.length > max ? `${raw.slice(0, max)}…` : raw;
  } catch {
    return String(value).slice(0, max);
  }
}

/**
 * Full EIP-1193 / viem reject dump for mobile forensics.
 * Do not treat 4001 as proof of a manual cancel without this body.
 */
export function serializeGatewayWithdrawProviderError(
  err: unknown,
  depth = 0,
): string {
  if (depth > 6) return "…";
  if (err == null) return "";
  if (typeof err === "string") return err.slice(0, 400);
  if (typeof err !== "object") return String(err);
  const e = err as Record<string, unknown>;
  const bits: string[] = [];
  if (e.name != null) bits.push(`name=${String(e.name)}`);
  if (e.code != null) bits.push(`code=${String(e.code)}`);
  if (e.shortMessage != null) {
    bits.push(`short=${String(e.shortMessage).slice(0, 200)}`);
  }
  if (e.message != null) bits.push(`msg=${String(e.message).slice(0, 320)}`);
  if (e.details != null) {
    bits.push(`details=${String(e.details).slice(0, 320)}`);
  }
  if (e.data != null) {
    bits.push(
      `data=${
        typeof e.data === "string"
          ? e.data.slice(0, 240)
          : safeJsonSlice(e.data, 280)
      }`,
    );
  }
  if (e.cause != null) {
    bits.push(
      `cause={${serializeGatewayWithdrawProviderError(e.cause, depth + 1)}}`,
    );
  }
  const out = bits.join(" ");
  return out.length > 1_200 ? `${out.slice(0, 1_200)}…` : out;
}

/** Compact forced eth_sendTransaction fields for reject dumps. */
export function formatForcedGatewayExitTxForDump(
  tx: Record<string, unknown> | null | undefined,
): string {
  if (!tx || typeof tx !== "object") return "";
  const data =
    typeof tx.data === "string"
      ? tx.data
      : typeof tx.input === "string"
        ? tx.input
        : "";
  const parts = [
    tx.from != null ? `from=${String(tx.from)}` : null,
    tx.to != null ? `to=${String(tx.to)}` : null,
    data ? `sel=${data.slice(0, 10)}` : null,
    tx.gas != null ? `gas=${String(tx.gas)}` : null,
    tx.maxFeePerGas != null ? `maxFee=${String(tx.maxFeePerGas)}` : null,
    tx.maxPriorityFeePerGas != null
      ? `tip=${String(tx.maxPriorityFeePerGas)}`
      : null,
    tx.value != null ? `value=${String(tx.value)}` : null,
    tx.type != null ? `type=${String(tx.type)}` : null,
  ];
  return parts.filter(Boolean).join(" ");
}

export function enrichGatewayWithdrawProviderReject(
  err: unknown,
  forcedTx?: Record<string, unknown> | null,
  method?: string,
): Error {
  if (
    err instanceof Error &&
    (/forcedTx\[/.test(err.message) || /provider\[/.test(err.message))
  ) {
    return err;
  }
  const dump = serializeGatewayWithdrawProviderError(err);
  const txDump = formatForcedGatewayExitTxForDump(forcedTx);
  const header =
    err instanceof Error && err.message
      ? err.message.slice(0, 280)
      : "Wallet rejected gateway exit";
  const body = [
    header,
    method ? `rpcMethod=${method}` : null,
    txDump ? `forcedTx[${txDump}]` : null,
    dump ? `provider[${dump}]` : null,
  ]
    .filter(Boolean)
    .join(" — ");
  const out = new Error(body);
  (out as Error & { cause?: unknown }).cause = err;
  return out;
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

export function formatGatewayWithdrawWalletError(
  err: unknown,
  context?: {
    submittedGas?: bigint;
    ethBalance?: bigint;
    networkMaxFee?: bigint;
  },
): string | null {
  if (isGatewayWithdrawSimulationError(err)) {
    return GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE;
  }
  // Bare 4001 after an unaffordable fee-reserve prompt is wallet Close-only, not a cancel.
  if (
    context &&
    context.submittedGas != null &&
    context.ethBalance != null &&
    isGatewayWithdrawUserRejectError(err)
  ) {
    if (
      context.networkMaxFee != null &&
      isGatewayExitFeeReserveUnaffordable({
        gas: context.submittedGas,
        ethBalance: context.ethBalance,
        networkMaxFee: context.networkMaxFee,
      })
    ) {
      return GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE;
    }
    if (
      isGatewayExitWalletPrivateFeeUnaffordable({
        gas: context.submittedGas,
        ethBalance: context.ethBalance,
      })
    ) {
      return GATEWAY_EXIT_WALLET_SIM_USER_MESSAGE;
    }
  }
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

/** Conservative maxFee from live network quote × pad (no fixed 5 gwei floor). */
export function conservativeGatewayExitMaxFee(networkMaxFee: bigint): bigint {
  if (networkMaxFee <= BigInt(0)) {
    return GATEWAY_EXIT_LIVE_FEE_FLOOR_WEI;
  }
  const padded = networkMaxFee * GATEWAY_EXIT_FEE_PAD_MULT;
  return padded > GATEWAY_EXIT_LIVE_FEE_FLOOR_WEI
    ? padded
    : GATEWAY_EXIT_LIVE_FEE_FLOOR_WEI;
}

/** True when submitted gas × live conservative fee exceeds wallet ETH (MM Close-only risk). */
export function isGatewayExitFeeReserveUnaffordable(params: {
  gas: bigint;
  ethBalance: bigint;
  networkMaxFee: bigint;
}): boolean {
  if (params.gas <= BigInt(0) || params.ethBalance <= BigInt(0)) return true;
  const fee = conservativeGatewayExitMaxFee(params.networkMaxFee);
  return params.gas * fee > params.ethBalance;
}

/** True when gas × mobile private fee floor exceeds ETH (false 4001 risk). */
export function isGatewayExitWalletPrivateFeeUnaffordable(params: {
  gas: bigint;
  ethBalance: bigint;
}): boolean {
  if (params.gas <= BigInt(0) || params.ethBalance <= BigInt(0)) return true;
  return (
    params.gas * GATEWAY_EXIT_WALLET_PRIVATE_FEE_FLOOR_WEI > params.ethBalance
  );
}

/**
 * Wallet-visible maxFeePerGas for exit sends.
 * Phantom/MM ignore dust Base fees (~0.007 gwei) and pad ≥1 gwei privately.
 * Pin max(network×12, 1 gwei), capped so gas×maxFee ≤ 90% ETH.
 * Throws if even the 1 gwei floor exceeds the ETH budget (top up required).
 */
export function resolveWalletVisibleGatewayExitMaxFee(params: {
  exitGas: bigint;
  ethBalance: bigint;
  networkMaxFee: bigint;
}): bigint {
  if (params.exitGas <= BigInt(0)) {
    throw new Error("Gateway exit gas must be > 0 to resolve wallet-visible fees");
  }
  if (params.ethBalance <= BigInt(0)) {
    throw new Error(
      "Not enough Base ETH for gateway exit fee reserve. Top up Base ETH and retry. LPs untouched.",
    );
  }
  const ethBudget =
    (params.ethBalance * GATEWAY_EXIT_ETH_BUDGET_BPS) / BigInt(10_000);
  const affordableFee = ethBudget / params.exitGas;
  const preferred = (() => {
    const padded = conservativeGatewayExitMaxFee(params.networkMaxFee);
    return padded > GATEWAY_EXIT_WALLET_PRIVATE_FEE_FLOOR_WEI
      ? padded
      : GATEWAY_EXIT_WALLET_PRIVATE_FEE_FLOOR_WEI;
  })();
  if (affordableFee < GATEWAY_EXIT_WALLET_PRIVATE_FEE_FLOOR_WEI) {
    const need =
      params.exitGas * GATEWAY_EXIT_WALLET_PRIVATE_FEE_FLOOR_WEI;
    const fmt = (w: bigint) => `${(Number(w) / 1e18).toFixed(6)} ETH`;
    throw new Error(
      `Not enough Base ETH for wallet fee reserve: have ${fmt(params.ethBalance)}, ` +
        `need ~${fmt(need)} at 1 gwei (mobile wallets pad fees above Base's dust rates). ` +
        `Top up ETH and retry. LPs untouched.`,
    );
  }
  return preferred < affordableFee ? preferred : affordableFee;
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
