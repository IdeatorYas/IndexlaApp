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
import { readCurrentTicks } from "@/lib/stable-club/pool-slot0";
import {
  FIVE_POOL_DEFAULT_DEADLINE_SEC,
  FIVE_POOL_DEFAULT_LP_SLIPPAGE_BPS,
  FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
  FIVE_POOL_DEFAULT_SWAP_SLIPPAGE_BPS,
  FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC,
  assertExecutableQuotePlanValidity,
  buildDepositFivePoolStrategyArgs,
  buildDepositPreview,
  explorerTxUrl,
  formatUsdcUnits,
  parseUsdcDepositInput,
  runFivePoolDepositApprovalSequence,
  validateSlippageBps,
  type FivePoolDepositPreview,
  type FivePoolDepositProgress,
} from "@/lib/stable-club/five-pool-deposit";
import {
  assertClFivePoolPermit2Ready,
  buildClFivePoolPermit2Plan,
  computeClFivePoolPermit2Expiration,
  evaluateClFivePoolPermit2Readiness,
} from "@/lib/stable-club/five-pool-permit2";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import {
  createOracleGuardQuoteAdapter,
  type FivePoolQuoteBundle,
} from "@/lib/stable-club/five-pool-quotes";
import { FIVE_POOL_ALLOCATION_BPS_PER_LEG } from "@/lib/stable-club/five-pool-strategy";
import { encodeAllowedActions } from "@/lib/stable-club/permissions";
import { computeStableClubPermissionId } from "@/lib/stable-club/permission-id";
import { formatPermit2UserError, permit2AllowanceAbi } from "@/lib/stable-club/permit2";
import {
  attestPhase2aDeployments,
  isValidPhase2aPublicDeployments,
  requireAttestedPhase2aDeployments,
  type StableClubPhase2aPublicDeployments,
} from "@/lib/stable-club/phase2a-deployments";
import { base } from "viem/chains";
import { buildFivePoolQuotePlan, QuotePlanError } from "@/lib/stable-club/quote-plan";

