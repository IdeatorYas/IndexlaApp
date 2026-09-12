/**
 * Gateway cold/warm withdraw orchestration (feature-flagged).
 * Fail-closed: never mark complete while catalogue LPs or non-USDC withdrawal residue remain.
 * Atomic path: setApprovalForAll (as needed) → simulate → one exitPercentToUsdc for all legs.
 */
import {
  createWalletClient,
  custom,
  erc20Abi,
  getAddress,
  type Address,
  type EIP1193Provider,
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
import { quoteTokenToUsdcViaOracle } from "@/components/stable-club/usePositionUsdValue";
import { listCatalogueMatchedOpenPositions } from "@/lib/stable-club/list-open-owner-npm-positions";
import { waitForReadClientBlock } from "@/lib/stable-club/read-block-floor";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import { planLooseAssetRecoveries } from "@/lib/stable-club/recover-loose-assets";
import { residueFromBaseline } from "@/lib/stable-club/withdraw-checkpoint";

export type GatewayWithdrawPosition = {
  npm: Address;
  positionTokenId: bigint;
  liquidity: bigint;
  tokenA: Address;
  tokenB: Address;
};

const UNI_FEE_005 = 500;
/** 1% haircut under oracle mid for aggregate minUsdcOut. */
const MIN_USDC_ORACLE_HAIRCUT_BPS = 100n;

export async function withdrawPercentViaOpsGateway(params: {
  deployments: {
    opsGateway?: Address | string | null;
    oracleGuard?: Address | string | null;
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
  provider: EIP1193Provider;
  publicClient: Pick<
    PublicClient,
    | "readContract"
    | "simulateContract"
    | "waitForTransactionReceipt"
    | "getBalance"
    | "getBlockNumber"
    | "call"
  >;
  /** Optional React positions — live HTTP catalogue enumeration is authoritative. */
  positions: GatewayWithdrawPosition[];
  percent: number;
  /** Ignored when oracleGuard is set — recomputed from simulated exits. */
  minUsdcOut?: bigint;
  onStatus?: (msg: string) => void;
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
  const oracleGuard = params.deployments.oracleGuard
    ? getAddress(params.deployments.oracleGuard as Address)
    : null;
  const pct = Math.round(params.percent);
  if (!Number.isFinite(params.percent) || pct < 1 || pct > 100) {
    throw new Error("Withdraw percent must be between 1 and 100");
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

  // Wait for HTTP head so post–Add Funds enumeration is not stale.
  const head = await params.publicClient.getBlockNumber({ cacheTime: 0 });
  await waitForReadClientBlock({
    client: params.publicClient,
    minBlock: head,
  });

  const catalogueOpen = await listCatalogueMatchedOpenPositions({
    publicClient: params.publicClient,
    account: params.account,
  });
  if (catalogueOpen.length === 0) {
    throw new Error(
      "No open Stable Club catalogue LPs found for gateway withdraw",
    );
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const exitLegs: NpmExitLegInput[] = [];
  let expectedUsdc = BigInt(0);

  for (const row of catalogueOpen) {
    const liqOut =
      pct >= 100
        ? row.liquidity
        : (row.liquidity * BigInt(pct * 100)) / BigInt(10_000);
    if (liqOut <= BigInt(0) && row.owed0 + row.owed1 <= BigInt(0)) continue;
    if (liqOut <= BigInt(0)) {
      throw new Error(
        `Catalogue LP ${row.cataloguePoolId} token ${row.tokenId.toString()} has tokensOwed but zero liquidity — use Finish/legacy collect path`,
      );
    }
    const mins = await quoteNpmDecreaseMins({
      publicClient: params.publicClient,
      npm: row.npm,
      account: params.account,
      tokenId: row.tokenId,
      liquidity: liqOut,
      deadline,
      slippageBps: BigInt(500),
    });
    exitLegs.push({
      npm: getAddress(row.npm),
      tokenId: row.tokenId,
      liquidity: liqOut,
      amount0Min: mins.amount0Min,
      amount1Min: mins.amount1Min,
      burnIfEmpty: pct >= 100,
    });
    if (oracleGuard) {
      expectedUsdc += await quoteTokenToUsdcViaOracle({
        publicClient: params.publicClient,
        oracleGuard,
        tokenIn: row.token0,
        amountIn: mins.amount0,
      });
      expectedUsdc += await quoteTokenToUsdcViaOracle({
        publicClient: params.publicClient,
        oracleGuard,
        tokenIn: row.token1,
        amountIn: mins.amount1,
      });
    }
  }
  if (exitLegs.length === 0) {
    throw new Error("Gateway withdraw planned zero liquidity");
  }
  if (exitLegs.length !== catalogueOpen.filter((r) => r.liquidity > BigInt(0)).length) {
    throw new Error(
      "Gateway withdraw refused to submit a subset of open catalogue LPs",
    );
  }

  const minUsdcOut =
    oracleGuard && expectedUsdc > BigInt(0)
      ? (expectedUsdc * (10_000n - MIN_USDC_ORACLE_HAIRCUT_BPS)) / 10_000n
      : params.minUsdcOut != null && params.minUsdcOut > BigInt(0)
        ? params.minUsdcOut
        : BigInt(1);

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
  const cbBefore = (await params.publicClient.readContract({
    address: params.deployments.cbbtc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.account],
  })) as bigint;
  const wethBefore = (await params.publicClient.readContract({
    address: params.deployments.weth,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.account],
  })) as bigint;

  const npms = uniqueNpmAddresses(catalogueOpen.map((r) => ({ npm: r.npm })));
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

  // Grants first (idempotent), then simulate exit, then send — cold wallets cannot simulate without operator.
  if (needingGrant.length > 0 && !caps.atomicBatchSupported) {
    await sequentialGrantsOnly({
      walletClient,
      account: params.account,
      gateway,
      needingGrant,
      publicClient: params.publicClient,
      onStatus: params.onStatus,
      onBroadcast: params.onBroadcast,
    });
    needingGrant.length = 0;
  }

  const exitCall = encodeGatewayExitPercentToUsdcCall({
    gateway,
    exitLegs,
    swaps,
    minUsdcOut,
    deadline,
  });

  params.onStatus?.("Simulating gateway exitPercentToUsdc…");
  try {
    await params.publicClient.call({
      account: params.account,
      to: exitCall.to,
      data: exitCall.data,
    });
  } catch (simErr) {
    const detail = simErr instanceof Error ? simErr.message : String(simErr);
    throw new Error(
      `Gateway exit simulation failed — LPs untouched. ${detail.slice(0, 320)}`,
    );
  }

  const txHashes: Hex[] = [];

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

  const lastHash = txHashes[txHashes.length - 1];
  if (lastHash) {
    try {
      const receipt = await params.publicClient.waitForTransactionReceipt({
        hash: lastHash,
      });
      if (receipt.blockNumber != null) {
        await waitForReadClientBlock({
          client: params.publicClient,
          minBlock: receipt.blockNumber,
        });
      }
    } catch {
      // batch id may not be a standard tx hash — continue with head wait
      const tip = await params.publicClient.getBlockNumber({ cacheTime: 0 });
      await waitForReadClientBlock({
        client: params.publicClient,
        minBlock: tip,
      });
    }
  }

  const stillOpen = await listCatalogueMatchedOpenPositions({
    publicClient: params.publicClient,
    account: params.account,
  });
  if (stillOpen.length > 0) {
    throw new Error(
      `Gateway withdraw incomplete: catalogue LP(s) still open: ${stillOpen
        .map((r) => `${r.cataloguePoolId}#${r.tokenId.toString()}`)
        .join(", ")}`,
    );
  }

  const cbAfter = (await params.publicClient.readContract({
    address: params.deployments.cbbtc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.account],
  })) as bigint;
  const wethAfter = (await params.publicClient.readContract({
    address: params.deployments.weth,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.account],
  })) as bigint;
  const leftover = await planLooseAssetRecoveries({
    publicClient: params.publicClient,
    account: params.account,
    applyDustFilter: true,
    maxByToken: {
      cbBTC: residueFromBaseline({ current: cbAfter, baseline: cbBefore }),
      WETH: residueFromBaseline({ current: wethAfter, baseline: wethBefore }),
    },
  });
  if (leftover.length > 0) {
    throw new Error(
      `Gateway withdraw incomplete: non-USDC residue remains (${leftover
        .map((r) => r.symbol)
        .join(", ")})`,
    );
  }

  const usdcAfter = (await params.publicClient.readContract({
    address: params.deployments.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.account],
  })) as bigint;
  const usdcDelta = usdcAfter > usdcBefore ? usdcAfter - usdcBefore : BigInt(0);
  if (usdcDelta < minUsdcOut) {
    throw new Error(
      `Gateway withdraw incomplete: USDC gained ${usdcDelta.toString()} < min ${minUsdcOut.toString()}`,
    );
  }

  return { txHashes, promptClaim, usdcDelta };
}

async function sequentialGrantsOnly(params: {
  walletClient: WalletClient;
  account: Address;
  gateway: Address;
  needingGrant: Address[];
  publicClient: Pick<PublicClient, "waitForTransactionReceipt">;
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
    await params.publicClient.waitForTransactionReceipt({ hash });
  }
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
  params.onStatus?.("Confirm gateway exit to USDC (all catalogue LPs)…");
  const exitHash = await params.walletClient.sendTransaction({
    account: params.account,
    to: params.exitCall.to,
    data: params.exitCall.data,
    chain: null,
  });
  params.onBroadcast?.();
  params.txHashes.push(exitHash);
  await waitForSuccessfulTransactionReceipt(params.publicClient, exitHash);
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
