/**
 * EIP-1193 wrapper — mobile wallets re-simulate exitPercentToUsdc with a tight
 * default gas (~6M) even when eth_sendTransaction carries 10M. That preflight
 * OOG/reverts and the wallet surfaces "User rejected the request" (not a cancel).
 *
 * Cover eth_call + eth_estimateGas (short-circuit) + send/sign + wallet_sendTransaction.
 */
import {
  forceGatewayExitTxGas,
  isGatewayExitPercentToUsdcCalldata,
  GATEWAY_EXIT_GAS_FLOOR,
  parseHexGasQuantity,
  toHexGasQuantity,
} from "@/lib/stable-club/gateway-exit-gas";

type RequestFn = (args: {
  method: string;
  params?: unknown;
}) => Promise<unknown>;

export type ForceGatewayExitGasOptions = {
  /** HTTP-computed gas to return from eth_estimateGas / inject into eth_call. */
  cachedExitGas?: bigint;
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
  if (cachedExitGas != null && cachedExitGas >= GATEWAY_EXIT_GAS_FLOOR) {
    const fromExisting = parseHexGasQuantity(existing ?? null);
    const pick =
      fromExisting != null && fromExisting > cachedExitGas
        ? fromExisting
        : cachedExitGas;
    return forceGatewayExitTxGas({ gas: pick });
  }
  return forceGatewayExitTxGas({ gas: existing });
}

function withForcedGas(
  tx: Record<string, unknown>,
  cachedExitGas: bigint | undefined,
): Record<string, unknown> {
  const { gas } = readTxFields(tx);
  const next: Record<string, unknown> = {
    ...tx,
    gas: resolveForcedGasHex(gas, cachedExitGas),
  };
  delete next.gasLimit;
  return next;
}

export function wrapProviderForceGatewayExitGas<T>(
  provider: T,
  opts?: ForceGatewayExitGasOptions,
): T {
  const cachedExitGas = opts?.cachedExitGas;
  const baseRequest = (provider as { request: RequestFn }).request.bind(
    provider,
  ) as RequestFn;

  const request: RequestFn = async (args) => {
    const method = args.method;
    const params = Array.isArray(args.params) ? [...args.params] : args.params;

    // Short-circuit — never ask the wallet to estimate (mobile false-rejects).
    if (method === "eth_estimateGas" && Array.isArray(params) && params[0]) {
      const tx = params[0] as Record<string, unknown>;
      const { data } = readTxFields(tx);
      if (isGatewayExitPercentToUsdcCalldata(data)) {
        return resolveForcedGasHex(
          readTxFields(tx).gas,
          cachedExitGas ?? GATEWAY_EXIT_GAS_FLOOR,
        );
      }
      return baseRequest({ method, params });
    }

    // Wallet confirm preflight often eth_call's with missing/low gas.
    if (method === "eth_call" && Array.isArray(params) && params[0]) {
      const tx = params[0] as Record<string, unknown>;
      const { data } = readTxFields(tx);
      if (isGatewayExitPercentToUsdcCalldata(data)) {
        const forcedTx = withForcedGas(tx, cachedExitGas);
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
        const forcedTx = withForcedGas(tx, cachedExitGas);
        return baseRequest({ method, params: [forcedTx, ...params.slice(1)] });
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
  GATEWAY_EXIT_GAS_FLOOR,
  parseHexGasQuantity,
  toHexGasQuantity,
};
