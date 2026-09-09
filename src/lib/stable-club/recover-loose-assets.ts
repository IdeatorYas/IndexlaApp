/**
 * Recover loose cbBTC / WETH left in the user wallet (e.g. after failed npm-direct legs)
 * into USDC via the verified Uniswap V3 SwapRouter on Base — never INDEXLA contracts.
 */
import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { base } from "viem/chains";
import { BASE_DEX_UNISWAP_V3, BASE_TOKENS } from "@/lib/stable-club/official-pools";
import { applySlippageMin } from "@/lib/stable-club/exit-to-usdc";

export const RECOVER_LOOSE_ASSETS_ENGINE = "uni-router-recover-v1" as const;

const uniExactInputSingleAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

/** USDC/cbBTC and USDC/WETH Uni 0.05% pools on Base. */
const UNI_FEE_005 = 500;

export async function planLooseAssetRecoveries(params: {
  publicClient: Pick<PublicClient, "readContract">;
  account: Address;
  /** When set, only recover up to these caps (withdrawal residue). Omit = full balance. */
  maxByToken?: Partial<Record<"cbBTC" | "WETH", bigint>>;
}): Promise<{ tokenIn: Address; symbol: "cbBTC" | "WETH"; amountIn: bigint }[]> {
  const out: { tokenIn: Address; symbol: "cbBTC" | "WETH"; amountIn: bigint }[] = [];
  for (const row of [
    { tokenIn: BASE_TOKENS.cbBTC.address, symbol: "cbBTC" as const },
    { tokenIn: BASE_TOKENS.WETH.address, symbol: "WETH" as const },
  ]) {
    const bal = (await params.publicClient.readContract({
      address: row.tokenIn,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [params.account],
    })) as bigint;
    if (bal <= BigInt(0)) continue;
    const cap = params.maxByToken?.[row.symbol];
    const amountIn =
      cap === undefined ? bal : bal < cap ? bal : cap;
    if (amountIn > BigInt(0)) out.push({ ...row, amountIn });
  }
  return out;
}

export function buildUniExactInputSingleCalldata(params: {
  tokenIn: Address;
  amountIn: bigint;
  recipient: Address;
  minOut: bigint;
}): Hex {
  return encodeFunctionData({
    abi: uniExactInputSingleAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: getAddress(params.tokenIn),
        tokenOut: getAddress(BASE_TOKENS.USDC.address),
        fee: UNI_FEE_005,
        recipient: getAddress(params.recipient),
        amountIn: params.amountIn,
        amountOutMinimum: params.minOut,
        sqrtPriceLimitX96: BigInt(0),
      },
    ],
  });
}

/**
 * Approve (if needed) + exactInputSingle in one helper. Caller supplies waitReceipt
 * so we never leave a token approved-but-unswapped as a "successful" recover step.
 */
export async function recoverLooseAssetToUsdcFully(params: {
  publicClient: Pick<PublicClient, "readContract" | "simulateContract">;
  walletClient: WalletClient;
  account: Address;
  tokenIn: Address;
  amountIn: bigint;
  quotedUsdcOut: bigint;
  slippageBps?: bigint;
  waitReceipt: (hash: Hex) => Promise<unknown>;
}): Promise<Hex> {
  const router = getAddress(BASE_DEX_UNISWAP_V3.swapRouter);
  const minOut = applySlippageMin(
    params.quotedUsdcOut,
    params.slippageBps ?? BigInt(300),
  );
  if (minOut <= BigInt(0)) {
    throw new Error("Recover quote minOut is zero — refresh and retry");
  }
  if (params.amountIn <= BigInt(0)) {
    throw new Error("Recover amountIn is zero");
  }

  const chain = params.walletClient.chain ?? base;
  const allowance = (await params.publicClient.readContract({
    address: params.tokenIn,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.account, router],
  })) as bigint;

  if (allowance < params.amountIn) {
    const approveHash = await params.walletClient.writeContract({
      address: params.tokenIn,
      abi: erc20Abi,
      functionName: "approve",
      args: [router, params.amountIn],
      account: params.account,
      chain,
    });
    await params.waitReceipt(approveHash);
  }

  await params.publicClient.simulateContract({
    address: router,
    abi: uniExactInputSingleAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: getAddress(params.tokenIn),
        tokenOut: getAddress(BASE_TOKENS.USDC.address),
        fee: UNI_FEE_005,
        recipient: getAddress(params.account),
        amountIn: params.amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: BigInt(0),
      },
    ],
    account: params.account,
  });

  const swapHash = await params.walletClient.writeContract({
    address: router,
    abi: uniExactInputSingleAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: getAddress(params.tokenIn),
        tokenOut: getAddress(BASE_TOKENS.USDC.address),
        fee: UNI_FEE_005,
        recipient: getAddress(params.account),
        amountIn: params.amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: BigInt(0),
      },
    ],
    account: params.account,
    chain,
  });
  await params.waitReceipt(swapHash);
  return swapHash;
}

/** @deprecated Prefer recoverLooseAssetToUsdcFully — approve-only return left residue. */
export async function recoverOneLooseAssetToUsdc(params: {
  publicClient: Pick<PublicClient, "readContract" | "simulateContract">;
  walletClient: WalletClient;
  account: Address;
  tokenIn: Address;
  amountIn: bigint;
  quotedUsdcOut: bigint;
  slippageBps?: bigint;
}): Promise<Hex> {
  const router = getAddress(BASE_DEX_UNISWAP_V3.swapRouter);
  const minOut = applySlippageMin(
    params.quotedUsdcOut,
    params.slippageBps ?? BigInt(300),
  );
  if (minOut <= BigInt(0)) {
    throw new Error("Recover quote minOut is zero — refresh and retry");
  }

  const allowance = (await params.publicClient.readContract({
    address: params.tokenIn,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.account, router],
  })) as bigint;

  const chain = params.walletClient.chain ?? base;

  if (allowance < params.amountIn) {
    const approveHash = await params.walletClient.writeContract({
      address: params.tokenIn,
      abi: erc20Abi,
      functionName: "approve",
      args: [router, params.amountIn],
      account: params.account,
      chain,
    });
    return approveHash;
  }

  await params.publicClient.simulateContract({
    address: router,
    abi: uniExactInputSingleAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: getAddress(params.tokenIn),
        tokenOut: getAddress(BASE_TOKENS.USDC.address),
        fee: UNI_FEE_005,
        recipient: getAddress(params.account),
        amountIn: params.amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: BigInt(0),
      },
    ],
    account: params.account,
  });

  return params.walletClient.writeContract({
    address: router,
    abi: uniExactInputSingleAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: getAddress(params.tokenIn),
        tokenOut: getAddress(BASE_TOKENS.USDC.address),
        fee: UNI_FEE_005,
        recipient: getAddress(params.account),
        amountIn: params.amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: BigInt(0),
      },
    ],
    account: params.account,
    chain,
  });
}
