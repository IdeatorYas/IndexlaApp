/**
 * Permit2 AllowanceTransfer EIP-712 + gateway register consent signing.
 */
import {
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { OPS_GATEWAY_MAX_PERMIT2_TTL_SEC } from "@/lib/stable-club/ops-gateway";

export const permit2PermitAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
] as const;

export type PermitSingle = {
  details: {
    token: Address;
    amount: bigint;
    expiration: number;
    nonce: number;
  };
  spender: Address;
  sigDeadline: bigint;
};

const PERMIT2_TYPES = {
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
} as const;

const REGISTER_CONSENT_TYPES = {
  RegisterConsent: [
    { name: "user", type: "address" },
    { name: "strategyId", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function assertPermit2Ttl(expirationSec: number, nowSec: number): void {
  if (expirationSec <= nowSec) {
    throw new Error("Permit2 expiration is in the past");
  }
  if (expirationSec > nowSec + OPS_GATEWAY_MAX_PERMIT2_TTL_SEC) {
    throw new Error(
      `Permit2 TTL must be ≤ ${OPS_GATEWAY_MAX_PERMIT2_TTL_SEC / 60} minutes (INDEXLA policy)`,
    );
  }
}

export async function buildAndSignPermit2PermitSingle(params: {
  publicClient: Pick<PublicClient, "readContract">;
  walletClient: Pick<WalletClient, "signTypedData" | "account">;
  owner: Address;
  permit2: Address;
  token: Address;
  spender: Address;
  amount: bigint;
  chainId: number;
  nowSec?: number;
  ttlSec?: number;
}): Promise<{ permitSingle: PermitSingle; signature: Hex }> {
  const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);
  const ttlSec = params.ttlSec ?? OPS_GATEWAY_MAX_PERMIT2_TTL_SEC;
  const expiration = nowSec + ttlSec;
  assertPermit2Ttl(expiration, nowSec);

  const [, , nonce] = await params.publicClient.readContract({
    address: params.permit2,
    abi: permit2PermitAbi,
    functionName: "allowance",
    args: [params.owner, params.token, params.spender],
  });

  const permitSingle: PermitSingle = {
    details: {
      token: getAddress(params.token),
      amount: params.amount,
      expiration,
      nonce: Number(nonce),
    },
    spender: getAddress(params.spender),
    sigDeadline: BigInt(expiration),
  };

  const signature = await params.walletClient.signTypedData({
    account: params.owner,
    domain: {
      name: "Permit2",
      chainId: params.chainId,
      verifyingContract: getAddress(params.permit2),
    },
    types: PERMIT2_TYPES,
    primaryType: "PermitSingle",
    message: {
      details: {
        token: permitSingle.details.token,
        amount: permitSingle.details.amount,
        expiration: permitSingle.details.expiration,
        nonce: permitSingle.details.nonce,
      },
      spender: permitSingle.spender,
      sigDeadline: permitSingle.sigDeadline,
    },
  });

  return { permitSingle, signature };
}

export async function signGatewayRegisterConsent(params: {
  walletClient: Pick<WalletClient, "signTypedData">;
  gateway: Address;
  user: Address;
  strategyId: Hex;
  chainId: number;
  nonce: bigint;
  deadline: bigint;
}): Promise<Hex> {
  return params.walletClient.signTypedData({
    account: params.user,
    domain: {
      name: "StableClubOpsGateway",
      version: "1",
      chainId: params.chainId,
      verifyingContract: getAddress(params.gateway),
    },
    types: REGISTER_CONSENT_TYPES,
    primaryType: "RegisterConsent",
    message: {
      user: getAddress(params.user),
      strategyId: params.strategyId,
      chainId: BigInt(params.chainId),
      nonce: params.nonce,
      deadline: params.deadline,
    },
  });
}
