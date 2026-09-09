"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
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
import { requireGasPriceWithinSafetyCeiling } from "@/lib/stable-club/gas-price-ceiling-preflight";
import {
  STABLE_CLUB_BASE_RPC_PROXY_PATH,
} from "@/lib/stable-club/base-rpc-client";
import { createStableClubBaseReadTransport } from "@/lib/stable-club/base-rpc-transport";
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
  resolveDepositStack,
  readStrategyLegAdapters,
} from "@/lib/stable-club/cl-stack-resolve";
import { isExitAllToUsdcAvailable } from "@/lib/stable-club/exit-to-usdc";
import { readPoolSlot0States } from "@/lib/stable-club/pool-slot0";
import {
  FIVE_POOL_DEFAULT_DEADLINE_SEC,
  FIVE_POOL_DEFAULT_LP_SLIPPAGE_BPS,
  FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
  FIVE_POOL_DEFAULT_SWAP_SLIPPAGE_BPS,
  FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC,
  assertExecutableQuotePlanValidity,
  buildDepositFivePoolStrategyArgs,
  buildDepositPreview,
  rebuildDepositExecutionPlan,
  explorerTxUrl,
  formatUsdcUnits,
  parseUsdcDepositInput,
  runFivePoolDepositApprovalSequence,
  validateSlippageBps,
  type FivePoolDepositPreview,
  type FivePoolDepositProgress,
} from "@/lib/stable-club/five-pool-deposit";
import {
  buildClFivePoolPermit2Plan,
  computeClFivePoolPermit2Expiration,
  decodeClFivePoolPermit2AllowanceTuple,
  evaluateClFivePoolPermit2Readiness,
  refetchClFivePoolPermit2AllowancesUntilReady,
  type ClFivePoolPermit2LiveAllowances,
} from "@/lib/stable-club/five-pool-permit2";
import { readClFivePoolPermit2AllowancesWithRpcGuard } from "@/lib/stable-club/permit2-allowance-rpc";
import {
  applyFivePoolDepositGasBuffer,
  preflightDepositFivePoolStrategyCall,
  requireFivePoolDepositGasLimit,
} from "@/lib/stable-club/five-pool-deposit-gas";
import { wrapProviderForceFivePoolDepositGas } from "@/lib/stable-club/force-five-pool-deposit-gas-provider";
import {
  assertRegistrationAllowsDeposit,
  isStrategyAlreadyExistsError,
} from "@/lib/stable-club/five-pool-registration-flow";
import { requestFivePoolPositionsRefresh } from "@/lib/stable-club/positions-refresh";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import {
  createOracleGuardQuoteAdapter,
  type FivePoolQuoteBundle,
} from "@/lib/stable-club/five-pool-quotes";
import { FIVE_POOL_ALLOCATION_BPS_PER_LEG } from "@/lib/stable-club/five-pool-strategy";
import { encodeAllowedActions } from "@/lib/stable-club/permissions";
import { computeStableClubPermissionId } from "@/lib/stable-club/permission-id";
import { formatPermit2UserError, permit2AllowanceAbi } from "@/lib/stable-club/permit2";
import { formatStableClubExecutionError } from "@/lib/stable-club/execution-errors";
import {
  attestPhase2aDeployments,
  isValidPhase2aPublicDeployments,
  requireAttestedPhase2aDeployments,
  type StableClubPhase2aPublicDeployments,
} from "@/lib/stable-club/phase2a-deployments";
import { base } from "viem/chains";
import { buildFivePoolQuotePlan, QuotePlanError } from "@/lib/stable-club/quote-plan";

export { readCurrentTicks, readPoolSlot0States } from "@/lib/stable-club/pool-slot0";

