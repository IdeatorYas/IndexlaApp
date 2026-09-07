/**
 * Product Withdraw — call only allowlisted Uniswap V3 / Aerodrome Slipstream NPMs.
 * Never INDEXLA executor/adapters. Never ERC20/ERC721 approve (same selector 0x095ea7b3).
 */
import {
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import {
  BASE_DEX_AERODROME_CURRENT,
  BASE_DEX_AERODROME_LEGACY,
  BASE_DEX_UNISWAP_V3,
} from "@/lib/stable-club/official-pools";

export const NPM_DIRECT_WITHDRAW_ENGINE = "npm-direct-v3" as const;

/** ERC20 + ERC721 share this selector — wallets label both as “approves ERC20…”. */
export const APPROVE_SELECTOR = "0x095ea7b3";

export const ALLOWED_BASE_NPM_ADDRESSES: readonly Address[] = [
  getAddress(BASE_DEX_UNISWAP_V3.npm),
  getAddress(BASE_DEX_AERODROME_CURRENT.npm),
  getAddress(BASE_DEX_AERODROME_LEGACY.npm),
];

const allowedNpmSet = new Set(
  ALLOWED_BASE_NPM_ADDRESSES.map((a) => a.toLowerCase()),
);

export const npmPositionManagerAbi = [
  {
    type: "function",
    name: "decreaseLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "liquidity", type: "uint128" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "collect",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "amount0Max", type: "uint128" },
          { name: "amount1Max", type: "uint128" },
        ],
      },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "burn",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

export function assertAllowedNpm(npm: Address): Address {
  const checksummed = getAddress(npm);
  if (!allowedNpmSet.has(checksummed.toLowerCase())) {
    throw new Error(
      `Refusing withdraw: ${checksummed} is not an allowlisted Uniswap/Aerodrome NPM`,
    );
  }
  return checksummed;
}

export function assertNotApproveCalldata(data: Hex): void {
  if (data.slice(0, 10).toLowerCase() === APPROVE_SELECTOR) {
    throw new Error(
      "Refusing withdraw: calldata is approve() — INDEXLA never requests token/NFT approve on Withdraw",
    );
  }
}

export function buildNpmWithdrawMulticallCalls(params: {
  tokenId: bigint;
  liquidity: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  deadline: bigint;
  recipient: Address;
  burnAfter: boolean;
}): { calls: Hex[]; multicallData: Hex } {
  const decrease = encodeFunctionData({
    abi: npmPositionManagerAbi,
    functionName: "decreaseLiquidity",
    args: [
      {
        tokenId: params.tokenId,
        liquidity: params.liquidity,
        amount0Min: params.amount0Min,
        amount1Min: params.amount1Min,
        deadline: params.deadline,
      },
    ],
  });
  assertNotApproveCalldata(decrease);

  const collect = encodeFunctionData({
    abi: npmPositionManagerAbi,
    functionName: "collect",
    args: [
      {
        tokenId: params.tokenId,
        recipient: getAddress(params.recipient),
        amount0Max: BigInt("0xffffffffffffffffffffffffffffffff"),
        amount1Max: BigInt("0xffffffffffffffffffffffffffffffff"),
      },
    ],
  });
  assertNotApproveCalldata(collect);

  const calls: Hex[] = [decrease, collect];
  if (params.burnAfter) {
    const burn = encodeFunctionData({
      abi: npmPositionManagerAbi,
      functionName: "burn",
      args: [params.tokenId],
    });
    assertNotApproveCalldata(burn);
    calls.push(burn);
  }

  const multicallData = encodeFunctionData({
    abi: npmPositionManagerAbi,
    functionName: "multicall",
    args: [calls],
  });
  assertNotApproveCalldata(multicallData);
  return { calls, multicallData };
}

/** @deprecated Prefer buildNpmWithdrawMulticallCalls */
export function buildNpmWithdrawMulticallData(params: {
  tokenId: bigint;
  liquidity: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  deadline: bigint;
  recipient: Address;
  burnAfter: boolean;
}): Hex {
  return buildNpmWithdrawMulticallCalls(params).multicallData;
}
