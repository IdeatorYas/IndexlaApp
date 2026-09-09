/**
 * Product Withdraw — call only allowlisted Uniswap V3 / Aerodrome Slipstream NPMs.
 * Never INDEXLA executor/adapters. Never ERC20/ERC721 approve (same selector 0x095ea7b3).
 */
import {
  encodeFunctionData,
  decodeFunctionResult,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  BASE_DEX_AERODROME_CURRENT,
  BASE_DEX_AERODROME_LEGACY,
  BASE_DEX_UNISWAP_V3,
} from "@/lib/stable-club/official-pools";
import { applyNpmExitSlippageMin } from "@/lib/stable-club/five-pool-positions";

export const NPM_DIRECT_WITHDRAW_ENGINE = "npm-direct-v4" as const;

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
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "feeOrTickSpacing", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
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

/**
 * eth_call decreaseLiquidity with 0 mins → actual amount0/amount1 the NPM would return,
 * then apply slippage. Fixes Uniswap "Price slippage check" from stale adapter estimates.
 */
export async function quoteNpmDecreaseMins(params: {
  publicClient: Pick<PublicClient, "simulateContract">;
  npm: Address;
  account: Address;
  tokenId: bigint;
  liquidity: bigint;
  deadline: bigint;
  slippageBps: bigint;
}): Promise<{ amount0Min: bigint; amount1Min: bigint; amount0: bigint; amount1: bigint }> {
  const npm = assertAllowedNpm(params.npm);
  const { result } = await params.publicClient.simulateContract({
    address: npm,
    abi: npmPositionManagerAbi,
    functionName: "decreaseLiquidity",
    args: [
      {
        tokenId: params.tokenId,
        liquidity: params.liquidity,
        amount0Min: BigInt(0),
        amount1Min: BigInt(0),
        deadline: params.deadline,
      },
    ],
    account: params.account,
  });
  const amount0 = result[0];
  const amount1 = result[1];
  if (amount0 <= BigInt(0) && amount1 <= BigInt(0)) {
    throw new Error(
      `NPM decreaseLiquidity simulation returned 0/0 for tokenId ${params.tokenId.toString()}`,
    );
  }
  return {
    amount0,
    amount1,
    amount0Min: applyNpmExitSlippageMin(amount0, params.slippageBps),
    amount1Min: applyNpmExitSlippageMin(amount1, params.slippageBps),
  };
}

const MAX_UINT128 = BigInt("0xffffffffffffffffffffffffffffffff");

/**
 * Executor exit quote: multicall decreaseLiquidity(0 mins) + collect.
 * Mins bind only to decrease outputs at the caller-configured slippageBps
 * (product default FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS = 500 = 5% — do not raise).
 * Unwind amounts use collect (includes unpoked fee growth that adapter.positionAmounts misses).
 * Always pass the position's own NPM — wrong NPM yields Slipstream require(..., "ID").
 */
