/**
 * Recover loose cbBTC / WETH left in the user wallet (e.g. after failed npm-direct legs)
 * into USDC via the verified Uniswap V3 SwapRouter on Base — never INDEXLA contracts.
 *
 * STF root cause (live 50% withdraw): approve mined for amountIn, but simulate/swap used a
 * wallet-provider eth_call that still saw allowance=0 → Uniswap TransferHelper "STF".
 * Always read/simulate on a fresh HTTP client and poll allowance after approve.
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

/** USDC/cbBTC and USDC/WETH Uni 0.05% pools on Base. */
const UNI_FEE_005 = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function readTokenBalanceAndRouterAllowance(params: {
  publicClient: Pick<PublicClient, "readContract">;
  token: Address;
  owner: Address;
  router: Address;
}): Promise<{ balance: bigint; allowance: bigint }> {
  const balance = (await params.publicClient.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.owner],
  })) as bigint;
  const allowance = (await params.publicClient.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.owner, params.router],
  })) as bigint;
  return { balance, allowance };
}

/**
 * Poll HTTP/read client until allowance >= minAmount (wallet EIP-1193 eth_call is often stale).
 */
export async function waitUntilRouterAllowance(params: {
  publicClient: Pick<PublicClient, "readContract">;
  token: Address;
  owner: Address;
  router: Address;
  minAmount: bigint;
  attempts?: number;
  delayMs?: number;
}): Promise<bigint> {
  const attempts = params.attempts ?? 40;
  const delayMs = params.delayMs ?? 250;
  let last = BigInt(0);
  for (let i = 0; i < attempts; i += 1) {
    const { allowance } = await readTokenBalanceAndRouterAllowance({
      publicClient: params.publicClient,
      token: params.token,
      owner: params.owner,
      router: params.router,
    });
    last = allowance;
    if (allowance >= params.minAmount) return allowance;
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
 *
 * publicClient MUST be an HTTP/read transport (not wallet EIP-1193) for allowance + simulate.
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
  let { balance, allowance } = await readTokenBalanceAndRouterAllowance({
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
    allowance = await waitUntilRouterAllowance({
      publicClient: params.publicClient,
      token: params.tokenIn,
      owner: params.account,
      router,
      minAmount: params.amountIn,
    });
    ({ balance } = await readTokenBalanceAndRouterAllowance({
      publicClient: params.publicClient,
      token: params.tokenIn,
      owner: params.account,
      router,
    }));
  }

  assertRecoverSpendable({
    balance,
    allowance,
    amountIn: params.amountIn,
  });

  try {
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
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (/\bSTF\b/i.test(text) || /SafeTransferFrom/i.test(text)) {
      throw new Error(UNI_SWAP_ROUTER02_STF_MESSAGE);
    }
    throw err;
  }

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
      args: [router, params.amountIn],
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
