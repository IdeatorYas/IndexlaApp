/**
 * EIP-1193 wrapper — mobile wallets strip dapp gas and re-estimate.
 * Inflate eth_estimateGas + force send/sign gas for Ops Gateway exitPercentToUsdc.
 */
import {
  forceGatewayExitTxGas,
  inflateGatewayExitEstimateGasHex,
  isGatewayExitPercentToUsdcCalldata,
  GATEWAY_EXIT_GAS_FLOOR,
  parseHexGasQuantity,
  toHexGasQuantity,
} from "@/lib/stable-club/gateway-exit-gas";

type RequestFn = (args: {
  method: string;
  params?: unknown;
}) => Promise<unknown>;

function readTxData(tx: Record<string, unknown> | null | undefined): string | null {
  if (!tx || typeof tx !== "object") return null;
  const data = tx.data ?? tx.input;
  return typeof data === "string" ? data : null;
}

export function wrapProviderForceGatewayExitGas<T>(provider: T): T {
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
        isGatewayExitPercentToUsdcCalldata(readTxData(tx)) &&
        typeof result === "string"
      ) {
        return inflateGatewayExitEstimateGasHex(result);
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
      if (isGatewayExitPercentToUsdcCalldata(readTxData(tx))) {
        const forcedTx: Record<string, unknown> = {
          ...tx,
          gas: forceGatewayExitTxGas({
            gas:
              (tx.gas as string | number | bigint | undefined) ??
              (tx.gasLimit as string | number | bigint | undefined),
          }),
        };
        delete forcedTx.gasLimit;
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
