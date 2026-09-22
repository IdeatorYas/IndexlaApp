/**
 * EIP-1193 wrapper — mobile wallets re-simulate exitPercentToUsdc with a tight
 * default gas even when eth_sendTransaction carries the dapp limit.
 *
 * Two modes:
 * - Desktop oneshot (default): short-circuit eth_estimateGas, force eth_call gas,
 *   optionally pin EIP-1559 fees.
 * - Mobile/chunk (`omitFees`): match the working deposit wrap — pass-through
 *   eth_estimateGas then inflate to HTTP cached gas, do NOT intercept eth_call,
 *   force gas only on send (no fee pin, no value inject). Screenshot proved
 *   fee pin and fee omit alone still bare-4001; deposit wrap shape is the next
 *   proven Phantom-compatible path.
 */
import {
  forceGatewayExitTxGas,
  isGatewayExitPercentToUsdcCalldata,
  GATEWAY_EXIT_GAS_ABSOLUTE_MIN,
  parseHexGasQuantity,
  toHexGasQuantity,
  enrichGatewayWithdrawProviderReject,
} from "@/lib/stable-club/gateway-exit-gas";

type RequestFn = (args: {
  method: string;
  params?: unknown;
}) => Promise<unknown>;

export type ForceGatewayExitGasOptions = {
  /** HTTP-computed gas to return from eth_estimateGas / inject into eth_call. */
  cachedExitGas?: bigint;
  /** Live HTTP maxFeePerGas — pin on desktop oneshot only (not mobile chunks). */
  maxFeePerGas?: bigint;
  /** Live HTTP tip — pin alongside maxFeePerGas on desktop oneshot. */
  maxPriorityFeePerGas?: bigint;
  /**
   * Mobile/chunk mode: deposit-style prepare (pass-through estimateGas + inflate,
   * no eth_call hijack) and strip fee fields on send.
   */
  omitFees?: boolean;
};

function readTxFields(tx: Record<string, unknown> | null | undefined): {
  data: string | null;
  gas: string | number | bigint | undefined;
} {
  if (!tx || typeof tx !== "object") return { data: null, gas: undefined };
  const data =
    typeof tx.data === "string"
      ? tx.data
      : typeof tx.input === "string"
        ? tx.input
        : null;
  const gas =
    (tx.gas as string | number | bigint | undefined) ??
    (tx.gasLimit as string | number | bigint | undefined);
  return { data, gas };
}

function resolveForcedGasHex(
  existing: string | number | bigint | undefined,
  cachedExitGas: bigint | undefined,
): `0x${string}` {
  // Honor any positive cached exit gas (affordability-clamped estimate×buffer).
  if (cachedExitGas != null && cachedExitGas > BigInt(0)) {
    const fromExisting = parseHexGasQuantity(existing ?? null);
    const pick =
      fromExisting != null && fromExisting > cachedExitGas
        ? fromExisting
        : cachedExitGas;
    return toHexGasQuantity(pick);
  }
  return forceGatewayExitTxGas({ gas: existing });
}

function withForcedGasAndFees(
  tx: Record<string, unknown>,
  opts: ForceGatewayExitGasOptions | undefined,
): Record<string, unknown> {
  const { gas } = readTxFields(tx);
  const next: Record<string, unknown> = {
    ...tx,
    gas: resolveForcedGasHex(gas, opts?.cachedExitGas),
  };
  delete next.gasLimit;
  if (opts?.omitFees) {
    delete next.maxFeePerGas;
    delete next.maxPriorityFeePerGas;
    delete next.gasPrice;
    // Deposit wrap does not inject value — leave absent so Phantom fills defaults.
  } else {
    if (opts?.maxFeePerGas != null && opts.maxFeePerGas > BigInt(0)) {
      next.maxFeePerGas = toHexGasQuantity(opts.maxFeePerGas);
      delete next.gasPrice;
    }
    if (
      opts?.maxPriorityFeePerGas != null &&
      opts.maxPriorityFeePerGas > BigInt(0)
    ) {
      next.maxPriorityFeePerGas = toHexGasQuantity(opts.maxPriorityFeePerGas);
    }
    if (next.value == null) {
      next.value = "0x0";
    }
  }
  return next;
}

export function wrapProviderForceGatewayExitGas<T>(
  provider: T,
  opts?: ForceGatewayExitGasOptions,
): T {
  const cachedExitGas = opts?.cachedExitGas;
  const matchDepositPrepare = Boolean(opts?.omitFees);
  const baseRequest = (provider as { request: RequestFn }).request.bind(
    provider,
  ) as RequestFn;

  const request: RequestFn = async (args) => {
    const method = args.method;
    const params = Array.isArray(args.params) ? [...args.params] : args.params;

    if (method === "eth_estimateGas" && Array.isArray(params) && params[0]) {
      const tx = params[0] as Record<string, unknown>;
      const { data } = readTxFields(tx);
      if (isGatewayExitPercentToUsdcCalldata(data)) {
        if (matchDepositPrepare) {
          // Deposit-style: ask the wallet, then inflate to HTTP cached floor.
          const result = await baseRequest({ method, params });
          if (typeof result === "string") {
            const walletGas = parseHexGasQuantity(result) ?? BigInt(0);
            const floor =
              cachedExitGas != null && cachedExitGas > BigInt(0)
                ? cachedExitGas
                : GATEWAY_EXIT_GAS_ABSOLUTE_MIN;
            const pick = walletGas > floor ? walletGas : floor;
            return toHexGasQuantity(pick);
          }
          return result;
        }
        // Desktop oneshot: short-circuit — never ask the wallet to estimate.
        return resolveForcedGasHex(
          readTxFields(tx).gas,
          cachedExitGas ?? GATEWAY_EXIT_GAS_ABSOLUTE_MIN,
        );
      }
      return baseRequest({ method, params });
    }

    // Desktop oneshot only — mobile/chunk must not re-enter Phantom on eth_call
    // (deposit wrap does not intercept eth_call either).
    if (
      !matchDepositPrepare &&
      method === "eth_call" &&
      Array.isArray(params) &&
      params[0]
    ) {
      const tx = params[0] as Record<string, unknown>;
      const { data } = readTxFields(tx);
      if (isGatewayExitPercentToUsdcCalldata(data)) {
        const forcedTx = withForcedGasAndFees(tx, opts);
        return baseRequest({
          method,
          params: [forcedTx, ...params.slice(1)],
        });
      }
      return baseRequest({ method, params });
    }

    if (
      (method === "eth_sendTransaction" ||
        method === "eth_signTransaction" ||
        method === "wallet_sendTransaction") &&
      Array.isArray(params) &&
      params[0] &&
      typeof params[0] === "object"
    ) {
      const tx = params[0] as Record<string, unknown>;
      const { data } = readTxFields(tx);
      if (isGatewayExitPercentToUsdcCalldata(data)) {
        const forcedTx = withForcedGasAndFees(tx, opts);
        try {
          return await baseRequest({
            method,
            params: [forcedTx, ...params.slice(1)],
          });
        } catch (sendErr) {
          throw enrichGatewayWithdrawProviderReject(sendErr, forcedTx, method);
        }
      }
    }

    return baseRequest(args);
  };

  return new Proxy(provider as object, {
    get(target, prop, receiver) {
      if (prop === "request") return request;
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}

export {
  GATEWAY_EXIT_GAS_ABSOLUTE_MIN,
  parseHexGasQuantity,
  toHexGasQuantity,
};