export { readCurrentTicks } from "@/lib/stable-club/pool-slot0";

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

  const [amountInput, setAmountInput] = useState("20");
  const [swapSlippageInput, setSwapSlippageInput] = useState(
    String(FIVE_POOL_DEFAULT_SWAP_SLIPPAGE_BPS),
  );
  const [lpSlippageInput, setLpSlippageInput] = useState(
    String(FIVE_POOL_DEFAULT_LP_SLIPPAGE_BPS),
  );

  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0));
  const [strategyId, setStrategyId] = useState<Hex | null>(null);
  const [strategyRegistered, setStrategyRegistered] = useState(false);
  const strategyIdRef = useRef<Hex | null>(null);
  const [executionNonce, setExecutionNonce] = useState<bigint>(BigInt(1));

  const [progress, setProgress] = useState<FivePoolDepositProgress>("idle");
  const [preview, setPreview] = useState<FivePoolDepositPreview | null>(null);
  const [quoteBundle, setQuoteBundle] = useState<FivePoolQuoteBundle | null>(null);
  const [planReady, setPlanReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hex | null>(null);
  const [approvalTxHashes, setApprovalTxHashes] = useState<Hex[]>([]);

  const strategyRegisteredRef = useRef(false);
  const planReadyRef = useRef(false);
  const quoteBundleRef = useRef<FivePoolQuoteBundle | null>(null);

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
          // SC-F09: shape-valid only — attest bytecode before exposing execution.
          const candidate = json.deployments;
          const attestChain =
            candidate.network === "hardhat-local" ? STABLE_CLUB_LOCAL_CHAIN : base;
          const attestClient = createPublicClient({
            chain: attestChain,
            transport: http(candidate.rpcUrl),
          });
          await attestPhase2aDeployments({
            client: {
              getChainId: () => attestClient.getChainId(),
              getBytecode: (args) => attestClient.getBytecode(args),
            },
            deployments: candidate,
          });
          if (cancelled) return;
          setDeployments(candidate);
          setDeploymentsError(null);
        } else {
          setDeployments(null);
          setDeploymentsError(
            !json.configured ? json.message : "Invalid phase 2a deployments payload",
          );
        }
      } catch (err) {
        if (!cancelled) {
          setDeployments(null);
          setDeploymentsError(
            err instanceof Error ? err.message : "Failed to load phase 2a deployments",
          );
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
      strategyRegisteredRef.current = false;
      setStrategyId(null);
      strategyIdRef.current = null;
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
    strategyIdRef.current = sid;

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
    strategyRegisteredRef.current = registered;

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
    planReadyRef.current = false;
    quoteBundleRef.current = null;
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
      const currentTicks = await readCurrentTicks(
        publicClient,
        deployments.network,
        deployments.chainId,
      );
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
      quoteBundleRef.current = bundle;
      planReadyRef.current = true;
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
    let attestedDeployments: StableClubPhase2aPublicDeployments;
    try {
      attestedDeployments = requireAttestedPhase2aDeployments(deployments);
    } catch {
      setError("Wallet and deployments required");
      return;
    }
    if (!wallet.address || !wallet.provider) {
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
        deploymentChainId: attestedDeployments.chainId,
        network: attestedDeployments.network,
        permit2: attestedDeployments.permit2,
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
        depositToken: attestedDeployments.usdc,
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
        const a = attestedDeployments.adapters[i]!;
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
          // SC-07 metadata-only — stored for registration UX; not an on-chain security cap.
          maxLegPerDay: BigInt(10_000) * BigInt(10 ** STABLE_CLUB_USDC_DECIMALS),
        });
      }
      const hash = await walletClient.writeContract({
        address: attestedDeployments.strategyRegistry,
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
      const attestedDeployments = requireAttestedPhase2aDeployments(deployments);
      if (!wallet.address || !wallet.provider) {
        throw new Error("Wallet and deployments required");
      }
      const ownerAddress = wallet.address;
      const walletProvider = wallet.provider;
      if (!onExpectedChain) {
        throw new Error(`Wrong network — switch to chain ${expectedChainId}`);
      }
      assertChainEnvironmentMatch({
        walletChainId: wallet.chainId,
        deploymentChainId: attestedDeployments.chainId,
        network: attestedDeployments.network,
        permit2: attestedDeployments.permit2,
      });
      if (!strategyRegisteredRef.current && !strategyRegistered) {
        throw new Error("Register the five-pool strategy before depositing");
      }
      const activeQuoteBundle = quoteBundleRef.current ?? quoteBundle;
      if (!planRef.current || !activeQuoteBundle || !preview) {
        throw new Error("Prepare quotes first");
      }

      const activeStrategyId = strategyIdRef.current ?? strategyId;
      if (!activeStrategyId) {
        throw new Error("Register the five-pool strategy before depositing");
      }

      const nowSec = Math.floor(Date.now() / 1000);
      // Always resolve from chain — local retries / prior deposits must not reuse a nonce.
      const nextNonce = await resolveNextDepositExecutionNonce(
        publicClient,
        attestedDeployments.strategyRegistry,
        activeStrategyId,
      );
      setExecutionNonce(nextNonce);

      const depositArgs = buildDepositFivePoolStrategyArgs({
        plan: planRef.current,
        adapters: attestedDeployments.adapters,
        strategyId: activeStrategyId,
        executionNonce: nextNonce,
        quoteBundle: activeQuoteBundle,
        nowSec,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
        minRemainingSec: FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC,
        requireLiveQuotes: true,
      });

      const walletClient = createWalletClient({
        account: ownerAddress,
        chain,
        transport: custom(walletProvider),
      });

      setProgress("awaiting-approval");
      setStatusMessage("Checking USDC + Permit2 allowances…");

      const permitExpiration = computeClFivePoolPermit2Expiration(nowSec);
      const permitPlan = buildClFivePoolPermit2Plan({
        chainId: expectedChainId,
        permit2: attestedDeployments.permit2,
        token: attestedDeployments.usdc,
        clExecutor: attestedDeployments.clExecutor,
        grossUsdc: depositArgs.grossUsdc,
        expiration: permitExpiration,
        nowSec,
      });

      const readDepositAllowances = async () => {
        const erc20AllowanceToPermit2 = await publicClient.readContract({
          address: attestedDeployments.usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [ownerAddress, permitPlan.permit2],
        });
        const p2 = await publicClient.readContract({
          address: permitPlan.permit2,
          abi: permit2AllowanceAbi,
          functionName: "allowance",
          args: [ownerAddress, attestedDeployments.usdc, attestedDeployments.clExecutor],
        });
        return {
          erc20AllowanceToPermit2,
          permit2AmountToExecutor: p2[0],
          permit2ExpirationToExecutor: Number(p2[1]),
        };
      };

      let allowances = await readDepositAllowances();
      const precheckNow = Math.floor(Date.now() / 1000);
      const readiness = evaluateClFivePoolPermit2Readiness({
        requiredGrossUsdc: depositArgs.grossUsdc,
        nowSec: precheckNow,
        allowances,
      });

      setStatusMessage(
        readiness.needsErc20Approve
          ? "Approve USDC → Permit2 (exact deposit amount)…"
          : readiness.needsPermit2Approve
            ? "Approve Permit2 → CL executor (exact amount, short expiry)…"
            : "Allowances ready — preparing deposit…",
      );

      const approvalHashes = await runFivePoolDepositApprovalSequence({
        nowSec: () => Math.floor(Date.now() / 1000),
        quotes: activeQuoteBundle.quotes,
        deadline: planRef.current.deadline,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
        minRemainingSec: FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC,
        erc20Approve: readiness.needsErc20Approve
          ? async () => {
              setStatusMessage("Approve USDC → Permit2 (exact deposit amount)…");
              return walletClient.writeContract({
                address: permitPlan.erc20ApproveTx.address,
                abi: permitPlan.erc20ApproveTx.abi,
                functionName: permitPlan.erc20ApproveTx.functionName,
                args: permitPlan.erc20ApproveTx.args,
              });
            }
          : null,
        permit2Approve: readiness.needsPermit2Approve
          ? async () => {
              setStatusMessage("Approve Permit2 → CL executor (exact amount, short expiry)…");
              return walletClient.writeContract({
                address: permitPlan.permit2ApproveTx.address,
                abi: permitPlan.permit2ApproveTx.abi,
                functionName: permitPlan.permit2ApproveTx.functionName,
                args: permitPlan.permit2ApproveTx.args,
              });
            }
          : null,
        waitForSuccess: (hash) => waitForSuccessfulTransactionReceipt(publicClient, hash),
      });
      setApprovalTxHashes(approvalHashes);

      // Refresh both allowances after successful receipts — never deposit on stale reads.
      setStatusMessage("Refreshing allowances…");
      allowances = await readDepositAllowances();
      const postApproveNow = Math.floor(Date.now() / 1000);
      assertClFivePoolPermit2Ready({
        requiredGrossUsdc: depositArgs.grossUsdc,
        nowSec: postApproveNow,
        allowances,
        permit2: permitPlan.permit2,
        clExecutor: attestedDeployments.clExecutor,
      });

      // SC-F10 — recheck remaining validity immediately before deposit write
      const depositNowSec = Math.floor(Date.now() / 1000);
      assertExecutableQuotePlanValidity({
        quotes: activeQuoteBundle.quotes,
        deadline: planRef.current.deadline,
        nowSec: depositNowSec,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
        minRemainingSec: FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC,
      });
      buildDepositFivePoolStrategyArgs({
        plan: planRef.current,
        adapters: attestedDeployments.adapters,
        strategyId: activeStrategyId,
        executionNonce: nextNonce,
        quoteBundle: activeQuoteBundle,
        nowSec: depositNowSec,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
        minRemainingSec: FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC,
        requireLiveQuotes: true,
      });

      setProgress("awaiting-deposit");
      setStatusMessage("Confirm depositFivePoolStrategy…");

      const depositHash = await walletClient.writeContract({
        address: attestedDeployments.clExecutor,
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
      const permit2Msg = formatPermit2UserError(err);
      if (
        err instanceof QuotePlanError &&
        (err.code === "STALE_QUOTE" || err.code === "INVALID_DEADLINE")
      ) {
        setError(`${err.message} — prepare quotes again`);
        clearPlan();
        planRef.current = null;
      } else {
        setError(
          reject ??
            permit2Msg ??
            (err instanceof Error ? err.message : "Deposit failed"),
        );
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

  const depositIntoFivePoolStrategy = useCallback(async () => {
    if (!wallet.address) {
      await wallet.connect();
      return;
    }
    if (!onExpectedChain) {
      await wallet.switchToBase();
      return;
    }
    if (!strategyRegisteredRef.current && !strategyRegistered) {
      await registerStrategy();
      await refreshBalancesAndStrategy();
    }
    if (!planRef.current || !quoteBundleRef.current) {
      await prepareQuotes();
    }
    if (!planRef.current || !quoteBundleRef.current) {
      return;
    }
    await submitDeposit();
  }, [
    onExpectedChain,
    prepareQuotes,
    refreshBalancesAndStrategy,
    registerStrategy,
    strategyRegistered,
    submitDeposit,
    wallet,
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
    depositIntoFivePoolStrategy,
    registerStrategy,
    refreshBalancesAndStrategy,
    invalidatePlan: clearPlan,
    wallet,
  };
}
