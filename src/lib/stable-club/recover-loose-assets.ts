/**
 * Recover loose cbBTC / WETH into USDC via Uniswap V3 SwapRouter02 on Base.
 *
 * Live OOG (0xd48ff77b…): second approve after swap zeroed allowance used stale
 * warm-slot gas (43,216) while cold slot needed ~60,761. Fix: approve amountIn+1
 * keepalive, buffered gas floors, pin reads to confirmed blocks, OOG retry once.
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
import { maxBlock } from "@/lib/stable-club/read-block-floor";
import {
  applyRecoverGasBuffer,
  isOutOfGasError,
  isWalletGasEstimateStale,
  RECOVER_ALLOWANCE_KEEPALIVE_WEI,
  RECOVER_APPROVE_GAS_FLOOR,
  RECOVER_APPROVE_OOG_USER_MESSAGE,
  RECOVER_DUST_EPSILON_BY_SYMBOL,
  RECOVER_SWAP_GAS_FLOOR,
  RECOVER_SWAP_OOG_USER_MESSAGE,
} from "@/lib/stable-club/recover-swap-gas";

export const RECOVER_LOOSE_ASSETS_ENGINE = "uni-router-recover-v1" as const;

export const UNI_SWAP_ROUTER02_STF_MESSAGE =
  "Uniswap swap reverted STF (SafeTransferFrom): router lacks allowance or balance for this exact amount. Approve the Uni router, wait for confirmation, then retry residue→USDC.";

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

const UNI_FEE_005 = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function readTokenBalanceAndRouterAllowance(params: {
  publicClient: Pick<PublicClient, "readContract">;
  token: Address;
  owner: Address;
  router: Address;
  blockNumber?: bigint;
}): Promise<{ balance: bigint; allowance: bigint }> {
  const at =
    params.blockNumber == null ? {} : { blockNumber: params.blockNumber };
  const balance = (await params.publicClient.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.owner],
    ...at,
  })) as bigint;
  const allowance = (await params.publicClient.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.owner, params.router],
    ...at,
  })) as bigint;
  return { balance, allowance };
}

export async function waitUntilRouterAllowance(params: {
  publicClient: Pick<PublicClient, "readContract">;
  token: Address;
  owner: Address;
  router: Address;
  minAmount: bigint;
  blockNumber?: bigint;
  attempts?: number;
  delayMs?: number;
}): Promise<bigint> {
  const attempts = params.attempts ?? 40;
  const delayMs = params.delayMs ?? 250;
  let last = BigInt(0);
  for (let i = 0; i < attempts; i += 1) {
    try {
      const { allowance } = await readTokenBalanceAndRouterAllowance({
        publicClient: params.publicClient,
        token: params.token,
        owner: params.owner,
        router: params.router,
        blockNumber: params.blockNumber,
      });
      last = allowance;
      if (allowance >= params.minAmount) return allowance;
    } catch {
      /* node not synced to blockNumber yet */
    }
    await sleep(delayMs);
  }
  throw new Error(
    `${UNI_SWAP_ROUTER02_STF_MESSAGE} (allowance ${last.toString()} < ${params.minAmount.toString()} after approve)`,
  );
}

export function assertRecoverSpendable(params: {
  balance: bigint;
  allowance: bigint;
  amountIn: bigint;
}): void {
  if (params.amountIn <= BigInt(0)) {
    throw new Error("Recover amountIn is zero");
  }
  if (params.balance < params.amountIn) {
    throw new Error(
      `Recover balance ${params.balance.toString()} < amountIn ${params.amountIn.toString()}`,
    );
  }
  if (params.allowance < params.amountIn) {
    throw new Error(
      `${UNI_SWAP_ROUTER02_STF_MESSAGE} (allowance ${params.allowance.toString()} < amountIn ${params.amountIn.toString()})`,
    );
  }
}

