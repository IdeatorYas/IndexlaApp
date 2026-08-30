"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  type Address,
  type Hex,
} from "viem";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  clPoolSlot0Abi,
  concentratedLiquidityExecutorAbi,
  erc20Abi,
  strategyPermissionRegistryAbi,
} from "@/lib/stable-club/abis";
import {
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_CHAIN_ID,
  STABLE_CLUB_LOCAL_RPC_URL,
  STABLE_CLUB_USDC_DECIMALS,
} from "@/lib/stable-club/constants";
import {
  assertChainEnvironmentMatch,
} from "@/lib/stable-club/chain-isolation";
import {
  FIVE_POOL_DEFAULT_DEADLINE_SEC,
  FIVE_POOL_DEFAULT_LP_SLIPPAGE_BPS,
  FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
  FIVE_POOL_DEFAULT_SWAP_SLIPPAGE_BPS,
  buildDepositFivePoolStrategyArgs,
  buildDepositPreview,
  explorerTxUrl,
  formatUsdcUnits,
  parseUsdcDepositInput,
  validateSlippageBps,
  type FivePoolDepositPreview,
  type FivePoolDepositProgress,
} from "@/lib/stable-club/five-pool-deposit";
import { buildClFivePoolPermit2Plan } from "@/lib/stable-club/five-pool-permit2";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import {
  createOracleGuardQuoteAdapter,
  type FivePoolQuoteBundle,
} from "@/lib/stable-club/five-pool-quotes";
import { FIVE_POOL_ALLOCATION_BPS_PER_LEG } from "@/lib/stable-club/five-pool-strategy";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { encodeAllowedActions } from "@/lib/stable-club/permissions";
import { computeStableClubPermissionId } from "@/lib/stable-club/permission-id";
import { permit2AllowanceAbi } from "@/lib/stable-club/permit2";
import {
  isValidPhase2aPublicDeployments,
  type StableClubPhase2aPublicDeployments,
} from "@/lib/stable-club/phase2a-deployments";
import { buildFivePoolQuotePlan, QuotePlanError } from "@/lib/stable-club/quote-plan";

/** Matches fork five-pool ALL_ACTIONS (bits 0–4, 6–7). */
const FIVE_POOL_ALLOWED_ACTIONS = BigInt(
  encodeAllowedActions([
    "deposit-and-add-liquidity",
    "swap",
    "add-liquidity",
    "remove-liquidity",
    "withdraw-all",
    "revoke-permission",
    "emergency-exit",
  ]),
);

type Phase2aResponse =
  | { configured: false; message: string }
  | { configured: true; deployments: StableClubPhase2aPublicDeployments };

function userRejectMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (/user rejected|denied|rejected the request|ACTION_REJECTED/i.test(msg)) {
    return "Wallet rejected the request";
  }
  return null;
}

async function readCurrentTicks(
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof clPoolSlot0Abi;
      functionName: "slot0";
    }) => Promise<readonly unknown[]>;
  },
  network: string,
): Promise<number[]> {
  const ticks: number[] = [];
  for (const pool of OFFICIAL_STABLE_CLUB_BASE_POOLS) {
    if (!pool.poolAddress || network === "hardhat-local") {
      ticks.push(0);
      continue;
    }
    try {
      const slot0 = await publicClient.readContract({
        address: pool.poolAddress,
        abi: clPoolSlot0Abi,
        functionName: "slot0",
      });
      ticks.push(Number(slot0[1]));
    } catch {
      ticks.push(0);
    }
  }
  return ticks;
}

