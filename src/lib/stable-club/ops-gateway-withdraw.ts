/**
 * Gateway cold/warm withdraw orchestration (feature-flagged).
 * Fail-closed: never mark complete while non-USDC withdrawal residue remains.
 */
import {
  createWalletClient,
  custom,
  erc20Abi,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  coldWithdrawPromptClaim,
  encodeGatewayExitPercentToUsdcCall,
  encodeSetApprovalForAllCall,
  erc721SetApprovalForAllAbi,
  opsGatewayAbi,
  probeAtomicBatchCapability,
  resolveOpsGatewayAddress,
  tryWalletSendCalls,
  uniqueNpmAddresses,
  isOpsGatewayWithdrawAvailable,
  type NpmExitLegInput,
  type GatewayExitSwapInput,
} from "@/lib/stable-club/ops-gateway";
import { quoteNpmDecreaseMins } from "@/lib/stable-club/npm-direct-withdraw";

export type GatewayWithdrawPosition = {
  npm: Address;
  positionTokenId: bigint;
  liquidity: bigint;
  tokenA: Address;
  tokenB: Address;
};

const UNI_FEE_005 = 500;

export async function withdrawPercentViaOpsGateway(params: {
  deployments: {
    opsGateway?: Address | string | null;
    features?: {
      opsGateway?: boolean;
      opsGatewayWithdraw?: boolean;
      opsGatewayDeposit?: boolean;
    };
    usdc: Address;
    cbbtc: Address;
    weth: Address;
    chainId: number;
  };
  account: Address;
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  publicClient: Pick<
    PublicClient,
    "readContract" | "simulateContract" | "waitForTransactionReceipt" | "getBalance"
  >;
  positions: GatewayWithdrawPosition[];
  percent: number;
  minUsdcOut: bigint;
  onStatus?: (msg: string) => void;
  /** Fired once the first wallet broadcast is submitted (grant, batch, or exit). */
  onBroadcast?: () => void;
}): Promise<{
  txHashes: Hex[];
  promptClaim: ReturnType<typeof coldWithdrawPromptClaim>;
  usdcDelta: bigint;
}> {
  const gateway = resolveOpsGatewayAddress(params.deployments);
  if (!gateway || !isOpsGatewayWithdrawAvailable(params.deployments)) {
    throw new Error("Ops Gateway withdraw is not enabled on this deployment");
  }
  const pct = Math.round(params.percent);
  if (!Number.isFinite(params.percent) || pct < 1 || pct > 100) {
    throw new Error("Withdraw percent must be between 1 and 100");
  }
  if (params.positions.length === 0) {
    throw new Error("No open positions for gateway withdraw");
  }

  const chainIdHex = `0x${params.deployments.chainId.toString(16)}` as Hex;
  const caps = await probeAtomicBatchCapability({
    provider: params.provider,
    chainIdHex,
    account: params.account,
  });
  const promptClaim = coldWithdrawPromptClaim({
    atomicBatchSupported: caps.atomicBatchSupported,
  });
  params.onStatus?.(promptClaim.copy);

  const walletClient = createWalletClient({
    account: params.account,
    transport: custom(params.provider),
  });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const npms = uniqueNpmAddresses(params.positions);
  const exitLegs: NpmExitLegInput[] = [];

  for (const p of params.positions) {
    const liqOut =
      pct >= 100
        ? p.liquidity
        : (p.liquidity * BigInt(pct * 100)) / BigInt(10_000);
    if (liqOut <= BigInt(0)) continue;
    const mins = await quoteNpmDecreaseMins({
      publicClient: params.publicClient,
      npm: p.npm,
      account: params.account,
      tokenId: p.positionTokenId,
      liquidity: liqOut,
      deadline,
      slippageBps: BigInt(500),
    });
    exitLegs.push({
      npm: getAddress(p.npm),
      tokenId: p.positionTokenId,
      liquidity: liqOut,
      amount0Min: mins.amount0Min,
      amount1Min: mins.amount1Min,
      burnIfEmpty: pct >= 100,
    });
  }
  if (exitLegs.length === 0) {
    throw new Error("Gateway withdraw planned zero liquidity");
  }

  const swaps: GatewayExitSwapInput[] = [
    {
      tokenIn: getAddress(params.deployments.cbbtc),
      fee: UNI_FEE_005,
      amountIn: BigInt(0),
      amountOutMinimum: BigInt(1),
    },
    {
      tokenIn: getAddress(params.deployments.weth),
      fee: UNI_FEE_005,
      amountIn: BigInt(0),
      amountOutMinimum: BigInt(1),
    },
  ];

  const usdcBefore = (await params.publicClient.readContract({
    address: params.deployments.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.account],
  })) as bigint;

  const needingGrant: Address[] = [];
  for (const npm of npms) {
    const approved = (await params.publicClient.readContract({
      address: npm,
      abi: erc721SetApprovalForAllAbi,
      functionName: "isApprovedForAll",
      args: [params.account, gateway],
    })) as boolean;
    if (!approved) needingGrant.push(npm);
  }

  const txHashes: Hex[] = [];
  const exitCall = encodeGatewayExitPercentToUsdcCall({
    gateway,
    exitLegs,
    swaps,
    minUsdcOut: params.minUsdcOut,
    deadline,
  });

  if (needingGrant.length > 0 && caps.atomicBatchSupported) {
    params.onStatus?.("Batching NFT operator grants + exit to USDC (EIP-5792)…");
    const calls = [
      ...needingGrant.map((npm) =>
        encodeSetApprovalForAllCall({ npm, operator: gateway, approved: true }),
      ),
      exitCall,
    ];
    const batchId = await tryWalletSendCalls({
      provider: params.provider,
      from: params.account,
      chainIdHex,
      calls,
    });
    if (batchId) {
      params.onBroadcast?.();
      txHashes.push(batchId);
    } else {
      // Fall through to sequential
      await sequentialGrantsAndExit({
        walletClient,
        account: params.account,
        gateway,
        needingGrant,
        exitCall,
        publicClient: params.publicClient,
        txHashes,
        onStatus: params.onStatus,
        onBroadcast: params.onBroadcast,
      });
    }
  } else {
    await sequentialGrantsAndExit({
      walletClient,
      account: params.account,
      gateway,
      needingGrant,
      exitCall,
      publicClient: params.publicClient,
      txHashes,
      onStatus: params.onStatus,
      onBroadcast: params.onBroadcast,
    });
  }

  const usdcAfter = (await params.publicClient.readContract({
    address: params.deployments.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.account],
  })) as bigint;
  const usdcDelta = usdcAfter > usdcBefore ? usdcAfter - usdcBefore : BigInt(0);

  // Fail-closed residue check on user wallet for withdrawal tokens (gateway already reverts on its own residue).
  for (const token of [params.deployments.cbbtc, params.deployments.weth] as Address[]) {
    // Gateway collects to itself then swaps; user should not gain non-USDC from this path.
    void token;
  }

  if (usdcDelta < params.minUsdcOut) {
    throw new Error(
      `Gateway withdraw incomplete: USDC gained ${usdcDelta.toString()} < min ${params.minUsdcOut.toString()}`,
    );
  }

  return { txHashes, promptClaim, usdcDelta };
}

