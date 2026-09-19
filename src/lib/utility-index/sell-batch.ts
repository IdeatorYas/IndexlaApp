/**
 * Utility Index cold-sell batching (EIP-5792 + EIP-7702 Calibur).
 * Tokens stay in the user EOA. No vault / sequential fallback.
 */
import {
  encodeAbiParameters,
  encodeFunctionData,
  hexToBytes,
  numberToHex,
  pad,
  parseAbi,
  bytesToHex,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";
import {
  hashAuthorization,
  recoverAuthorizationAddress,
} from "viem/utils";
import { BASKET, GATEWAY_ADDRESS, RH_CHAIN_ID } from "@/lib/utility-index/constants";

export type Eip1193Requester = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export type Signed7702Authorization = {
  chainId: number;
  address: Address;
  nonce: number;
  yParity: number;
  r: Hex;
  s: Hex;
};

export const RH_CHAIN_HEX = `0x${RH_CHAIN_ID.toString(16)}` as Hex;

/** Live Calibur v10 on Robinhood 4663. */
export const CALIBUR_RH = "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00" as Address;

export const ROOT_KEY_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

/** salt = pad(implementation) with saltPrefix=0 */
export const CALIBUR_SALT = pad(CALIBUR_RH, { dir: "left", size: 32 });

export const CALIBUR_EIP712_TYPES = {
  SignedBatchedCall: [
    { name: "batchedCall", type: "BatchedCall" },
    { name: "nonce", type: "uint256" },
    { name: "keyHash", type: "bytes32" },
    { name: "executor", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
  BatchedCall: [
    { name: "calls", type: "Call[]" },
    { name: "revertOnFailure", type: "bool" },
  ],
  Call: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
} as const;

const caliburExecuteAbi = parseAbi([
  "function execute(((address to, uint256 value, bytes data)[] calls, bool revertOnFailure) batchedCall)",
]);

export const caliburSignedExecuteAbi = [
  {
    name: "execute",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "signedBatchedCall",
        type: "tuple",
        components: [
          {
            name: "batchedCall",
            type: "tuple",
            components: [
              {
                name: "calls",
                type: "tuple[]",
                components: [
                  { name: "to", type: "address" },
                  { name: "value", type: "uint256" },
                  { name: "data", type: "bytes" },
                ],
              },
              { name: "revertOnFailure", type: "bool" },
            ],
          },
          { name: "nonce", type: "uint256" },
          { name: "keyHash", type: "bytes32" },
          { name: "executor", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "wrappedSignature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export type BatchCall = { to: Address; data: Hex; value: Hex };

export type SignedBatchedCallMessage = {
  batchedCall: {
    calls: Array<{ to: Address; value: bigint; data: Hex }>;
    revertOnFailure: boolean;
  };
  nonce: bigint;
  keyHash: Hex;
  executor: Address;
  deadline: bigint;
};

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

/** Wallet ethers ≤6.13.4 rejects type=4 before fold-in (live Backpack-class). */
export function isEthersType4Unsupported(detail: string): boolean {
  return /unsupported transaction type|INVALID_ARGUMENT[\s\S]*value[=:]?\s*4|argument=["']type["'][\s\S]*value[=:]?\s*4/i.test(
    detail,
  );
}

export function caliburTypedDataDomain(user: Address): TypedDataDomain {
  return {
    name: "Calibur",
    version: "1.0.0",
    chainId: RH_CHAIN_ID,
    verifyingContract: user,
    salt: CALIBUR_SALT,
  };
}

export function buildSignedBatchedCallMessage(args: {
  calls: BatchCall[];
  nonce: bigint;
  /** address(0) = any submitter (Relay pattern). */
  executor?: Address;
  deadline?: bigint;
}): SignedBatchedCallMessage {
  return {
    batchedCall: {
      calls: args.calls.map((c) => ({
        to: c.to,
        value: BigInt(c.value),
        data: c.data,
      })),
      revertOnFailure: true,
    },
    nonce: args.nonce,
    keyHash: ROOT_KEY_HASH,
    executor: (args.executor ??
      "0x0000000000000000000000000000000000000000") as Address,
    deadline: args.deadline ?? BigInt(0),
  };
}

/** Calibur execute(SignedBatchedCall): abi.encode(signature, hookData). */
export function wrapCaliburSignature(signature: Hex): Hex {
  return encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes" }],
    [signature, "0x"],
  );
}

export function encodeCaliburSignedExecute(
  message: SignedBatchedCallMessage,
  wrappedSignature: Hex,
): Hex {
  return encodeFunctionData({
    abi: caliburSignedExecuteAbi,
    functionName: "execute",
    args: [message, wrappedSignature],
  });
}

const APPROVE_SELECTOR = "0x095ea7b3";

/** True when EOA already has EIP-7702 code delegated to Calibur. */
export function isCaliburDelegated(
  code: Hex | undefined | null,
  calibur: Address = CALIBUR_RH,
): boolean {
  if (!code || code === "0x" || code.length < 48) return false;
  const lower = code.toLowerCase();
  if (!lower.startsWith("0xef0100")) return false;
  return lower.slice(8) === calibur.toLowerCase().slice(2);
}

function toQuantity(n: number | bigint): Hex {
  return numberToHex(n);
}

function parseSignedAuthorization(
  raw: unknown,
  expected: { chainId: number; address: Address; nonce: number },
): Signed7702Authorization {
  if (typeof raw === "string" && raw.startsWith("0x")) {
    const bytes = hexToBytes(raw as Hex);
    if (bytes.length !== 65) {
      throw new Error(`eth_signAuthorization returned ${bytes.length}-byte sig`);
    }
    const r = bytesToHex(bytes.slice(0, 32));
    const s = bytesToHex(bytes.slice(32, 64));
    const v = bytes[64];
    const yParity = v === 0 || v === 1 ? v : v >= 27 ? v - 27 : v;
    return {
      chainId: expected.chainId,
      address: expected.address,
      nonce: expected.nonce,
      yParity,
      r,
      s,
    };
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("eth_signAuthorization returned empty result");
  }
  const o = raw as Record<string, unknown>;
  const r = String(o.r ?? "") as Hex;
  const s = String(o.s ?? "") as Hex;
  if (!r.startsWith("0x") || !s.startsWith("0x")) {
    throw new Error("eth_signAuthorization missing r/s");
  }
  let yParity = 0;
  if (typeof o.yParity === "number") yParity = o.yParity;
  else if (typeof o.yParity === "string") yParity = Number(o.yParity);
  else if (typeof o.v === "number") yParity = o.v >= 27 ? o.v - 27 : o.v;
  else if (typeof o.v === "string") {
    const v = Number(o.v);
    yParity = v >= 27 ? v - 27 : v;
  }
  const chainId =
    o.chainId != null
      ? typeof o.chainId === "string"
        ? Number.parseInt(o.chainId, o.chainId.startsWith("0x") ? 16 : 10)
        : Number(o.chainId)
      : expected.chainId;
  const nonce =
    o.nonce != null
      ? typeof o.nonce === "string"
        ? Number.parseInt(o.nonce, o.nonce.startsWith("0x") ? 16 : 10)
        : Number(o.nonce)
      : expected.nonce;
  const address = (String(o.address ?? o.contractAddress ?? expected.address) as Address);
  return { chainId, address, nonce, yParity, r, s };
}

/**
 * Sign EIP-7702 authorization via EIP-1193 wallet (AppKit json-rpc).
 * Do NOT use viem walletClient.signAuthorization — it rejects json-rpc accounts.
 * Fallback C2c: eth_sign(hashAuthorization) with recover===signer fail-closed.
 */
export async function signEip7702AuthorizationViaProvider(args: {
  ethereum: Eip1193Requester;
  signer: Address;
  contractAddress?: Address;
  chainId?: number;
  nonce: number;
}): Promise<Signed7702Authorization> {
  const contractAddress = args.contractAddress ?? CALIBUR_RH;
  const chainId = args.chainId ?? RH_CHAIN_ID;
  const authFields = {
    address: contractAddress,
    chainId: toQuantity(chainId),
    nonce: toQuantity(args.nonce),
  };
  const attempts: Array<{ method: string; params: unknown[] }> = [
    { method: "eth_signAuthorization", params: [authFields] },
    { method: "eth_signAuthorization", params: [args.signer, authFields] },
    {
      method: "wallet_signAuthorization",
      params: [{ ...authFields, contractAddress }],
    },
    {
      method: "wallet_signAuthorization",
      params: [args.signer, { ...authFields, contractAddress }],
    },
  ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const raw = await args.ethereum.request(attempt);
      return parseSignedAuthorization(raw, {
        chainId,
        address: contractAddress,
        nonce: args.nonce,
      });
    } catch (e) {
      errors.push(
        `${attempt.method}: ${e instanceof Error ? e.message : String(e)}`.slice(
          0,
          160,
        ),
      );
    }
  }

  // C2c: raw eth_sign over EIP-7702 digest (not personal_sign).
  const digest = hashAuthorization({
    address: contractAddress,
    chainId,
    nonce: args.nonce,
  });
  try {
    const rawSig = (await args.ethereum.request({
      method: "eth_sign",
      params: [args.signer, digest],
    })) as Hex;
    if (typeof rawSig !== "string" || !rawSig.startsWith("0x")) {
      throw new Error("eth_sign returned non-hex");
    }
    const parsed = parseSignedAuthorization(rawSig, {
      chainId,
      address: contractAddress,
      nonce: args.nonce,
    });
    const recovered = await recoverAuthorizationAddress({
      authorization: {
        address: contractAddress,
        chainId,
        nonce: args.nonce,
        r: parsed.r,
        s: parsed.s,
        yParity: parsed.yParity,
      },
    });
    if (recovered.toLowerCase() !== args.signer.toLowerCase()) {
      throw new Error(
        `eth_sign recover mismatch (got ${recovered}, expected ${args.signer})`,
      );
    }
    return parsed;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    errors.push(`eth_sign: ${detail}`.slice(0, 200));
    throw new Error(
      `Cold sell blocked: this wallet cannot produce EIP-7702 authorization. Tried eth_signAuthorization / wallet_signAuthorization / eth_sign(hashAuthorization). Last errors: ${errors.slice(-3).join(" | ")}. Unlock requires wallet support for wallet_sendCalls on Robinhood 4663, type-4 eth_sendTransaction, eth_signAuthorization, or eth_sign of the 7702 digest. Warm sells work after gateway allowances exist. No sequential path.`,
    );
  }
}

/** Allowlist: approve(gateway) for basket tokens, or exitPercentToEth on gateway. */
export function assertAllowlistedSellCalls(
  calls: BatchCall[],
  gateway: Address = GATEWAY_ADDRESS,
): void {
  if (calls.length < 2) {
    throw new Error("Sell batch must include approvals and exit");
  }
  const gatewayLc = gateway.toLowerCase();
  const basket = new Set(BASKET.map((t) => t.address.toLowerCase()));
  const exit = calls[calls.length - 1];
  if (exit.to.toLowerCase() !== gatewayLc) {
    throw new Error("Last call must target gateway exit");
  }
  if (exit.value !== "0x0" && BigInt(exit.value) !== BigInt(0)) {
    throw new Error("Exit call must have zero value");
  }
  for (let i = 0; i < calls.length - 1; i++) {
    const c = calls[i];
    if (!basket.has(c.to.toLowerCase())) {
      throw new Error(`Call ${i} target not in basket`);
    }
    if (!c.data.toLowerCase().startsWith(APPROVE_SELECTOR)) {
      throw new Error(`Call ${i} must be ERC20 approve`);
    }
    // approve(spender, amount) — spender is first address arg (bytes 16..36 of padded word)
    const spenderWord = c.data.slice(34, 74).toLowerCase();
    if (!spenderWord.endsWith(gatewayLc.slice(2))) {
      throw new Error(`Call ${i} approve spender must be gateway`);
    }
  }
}
