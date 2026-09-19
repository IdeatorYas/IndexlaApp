/**
 * Utility Index cold-sell batching helpers (EIP-5792 + EIP-7702 type-4).
 * Tokens stay in the user EOA. No vault / sequential fallback.
 */
import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { RH_CHAIN_ID } from "@/lib/utility-index/constants";

export const RH_CHAIN_HEX = `0x${RH_CHAIN_ID.toString(16)}` as Hex;

/** Live Calibur on Robinhood 4663 (probed; used by fork/aa scripts). */
export const CALIBUR_RH = "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00" as Address;

const caliburExecuteAbi = parseAbi([
  "function execute(((address to, uint256 value, bytes data)[] calls, bool revertOnFailure) batchedCall)",
]);

export type BatchCall = { to: Address; data: Hex; value: Hex };

export function encodeCaliburExecute(calls: BatchCall[]): Hex {
  return encodeFunctionData({
    abi: caliburExecuteAbi,
    functionName: "execute",
    args: [
      {
        calls: calls.map((c) => ({
          to: c.to,
          value: BigInt(c.value),
          data: c.data,
        })),
        revertOnFailure: true,
      },
    ],
  });
}

export function buildType4CaliburExecuteTx(args: {
  from: Address;
  nonce: Hex;
  calls: BatchCall[];
  calibur?: Address;
  gas?: Hex;
}): { method: "eth_sendTransaction"; params: [Record<string, unknown>] } {
  const calibur = (args.calibur ?? CALIBUR_RH).toLowerCase() as Hex;
  const executeCalldata = encodeCaliburExecute(args.calls);
  const auth = {
    chainId: RH_CHAIN_HEX,
    address: calibur,
    nonce: args.nonce,
  };
  const tx: Record<string, unknown> = {
    from: args.from,
    to: args.from,
    value: "0x0",
    data: executeCalldata,
    type: "0x4",
    chainId: RH_CHAIN_HEX,
    nonce: args.nonce,
    authorizationList: [auth],
  };
  if (args.gas) tx.gas = args.gas;
  return { method: "eth_sendTransaction", params: [tx] };
}

/** True when wallet_sendCalls failed because EIP-5792 is unavailable on this chain. */
export function isSendCallsNetworkUnsupported(detail: string): boolean {
  return /UNRECOGNIZED|Specified network|5710|Unsupported chain|chain not supported|32600|32601|Unsupported method|method not found|5700/i.test(
    detail,
  );
}