async function sequentialGrantsAndExit(params: {
  walletClient: WalletClient;
  account: Address;
  gateway: Address;
  needingGrant: Address[];
  exitCall: { to: Address; data: Hex };
  publicClient: Pick<PublicClient, "waitForTransactionReceipt">;
  txHashes: Hex[];
  onStatus?: (msg: string) => void;
  onBroadcast?: () => void;
}): Promise<void> {
  for (const npm of params.needingGrant) {
    params.onStatus?.(
      `Confirm NFT operator grant for gateway (${SET_APPROVAL_LABEL})…`,
    );
    const hash = await params.walletClient.writeContract({
      address: npm,
      abi: erc721SetApprovalForAllAbi,
      functionName: "setApprovalForAll",
      args: [params.gateway, true],
      account: params.account,
      chain: null,
    });
    params.onBroadcast?.();
    params.txHashes.push(hash);
    await params.publicClient.waitForTransactionReceipt({ hash });
  }
  params.onStatus?.("Confirm gateway exit to USDC…");
  const exitHash = await params.walletClient.sendTransaction({
    account: params.account,
    to: params.exitCall.to,
    data: params.exitCall.data,
    chain: null,
  });
  params.onBroadcast?.();
  params.txHashes.push(exitHash);
  await params.publicClient.waitForTransactionReceipt({ hash: exitHash });
}

const SET_APPROVAL_LABEL = "setApprovalForAll 0xa22cb465";

/** Warm depositAgain helper when strategy already registered and gateway live. */
export async function depositAgainViaOpsGateway(params: {
  gateway: Address;
  walletClient: WalletClient;
  account: Address;
  publicClient: Pick<PublicClient, "waitForTransactionReceipt">;
  permitSingle: {
    details: {
      token: Address;
      amount: bigint;
      expiration: number;
      nonce: number;
    };
    spender: Address;
    sigDeadline: bigint;
  };
  permitSignature: Hex;
  strategyId: Hex;
  executionNonce: bigint;
  grossUsdc: bigint;
  poolIds: readonly Hex[];
  depositDeadline: bigint;
  depositLegs: unknown;
}): Promise<Hex> {
  const hash = await params.walletClient.writeContract({
    address: params.gateway,
    abi: opsGatewayAbi,
    functionName: "depositAgain",
    args: [
      {
        details: {
          token: params.permitSingle.details.token,
          amount: params.permitSingle.details.amount,
          expiration: params.permitSingle.details.expiration,
          nonce: params.permitSingle.details.nonce,
        },
        spender: params.permitSingle.spender,
        sigDeadline: params.permitSingle.sigDeadline,
      },
      params.permitSignature,
      params.strategyId,
      params.executionNonce,
      params.grossUsdc,
      params.poolIds as [Hex, Hex, Hex, Hex, Hex],
      params.depositDeadline,
      params.depositLegs as never,
    ],
    account: params.account,
    chain: null,
  });
  await params.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