export async function planLooseAssetRecoveries(params: {
  publicClient: Pick<PublicClient, "readContract">;
  account: Address;
  maxByToken?: Partial<Record<"cbBTC" | "WETH", bigint>>;
  blockNumber?: bigint;
  /** Drop dust that cannot profitably swap. */
  applyDustFilter?: boolean;
}): Promise<{ tokenIn: Address; symbol: "cbBTC" | "WETH"; amountIn: bigint }[]> {
  const out: { tokenIn: Address; symbol: "cbBTC" | "WETH"; amountIn: bigint }[] =
    [];
  const at =
    params.blockNumber == null ? {} : { blockNumber: params.blockNumber };
  for (const row of [
    { tokenIn: BASE_TOKENS.cbBTC.address, symbol: "cbBTC" as const },
    { tokenIn: BASE_TOKENS.WETH.address, symbol: "WETH" as const },
  ]) {
    const bal = (await params.publicClient.readContract({
      address: row.tokenIn,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [params.account],
      ...at,
    })) as bigint;
    if (bal <= BigInt(0)) continue;
    const cap = params.maxByToken?.[row.symbol];
    const amountIn = cap === undefined ? bal : bal < cap ? bal : cap;
    if (amountIn <= BigInt(0)) continue;
    if (
      params.applyDustFilter !== false &&
      amountIn <= RECOVER_DUST_EPSILON_BY_SYMBOL[row.symbol]
    ) {
      continue;
    }
    out.push({ ...row, amountIn });
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

function readBlockOf(receipt: unknown): bigint | null {
  const bn = (receipt as { blockNumber?: bigint | null } | null)?.blockNumber;
  return bn == null ? null : BigInt(bn);
}

/**
 * Approve (if needed) + exactInputSingle. publicClient MUST be HTTP for reads.
 */
export async function recoverLooseAssetToUsdcFully(params: {
  publicClient: Pick<
    PublicClient,
    "readContract" | "simulateContract" | "estimateContractGas"
  >;
  walletClient: WalletClient;
  account: Address;
  tokenIn: Address;
  amountIn: bigint;
  quotedUsdcOut: bigint;
  slippageBps?: bigint;
  minReadBlock?: bigint;
  walletEstimateGas?: (args: {
    to: Address;
    data: Hex;
  }) => Promise<bigint | null>;
  waitReceipt: (
    hash: Hex,
    opts?: { gasLimit?: bigint; outOfGasMessage?: string },
  ) => Promise<unknown>;
}): Promise<{ swapHash: Hex; approveHash: Hex | null; blockNumber: bigint }> {
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
  let readBlock = params.minReadBlock ?? BigInt(0);
  const readAt = () => (readBlock > BigInt(0) ? readBlock : undefined);

  let { balance, allowance } = await readTokenBalanceAndRouterAllowance({
    publicClient: params.publicClient,
    token: params.tokenIn,
    owner: params.account,
    router,
    blockNumber: readAt(),
  });

  if (balance < params.amountIn) {
    throw new Error(
      `Recover balance ${balance.toString()} < amountIn ${params.amountIn.toString()}`,
    );
  }

  let approveHash: Hex | null = null;

  if (allowance < params.amountIn) {
    const approveAmount = params.amountIn + RECOVER_ALLOWANCE_KEEPALIVE_WEI;
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [router, approveAmount],
    });

    const freshApproveEstimate = await params.publicClient.estimateContractGas({
      address: params.tokenIn,
      abi: erc20Abi,
      functionName: "approve",
      args: [router, approveAmount],
      account: params.account,
    });

    if (params.walletEstimateGas) {
      for (let i = 0; i < 24; i += 1) {
        const walletEstimate = await params
          .walletEstimateGas({ to: params.tokenIn, data: approveData })
          .catch(() => null);
        if (
          walletEstimate == null ||
          !isWalletGasEstimateStale({
            walletEstimate,
            freshEstimate: freshApproveEstimate,
          })
        ) {
          break;
        }
        await sleep(500);
      }
    }

    const submitApprove = async (gas: bigint): Promise<unknown> => {
      approveHash = await params.walletClient.writeContract({
        address: params.tokenIn,
        abi: erc20Abi,
        functionName: "approve",
        args: [router, approveAmount],
        account: params.account,
        chain,
        gas,
      });
      return params.waitReceipt(approveHash, {
        gasLimit: gas,
        outOfGasMessage: RECOVER_APPROVE_OOG_USER_MESSAGE,
      });
    };

    const approveGas = applyRecoverGasBuffer({
      estimateGas: freshApproveEstimate,
      floor: RECOVER_APPROVE_GAS_FLOOR,
    });

    let approveReceipt: unknown;
    try {
      approveReceipt = await submitApprove(approveGas);
    } catch (err) {
      if (!isOutOfGasError(err)) throw err;
      const retryEstimate = await params.publicClient.estimateContractGas({
        address: params.tokenIn,
        abi: erc20Abi,
        functionName: "approve",
        args: [router, approveAmount],
        account: params.account,
      });
      approveReceipt = await submitApprove(
        applyRecoverGasBuffer({
          estimateGas: retryEstimate * BigInt(2),
          floor: RECOVER_APPROVE_GAS_FLOOR,
        }),
      );
    }

    readBlock = maxBlock(readBlock, readBlockOf(approveReceipt));
    allowance = await waitUntilRouterAllowance({
      publicClient: params.publicClient,
      token: params.tokenIn,
      owner: params.account,
      router,
      minAmount: params.amountIn,
      blockNumber: readAt(),
    });
    ({ balance } = await readTokenBalanceAndRouterAllowance({
      publicClient: params.publicClient,
      token: params.tokenIn,
      owner: params.account,
      router,
      blockNumber: readAt(),
    }));
    if (balance < params.amountIn) {
      throw new Error(
        `Recover balance ${balance.toString()} < amountIn ${params.amountIn.toString()}`,
      );
    }
  }

  assertRecoverSpendable({
    balance,
    allowance,
    amountIn: params.amountIn,
  });

  const swapArgs = [
    {
      tokenIn: getAddress(params.tokenIn),
      tokenOut: getAddress(BASE_TOKENS.USDC.address),
      fee: UNI_FEE_005,
      recipient: getAddress(params.account),
      amountIn: params.amountIn,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: BigInt(0),
    },
  ] as const;

  try {
    await params.publicClient.simulateContract({
      address: router,
      abi: uniExactInputSingleAbi,
      functionName: "exactInputSingle",
      args: swapArgs,
      account: params.account,
      ...(readAt() == null ? {} : { blockNumber: readAt() }),
    });
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (/\bSTF\b/i.test(text) || /SafeTransferFrom/i.test(text)) {
      throw new Error(UNI_SWAP_ROUTER02_STF_MESSAGE);
    }
    throw err;
  }

  const swapEstimate = await params.publicClient.estimateContractGas({
    address: router,
    abi: uniExactInputSingleAbi,
    functionName: "exactInputSingle",
    args: swapArgs,
    account: params.account,
  });
  const swapGas = applyRecoverGasBuffer({
    estimateGas: swapEstimate,
    floor: RECOVER_SWAP_GAS_FLOOR,
  });

  const swapHash = await params.walletClient.writeContract({
    address: router,
    abi: uniExactInputSingleAbi,
    functionName: "exactInputSingle",
    args: swapArgs,
    account: params.account,
    chain,
    gas: swapGas,
  });
  const swapReceipt = await params.waitReceipt(swapHash, {
    gasLimit: swapGas,
    outOfGasMessage: RECOVER_SWAP_OOG_USER_MESSAGE,
  });
  readBlock = maxBlock(readBlock, readBlockOf(swapReceipt));

  return { swapHash, approveHash, blockNumber: readBlock };
}

/** @deprecated Prefer recoverLooseAssetToUsdcFully. */
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
  const { balance, allowance } = await readTokenBalanceAndRouterAllowance({
    publicClient: params.publicClient,
    token: params.tokenIn,
    owner: params.account,
    router,
  });
  if (balance < params.amountIn) {
    throw new Error(
      `Recover balance ${balance.toString()} < amountIn ${params.amountIn.toString()}`,
    );
  }
  const chain = params.walletClient.chain ?? base;
  if (allowance < params.amountIn) {
    return params.walletClient.writeContract({
      address: params.tokenIn,
      abi: erc20Abi,
      functionName: "approve",
      args: [router, params.amountIn + RECOVER_ALLOWANCE_KEEPALIVE_WEI],
      account: params.account,
      chain,
    });
  }
  assertRecoverSpendable({ balance, allowance, amountIn: params.amountIn });
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