/** First unused strategy deposit nonce (mapping is sparse; scan from 1). */
async function resolveNextDepositExecutionNonce(
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof strategyPermissionRegistryAbi;
      functionName: "strategyDepositNonceUsed";
      args: readonly [Hex, bigint];
    }) => Promise<boolean>;
  },
  strategyRegistry: Address,
  strategyId: Hex,
  startFrom: bigint = BigInt(1),
  maxScan: bigint = BigInt(256),
): Promise<bigint> {
  for (let n = startFrom; n < startFrom + maxScan; n++) {
    const used = await publicClient.readContract({
      address: strategyRegistry,
      abi: strategyPermissionRegistryAbi,
      functionName: "strategyDepositNonceUsed",
      args: [strategyId, n],
    });
    if (!used) return n;
  }
  throw new Error("No free deposit execution nonce found");
}

export function useFivePoolDeposit() {
  const wallet = useStableClubWallet();
  const submittingRef = useRef(false);

  const [deployments, setDeployments] = useState<StableClubPhase2aPublicDeployments | null>(null);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [deploymentsError, setDeploymentsError] = useState<string | null>(null);

  const [amountInput, setAmountInput] = useState("1000");
  const [swapSlippageInput, setSwapSlippageInput] = useState(
    String(FIVE_POOL_DEFAULT_SWAP_SLIPPAGE_BPS),
  );
  const [lpSlippageInput, setLpSlippageInput] = useState(
    String(FIVE_POOL_DEFAULT_LP_SLIPPAGE_BPS),
  );

  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0));
  const [strategyId, setStrategyId] = useState<Hex | null>(null);
  const [strategyRegistered, setStrategyRegistered] = useState(false);
  const [executionNonce, setExecutionNonce] = useState<bigint>(BigInt(1));

  const [progress, setProgress] = useState<FivePoolDepositProgress>("idle");
  const [preview, setPreview] = useState<FivePoolDepositPreview | null>(null);
  const [quoteBundle, setQuoteBundle] = useState<FivePoolQuoteBundle | null>(null);
  const [planReady, setPlanReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hex | null>(null);
  const [approvalTxHashes, setApprovalTxHashes] = useState<Hex[]>([]);

  const chain = useMemo(
    () =>
      deployments?.network === "hardhat-local"
        ? STABLE_CLUB_LOCAL_CHAIN
        : wallet.chain ?? STABLE_CLUB_LOCAL_CHAIN,
    [deployments?.network, wallet.chain],
  );

  const publicClient = useMemo(() => {
    const rpc = deployments?.rpcUrl ?? STABLE_CLUB_LOCAL_RPC_URL;
    if (wallet.provider) {
      return createPublicClient({ chain, transport: custom(wallet.provider) });
    }
    return createPublicClient({ chain, transport: http(rpc) });
  }, [chain, deployments?.rpcUrl, wallet.provider]);

  const expectedChainId = deployments?.chainId ?? STABLE_CLUB_LOCAL_CHAIN_ID;
  const onExpectedChain = wallet.chainId === expectedChainId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDeploymentsLoading(true);
      try {
        const res = await fetch("/api/stable-club/phase2a-deployments");
        const json = (await res.json()) as Phase2aResponse;
        if (cancelled) return;
        if (json.configured && isValidPhase2aPublicDeployments(json.deployments)) {
          setDeployments(json.deployments);
          setDeploymentsError(null);
        } else {
          setDeployments(null);
          setDeploymentsError(
            !json.configured ? json.message : "Invalid phase 2a deployments payload",
          );
        }
      } catch {
        if (!cancelled) {
          setDeployments(null);
          setDeploymentsError("Failed to load phase 2a deployments");
        }
      } finally {
        if (!cancelled) setDeploymentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshBalancesAndStrategy = useCallback(async () => {
    if (!deployments || !wallet.address) {
      setUsdcBalance(BigInt(0));
      setStrategyRegistered(false);
      setStrategyId(null);
      return;
    }
    const bal = await publicClient.readContract({
      address: deployments.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet.address],
    });
    setUsdcBalance(bal);

    const sid = await publicClient.readContract({
      address: deployments.strategyRegistry,
      abi: strategyPermissionRegistryAbi,
      functionName: "strategyIdFor",
      args: [wallet.address, BigInt(expectedChainId), deployments.usdc],
    });
    setStrategyId(sid);

    const strategy = await publicClient.readContract({
      address: deployments.strategyRegistry,
      abi: strategyPermissionRegistryAbi,
      functionName: "getStrategy",
      args: [sid],
    });
    const strategyUser = (strategy as { user: Address }).user;
    const strategyRevoked = (strategy as { revoked: boolean }).revoked;
    const registered =
      strategyUser.toLowerCase() === wallet.address.toLowerCase() && !strategyRevoked;
    setStrategyRegistered(registered);

    if (registered) {
      const nextNonce = await resolveNextDepositExecutionNonce(
        publicClient,
        deployments.strategyRegistry,
        sid,
      );
      setExecutionNonce(nextNonce);
    } else {
      setExecutionNonce(BigInt(1));
    }
  }, [deployments, wallet.address, publicClient, expectedChainId]);

  useEffect(() => {
    void refreshBalancesAndStrategy().catch(() => {
      /* ignore until wallet ready */
    });
  }, [refreshBalancesAndStrategy]);

  const planRef = useRef<ReturnType<typeof buildFivePoolQuotePlan> | null>(null);

  const clearPlan = useCallback(() => {
    setPreview(null);
    setQuoteBundle(null);
    setPlanReady(false);
    planRef.current = null;
  }, []);

  const prepareQuotes = useCallback(async () => {
    setError(null);
    setStatusMessage(null);
    setLastTxHash(null);
    clearPlan();

    if (!deployments) {
      setError("Phase 2a deployments not configured");
      setProgress("failed");
      return;
    }
    if (!wallet.address) {
      setError("Connect wallet first");
      setProgress("failed");
      return;
    }
    if (!onExpectedChain) {
      setError(`Wrong network — switch to chain ${expectedChainId}`);
      setProgress("failed");
      return;
    }

    const parsed = parseUsdcDepositInput(amountInput);
    if (!parsed.ok) {
      setError(parsed.message);
      setProgress("failed");
      return;
    }
    const swapSlip = validateSlippageBps(swapSlippageInput, "Swap slippage");
    if (!swapSlip.ok) {
      setError(swapSlip.message);
      setProgress("failed");
      return;
    }
    const lpSlip = validateSlippageBps(lpSlippageInput, "LP slippage");
    if (!lpSlip.ok) {
      setError(lpSlip.message);
      setProgress("failed");
      return;
    }
    if (parsed.grossUsdc > usdcBalance) {
      setError(
        `Insufficient USDC balance (have ${formatUsdcUnits(usdcBalance)}, need ${parsed.human})`,
      );
      setProgress("failed");
      return;
    }

    setProgress("preparing-quotes");
    setStatusMessage("Fetching eight OracleGuard quotes…");

    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const deadline = BigInt(nowSec + FIVE_POOL_DEFAULT_DEADLINE_SEC);
      const adapter = createOracleGuardQuoteAdapter({
        publicClient,
        oracleGuard: deployments.oracleGuard,
        tokens: {
          usdc: deployments.usdc,
          cbbtc: deployments.cbbtc,
          weth: deployments.weth,
        },
      });
      const bundle = await adapter.fetchQuotes({
        grossUsdc: parsed.grossUsdc,
        nowSec,
      });
      const currentTicks = await readCurrentTicks(publicClient, deployments.network);
      const adapters = deployments.adapters.map((a) => a.adapter) as readonly Address[];
      const plan = buildFivePoolQuotePlan({
        grossUsdc: parsed.grossUsdc,
        adapters,
        currentTicks,
        quotes: bundle.quotes,
        slippageBps: swapSlip.bps,
        lpSlippageBps: lpSlip.bps,
        deadline,
        nowSec,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
      });
      const nextPreview = buildDepositPreview({
        plan,
        quotedAtSec: bundle.quotedAtSec,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
        quoteSource: bundle.source,
      });
      planRef.current = plan;
      setQuoteBundle(bundle);
      setPreview(nextPreview);
      setPlanReady(true);
      setProgress("idle");
      setStatusMessage("Quotes ready — review preview, then deposit");
    } catch (err) {
      const reject = userRejectMessage(err);
      setProgress("failed");
      setError(
        reject ??
          (err instanceof QuotePlanError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Quote preparation failed"),
      );
      clearPlan();
    }
  }, [
    amountInput,
    clearPlan,
    deployments,
    expectedChainId,
    lpSlippageInput,
    onExpectedChain,
    publicClient,
    swapSlippageInput,
    usdcBalance,
    wallet.address,
  ]);

  const registerStrategy = useCallback(async () => {
    if (!deployments || !wallet.address || !wallet.provider) {
      setError("Wallet and deployments required");
      return;
    }
    if (!onExpectedChain) {
      setError(`Wrong network — switch to chain ${expectedChainId}`);
      return;
    }
    try {
      assertChainEnvironmentMatch({
        walletChainId: wallet.chainId,
        deploymentChainId: deployments.chainId,
        network: deployments.network,
        permit2: deployments.permit2,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chain/environment mismatch");
      return;
    }
    setError(null);
    setStatusMessage("Registering five-pool strategy…");
    try {
      const walletClient = createWalletClient({
        account: wallet.address,
        chain,
        transport: custom(wallet.provider),
      });
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30);
      const strategy = {
        user: wallet.address,
        chainId: BigInt(expectedChainId),
        depositToken: deployments.usdc,
        allowedActions: FIVE_POOL_ALLOWED_ACTIONS,
        maxTotalPerTx: BigInt(10_000) * BigInt(10 ** STABLE_CLUB_USDC_DECIMALS),
        maxTotalPerDay: BigInt(50_000) * BigInt(10 ** STABLE_CLUB_USDC_DECIMALS),
        maxSlippageBps: BigInt(500),
        minTimeBetweenExecutions: BigInt(0),
        maxExecutionsPerDay: BigInt(50),
        expiresAt,
        revoked: false,
        paused: false,
      };
      const legPermissions = [];
      const legs = [];
      for (let i = 0; i < 5; i++) {
        const a = deployments.adapters[i]!;
        const legPermissionId = computeStableClubPermissionId({
          user: wallet.address,
          chainId: expectedChainId,
          poolId: a.poolId,
          tokenA: a.tokenA,
          tokenB: a.tokenB,
        });
        legPermissions.push({
          user: wallet.address,
          chainId: BigInt(expectedChainId),
          poolId: a.poolId,
          tokenA: a.tokenA,
          tokenB: a.tokenB,
          allowedActions: FIVE_POOL_ALLOWED_ACTIONS,
          maxAmountPerTx: BigInt(2_000) * BigInt(10 ** STABLE_CLUB_USDC_DECIMALS),
          maxAmountPerDay: BigInt(10_000) * BigInt(10 ** STABLE_CLUB_USDC_DECIMALS),
          maxSlippageBps: BigInt(500),
          minTimeBetweenExecutions: BigInt(0),
          maxExecutionsPerDay: BigInt(50),
          expiresAt,
          revoked: false,
          paused: false,
        });
        legs.push({
          poolId: a.poolId,
          allocationBps: BigInt(FIVE_POOL_ALLOCATION_BPS_PER_LEG),
          adapter: a.adapter,
          tokenA: a.tokenA,
          tokenB: a.tokenB,
          legPermissionId,
          maxLegPerTx: BigInt(2_000) * BigInt(10 ** STABLE_CLUB_USDC_DECIMALS),
          maxLegPerDay: BigInt(10_000) * BigInt(10 ** STABLE_CLUB_USDC_DECIMALS),
        });
      }
      const hash = await walletClient.writeContract({
        address: deployments.strategyRegistry,
        abi: strategyPermissionRegistryAbi,
        functionName: "registerFivePoolStrategy",
        args: [strategy, legPermissions as never, legs as never],
      });
      setLastTxHash(hash);
      await waitForSuccessfulTransactionReceipt(publicClient, hash);
      await refreshBalancesAndStrategy();
      setStatusMessage("Strategy registered");
    } catch (err) {
      const message =
        userRejectMessage(err) ?? (err instanceof Error ? err.message : "Registration failed");
      if (/StrategyAlreadyExists/i.test(message)) {
        await refreshBalancesAndStrategy();
        setError(null);
        setProgress("idle");
        setStatusMessage("Strategy already registered");
        return;
      }
      setError(message);
      setProgress("failed");
    }
  }, [
    chain,
    deployments,
    expectedChainId,
    onExpectedChain,
    publicClient,
    refreshBalancesAndStrategy,
    wallet.address,
    wallet.provider,
  ]);

  const submitDeposit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setApprovalTxHashes([]);

    try {
      if (!deployments || !wallet.address || !wallet.provider) {
        throw new Error("Wallet and deployments required");
      }
      if (!onExpectedChain) {
        throw new Error(`Wrong network — switch to chain ${expectedChainId}`);
      }
      assertChainEnvironmentMatch({
        walletChainId: wallet.chainId,
        deploymentChainId: deployments.chainId,
        network: deployments.network,
        permit2: deployments.permit2,
      });
      if (!strategyRegistered || !strategyId) {
        throw new Error("Register the five-pool strategy before depositing");
      }
      if (!planReady || !quoteBundle || !planRef.current || !preview) {
        throw new Error("Prepare quotes first");
      }

      const nowSec = Math.floor(Date.now() / 1000);
      // Always resolve from chain — local retries / prior deposits must not reuse a nonce.
      const nextNonce = await resolveNextDepositExecutionNonce(
        publicClient,
        deployments.strategyRegistry,
        strategyId,
      );
      setExecutionNonce(nextNonce);

      const depositArgs = buildDepositFivePoolStrategyArgs({
        plan: planRef.current,
        adapters: deployments.adapters,
        strategyId,
        executionNonce: nextNonce,
        quoteBundle,
        nowSec,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
        requireLiveQuotes: true,
      });

      const walletClient = createWalletClient({
        account: wallet.address,
        chain,
        transport: custom(wallet.provider),
      });

      setProgress("awaiting-approval");
      setStatusMessage("Approve USDC → Permit2 (bounded)…");

      const permitExpiration = nowSec + FIVE_POOL_DEFAULT_DEADLINE_SEC;
      const permitPlan = buildClFivePoolPermit2Plan({
        chainId: expectedChainId,
        permit2: deployments.permit2,
        token: deployments.usdc,
        clExecutor: deployments.clExecutor,
        grossUsdc: depositArgs.grossUsdc,
        expiration: permitExpiration,
        nowSec,
      });

      // Skip ERC20 approve if allowance already sufficient
      const erc20Allowance = await publicClient.readContract({
        address: deployments.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [wallet.address, permitPlan.permit2],
      });
      const hashes: Hex[] = [];
      if (erc20Allowance < depositArgs.grossUsdc) {
        const h1 = await walletClient.writeContract({
          address: permitPlan.erc20ApproveTx.address,
          abi: permitPlan.erc20ApproveTx.abi,
          functionName: permitPlan.erc20ApproveTx.functionName,
          args: permitPlan.erc20ApproveTx.args,
        });
        hashes.push(h1);
        await waitForSuccessfulTransactionReceipt(publicClient, h1);
      }

      setStatusMessage("Approve Permit2 → CL executor (bounded, expiring)…");
      const p2 = await publicClient.readContract({
        address: permitPlan.permit2,
        abi: permit2AllowanceAbi,
        functionName: "allowance",
        args: [wallet.address, deployments.usdc, deployments.clExecutor],
      });
      const p2Amount = p2[0];
      const p2Exp = Number(p2[1]);
      if (p2Amount < depositArgs.grossUsdc || p2Exp <= nowSec) {
        const h2 = await walletClient.writeContract({
          address: permitPlan.permit2ApproveTx.address,
          abi: permitPlan.permit2ApproveTx.abi,
          functionName: permitPlan.permit2ApproveTx.functionName,
          args: permitPlan.permit2ApproveTx.args,
        });
        hashes.push(h2);
        await waitForSuccessfulTransactionReceipt(publicClient, h2);
      }
      setApprovalTxHashes(hashes);

      // Re-check quote freshness immediately before deposit
      buildDepositFivePoolStrategyArgs({
        plan: planRef.current,
        adapters: deployments.adapters,
        strategyId,
        executionNonce: nextNonce,
        quoteBundle,
        nowSec: Math.floor(Date.now() / 1000),
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
        requireLiveQuotes: true,
      });

      setProgress("awaiting-deposit");
      setStatusMessage("Confirm depositFivePoolStrategy…");

      const depositHash = await walletClient.writeContract({
        address: deployments.clExecutor,
        abi: concentratedLiquidityExecutorAbi,
        functionName: "depositFivePoolStrategy",
        args: [
          depositArgs.strategyId,
          nextNonce,
          depositArgs.grossUsdc,
          depositArgs.poolIds,
          depositArgs.deadline,
          depositArgs.legs.map((leg) => ({
            legIndex: leg.legIndex,
            adapter: leg.adapter,
            tokenA: leg.tokenA,
            tokenB: leg.tokenB,
            tickLower: leg.tickLower,
            tickUpper: leg.tickUpper,
            retainUsdc: leg.retainUsdc,
            swaps: leg.swaps,
            swapCount: leg.swapCount,
            amountAMin: leg.amountAMin,
            amountBMin: leg.amountBMin,
            slippageBps: leg.slippageBps,
          })) as never,
        ],
      });
      setLastTxHash(depositHash);
      await waitForSuccessfulTransactionReceipt(publicClient, depositHash);
      setExecutionNonce(nextNonce + BigInt(1));
      setProgress("confirmed");
      setStatusMessage("Deposit confirmed");
      clearPlan();
      planRef.current = null;
      await refreshBalancesAndStrategy();
    } catch (err) {
      setProgress("failed");
      const reject = userRejectMessage(err);
      if (err instanceof QuotePlanError && err.code === "STALE_QUOTE") {
        setError(`${err.message} — prepare quotes again`);
        clearPlan();
        planRef.current = null;
      } else {
        setError(reject ?? (err instanceof Error ? err.message : "Deposit failed"));
      }
    } finally {
      submittingRef.current = false;
    }
  }, [
    chain,
    clearPlan,
    deployments,
    expectedChainId,
    onExpectedChain,
    planReady,
    preview,
    publicClient,
    quoteBundle,
    refreshBalancesAndStrategy,
    strategyId,
    strategyRegistered,
    wallet.address,
    wallet.provider,
  ]);

  return {
    deployments,
    deploymentsLoading,
    deploymentsError,
    amountInput,
    setAmountInput,
    swapSlippageInput,
    setSwapSlippageInput,
    lpSlippageInput,
    setLpSlippageInput,
    usdcBalance,
    usdcBalanceFormatted: formatUnits(usdcBalance, STABLE_CLUB_USDC_DECIMALS),
    strategyId,
    strategyRegistered,
    executionNonce,
    progress,
    preview,
    planReady,
    statusMessage,
    error,
    lastTxHash,
    approvalTxHashes,
    explorerUrl: lastTxHash ? explorerTxUrl(expectedChainId, lastTxHash) : null,
    onExpectedChain,
    expectedChainId,
    busy: progress === "preparing-quotes" || progress === "awaiting-approval" || progress === "awaiting-deposit",
    prepareQuotes,
    submitDeposit,
    registerStrategy,
    refreshBalancesAndStrategy,
    invalidatePlan: clearPlan,
    wallet,
  };
}