/** Matches fork five-pool ALL_ACTIONS including Harvest + Compound (bits 0–4, 6–10). */
const FIVE_POOL_ALLOWED_ACTIONS = BigInt(
  encodeAllowedActions([
    "deposit-and-add-liquidity",
    "swap",
    "add-liquidity",
    "remove-liquidity",
    "withdraw-all",
    "revoke-permission",
    "emergency-exit",
    "harvest",
    "compound",
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

  /**
   * Allowance / readiness reads must use HTTP Base RPC — never the wallet EIP-1193
   * provider. Wallet eth_call is often stale right after a confirmed Permit2 approve,
   * which falsely surfaces AllowanceExpired after "Refreshing allowances…".
   * Base uses the same-origin RPC proxy (+ fallback transport), not public mainnet.base.org.
   */
  const allowanceReadClient = useMemo(() => {
    const readChain =
      deployments?.network === "hardhat-local" ? STABLE_CLUB_LOCAL_CHAIN : base;
    if (deployments?.network === "hardhat-local") {
      return createPublicClient({
        chain: readChain,
        transport: http(deployments.rpcUrl ?? STABLE_CLUB_LOCAL_RPC_URL),
      });
    }
    const extraFallbacks =
      typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_BASE_RPC_FALLBACK_URL
        ? [process.env.NEXT_PUBLIC_BASE_RPC_FALLBACK_URL]
        : [];
    return createPublicClient({
      chain: readChain,
      transport: createStableClubBaseReadTransport({
        extraFallbacks,
      }),
    });
  }, [deployments?.network, deployments?.rpcUrl]);

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
          const attestTransport =
            candidate.network === "hardhat-local"
              ? http(candidate.rpcUrl)
              : candidate.network === "base" ||
                  candidate.rpcUrl === STABLE_CLUB_BASE_RPC_PROXY_PATH ||
                  candidate.chainId === 8453
                ? createStableClubBaseReadTransport()
                : http(candidate.rpcUrl);
          const attestClient = createPublicClient({
            chain: attestChain,
            transport: attestTransport,
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
      const slot0States = await readPoolSlot0States(
        publicClient,
        deployments.network,
        deployments.chainId,
      );
      const currentTicks = slot0States.map((s) => s.tick);
      const sqrtPriceX96PerPool = slot0States.map((s) => s.sqrtPriceX96);
      // Match deposit adapters to registered strategy legs (legacy-pinned users
      // cannot use primary adapters — strategy IDs are non-recyclable).
      let legAdapters: Address[] = [];
      const sid = strategyIdRef.current;
      if (sid && strategyRegisteredRef.current) {
        legAdapters = await readStrategyLegAdapters({
          publicClient,
          strategyRegistry: deployments.strategyRegistry,
          strategyId: sid,
        });
      }
      const depositStack = resolveDepositStack(deployments, legAdapters);
      const adapters = depositStack.adapters.map((a) => a.adapter) as readonly Address[];
      const plan = buildFivePoolQuotePlan({
        grossUsdc: parsed.grossUsdc,
        adapters,
        currentTicks,
        sqrtPriceX96PerPool,
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
      const message = "Wallet and deployments required";
      setError(message);
      setProgress("failed");
      throw new Error(message);
    }
    if (!wallet.address || !wallet.provider) {
      const message = "Wallet and deployments required";
      setError(message);
      setProgress("failed");
      throw new Error(message);
    }
    if (!onExpectedChain) {
      const message = `Wrong network — switch to chain ${expectedChainId}`;
      setError(message);
      setProgress("failed");
      throw new Error(message);
    }
    try {
      assertChainEnvironmentMatch({
        walletChainId: wallet.chainId,
        deploymentChainId: attestedDeployments.chainId,
        network: attestedDeployments.network,
        permit2: attestedDeployments.permit2,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Chain/environment mismatch";
      setError(message);
      setProgress("failed");
      throw e instanceof Error ? e : new Error(message);
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
      if (isStrategyAlreadyExistsError(message)) {
        await refreshBalancesAndStrategy();
        setError(null);
        setProgress("idle");
        setStatusMessage("Strategy already registered");
        return;
      }
      setError(message);
      setProgress("failed");
      throw err instanceof Error ? err : new Error(message);
    }
  }, [
    chain,
    deployments,
    expectedChainId,
    onExpectedChain,
    publicClient,
    refreshBalancesAndStrategy,
    wallet.address,
    wallet.chainId,
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
      setStatusMessage("Checking network gas vs SafetyController ceiling…");
      await requireGasPriceWithinSafetyCeiling({
        publicClient,
        safetyController: attestedDeployments.safetyController,
      });
      if (!strategyRegisteredRef.current && !strategyRegistered) {
        throw new Error("Register the five-pool strategy before depositing");
      }
      const activeQuoteBundle = quoteBundleRef.current ?? quoteBundle;
      if (!planRef.current || !activeQuoteBundle) {
        throw new Error("Prepare quotes first");
      }

      const activeStrategyId = strategyIdRef.current ?? strategyId;
      if (!activeStrategyId) {
        throw new Error("Register the five-pool strategy before depositing");
      }

      const legAdapters = await readStrategyLegAdapters({
        publicClient,
        strategyRegistry: attestedDeployments.strategyRegistry,
        strategyId: activeStrategyId,
      });
      const depositStack = resolveDepositStack(attestedDeployments, legAdapters);
      const clExecutor = depositStack.clExecutor;
      const stackAdapters = depositStack.adapters;

      const nowSec = Math.floor(Date.now() / 1000);
      // Always resolve from chain — local retries / prior deposits must not reuse a nonce.
      const nextNonce = await resolveNextDepositExecutionNonce(
        publicClient,
        attestedDeployments.strategyRegistry,
        activeStrategyId,
      );
      setExecutionNonce(nextNonce);

      const walletClient = createWalletClient({
        account: ownerAddress,
        chain,
        // Inflate deposit estimateGas + force ≥10M gas on send — wallets often
        // substitute raw eth_estimateGas (~6.2M) and OOG (tx 0x5bab6b53…).
        transport: custom(wrapProviderForceFivePoolDepositGas(walletProvider)),
      });

      setProgress("awaiting-approval");
      setStatusMessage(
        depositStack.kind === "legacy"
          ? "Checking USDC + Permit2 allowances (legacy stack)…"
          : "Checking USDC + Permit2 allowances…",
      );

      const readDepositAllowancesRaw =
        async (): Promise<ClFivePoolPermit2LiveAllowances> => {
          // Explicit latest block via HTTP RPC — never wallet-provider eth_call cache.
          const erc20AllowanceToPermit2 = await allowanceReadClient.readContract({
            address: attestedDeployments.usdc,
            abi: erc20Abi,
            functionName: "allowance",
            args: [ownerAddress, attestedDeployments.permit2],
            blockTag: "latest",
          });
          const p2 = await allowanceReadClient.readContract({
            address: attestedDeployments.permit2,
            abi: permit2AllowanceAbi,
            functionName: "allowance",
            args: [
              ownerAddress,
              attestedDeployments.usdc,
              clExecutor,
            ],
            blockTag: "latest",
          });
          const decoded = decodeClFivePoolPermit2AllowanceTuple(p2[0], p2[1]);
          return {
            erc20AllowanceToPermit2,
            permit2AmountToExecutor: decoded.permit2AmountToExecutor,
            permit2ExpirationToExecutor: decoded.permit2ExpirationToExecutor,
          };
        };

      const readDepositAllowances = () =>
        readClFivePoolPermit2AllowancesWithRpcGuard({
          owner: ownerAddress,
          token: attestedDeployments.usdc,
          permit2: attestedDeployments.permit2,
          clExecutor,
          readAllowances: readDepositAllowancesRaw,
        });

      let allowances = await readDepositAllowances();
      const precheckNow = Math.floor(Date.now() / 1000);
      const readiness = evaluateClFivePoolPermit2Readiness({
        requiredGrossUsdc: planRef.current.grossUsdc,
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
              const approveNow = Math.floor(Date.now() / 1000);
              const plan = buildClFivePoolPermit2Plan({
                chainId: expectedChainId,
                permit2: attestedDeployments.permit2,
                token: attestedDeployments.usdc,
                clExecutor,
                grossUsdc: planRef.current!.grossUsdc,
                expiration: computeClFivePoolPermit2Expiration(approveNow),
                nowSec: approveNow,
              });
              return walletClient.writeContract({
                address: plan.erc20ApproveTx.address,
                abi: plan.erc20ApproveTx.abi,
                functionName: plan.erc20ApproveTx.functionName,
                args: plan.erc20ApproveTx.args,
              });
            }
          : null,
        permit2Approve: readiness.needsPermit2Approve
          ? async () => {
              setStatusMessage("Approve Permit2 → CL executor (exact amount, short expiry)…");
              // Fresh 30-minute expiry at wallet-prompt time (not deposit-start clock).
              const approveNow = Math.floor(Date.now() / 1000);
              const plan = buildClFivePoolPermit2Plan({
                chainId: expectedChainId,
                permit2: attestedDeployments.permit2,
                token: attestedDeployments.usdc,
                clExecutor,
                grossUsdc: planRef.current!.grossUsdc,
                expiration: computeClFivePoolPermit2Expiration(approveNow),
                nowSec: approveNow,
              });
              return walletClient.writeContract({
                address: plan.permit2ApproveTx.address,
                abi: plan.permit2ApproveTx.abi,
                functionName: plan.permit2ApproveTx.functionName,
                args: plan.permit2ApproveTx.args,
              });
            }
          : null,
        waitForSuccess: (hash) =>
          waitForSuccessfulTransactionReceipt(allowanceReadClient, hash),
      });
      setApprovalTxHashes(approvalHashes);

      // Poll HTTP Base RPC until allowances match — wallet eth_call is often stale here.
      setStatusMessage("Refreshing allowances…");
      allowances = await refetchClFivePoolPermit2AllowancesUntilReady({
        readAllowances: readDepositAllowances,
        requiredGrossUsdc: planRef.current.grossUsdc,
        nowSec: () => Math.floor(Date.now() / 1000),
        permit2: attestedDeployments.permit2,
        clExecutor,
      });

      // Refresh oracle quotes + LP mins immediately before estimateGas / write —
      // avoids MevGuard ExcessiveSlippage when oracle moved after Prepare Quotes.
      const depositNowSec = Math.floor(Date.now() / 1000);
      const swapSlip = validateSlippageBps(swapSlippageInput, "Swap slippage");
      const lpSlip = validateSlippageBps(lpSlippageInput, "LP slippage");
      if (!swapSlip.ok) throw new Error(swapSlip.message);
      if (!lpSlip.ok) throw new Error(lpSlip.message);
      setStatusMessage("Refreshing live oracle quotes for deposit…");
      const refreshed = await rebuildDepositExecutionPlan({
        grossUsdc: planRef.current.grossUsdc,
        adapters: stackAdapters.map((a) => a.adapter),
        swapSlippageBps: swapSlip.bps,
        lpSlippageBps: lpSlip.bps,
        deadline: planRef.current.deadline,
        publicClient: allowanceReadClient,
        oracleGuard: attestedDeployments.oracleGuard,
        tokens: {
          usdc: attestedDeployments.usdc,
          cbbtc: attestedDeployments.cbbtc,
          weth: attestedDeployments.weth,
        },
        network: attestedDeployments.network,
        chainId: attestedDeployments.chainId,
        nowSec: depositNowSec,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
      });
      planRef.current = refreshed.plan;
      quoteBundleRef.current = refreshed.quoteBundle;
      setQuoteBundle(refreshed.quoteBundle);
      setPreview(
        buildDepositPreview({
          plan: refreshed.plan,
          quotedAtSec: refreshed.quoteBundle.quotedAtSec,
          maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
          quoteSource: refreshed.quoteBundle.source,
        }),
      );

      const depositArgs = buildDepositFivePoolStrategyArgs({
        plan: refreshed.plan,
        adapters: stackAdapters,
        strategyId: activeStrategyId,
        executionNonce: nextNonce,
        quoteBundle: refreshed.quoteBundle,
        nowSec: depositNowSec,
        maxQuoteAgeSec: FIVE_POOL_DEFAULT_QUOTE_MAX_AGE_SEC,
        minRemainingSec: FIVE_POOL_EXECUTABLE_QUOTE_MIN_REMAINING_SEC,
        requireLiveQuotes: true,
      });

      setProgress("awaiting-deposit");
      setStatusMessage("Estimating deposit gas…");

      const depositWriteArgs = [
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
      ] as const;

      // HTTP estimate + buffer — wallet eth_estimateGas alone OOGed at ~6.59M
      // (tx 0x1e76759c… / 0xac64ff1b…); same calldata succeeds at ≥10M.
      const gasEstimate = await allowanceReadClient.estimateContractGas({
        address: clExecutor,
        abi: concentratedLiquidityExecutorAbi,
        functionName: "depositFivePoolStrategy",
        args: depositWriteArgs as never,
        account: ownerAddress,
      });
      const depositGas = requireFivePoolDepositGasLimit(
        applyFivePoolDepositGasBuffer(gasEstimate),
      );

      setStatusMessage("Simulating deposit…");
      const depositCalldata = encodeFunctionData({
        abi: concentratedLiquidityExecutorAbi,
        functionName: "depositFivePoolStrategy",
        args: depositWriteArgs as never,
      });
      await preflightDepositFivePoolStrategyCall({
        gas: depositGas,
        call: ({ gas }) =>
          allowanceReadClient.call({
            account: ownerAddress,
            to: clExecutor,
            data: depositCalldata,
            gas,
          }),
      });

      setStatusMessage(
        "Confirm deposit — keep gas limit ≥ 10,000,000 (do not accept a ~6M wallet estimate)…",
      );

      // sendTransaction + provider wrapper: writeContract gas is often replaced
      // by wallet eth_estimateGas (~6.22M on 0x5bab6b53…).
      const depositHash = await walletClient.sendTransaction({
        account: ownerAddress,
        to: clExecutor,
        data: depositCalldata,
        gas: depositGas,
        chain: walletClient.chain ?? undefined,
      });
      setLastTxHash(depositHash);
      await waitForSuccessfulTransactionReceipt(publicClient, depositHash, {
        gasLimit: depositGas,
      });
      setExecutionNonce(nextNonce + BigInt(1));
      setProgress("confirmed");
      setStatusMessage("Deposit confirmed — loading positions…");
      clearPlan();
      planRef.current = null;
      await refreshBalancesAndStrategy();
      requestFivePoolPositionsRefresh({
        reason: "deposit-confirmed",
        txHash: depositHash,
      });
    } catch (err) {
      setProgress("failed");
      const reject = userRejectMessage(err);
      const permit2Msg = formatPermit2UserError(err);
      const execMsg = formatStableClubExecutionError(err);
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
            execMsg ??
            (err instanceof Error ? err.message : "Deposit failed"),
        );
      }
    } finally {
      submittingRef.current = false;
    }
  }, [
    allowanceReadClient,
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
    lpSlippageInput,
    strategyId,
    strategyRegistered,
    swapSlippageInput,
    wallet.address,
    wallet.provider,
  ]);

  const depositIntoFivePoolStrategy = useCallback(async () => {
    try {
      setError(null);
      if (!isExitAllToUsdcAvailable(deployments)) {
        throw new Error(
          "Deposits are unavailable until USDC-only Withdraw All (exitAllToUsdc) is enabled. Deposit and Withdraw unlock together after Safe-owned stack cutover + Base E2E. Legacy mixed-asset exit is never offered.",
        );
      }
      if (!wallet.address) {
        setStatusMessage("Connect wallet to continue…");
        setProgress("awaiting-approval");
        await wallet.connect();
        // Wallet connect is async / modal — user re-clicks Deposit after connecting.
        setProgress("idle");
        setStatusMessage("Wallet connected — click Deposit again to continue");
        return;
      }
      if (!onExpectedChain) {
        setStatusMessage("Switch wallet to Base…");
        setProgress("awaiting-approval");
        await wallet.switchToBase();
        setProgress("idle");
        setStatusMessage("Switched network — click Deposit again to continue");
        return;
      }
      if (!strategyRegisteredRef.current && !strategyRegistered) {
        setStatusMessage("Registering five-pool strategy…");
        // registerStrategy rethrows on hard failure; StrategyAlreadyExists returns normally.
        await registerStrategy();
        await refreshBalancesAndStrategy();
        assertRegistrationAllowsDeposit(strategyRegisteredRef.current);
      }
      if (!planRef.current || !quoteBundleRef.current) {
        setStatusMessage("Preparing quotes…");
        await prepareQuotes();
      }
      if (!planRef.current || !quoteBundleRef.current) {
        // prepareQuotes already set a user-visible error when it failed.
        return;
      }
      await submitDeposit();
    } catch (err) {
      setProgress("failed");
      const reject = userRejectMessage(err);
      const permit2Msg = formatPermit2UserError(err);
      const execMsg = formatStableClubExecutionError(err);
      setError(
        reject ??
          permit2Msg ??
          execMsg ??
          (err instanceof Error ? err.message : "Deposit failed"),
      );
      setStatusMessage(null);
    }
  }, [
    deployments,
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
