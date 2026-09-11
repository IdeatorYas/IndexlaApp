/**
 * EIP-1193 wrapper — this wallet strips dapp `gas` and re-estimates.
 * Inflate eth_estimateGas + force send/sign gas for owner NPM multicall(bytes[]).
 *
 * Live OOG: tx 0xd73deb70… mined gasLimit==gasUsed==429802 while app requested ≥700k floor.
 */
import {
  applyOwnerNpmMulticallGasBuffer,
  forceOwnerNpmMulticallTxGas,
  inflateOwnerNpmMulticallEstimateGasHex,
  isOwnerNpmMulticallCall,
  OWNER_NPM_MULTICALL_GAS_FLOOR,
  parseHexGasQuantity,
  toHexGasQuantity,
} from "@/lib/stable-club/owner-npm-multicall-gas";

type RequestFn = (args: {
  method: string;
  params?: unknown;
}) => Promise<unknown>;

function readTxFields(tx: Record<string, unknown> | null | undefined): {
  to: string | null;
  data: string | null;
} {
  if (!tx || typeof tx !== "object") return { to: null, data: null };
  const to = typeof tx.to === "string" ? tx.to : null;
  const data =
    typeof tx.data === "string"
      ? tx.data
      : typeof tx.input === "string"
        ? tx.input
        : null;
  return { to, data };
}

export function wrapProviderForceOwnerNpmMulticallGas<T>(provider: T): T {
  const baseRequest = (provider as { request: RequestFn }).request.bind(
    provider,
  ) as RequestFn;

  const request: RequestFn = async (args) => {
    const method = args.method;
    const params = Array.isArray(args.params) ? [...args.params] : args.params;

    if (method === "eth_estimateGas" && Array.isArray(params) && params[0]) {
      const tx = params[0] as Record<string, unknown>;
      const { to, data } = readTxFields(tx);
      const result = await baseRequest({ method, params });
      if (isOwnerNpmMulticallCall({ to, data }) && typeof result === "string") {
        return inflateOwnerNpmMulticallEstimateGasHex(result);
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
      const { to, data } = readTxFields(tx);
      if (isOwnerNpmMulticallCall({ to, data })) {
        const forcedTx: Record<string, unknown> = {
          ...tx,
          gas: forceOwnerNpmMulticallTxGas({
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
  applyOwnerNpmMulticallGasBuffer,
  OWNER_NPM_MULTICALL_GAS_FLOOR,
  parseHexGasQuantity,
  toHexGasQuantity,
};
