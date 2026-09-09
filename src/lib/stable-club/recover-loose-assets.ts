/**
 * Recover loose cbBTC / WETH into USDC via Uniswap V3 SwapRouter02 on Base.
 *
 * Failure mode (post-9e3d55e): per-token rounds + pinned historical reads missed
 * WETH; wallet stripped dapp gas. Fix: read residue at HTTP head, maxUint256
 * approve once per token, one SwapRouter02 multicall(deadline, exactInputSingle[]).
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
  RECOVER_APPROVE_GAS_FLOOR,
  RECOVER_APPROVE_OOG_USER_MESSAGE,
  RECOVER_DUST_EPSILON_BY_SYMBOL,
  RECOVER_MAX_APPROVE_AMOUNT,
  RECOVER_SWAP_GAS_FLOOR,
  RECOVER_SWAP_OOG_USER_MESSAGE,
  RECOVER_SWEEP_GAS_FLOOR,
  RECOVER_SWEEP_OOG_USER_MESSAGE,
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

const uniMulticallDeadlineAbi = [
  {
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [
      { name: "deadline", type: "uint256" },
      { name: "data", type: "bytes[]" },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
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

/** SwapRouter02 multicall(uint256 deadline, bytes[] data) — selector 0x5ae401dc. */
export function buildUniResidueSweepMulticallData(params: {
  legs: { tokenIn: Address; amountIn: bigint; minOut: bigint }[];
  recipient: Address;
  deadline: bigint;
}): Hex {
  if (params.legs.length === 0) {
    throw new Error("Residue sweep multicall requires at least one leg");
  }
  const calls = params.legs.map((leg) =>
    buildUniExactInputSingleCalldata({
      tokenIn: leg.tokenIn,
      amountIn: leg.amountIn,
      recipient: params.recipient,
      minOut: leg.minOut,
    }),
  );
  return encodeFunctionData({
    abi: uniMulticallDeadlineAbi,
    functionName: "multicall",
    args: [params.deadline, calls],
  });
}