export async function quoteNpmExecutorExit(params: {
  publicClient: Pick<PublicClient, "simulateContract" | "readContract">;
  npm: Address;
  account: Address;
  tokenId: bigint;
  /** Liquidity to remove; full exit passes current position liquidity. */
  liquidity: bigint;
  deadline: bigint;
  slippageBps: bigint;
  /** When true, liquidity calldata for the executor leg is 0 (closePosition). */
  fullExit: boolean;
}): Promise<{
  amount0: bigint;
  amount1: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  collect0: bigint;
  collect1: bigint;
  liquidityCalldata: bigint;
  token0: Address;
  token1: Address;
}> {
  const npm = assertAllowedNpm(params.npm);
  const liqOut = params.liquidity;
  if (!params.fullExit && liqOut <= BigInt(0)) {
    throw new Error(`Partial exit liquidity is zero for tokenId ${params.tokenId.toString()}`);
  }

  let amount0 = BigInt(0);
  let amount1 = BigInt(0);
  let collect0 = BigInt(0);
  let collect1 = BigInt(0);

  if (liqOut > BigInt(0)) {
    const decreaseData = encodeFunctionData({
      abi: npmPositionManagerAbi,
      functionName: "decreaseLiquidity",
      args: [
        {
          tokenId: params.tokenId,
          liquidity: liqOut,
          amount0Min: BigInt(0),
          amount1Min: BigInt(0),
          deadline: params.deadline,
        },
      ],
    });
    const collectData = encodeFunctionData({
      abi: npmPositionManagerAbi,
      functionName: "collect",
      args: [
        {
          tokenId: params.tokenId,
          recipient: getAddress(params.account),
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        },
      ],
    });
    const { result } = await params.publicClient.simulateContract({
      address: npm,
      abi: npmPositionManagerAbi,
      functionName: "multicall",
      args: [[decreaseData, collectData]],
      account: params.account,
    });
    const dec = decodeFunctionResult({
      abi: npmPositionManagerAbi,
      functionName: "decreaseLiquidity",
      data: result[0]!,
    });
    const col = decodeFunctionResult({
      abi: npmPositionManagerAbi,
      functionName: "collect",
      data: result[1]!,
    });
    amount0 = dec[0];
    amount1 = dec[1];
    collect0 = col[0];
    collect1 = col[1];
  } else {
    const { result } = await params.publicClient.simulateContract({
      address: npm,
      abi: npmPositionManagerAbi,
      functionName: "collect",
      args: [
        {
          tokenId: params.tokenId,
          recipient: getAddress(params.account),
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        },
      ],
      account: params.account,
    });
    collect0 = result[0];
    collect1 = result[1];
  }

  if (collect0 <= BigInt(0) && collect1 <= BigInt(0)) {
    throw new Error(
      `NPM collect simulation returned 0/0 for tokenId ${params.tokenId.toString()}`,
    );
  }

  let amount0Min = applyNpmExitSlippageMin(amount0, params.slippageBps);
  let amount1Min = applyNpmExitSlippageMin(amount1, params.slippageBps);
  if (amount0Min === BigInt(0) && amount1Min === BigInt(0)) {
    amount0Min = applyNpmExitSlippageMin(collect0, params.slippageBps);
    amount1Min = applyNpmExitSlippageMin(collect1, params.slippageBps);
  }
  if (amount0Min === BigInt(0) && amount1Min === BigInt(0)) {
    throw new Error(
      `Exit mins are both zero for tokenId ${params.tokenId.toString()} — refusing calldata`,
    );
  }

  const pos = (await params.publicClient.readContract({
    address: npm,
    abi: npmPositionManagerAbi,
    functionName: "positions",
    args: [params.tokenId],
  })) as readonly [
    bigint,
    Address,
    Address,
    Address,
    number,
    number,
    number,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
  ];

  return {
    amount0,
    amount1,
    amount0Min,
    amount1Min,
    collect0,
    collect1,
    liquidityCalldata: params.fullExit ? BigInt(0) : liqOut,
    token0: getAddress(pos[2]),
    token1: getAddress(pos[3]),
  };
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

  return { calls, multicallData: encodeNpmMulticall(calls) };
}

/** Pack many per-position NPM call arrays into one multicall (same NPM only). */
export function encodeNpmMulticall(calls: Hex[]): Hex {
  for (const c of calls) assertNotApproveCalldata(c);
  const multicallData = encodeFunctionData({
    abi: npmPositionManagerAbi,
    functionName: "multicall",
    args: [calls],
  });
  assertNotApproveCalldata(multicallData);
  return multicallData;
}

/**
 * Estimate native ETH needed for a list of NPM multicalls + a small buffer for
 * subsequent Uni recover approve/swap txs. Throws a clear shortfall error.
 */
export async function requireNativeEthForOwnerWithdraw(params: {
  publicClient: Pick<
    PublicClient,
    "getBalance" | "estimateGas" | "estimateFeesPerGas" | "getGasPrice"
  >;
  account: Address;
  txs: { to: Address; data: Hex }[];
  /** Extra synthetic gas units for post-NPM Uni approve+swap recoveries. */
  recoverGasBuffer?: bigint;
}): Promise<{
  have: bigint;
  need: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  if (params.txs.length === 0) {
    throw new Error("No NPM withdraw transactions to fund");
  }
  const fees = await params.publicClient.estimateFeesPerGas();
  const maxFeePerGas =
    fees.maxFeePerGas ?? (await params.publicClient.getGasPrice());
  const maxPriorityFeePerGas =
    fees.maxPriorityFeePerGas && fees.maxPriorityFeePerGas > BigInt(0)
      ? fees.maxPriorityFeePerGas
      : BigInt(1_000_000);
  let gasSum = BigInt(0);
  for (const tx of params.txs) {
    const gas = await params.publicClient.estimateGas({
      account: params.account,
      to: tx.to,
      data: tx.data,
    });
    gasSum += gas;
  }
  gasSum += params.recoverGasBuffer ?? BigInt(400_000);
  // 25% headroom for fee spikes between estimate and wallet broadcast.
  const need = (gasSum * maxFeePerGas * BigInt(125)) / BigInt(100);
  const have = await params.publicClient.getBalance({ address: params.account });
  if (have < need) {
    const short = need - have;
    const fmt = (w: bigint) => `${(Number(w) / 1e18).toFixed(6)} ETH`;
    throw new Error(
      `Not enough Base ETH for gas: have ${fmt(have)}, need ~${fmt(need)} (short ${fmt(short)}). ` +
        `Owner withdraw batches ${params.txs.length} NPM multicall(s) then Uni recover — top up ETH and retry. ` +
        `This is not an LP/NFT failure.`,
    );
  }
  return { have, need, maxFeePerGas, maxPriorityFeePerGas };
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
