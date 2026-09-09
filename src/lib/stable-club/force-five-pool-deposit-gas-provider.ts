/**
 * EIP-1193 wrapper — wallets often replace dapp gas with raw eth_estimateGas
 * (~6.2M) for depositFivePoolStrategy and OOG. Inflate estimateGas + force
 * send/sign gas to the five-pool floor whenever calldata matches.
 */
import {
  forceDepositFivePoolStrategyGasLimit,
  inflateDepositFivePoolEstimateGasHex,
  isDepositFivePoolStrategyCalldata,
  parseHexGasQuantity,
  toHexGasQuantity,
} from "@/lib/stable-club/five-pool-deposit-gas";

type RequestFn = (args: {
  method: string;
  params?: unknown;
}) => Promise<unknown>;

function readTxData(tx: Record<string, unknown> | null | undefined): string | null {
  if (!tx || typeof tx !== "object") return null;
  const data = tx.data ?? tx.input;
  return typeof data === "string" ? data : null;
}

function forceTxGas(tx: Record<string, unknown>): Record<string, unknown> {
  const fromGas = parseHexGasQuantity(
    (tx.gas as string | number | bigint | undefined) ??
      (tx.gasLimit as string | number | bigint | undefined),
  );
  const forced = forceDepositFivePoolStrategyGasLimit(fromGas);
  const hex = toHexGasQuantity(forced);
  const next = { ...tx, gas: hex };
  delete next.gasLimit;
  return next;
}

/**
 * Wrap any EIP-1193-like provider. Preserves the input type for viem `custom()`.
 */
export function wrapProviderForceFivePoolDepositGas<T>(provider: T): T {
  const baseRequest = (provider as { request: RequestFn }).request.bind(
    provider,
  ) as RequestFn;

  const request: RequestFn = async (args) => {
    const method = args.method;
    const params = Array.isArray(args.params) ? [...args.params] : args.params;

    if (method === "eth_estimateGas" && Array.isArray(params) && params[0]) {
      const tx = params[0] as Record<string, unknown>;
      const result = await baseRequest({ method, params });
      if (
        isDepositFivePoolStrategyCalldata(readTxData(tx)) &&
        typeof result === "string"
      ) {
        return inflateDepositFivePoolEstimateGasHex(result);
      }
      return result;
    }

    if (
      (method === "eth_sendTransaction" || method === "eth_signTransaction") &&
      Array.isArray(params) &&
      params[0] &&
      typeof params[0] === "object"
    ) {
      const tx = params[0] as Record<string, unknown>;
      if (isDepositFivePoolStrategyCalldata(readTxData(tx))) {
        const forcedTx = forceTxGas(tx);
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