async function maxApproveTokenIfNeeded(params: {
  publicClient: Pick<
    PublicClient,
    "readContract" | "estimateContractGas"
  >;
  walletClient: WalletClient;
  account: Address;
  token: Address;
  amountIn: bigint;
  router: Address;
  chain: typeof base;
  walletEstimateGas?: (args: {
    to: Address;
    data: Hex;
  }) => Promise<bigint | null>;
  waitReceipt: (
    hash: Hex,
    opts?: { gasLimit?: bigint; outOfGasMessage?: string },
  ) => Promise<unknown>;
}): Promise<{ approveHash: Hex | null; receiptBlock: bigint | null }> {
  const { balance, allowance } = await readTokenBalanceAndRouterAllowance({
    publicClient: params.publicClient,
    token: params.token,
    owner: params.account,
    router: params.router,
  });
  if (balance < params.amountIn) {
    throw new Error(
      `Recover balance ${balance.toString()} < amountIn ${params.amountIn.toString()}`,
    );
  }
  if (allowance >= params.amountIn) {
    return { approveHash: null, receiptBlock: null };
  }

  const approveAmount = RECOVER_MAX_APPROVE_AMOUNT;
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [params.router, approveAmount],
  });

  const freshApproveEstimate = await params.publicClient.estimateContractGas({
    address: params.token,
    abi: erc20Abi,
    functionName: "approve",
    args: [params.router, approveAmount],
    account: params.account,
  });

  if (params.walletEstimateGas) {
    for (let i = 0; i < 24; i += 1) {
      const walletEstimate = await params
        .walletEstimateGas({ to: params.token, data: approveData })
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

  const submitApprove = async (gas: bigint): Promise<{ hash: Hex; receipt: unknown }> => {
    const hash = await params.walletClient.writeContract({
      address: params.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [params.router, approveAmount],
      account: params.account,
      chain: params.chain,
      gas,
    });
    const receipt = await params.waitReceipt(hash, {
      gasLimit: gas,
      outOfGasMessage: RECOVER_APPROVE_OOG_USER_MESSAGE,
    });
    return { hash, receipt };
  };

  const approveGas = applyRecoverGasBuffer({
    estimateGas: freshApproveEstimate,
    floor: RECOVER_APPROVE_GAS_FLOOR,
  });

  let approveHash: Hex;
  let approveReceipt: unknown;
  try {
    ({ hash: approveHash, receipt: approveReceipt } =
      await submitApprove(approveGas));
  } catch (err) {
    if (!isOutOfGasError(err)) throw err;
    const retryEstimate = await params.publicClient.estimateContractGas({
      address: params.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [params.router, approveAmount],
      account: params.account,
    });
    ({ hash: approveHash, receipt: approveReceipt } = await submitApprove(
      applyRecoverGasBuffer({
        estimateGas: retryEstimate * BigInt(2),
        floor: RECOVER_APPROVE_GAS_FLOOR,
      }),
    ));
  }

  await waitUntilRouterAllowance({
    publicClient: params.publicClient,
    token: params.token,
    owner: params.account,
    router: params.router,
    minAmount: params.amountIn,
  });

  return {
    approveHash,
    receiptBlock: readBlockOf(approveReceipt),
  };
}

function readBlockOf(receipt: unknown): bigint | null {
  const bn = (receipt as { blockNumber?: bigint | null } | null)?.blockNumber;
  return bn == null ? null : BigInt(bn);
}

/**
 * Approve (maxUint256 if needed) + exactInputSingle. publicClient MUST be HTTP for reads.
 * Prefer sweepAllResidueToUsdcOnce when both cbBTC and WETH remain.
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

  const approve = await maxApproveTokenIfNeeded({
    publicClient: params.publicClient,
    walletClient: params.walletClient,
    account: params.account,
    token: params.tokenIn,
    amountIn: params.amountIn,
    router,
    chain,
    walletEstimateGas: params.walletEstimateGas,
    waitReceipt: params.waitReceipt,
  });
  const approveHash = approve.approveHash;
  readBlock = maxBlock(readBlock, approve.receiptBlock);

  const { balance, allowance } = await readTokenBalanceAndRouterAllowance({
    publicClient: params.publicClient,
    token: params.tokenIn,
    owner: params.account,
    router,
  });
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

/**
 * Max-approve each needed token, then one SwapRouter02 multicall of all
 * exactInputSingle legs. Call after reading residue at HTTP head.
 */
export async function sweepAllResidueToUsdcOnce(params: {
  publicClient: Pick<
    PublicClient,
    | "readContract"
    | "simulateContract"
    | "estimateContractGas"
    | "estimateGas"
    | "call"
  >;
  walletClient: WalletClient;
  account: Address;
  legs: {
    tokenIn: Address;
    symbol: "cbBTC" | "WETH";
    amountIn: bigint;
    quotedUsdcOut: bigint;
  }[];
  slippageBps?: bigint;
  deadline?: bigint;
  walletEstimateGas?: (args: {
    to: Address;
    data: Hex;
  }) => Promise<bigint | null>;
  waitReceipt: (
    hash: Hex,
    opts?: { gasLimit?: bigint; outOfGasMessage?: string },
  ) => Promise<unknown>;
}): Promise<{
  sweepHash: Hex;
  approveHashes: Hex[];
  blockNumber: bigint;
}> {
  if (params.legs.length === 0) {
    throw new Error("sweepAllResidueToUsdcOnce: no legs");
  }

  const router = getAddress(BASE_DEX_UNISWAP_V3.swapRouter);
  const chain = params.walletClient.chain ?? base;
  const deadline =
    params.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const slippage = params.slippageBps ?? BigInt(300);

  const swapLegs = params.legs.map((leg) => {
    const minOut = applySlippageMin(leg.quotedUsdcOut, slippage);
    if (minOut <= BigInt(0)) {
      throw new Error(
        `Recover quote minOut is zero for ${leg.symbol} — refresh and retry`,
      );
    }
    if (leg.amountIn <= BigInt(0)) {
      throw new Error(`Recover amountIn is zero for ${leg.symbol}`);
    }
    return {
      tokenIn: leg.tokenIn,
      amountIn: leg.amountIn,
      minOut,
      symbol: leg.symbol,
    };
  });

  let readBlock = BigInt(0);
  const approveHashes: Hex[] = [];
  for (const leg of swapLegs) {
    const approve = await maxApproveTokenIfNeeded({
      publicClient: params.publicClient,
      walletClient: params.walletClient,
      account: params.account,
      token: leg.tokenIn,
      amountIn: leg.amountIn,
      router,
      chain,
      walletEstimateGas: params.walletEstimateGas,
      waitReceipt: params.waitReceipt,
    });
    if (approve.approveHash) approveHashes.push(approve.approveHash);
    readBlock = maxBlock(readBlock, approve.receiptBlock);
  }

  for (const leg of swapLegs) {
    const { balance, allowance } = await readTokenBalanceAndRouterAllowance({
      publicClient: params.publicClient,
      token: leg.tokenIn,
      owner: params.account,
      router,
    });
    assertRecoverSpendable({
      balance,
      allowance,
      amountIn: leg.amountIn,
    });
  }

  const multicallData = buildUniResidueSweepMulticallData({
    legs: swapLegs,
    recipient: params.account,
    deadline,
  });

  try {
    await params.publicClient.call({
      account: params.account,
      to: router,
      data: multicallData,
    });
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (/\bSTF\b/i.test(text) || /SafeTransferFrom/i.test(text)) {
      throw new Error(UNI_SWAP_ROUTER02_STF_MESSAGE);
    }
    throw err;
  }

  const sweepEstimate = await params.publicClient.estimateGas({
    account: params.account,
    to: router,
    data: multicallData,
  });
  const sweepGas = applyRecoverGasBuffer({
    estimateGas: sweepEstimate,
    floor: RECOVER_SWEEP_GAS_FLOOR,
  });

  const sweepHash = await params.walletClient.sendTransaction({
    account: params.account,
    to: router,
    data: multicallData,
    chain,
    gas: sweepGas,
  } as never);
  const sweepReceipt = await params.waitReceipt(sweepHash, {
    gasLimit: sweepGas,
    outOfGasMessage: RECOVER_SWEEP_OOG_USER_MESSAGE,
  });
  readBlock = maxBlock(readBlock, readBlockOf(sweepReceipt));

  return { sweepHash, approveHashes, blockNumber: readBlock };
}

/** @deprecated Prefer recoverLooseAssetToUsdcFully / sweepAllResidueToUsdcOnce. */
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
      args: [router, RECOVER_MAX_APPROVE_AMOUNT],
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
