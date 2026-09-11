"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  concentratedLiquidityAdapterAbi,
  concentratedLiquidityExecutorAbi,
  permissionRegistryAbi,
  strategyPermissionRegistryAbi,
} from "@/lib/stable-club/abis";
import { requireGasPriceWithinSafetyCeiling } from "@/lib/stable-club/gas-price-ceiling-preflight";
import {
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_CHAIN_ID,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";
import { createStableClubBaseReadTransport } from "@/lib/stable-club/base-rpc-transport";
import { assertChainEnvironmentMatch } from "@/lib/stable-club/chain-isolation";
import { explorerTxUrl } from "@/lib/stable-club/five-pool-deposit";
import {
  aggregateExitProceeds,
  buildExitToUsdcPreview,
  EXIT_UNWIND_SLIPPAGE_BPS,
  isExitAllToUsdcAvailable,
  isExitPercentToUsdcAvailable,
  padExitUnwindSwaps,
} from "@/lib/stable-club/exit-to-usdc";
import { withdrawPercentViaOpsGateway } from "@/lib/stable-club/ops-gateway-withdraw";
import {
  coldWithdrawPromptClaim,
  isOpsGatewayWithdrawAvailable,
} from "@/lib/stable-club/ops-gateway";
import {
  findDiscoveryAdapterMeta,
  resolveClStackForAdapters,
} from "@/lib/stable-club/cl-stack-resolve";
import { BASE_TOKENS } from "@/lib/stable-club/official-pools";
import { quoteTokenToUsdcViaOracle } from "@/components/stable-club/usePositionUsdValue";
import {
  planLooseAssetRecoveries,
  recoverLooseAssetToUsdcFully,
  sweepAllResidueToUsdcOnce,
} from "@/lib/stable-club/recover-loose-assets";
import { wrapProviderForceRecoverGas } from "@/lib/stable-club/force-recover-gas-provider";
import {
  applyOwnerNpmMulticallGasBuffer,
  OWNER_NPM_MULTICALL_OOG_USER_MESSAGE,
} from "@/lib/stable-club/owner-npm-multicall-gas";
import {
  RECOVER_APPROVE_OOG_USER_MESSAGE,
  RECOVER_SWAP_OOG_USER_MESSAGE,
  RECOVER_SWEEP_OOG_USER_MESSAGE,
} from "@/lib/stable-club/recover-swap-gas";
import {
  maxBlock,
  waitForReadClientBlock,
} from "@/lib/stable-club/read-block-floor";
import {
  clearWithdrawCheckpoint,
  isCheckpointIncomplete,
  readWithdrawCheckpoint,
  residueFromBaseline,
  writeWithdrawCheckpoint,
  type WithdrawCheckpoint,
} from "@/lib/stable-club/withdraw-checkpoint";
import {
  FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS,
  aeroFactoryGetPoolAbi,
  aeroNpmPositionsAbi,
  applyNpmExitSlippageMin,
  assertWalletOwnsPosition,
  buildDirectNpmExitPlan,
  buildExitAllLegs,
  buildExitAllToUsdcLegs,
  buildFullExitLegParams,
  buildPartialExitLegParams,
  buildPositionDiscoveryBlockRanges,
  buildSkippedExitLeg,
  collectOwnedNftTokenIdsWithRetry,
  collectTokenIdsFromTransferLogs,
  erc721EnumerableAbi,
  mapLegMinsToToken01,
  mapAmountsToLegOrder,
  exactPoolBindingExpectations,
  FIVE_POOL_LEG_DISCOVERY_TIMEOUT_MS,
  interpretLiveExitAmounts,
  matchExactPoolMintTokenId,
  positionNftClaimKey,
  resolvePositionDiscoveryFromBlock,
  toFivePoolPosition,
  uniV3FactoryGetPoolAbi,
  uniV3NpmPositionsAbi,
  withDiscoveryTimeout,
  type DirectNpmExitPlan,
  type FivePoolExitProgress,
  type FivePoolPosition,
  type NpmPositionIdentity,
  type PerLegExitResult,
  type StrategyLegBinding,
} from "@/lib/stable-club/five-pool-positions";
import { FIVE_POOL_LEG_COUNT } from "@/lib/stable-club/five-pool-strategy";
import { erc721PositionAbi } from "@/lib/stable-club/nft-approval";
import {
  buildNpmWithdrawMulticallCalls,
  encodeNpmMulticall,
  quoteNpmDecreaseMins,
  quoteNpmExecutorExit,
  requireNativeEthForOwnerWithdraw,
} from "@/lib/stable-club/npm-direct-withdraw";
import {
  BASE_NPM_PERMIT_DOMAINS,
  npmErc721PermitAbi,
  signAndBuildNpmPermitTx,
} from "@/lib/stable-club/npm-erc721-permit";
import {
  FIVE_POOL_POSITIONS_REFRESH_EVENT,
} from "@/lib/stable-club/positions-refresh";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import {
  requireAttestedPhase2aDeployments,
  type StableClubPhase2aPublicDeployments,
} from "@/lib/stable-club/phase2a-deployments";
import { usePhase2aBootstrap } from "@/components/stable-club/usePhase2aBootstrap";
import { base } from "viem/chains";

function userRejectMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (/user rejected|denied|rejected the request|ACTION_REJECTED/i.test(msg)) {
    return "Wallet rejected the request";
  }
  return null;
}

/** Must match StableClubConcentratedLiquidityExecutor.EXIT_EXECUTION_NONCE_DOMAIN (SC-10). */
const EXIT_EXECUTION_NONCE_DOMAIN = BigInt(1) << BigInt(255);
/** Must match StableClubConcentratedLiquidityExecutor.AUTOMATION_EXECUTION_NONCE_DOMAIN. */
const AUTOMATION_EXECUTION_NONCE_DOMAIN = BigInt(1) << BigInt(254);

function encodeExitExecutionNonce(callerNonce: bigint): bigint {
  if (callerNonce >= EXIT_EXECUTION_NONCE_DOMAIN) {
    throw new Error("Invalid exit execution nonce domain");
  }
  return EXIT_EXECUTION_NONCE_DOMAIN | callerNonce;
}

function encodeAutomationExecutionNonce(callerNonce: bigint): bigint {
  if (callerNonce >= AUTOMATION_EXECUTION_NONCE_DOMAIN) {
    throw new Error("Invalid automation execution nonce domain");
  }
  return AUTOMATION_EXECUTION_NONCE_DOMAIN | callerNonce;
}

async function resolveFreeExecutionNonce(
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof permissionRegistryAbi;
      functionName: "executionNonceUsed";
      args: readonly [Hex, bigint];
    }) => Promise<boolean>;
  },
  permissionRegistry: Address,
  permissionId: Hex,
  startFrom: bigint = BigInt(1),
  maxScan: bigint = BigInt(512),
): Promise<bigint> {
  for (let n = startFrom; n < startFrom + maxScan; n++) {
    const used = await publicClient.readContract({
      address: permissionRegistry,
      abi: permissionRegistryAbi,
      functionName: "executionNonceUsed",
      args: [permissionId, encodeExitExecutionNonce(n)],
    });
    if (!used) return n;
  }
  throw new Error("No free execution nonce found");
}

async function resolveExitAllNonceBase(
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof permissionRegistryAbi;
      functionName: "executionNonceUsed";
      args: readonly [Hex, bigint];
    }) => Promise<boolean>;
  },
  permissionRegistry: Address,
  permissionIds: readonly (Hex | null)[],
  startFrom: bigint = BigInt(1),
  maxScan: bigint = BigInt(512),
): Promise<bigint> {
  for (let base = startFrom; base < startFrom + maxScan; base++) {
    let ok = true;
    for (let i = 0; i < FIVE_POOL_LEG_COUNT; i++) {
      const pid = permissionIds[i];
      if (!pid) continue;
      const used = await publicClient.readContract({
        address: permissionRegistry,
        abi: permissionRegistryAbi,
        functionName: "executionNonceUsed",
        args: [pid, encodeExitExecutionNonce(base + BigInt(i))],
      });
      if (used) {
        ok = false;
        break;
      }
    }
    if (ok) return base;
  }
  throw new Error("No free exitAll nonce base found");
}

async function resolveAutomationAllNonceBase(
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof permissionRegistryAbi;
      functionName: "executionNonceUsed";
      args: readonly [Hex, bigint];
    }) => Promise<boolean>;
  },
  permissionRegistry: Address,
  permissionIds: readonly (Hex | null)[],
  startFrom: bigint = BigInt(1),
  maxScan: bigint = BigInt(512),
): Promise<bigint> {
  for (let base = startFrom; base < startFrom + maxScan; base++) {
    let ok = true;
    for (let i = 0; i < FIVE_POOL_LEG_COUNT; i++) {
      const pid = permissionIds[i];
      if (!pid) continue;
      const used = await publicClient.readContract({
        address: permissionRegistry,
        abi: permissionRegistryAbi,
        functionName: "executionNonceUsed",
        args: [pid, encodeAutomationExecutionNonce(base + BigInt(i))],
      });
      if (used) {
        ok = false;
        break;
      }
    }
    if (ok) return base;
  }
  throw new Error("No free harvest/compound nonce base found");
}

/** SC-F05: refresh live adapter amounts before any exit mins / approval / tx. */
async function readLiveExitAmountsForPosition(
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof concentratedLiquidityAdapterAbi;
      functionName: "ownerOf" | "positionTokens" | "positionAmounts" | "liquidityOf";
      args: readonly [bigint];
    }) => Promise<unknown>;
  },
  position: FivePoolPosition,
  account: Address,
): Promise<{ amountA: bigint; amountB: bigint; liquidity: bigint }> {
  try {
    const owner = (await publicClient.readContract({
      address: position.adapter,
      abi: concentratedLiquidityAdapterAbi,
      functionName: "ownerOf",
      args: [position.positionTokenId],
    })) as Address;
    assertWalletOwnsPosition(account, owner, position.positionTokenId);

    const tokens = (await publicClient.readContract({
      address: position.adapter,
      abi: concentratedLiquidityAdapterAbi,
      functionName: "positionTokens",
      args: [position.positionTokenId],
    })) as readonly [Address, Address];

    const amounts = (await publicClient.readContract({
      address: position.adapter,
      abi: concentratedLiquidityAdapterAbi,
      functionName: "positionAmounts",
      args: [position.positionTokenId],
    })) as readonly [bigint, bigint];

    let liquidity = BigInt(0);
    try {
      liquidity = (await publicClient.readContract({
        address: position.adapter,
        abi: concentratedLiquidityAdapterAbi,
        functionName: "liquidityOf",
        args: [position.positionTokenId],
      })) as bigint;
    } catch {
      liquidity = amounts[0]! + amounts[1]!;
    }

    const live = interpretLiveExitAmounts({
      tokenA: position.tokenA,
      tokenB: position.tokenB,
      token0: tokens[0]!,
      token1: tokens[1]!,
      amount0: amounts[0]!,
      amount1: amounts[1]!,
      liquidity,
    });
    return {
      amountA: live.amountA,
      amountB: live.amountB,
      liquidity: live.liquidity,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Live exit valuation failed for tokenId ${position.positionTokenId.toString()}: ${detail}`);
  }
}

export function useFivePoolPositions() {
  const wallet = useStableClubWallet();
  const submittingRef = useRef(false);
  const refreshGenerationRef = useRef(0);

  const bootstrap = usePhase2aBootstrap();
  const deployments = bootstrap.deployments;
  const deploymentsLoading = bootstrap.loading && !bootstrap.isSuccess;
  const deploymentsError = bootstrap.error;

  const [strategyId, setStrategyId] = useState<Hex | null>(null);
  const [strategyRegistered, setStrategyRegistered] = useState(false);
  const [strategyRevoked, setStrategyRevoked] = useState(false);
  const [strategyExpired, setStrategyExpired] = useState(false);
  const [positions, setPositions] = useState<FivePoolPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const [progress, setProgress] = useState<FivePoolExitProgress>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hex | null>(null);
  const [approvalTxHashes, setApprovalTxHashes] = useState<Hex[]>([]);
  const [legResults, setLegResults] = useState<PerLegExitResult[]>([]);
  const [directPlan, setDirectPlan] = useState<DirectNpmExitPlan | null>(null);
  const [slippageBps] = useState(FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS);
  const [strandedAssets, setStrandedAssets] = useState<
    { symbol: string; tokenIn: Address; amountIn: bigint }[]
  >([]);
  const [incompleteWithdraw, setIncompleteWithdraw] =
    useState<WithdrawCheckpoint | null>(null);

  const chain = useMemo(
    () =>
      deployments?.network === "hardhat-local"
        ? STABLE_CLUB_LOCAL_CHAIN
        : wallet.chain ?? STABLE_CLUB_LOCAL_CHAIN,
    [deployments?.network, wallet.chain],
  );

  /**
   * Position discovery (eth_getLogs over large block ranges) must use HTTP Base RPC —
   * never the wallet EIP-1193 provider, which often truncates/fails long log queries.
   */
  const discoveryClient = useMemo(() => {
    const readChain =
      deployments?.network === "hardhat-local" ? STABLE_CLUB_LOCAL_CHAIN : base;
    if (deployments?.network === "hardhat-local") {
      return createPublicClient({
        chain: readChain,
        transport: http(deployments.rpcUrl ?? STABLE_CLUB_LOCAL_RPC_URL),
      });
    }
    return createPublicClient({
      chain: readChain,
      transport: createStableClubBaseReadTransport(),
    });
  }, [deployments?.network, deployments?.rpcUrl]);

  /** Wallet transport for writes / receipt waits when connected. */
  const publicClient = useMemo(() => {
    const rpc = deployments?.rpcUrl ?? STABLE_CLUB_LOCAL_RPC_URL;
    if (wallet.provider) {
      return createPublicClient({ chain, transport: custom(wallet.provider) });
    }
    if (deployments?.network === "hardhat-local") {
      return createPublicClient({ chain, transport: http(rpc) });
    }
    return createPublicClient({
      chain,
      transport: createStableClubBaseReadTransport(),
    });
  }, [chain, deployments?.network, deployments?.rpcUrl, wallet.provider]);

  const expectedChainId = deployments?.chainId ?? STABLE_CLUB_LOCAL_CHAIN_ID;
  const onExpectedChain = wallet.chainId === expectedChainId;

  const refreshStrandedAssets = useCallback(async () => {
    if (!deployments || !wallet.address) {
      setStrandedAssets([]);
      setIncompleteWithdraw(null);
      return;
    }
    if (deployments.network === "hardhat-local" || deployments.chainId !== 8453) {
      setStrandedAssets([]);
      setIncompleteWithdraw(null);
      return;
    }
    if (!onExpectedChain) {
      setStrandedAssets([]);
      return;
    }
    try {
      const cp = readWithdrawCheckpoint(wallet.address, expectedChainId);
      setIncompleteWithdraw(isCheckpointIncomplete(cp) ? cp : null);
      let planned;
      if (cp && isCheckpointIncomplete(cp)) {
        const cbBal = (await publicClient.readContract({
          address: BASE_TOKENS.cbBTC.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet.address],
        })) as bigint;
        const wethBal = (await publicClient.readContract({
          address: BASE_TOKENS.WETH.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet.address],
        })) as bigint;
        planned = await planLooseAssetRecoveries({
          publicClient,
          account: wallet.address,
          maxByToken: {
            cbBTC: residueFromBaseline({
              current: cbBal,
              baseline: BigInt(cp.baseline.cbBtc),
            }),
            WETH: residueFromBaseline({
              current: wethBal,
              baseline: BigInt(cp.baseline.weth),
            }),
          },
        });
      } else {
        planned = await planLooseAssetRecoveries({
          publicClient,
          account: wallet.address,
        });
      }
      setStrandedAssets(
        planned.map((row) => ({
          symbol: row.symbol,
          tokenIn: row.tokenIn,
          amountIn: row.amountIn,
        })),
      );
    } catch {
      // Read-only reporting — keep prior list on RPC blips.
    }
  }, [
    deployments,
    expectedChainId,
    onExpectedChain,
    publicClient,
    wallet.address,
  ]);

  // Drop prior wallet rows immediately so account switches never flash stale LPs.
  useEffect(() => {
    refreshGenerationRef.current += 1;
    setPositions([]);
    setStrategyId(null);
    setStrategyRegistered(false);
    setStrategyRevoked(false);
    setStrategyExpired(false);
    setPositionsError(null);
    setStale(false);
    setStrandedAssets([]);
    setIncompleteWithdraw(null);
    setPositionsLoading(Boolean(wallet.address));
  }, [wallet.address]);

  const refreshPositions = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!deployments || !wallet.address) {
      setPositions([]);
      setStrategyId(null);
      setStrategyRegistered(false);
      setStrandedAssets([]);
      setPositionsLoading(false);
      return;
    }

    const generation = ++refreshGenerationRef.current;
    const quiet = opts?.quiet === true;
    // Quiet polls must not flip the loading flag (avoids empty/loading flicker).
    if (!quiet) {
      setPositionsLoading(true);
      setPositionsError(null);
    }
    try {
      const client = discoveryClient;
      const sid = await withDiscoveryTimeout(
        client.readContract({
          address: deployments.strategyRegistry,
          abi: strategyPermissionRegistryAbi,
          functionName: "strategyIdFor",
          args: [wallet.address, BigInt(expectedChainId), deployments.usdc],
        }),
        FIVE_POOL_LEG_DISCOVERY_TIMEOUT_MS,
        "strategyIdFor",
      );
      if (generation !== refreshGenerationRef.current) return;
      setStrategyId(sid);

      const strategyRaw = await withDiscoveryTimeout(
        client.readContract({
          address: deployments.strategyRegistry,
          abi: strategyPermissionRegistryAbi,
          functionName: "getStrategy",
          args: [sid],
        } as never),
        FIVE_POOL_LEG_DISCOVERY_TIMEOUT_MS,
        "getStrategy",
      );
      if (generation !== refreshGenerationRef.current) return;
      const strategy = strategyRaw as {
        user?: Address;
        revoked?: boolean;
        expiresAt?: bigint;
        0?: Address;
        9?: bigint;
        10?: boolean;
      };
      const strategyUser = (strategy.user ?? strategy[0]) as Address;
      const revoked = Boolean(strategy.revoked ?? strategy[10]);
      const expiresAt = BigInt(strategy.expiresAt ?? strategy[9] ?? 0);
      const now = BigInt(Math.floor(Date.now() / 1000));
      const registered =
        typeof strategyUser === "string" &&
        strategyUser.toLowerCase() === wallet.address.toLowerCase() &&
        strategyUser !== "0x0000000000000000000000000000000000000000";
      setStrategyRegistered(registered);
      setStrategyRevoked(revoked);
      setStrategyExpired(expiresAt > BigInt(0) && expiresAt <= now);

      if (!registered) {
        setPositions([]);
        setStale(false);
        void refreshStrandedAssets();
        return;
      }

      const isVerifiedLocal =
        deployments.network === "hardhat-local" && deployments.chainId === 31337;

      // Local Hardhat may lack ERC721Enumerable — keep Transfer log discovery there.
      let logRanges: { fromBlock: bigint; toBlock: bigint }[] | null = null;
      if (isVerifiedLocal) {
        const fromBlock = resolvePositionDiscoveryFromBlock({
          network: deployments.network,
          chainId: deployments.chainId,
          discoveryStartBlock: deployments.discoveryStartBlock,
        });
        const latestBlock = await client.getBlockNumber();
        logRanges = buildPositionDiscoveryBlockRanges(fromBlock, latestBlock);
      }

      // Phase 1 — all strategy legs in parallel (not serial RPC waterfall).
      const legSettled = await Promise.all(
        Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, legIndex) =>
          withDiscoveryTimeout(
            client.readContract({
              address: deployments.strategyRegistry,
              abi: strategyPermissionRegistryAbi,
              functionName: "getLeg",
              args: [sid, BigInt(legIndex)],
            }),
            FIVE_POOL_LEG_DISCOVERY_TIMEOUT_MS,
            `getLeg[${legIndex}]`,
          )
            .then((legRaw) => ({
              legIndex,
              ok: true as const,
              leg: legRaw as StrategyLegBinding,
            }))
            .catch((err) => ({
              legIndex,
              ok: false as const,
              error: err instanceof Error ? err.message : String(err),
            })),
        ),
      );
      if (generation !== refreshGenerationRef.current) return;

      type LegWork = {
        legIndex: number;
        leg: StrategyLegBinding;
        adapterMeta: NonNullable<
          StableClubPhase2aPublicDeployments["adapters"][number]
        >;
        binding: NonNullable<ReturnType<typeof exactPoolBindingExpectations>>;
        nftContract: Address;
      };

      const legWork: LegWork[] = [];
      let partial = false;
      for (const item of legSettled) {
        if (!item.ok) {
          partial = true;
          continue;
        }
        const { leg, legIndex } = item;
        if (!leg.adapter || leg.adapter === "0x0000000000000000000000000000000000000000") {
          continue;
        }
        const adapterMeta = findDiscoveryAdapterMeta(deployments, leg.adapter);
        if (!adapterMeta) {
          partial = true;
          continue;
        }
        const binding = exactPoolBindingExpectations(leg.poolId);
        if (!binding) {
          partial = true;
          continue;
        }
        const nftContract =
          deployments.network === "hardhat-local" ? adapterMeta.adapter : adapterMeta.npm;
        legWork.push({ legIndex, leg, adapterMeta, binding, nftContract });
      }

      // Phase 2 — enumerate each unique NPM once (Uni/Aero legs share contracts).
      const candidatesByNft = new Map<string, bigint[]>();
      const uniqueNfts = [...new Set(legWork.map((w) => w.nftContract.toLowerCase()))];
      const enumErrors: string[] = [];
      await Promise.all(
        uniqueNfts.map(async (nftKey) => {
          const nftContract = legWork.find((w) => w.nftContract.toLowerCase() === nftKey)!
            .nftContract;
          try {
            const candidates = await withDiscoveryTimeout(
              (async () => {
                if (isVerifiedLocal && logRanges) {
                  const transferEvent = parseAbiItem(
                    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
                  );
                  const logs: { args?: { tokenId?: bigint } | null }[] = [];
                  for (const range of logRanges) {
                    const chunk = await client.getLogs({
                      address: nftContract,
                      event: transferEvent,
                      args: {
                        from: "0x0000000000000000000000000000000000000000",
                        to: wallet.address,
                      },
                      fromBlock: range.fromBlock,
                      toBlock: range.toBlock,
                    });
                    logs.push(...chunk);
                  }
                  return collectTokenIdsFromTransferLogs(logs);
                }
                return collectOwnedNftTokenIdsWithRetry({
                  owner: wallet.address!,
                  label: `nftEnumerate[${nftKey.slice(0, 10)}]`,
                  balanceOf: (owner) =>
                    client.readContract({
                      address: nftContract,
                      abi: erc721EnumerableAbi,
                      functionName: "balanceOf",
                      args: [owner],
                    }),
                  tokenOfOwnerByIndex: (owner, index) =>
                    client.readContract({
                      address: nftContract,
                      abi: erc721EnumerableAbi,
                      functionName: "tokenOfOwnerByIndex",
                      args: [owner, index],
                    }),
                });
              })(),
              FIVE_POOL_LEG_DISCOVERY_TIMEOUT_MS * 3,
              `nftEnumerate[${nftKey.slice(0, 10)}]`,
            );
            candidatesByNft.set(nftKey, candidates);
          } catch (err) {
            partial = true;
            const msg = err instanceof Error ? err.message : String(err);
            enumErrors.push(msg);
            // Do not poison match with empty candidates on hard failure — leave unset
            // so Phase 3 can skip this NPM cleanly and surface the RPC error.
          }
        }),
      );
      if (generation !== refreshGenerationRef.current) return;

      if (enumErrors.length > 0 && candidatesByNft.size === 0) {
        setStale(true);
        setPositionsError(
          `LP discovery RPC failed (${enumErrors[0]}). Tap Refresh — positions kept if previously loaded.`,
        );
        setPositionsLoading(false);
        void refreshStrandedAssets();
        return;
      }

      // Phase 3 — match legs sequentially so claimed NFT IDs stay consistent.
      const discovered: FivePoolPosition[] = [];
      const claimedTokenIds = new Set<string>();

      for (const work of legWork.sort((a, b) => a.legIndex - b.legIndex)) {
        const { legIndex, leg, adapterMeta, binding, nftContract } = work;
        if (!candidatesByNft.has(nftContract.toLowerCase())) {
          partial = true;
          continue;
        }
        const candidates = candidatesByNft.get(nftContract.toLowerCase()) ?? [];
        const isUni =
          binding.protocol === "uniswap-v3" || binding.protocol === "uniswap";
        const isAero =
          binding.protocol === "aerodrome-slipstream" || binding.protocol === "aerodrome";

        try {
          const tokenId = await withDiscoveryTimeout(
            matchExactPoolMintTokenId({
              candidates,
              user: wallet.address!,
              expectedTokenA: leg.tokenA,
              expectedTokenB: leg.tokenB,
              protocol: binding.protocol,
              expectedPool: binding.expectedPool,
              factory: binding.factory,
              nftContract,
              expectedFee: binding.expectedFee,
              expectedTickSpacing: binding.expectedTickSpacing,
              claimedTokenIds,
              readOwner: (id) =>
                client.readContract({
                  address: adapterMeta.adapter,
                  abi: concentratedLiquidityAdapterAbi,
                  functionName: "ownerOf",
                  args: [id],
                }),
              readNpmPosition: async (id): Promise<NpmPositionIdentity> => {
                if (isVerifiedLocal) {
                  const [token0, token1] = await client.readContract({
                    address: adapterMeta.adapter,
                    abi: concentratedLiquidityAdapterAbi,
                    functionName: "positionTokens",
                    args: [id],
                  });
                  let liquidity = BigInt(0);
                  try {
                    liquidity = await client.readContract({
                      address: adapterMeta.adapter,
                      abi: concentratedLiquidityAdapterAbi,
                      functionName: "liquidityOf",
                      args: [id],
                    });
                  } catch {
                    liquidity = BigInt(0);
                  }
                  if (isUni) {
                    return { token0, token1, fee: binding.expectedFee, liquidity };
                  }
                  return {
                    token0,
                    token1,
                    tickSpacing: binding.expectedTickSpacing,
                    liquidity,
                  };
                }
                if (isUni) {
                  const pos = await client.readContract({
                    address: adapterMeta.npm,
                    abi: uniV3NpmPositionsAbi,
                    functionName: "positions",
                    args: [id],
                  });
                  return {
                    token0: pos[2],
                    token1: pos[3],
                    fee: Number(pos[4]),
                    liquidity: BigInt(pos[7]),
                  };
                }
                if (isAero) {
                  const pos = await client.readContract({
                    address: adapterMeta.npm,
                    abi: aeroNpmPositionsAbi,
                    functionName: "positions",
                    args: [id],
                  });
                  return {
                    token0: pos[2],
                    token1: pos[3],
                    tickSpacing: Number(pos[4]),
                    liquidity: BigInt(pos[7]),
                  };
                }
                throw new Error(`Unsupported protocol for NPM binding: ${binding.protocol}`);
              },
              resolveFactoryPool: async ({ token0, token1, fee, tickSpacing }) => {
                if (isVerifiedLocal) return binding.expectedPool;
                if (isUni && fee != null) {
                  return client.readContract({
                    address: binding.factory,
                    abi: uniV3FactoryGetPoolAbi,
                    functionName: "getPool",
                    args: [token0, token1, fee],
                  });
                }
                if (isAero && tickSpacing != null) {
                  return client.readContract({
                    address: binding.factory,
                    abi: aeroFactoryGetPoolAbi,
                    functionName: "getPool",
                    args: [token0, token1, tickSpacing],
                  });
                }
                throw new Error("Factory pool resolution requires fee or tickSpacing");
              },
              readAmounts: (id) =>
                client.readContract({
                  address: adapterMeta.adapter,
                  abi: concentratedLiquidityAdapterAbi,
                  functionName: "positionAmounts",
                  args: [id],
                }),
            }),
            FIVE_POOL_LEG_DISCOVERY_TIMEOUT_MS,
            `matchLeg[${legIndex}]`,
          );

          if (tokenId == null) {
            partial = true;
            continue;
          }
          claimedTokenIds.add(positionNftClaimKey(nftContract, tokenId));

          const owner = await client.readContract({
            address: adapterMeta.adapter,
            abi: concentratedLiquidityAdapterAbi,
            functionName: "ownerOf",
            args: [tokenId],
          });
          if (owner.toLowerCase() !== wallet.address!.toLowerCase()) {
            partial = true;
            continue;
          }

          const [amount0, amount1] = await client.readContract({
            address: adapterMeta.adapter,
            abi: concentratedLiquidityAdapterAbi,
            functionName: "positionAmounts",
            args: [tokenId],
          });

          let liquidity = BigInt(0);
          try {
            liquidity = await client.readContract({
              address: adapterMeta.adapter,
              abi: concentratedLiquidityAdapterAbi,
              functionName: "liquidityOf",
              args: [tokenId],
            });
          } catch {
            liquidity = amount0 + amount1;
          }

          const approved = await client.readContract({
            address: nftContract,
            abi: erc721PositionAbi,
            functionName: "getApproved",
            args: [tokenId],
          });
          const adapterApproved = approved.toLowerCase() === adapterMeta.adapter.toLowerCase();

          discovered.push(
            toFivePoolPosition({
              legIndex,
              leg,
              adapterMeta,
              network: deployments.network,
              chainId: deployments.chainId,
              tokenId,
              owner,
              liquidity,
              amount0,
              amount1,
              adapterApproved,
              rangeStatus: "unknown",
            }),
          );
        } catch {
          partial = true;
        }
      }

      if (generation !== refreshGenerationRef.current) return;

      // Never wipe a good table on partial discovery — merge/replace only when we found legs,
      // and keep prior rows when this pass found nothing but previous data exists.
      if (discovered.length > 0) {
        setPositions(discovered.sort((a, b) => a.legIndex - b.legIndex));
        setStale(partial || discovered.length < FIVE_POOL_LEG_COUNT);
        setPositionsError(
          partial || discovered.length < FIVE_POOL_LEG_COUNT
            ? "Some LP legs are still syncing — showing discovered positions. Tap Refresh."
            : null,
        );
      } else {
        // Clean empty wallet: discovery finished with zero LPs — not an RPC failure.
        if (!partial) {
          setPositions([]);
          setStale(false);
          setPositionsError(null);
        } else {
          setStale(true);
          setPositionsError(
            "Could not resolve LP NFTs yet — previous positions kept if shown. Tap Refresh.",
          );
          // Keep last-good positions (do not setPositions([])).
        }
      }
      void refreshStrandedAssets();
    } catch (err) {
      if (generation !== refreshGenerationRef.current) return;
      setPositionsError(err instanceof Error ? err.message : "Failed to load positions");
      setStale(true);
      // Keep last-good positions so the My Position table does not disappear on RPC errors.
    } finally {
      if (generation === refreshGenerationRef.current) {
        setPositionsLoading(false);
      }
    }
  }, [deployments, discoveryClient, expectedChainId, refreshStrandedAssets, wallet.address]);

  useEffect(() => {
    void refreshPositions();
  }, [refreshPositions]);

  useEffect(() => {
    const onRefresh = () => {
      void refreshPositions();
    };
    window.addEventListener(FIVE_POOL_POSITIONS_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(FIVE_POOL_POSITIONS_REFRESH_EVENT, onRefresh);
    };
  }, [refreshPositions]);

  const ensureReady = useCallback(() => {
    const d = requireAttestedPhase2aDeployments(deployments);
    if (!wallet.address || !wallet.provider) {
      throw new Error("Wallet and deployments required");
    }
    if (!onExpectedChain) {
      throw new Error(`Wrong network — switch to chain ${expectedChainId}`);
    }
    assertChainEnvironmentMatch({
      walletChainId: wallet.chainId,
      deploymentChainId: d.chainId,
      network: d.network,
      permit2: d.permit2,
    });
    if (!strategyId || !strategyRegistered) {
      throw new Error("Five-pool strategy not registered");
    }
    return {
      d,
      account: wallet.address,
      strategyId,
      walletClient: createWalletClient({
        account: wallet.address,
        chain,
        transport: custom(wallet.provider),
      }),
    };
  }, [
    chain,
    deployments,
    expectedChainId,
    onExpectedChain,
    strategyId,
    strategyRegistered,
    wallet.address,
    wallet.chainId,
    wallet.provider,
  ]);

  /**
   * Grant per-tokenId adapter authority without ERC721.approve (0x095ea7b3).
   * On Base: EIP-712 ERC721Permit → npm.permit (0x7ac2ff7b). Local mocks: approve.
   */
  const approveNftIfNeeded = useCallback(
    async (
      walletClient: ReturnType<typeof createWalletClient>,
      position: FivePoolPosition,
      opts?: { waitForReceipt?: boolean },
    ): Promise<Hex | null> => {
      const approved = await publicClient.readContract({
        address: position.nftContract,
        abi: erc721PositionAbi,
        functionName: "getApproved",
        args: [position.positionTokenId],
      });
      if (approved.toLowerCase() === position.adapter.toLowerCase()) return null;

      const account = walletClient.account?.address;
      if (!account) throw new Error("Wallet account required for NFT permit");

      const npmKey = position.nftContract.toLowerCase();
      const usePermit =
        expectedChainId === 8453 && Boolean(BASE_NPM_PERMIT_DOMAINS[npmKey]);

      let hash: Hex;
      if (usePermit) {
        const posAbi =
          position.protocol.toLowerCase().includes("uni")
            ? uniV3NpmPositionsAbi
            : aeroNpmPositionsAbi;
        const pos = await publicClient.readContract({
          address: position.nftContract,
          abi: posAbi,
          functionName: "positions",
          args: [position.positionTokenId],
        });
        const nonce = BigInt(pos[0]);
        const permitTx = await signAndBuildNpmPermitTx({
          walletClient,
          npm: position.nftContract,
          chainId: expectedChainId,
          spender: position.adapter,
          tokenId: position.positionTokenId,
          nonce,
          account,
        });
        hash = await walletClient.sendTransaction({
          account,
          to: permitTx.to,
          data: permitTx.data,
          value: permitTx.value,
          chain: walletClient.chain ?? undefined,
        } as never);
      } else {
        // Hardhat / local mock NFTs — no ERC721Permit domain.
        hash = await walletClient.writeContract({
          address: position.nftContract,
          abi: erc721PositionAbi,
          functionName: "approve",
          args: [position.adapter, position.positionTokenId],
        } as never);
      }

      if (opts?.waitForReceipt !== false) {
        await waitForSuccessfulTransactionReceipt(publicClient, hash);
        const after = await publicClient.readContract({
          address: position.nftContract,
          abi: npmErc721PermitAbi,
          functionName: "getApproved",
          args: [position.positionTokenId],
        });
        if (after.toLowerCase() !== position.adapter.toLowerCase()) {
          throw new Error(
            `NFT adapter authority not set after ${usePermit ? "permit" : "approve"} for tokenId ${position.positionTokenId}`,
          );
        }
      }
      return hash;
    },
    [expectedChainId, publicClient],
  );

  /**
   * Sign EIP-712 permits (Base) or local approves, broadcast without per-tx waits,
   * then confirm receipts in parallel.
   */
  const approveOpenPositionsFast = useCallback(
    async (
      walletClient: ReturnType<typeof createWalletClient>,
      open: FivePoolPosition[],
    ): Promise<Hex[]> => {
      const hashes: Hex[] = [];
      let signIndex = 0;
      const needCount = open.length;
      const onBase = expectedChainId === 8453;
      for (const position of open) {
        signIndex += 1;
        const adapterShort = `${position.adapter.slice(0, 6)}…${position.adapter.slice(-4)}`;
        setStatusMessage(
          onBase
            ? `Sign NFT permit ${signIndex}/${needCount} for IndexLa adapter ${adapterShort} (not ERC20 approve)…`
            : `Sign NFT approve ${signIndex}/${needCount} to adapter ${adapterShort}…`,
        );
        setLegResults((prev) =>
          prev.map((r) =>
            r.legIndex === position.legIndex ? { ...r, status: "approving" } : r,
          ),
        );
        const h = await approveNftIfNeeded(walletClient, position, {
          waitForReceipt: false,
        });
        if (h) hashes.push(h);
      }
      if (hashes.length > 0) {
        setStatusMessage(
          onBase
            ? `Confirming ${hashes.length} NFT permit(s) on Base (selector 0x7ac2ff7b)…`
            : `Confirming ${hashes.length} NFT approve(s)…`,
        );
        await Promise.all(
          hashes.map((h) => waitForSuccessfulTransactionReceipt(publicClient, h)),
        );
      }
      return hashes;
    },
    [approveNftIfNeeded, expectedChainId, publicClient],
  );

  const exitIndividual = useCallback(
    async (legIndex: number) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setError(null);
      setApprovalTxHashes([]);
      setDirectPlan(null);
      setLegResults([{ legIndex, status: "pending" }]);

      try {
        const { d, account, strategyId: sid, walletClient } = ensureReady();
        const position = positions.find((p) => p.legIndex === legIndex);
        if (!position) throw new Error(`No open position for leg ${legIndex}`);

        // SC-F05: live amounts before approval / calldata / tx.
        const live = await readLiveExitAmountsForPosition(publicClient, position, account);
        const leg = buildFullExitLegParams({
          legIndex: position.legIndex,
          adapter: position.adapter,
          tokenA: position.tokenA,
          tokenB: position.tokenB,
          positionTokenId: position.positionTokenId,
          amountA: live.amountA,
          amountB: live.amountB,
          slippageBps,
        });

        setProgress("awaiting-approval");
        setStatusMessage(`Approve NFT #${position.positionTokenId.toString()} → adapter…`);
        setLegResults([{ legIndex, status: "approving" }]);
        const approveHash = await approveNftIfNeeded(walletClient, position);
        if (approveHash) setApprovalTxHashes([approveHash]);

        const nonce = await resolveFreeExecutionNonce(
          publicClient,
          d.permissionRegistry,
          position.legPermissionId,
        );

        setProgress("awaiting-exit");
        setStatusMessage("Confirm exitLeg (full exit)…");
        setLegResults([{ legIndex, status: "submitting" }]);

        const hash = await walletClient.writeContract({
          address: d.clExecutor,
          abi: concentratedLiquidityExecutorAbi,
          functionName: "exitLeg",
          args: [sid, leg as never, nonce],
        } as never);
        setLastTxHash(hash);
        await waitForSuccessfulTransactionReceipt(publicClient, hash);
        setLegResults([{ legIndex, status: "confirmed", txHash: hash }]);
        setProgress("confirmed");
        setStatusMessage("Position exited");
        submittingRef.current = false;
        await refreshPositions();
      } catch (err) {
        setProgress("failed");
        const reject = userRejectMessage(err);
        const message = reject ?? (err instanceof Error ? err.message : "Exit failed");
        setError(message);
        setLegResults((prev) =>
          prev.map((r) => (r.status === "confirmed" ? r : { ...r, status: "failed", error: message })),
        );
      } finally {
        submittingRef.current = false;
      }
    },
    [
      approveNftIfNeeded,
      ensureReady,
      positions,
      publicClient,
      refreshPositions,
      slippageBps,
    ],
  );

  /**
   * Atomic on-chain exitAll. On revert, no legs are exited.
   * Approvals are sequential first; exit is a single transaction.
   */
  const exitAll = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setApprovalTxHashes([]);
    setDirectPlan(null);

    const open = [...positions].sort((a, b) => a.legIndex - b.legIndex);
    setLegResults(
      Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, i) => {
        const hit = open.find((p) => p.legIndex === i);
        return {
          legIndex: i,
          status: hit ? ("pending" as const) : ("skipped" as const),
        };
      }),
    );

    try {
      const { d, account, strategyId: sid, walletClient } = ensureReady();
      if (open.length === 0) throw new Error("No open positions to exit");
      if (strategyRevoked || strategyExpired) {
        throw new Error(
          "Strategy revoked or expired — use Emergency exit (per leg). Atomic exitAll requires active permissions.",
        );
      }

      const byLeg = new Map(open.map((p) => [p.legIndex, p]));
      // SC-F05: refresh all live amounts before any approval.
      const liveAmountsByLeg = new Map<number, { amountA: bigint; amountB: bigint }>();
      for (const position of open) {
        const live = await readLiveExitAmountsForPosition(publicClient, position, account);
        liveAmountsByLeg.set(position.legIndex, {
          amountA: live.amountA,
          amountB: live.amountB,
        });
      }
      const legs = buildExitAllLegs(byLeg, liveAmountsByLeg, slippageBps);

      setProgress("awaiting-approval");
      const hashes = await approveOpenPositionsFast(walletClient, open);
      setApprovalTxHashes(hashes);

      const permissionIds = Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, i) => {
        const p = byLeg.get(i);
        return p?.legPermissionId ?? null;
      });
      const nonceBase = await resolveExitAllNonceBase(
        publicClient,
        d.permissionRegistry,
        permissionIds,
      );

      setProgress("awaiting-exit");
      setStatusMessage(
        "Confirm Withdraw — LP tokens are sent to YOUR wallet (not held by the contract)…",
      );
      setLegResults((prev) =>
        prev.map((r) => (r.status === "skipped" ? r : { ...r, status: "submitting" })),
      );

      const hash = await walletClient.writeContract({
        address: d.clExecutor,
        abi: concentratedLiquidityExecutorAbi,
        functionName: "exitAll",
        args: [sid, legs as never, nonceBase],
      } as never);
      setLastTxHash(hash);
      await waitForSuccessfulTransactionReceipt(publicClient, hash);
      setLegResults((prev) =>
        prev.map((r) =>
          r.status === "skipped" ? r : { ...r, status: "confirmed", txHash: hash },
        ),
      );
      setProgress("confirmed");
      setStatusMessage("Withdraw confirmed — pool tokens sent to your wallet");
      submittingRef.current = false;
      await refreshPositions();
    } catch (err) {
      setProgress("failed");
      const reject = userRejectMessage(err);
      const message =
        reject ??
        (err instanceof Error
          ? `${err.message} — atomic exitAll reverted; no positions marked exited`
          : "Exit All failed — no positions marked exited");
      setError(message);
      setLegResults((prev) =>
        prev.map((r) =>
          r.status === "skipped" || r.status === "confirmed"
            ? r
            : { ...r, status: "failed", error: message },
        ),
      );
    } finally {
      submittingRef.current = false;
    }
  }, [
    approveOpenPositionsFast,
    ensureReady,
    positions,
    publicClient,
    refreshPositions,
    slippageBps,
    strategyExpired,
    strategyRevoked,
  ]);

  /**
   * Product Withdraw All — atomic exitAllToUsdc (USDC only).
   * Never calls legacy exitAll (underlying tokens).
   * @param percent 1–100 of remaining LP liquidity (default 100). Partial requires exitPercentToUsdc.
   */
  const exitAllToUsdc = useCallback(async (percent: number = 100) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setApprovalTxHashes([]);
    setDirectPlan(null);

    const open = [...positions].sort((a, b) => a.legIndex - b.legIndex);
    setLegResults(
      Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, i) => {
        const hit = open.find((p) => p.legIndex === i);
        return {
          legIndex: i,
          status: hit ? ("pending" as const) : ("skipped" as const),
        };
      }),
    );

    try {
      const { d, account, strategyId: sid, walletClient } = ensureReady();
      if (open.length === 0) throw new Error("No open positions to exit");
      if (strategyRevoked || strategyExpired) {
        throw new Error(
          "Strategy revoked or expired — USDC Withdraw requires active permissions.",
        );
      }
      if (!isExitAllToUsdcAvailable(d)) {
        throw new Error(
          "USDC-only Withdraw is not enabled on this deployment yet. Requires exitAllToUsdc + reverse cbBTC/WETH→USDC routes. Legacy mixed-asset exitAll is blocked in the product UI.",
        );
      }

      const pct = Math.round(percent);
      if (!Number.isFinite(percent) || pct < 1 || pct > 100) {
        throw new Error("Withdraw percent must be between 1 and 100");
      }
      const stack = resolveClStackForAdapters(
        d,
        open.map((p) => p.adapter),
      );
      if (pct !== 100 && !stack.percentExitAllowed) {
        throw new Error(
          stack.kind === "legacy"
            ? "Legacy custom % uses owner NPM withdraw — call withdrawPercent instead of exitAllToUsdc."
            : "Atomic USDC Withdraw on live INDEXLA contracts exits 100% of remaining LP liquidity only. Partial % requires exitPercentToUsdc after Safe cutover.",
        );
      }
      const clExecutor = stack.clExecutor;
      const percentBps = pct * 100;

      setStatusMessage("Checking network gas vs SafetyController ceiling…");
      await requireGasPriceWithinSafetyCeiling({
        publicClient,
        safetyController: d.safetyController as Address,
      });

      const byLeg = new Map(open.map((p) => [p.legIndex, p]));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
      const fullExit = percentBps === 10_000;
      const liveAmountsByLeg = new Map<
        number,
        { amountA: bigint; amountB: bigint; liquidity: bigint }
      >();
      const npmMinsByLeg = new Map<
        number,
        { amountAMin: bigint; amountBMin: bigint; liquidityCalldata: bigint }
      >();
      for (const position of open) {
        // Live NPM liquidity only — never trust stale discovery/adapter cache for calldata.
        const isAero =
          position.protocol === "aerodrome-slipstream" ||
          position.protocol === "aerodrome";
        const posAbi = isAero ? aeroNpmPositionsAbi : uniV3NpmPositionsAbi;
        let liqNow = BigInt(0);
        try {
          const posRow = await publicClient.readContract({
            address: position.npm,
            abi: posAbi,
            functionName: "positions",
            args: [position.positionTokenId],
          });
          liqNow = BigInt(posRow[7] as bigint);
        } catch {
          const live = await readLiveExitAmountsForPosition(
            publicClient,
            position,
            account,
          );
          liqNow = live.liquidity;
        }
        if (liqNow <= BigInt(0) && !fullExit) {
          throw new Error(
            `No live liquidity for tokenId ${position.positionTokenId.toString()} — refresh positions`,
          );
        }
        const liqOut = fullExit ? liqNow : (liqNow * BigInt(percentBps)) / BigInt(10_000);
        if (!fullExit && liqOut > liqNow) {
          throw new Error(
            `Exit liquidity ${liqOut.toString()} exceeds live ${liqNow.toString()} for tokenId ${position.positionTokenId.toString()}`,
          );
        }
        const q = await quoteNpmExecutorExit({
          publicClient,
          npm: position.npm,
          account,
          tokenId: position.positionTokenId,
          liquidity: liqOut > BigInt(0) ? liqOut : liqNow,
          deadline,
          slippageBps,
          fullExit,
        });
        const collect = mapAmountsToLegOrder({
          tokenA: position.tokenA,
          tokenB: position.tokenB,
          token0: q.token0,
          token1: q.token1,
          amount0: q.collect0,
          amount1: q.collect1,
        });
        // Keep collect amounts for unwind; liquidity for legs is live NPM-derived.
        liveAmountsByLeg.set(position.legIndex, {
          amountA: collect.amountA,
          amountB: collect.amountB,
          liquidity: liqNow,
        });
        const mins = mapAmountsToLegOrder({
          tokenA: position.tokenA,
          tokenB: position.tokenB,
          token0: q.token0,
          token1: q.token1,
          amount0: q.amount0Min,
          amount1: q.amount1Min,
        });
        npmMinsByLeg.set(position.legIndex, {
          amountAMin: mins.amountA,
          amountBMin: mins.amountB,
          liquidityCalldata: q.liquidityCalldata,
        });
      }
      // Build legs from NPM decrease mins (not adapter positionAmounts — that triggers PSC/ID).
      const legs = Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, i) => {
        const pos = byLeg.get(i);
        if (!pos) {
          return buildSkippedExitLeg(i);
        }
        const mins = npmMinsByLeg.get(i)!;
        const live = liveAmountsByLeg.get(i)!;
        if (fullExit) {
          return {
            ...buildFullExitLegParams({
              legIndex: i,
              adapter: pos.adapter,
              tokenA: pos.tokenA,
              tokenB: pos.tokenB,
              positionTokenId: pos.positionTokenId,
              amountA: live.amountA,
              amountB: live.amountB,
              slippageBps,
            }),
            amountAMin: mins.amountAMin,
            amountBMin: mins.amountBMin,
            liquidity: mins.liquidityCalldata,
          };
        }
        return {
          ...buildPartialExitLegParams({
            legIndex: i,
            adapter: pos.adapter,
            tokenA: pos.tokenA,
            tokenB: pos.tokenB,
            positionTokenId: pos.positionTokenId,
            liquidity: live.liquidity,
            amountA: live.amountA,
            amountB: live.amountB,
            percentBps,
            slippageBps,
          }),
          amountAMin: mins.amountAMin,
          amountBMin: mins.amountBMin,
          liquidity: mins.liquidityCalldata,
        };
      });

      const exitPositions = open.map((p) => {
        const live = liveAmountsByLeg.get(p.legIndex)!;
        return {
          tokenA: p.tokenA,
          tokenB: p.tokenB,
          tokenASymbol: p.tokenASymbol,
          tokenBSymbol: p.tokenBSymbol,
          amountA: live.amountA,
          amountB: live.amountB,
        };
      });
      const proceeds = aggregateExitProceeds(exitPositions);
      const amountInPadPercent = stack.kind === "legacy" ? 100 : 125;
      const quoteCache = new Map<string, bigint>();
      for (const [tokenIn, amountIn] of [
        [BASE_TOKENS.cbBTC.address, proceeds.cbBtc],
        [BASE_TOKENS.WETH.address, proceeds.weth],
      ] as const) {
        if (amountIn <= BigInt(0)) continue;
        const amountInMax =
          amountInPadPercent === 100
            ? amountIn
            : (amountIn * BigInt(amountInPadPercent)) / BigInt(100) + BigInt(1);
        for (const amt of amountInMax === amountIn ? [amountIn] : [amountIn, amountInMax]) {
          const quoted = await quoteTokenToUsdcViaOracle({
            publicClient,
            oracleGuard: d.oracleGuard as Address,
            tokenIn,
            amountIn: amt,
          });
          if (quoted <= BigInt(0)) {
            throw new Error("OracleGuard returned zero USDC for exit unwind");
          }
          quoteCache.set(`${tokenIn.toLowerCase()}:${amt.toString()}`, quoted);
        }
      }
      const preview = buildExitToUsdcPreview({
        positions: exitPositions,
        quoteTokenToUsdc: (tokenIn, amountIn) => {
          const key = `${tokenIn.toLowerCase()}:${amountIn.toString()}`;
          const hit = quoteCache.get(key);
          if (hit == null) {
            throw new Error(
              "Missing OracleGuard USDC quote for unwind — refresh and retry.",
            );
          }
          return hit;
        },
        deadline,
        amountInPadPercent,
      });

      setProgress("awaiting-approval");
      const hashes = await approveOpenPositionsFast(walletClient, open);
      setApprovalTxHashes(hashes);

      const permissionIds = Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, i) => {
        const p = byLeg.get(i);
        return p?.legPermissionId ?? null;
      });
      const nonceBase = await resolveExitAllNonceBase(
        publicClient,
        d.permissionRegistry,
        permissionIds,
      );

      setProgress("awaiting-exit");
      setStatusMessage(
        pct === 100
          ? "Confirm ONE Withdraw tx on INDEXLA executor — LP close + unwind swaps; USDC only to your wallet (reverts on failure)…"
          : `Confirm ONE Withdraw tx (${pct}%) on INDEXLA executor — partial LP decrease + unwind; USDC only to your wallet (reverts on failure)…`,
      );
      setLegResults((prev) =>
        prev.map((r) => (r.status === "skipped" ? r : { ...r, status: "submitting" })),
      );

      const swaps = padExitUnwindSwaps(preview.unwindSwaps);

      // Fail closed before the wallet prompt when mins/routes would revert.
      try {
        await publicClient.simulateContract({
          address: clExecutor,
          abi: concentratedLiquidityExecutorAbi,
          functionName: "exitAllToUsdc",
          args: [
            sid,
            legs as never,
            swaps as never,
            preview.unwindSwaps.length,
            preview.minUsdcOut,
            nonceBase,
          ],
          account,
        });
      } catch (simErr) {
        const detail = simErr instanceof Error ? simErr.message : String(simErr);
        throw new Error(
          `Withdraw simulation failed (no funds moved): ${detail.slice(0, 280)}`,
        );
      }

      const hash = await walletClient.writeContract({
        address: clExecutor,
        abi: concentratedLiquidityExecutorAbi,
        functionName: "exitAllToUsdc",
        args: [
          sid,
          legs as never,
          swaps as never,
          preview.unwindSwaps.length,
          preview.minUsdcOut,
          nonceBase,
        ],
      } as never);
      setLastTxHash(hash);
      await waitForSuccessfulTransactionReceipt(publicClient, hash);
      setLegResults((prev) =>
        prev.map((r) =>
          r.status === "skipped" ? r : { ...r, status: "confirmed", txHash: hash },
        ),
      );
      setProgress("confirmed");
      setStatusMessage(
        pct === 100
          ? "Withdraw confirmed — USDC sent to your wallet."
          : `Withdraw ${pct}% confirmed — USDC sent to your wallet.`,
      );
      submittingRef.current = false;
      await refreshPositions();
    } catch (err) {
      setProgress("failed");
      const reject = userRejectMessage(err);
      const message =
        reject ??
        (err instanceof Error
          ? `${err.message} — exitAllToUsdc reverted; no positions marked exited`
          : "Withdraw (USDC) failed — no positions marked exited");
      setError(message);
      setLegResults((prev) =>
        prev.map((r) =>
          r.status === "skipped" || r.status === "confirmed"
            ? r
            : { ...r, status: "failed", error: message },
        ),
      );
    } finally {
      submittingRef.current = false;
    }
  }, [
    approveOpenPositionsFast,
    ensureReady,
    positions,
    publicClient,
    refreshPositions,
    slippageBps,
    strategyExpired,
    strategyRevoked,
  ]);

  /**
   * Partial withdraw (1–99%): decreaseLiquidity on each open leg; tokens go to the user wallet.
   * Never routes proceeds through the executor / swap router.
   */
  const exitPartialPercentToWallet = useCallback(
    async (percent: number) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setError(null);
      setApprovalTxHashes([]);
      setDirectPlan(null);

      const open = [...positions].sort((a, b) => a.legIndex - b.legIndex);
      setLegResults(
        Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, i) => {
          const hit = open.find((p) => p.legIndex === i);
          return {
            legIndex: i,
            status: hit ? ("pending" as const) : ("skipped" as const),
          };
        }),
      );

      try {
        const { d, account, strategyId: sid, walletClient } = ensureReady();
        if (open.length === 0) throw new Error("No open positions to exit");
        if (strategyRevoked || strategyExpired) {
          throw new Error(
            "Strategy revoked or expired — partial withdraw requires active permissions.",
          );
        }
        if (!Number.isFinite(percent) || percent < 1 || percent >= 100) {
          throw new Error("Partial withdraw percent must be between 1 and 99");
        }
        const percentBps = Math.round(percent * 100);

        setProgress("awaiting-approval");
        const hashes = await approveOpenPositionsFast(walletClient, open);
        setApprovalTxHashes(hashes);

        for (const position of open) {
          const live = await readLiveExitAmountsForPosition(publicClient, position, account);
          let liquidity = position.liquidity;
          try {
            liquidity = await publicClient.readContract({
              address: position.adapter,
              abi: concentratedLiquidityAdapterAbi,
              functionName: "liquidityOf",
              args: [position.positionTokenId],
            });
          } catch {
            liquidity = position.liquidity;
          }
          const leg = buildPartialExitLegParams({
            legIndex: position.legIndex,
            adapter: position.adapter,
            tokenA: position.tokenA,
            tokenB: position.tokenB,
            positionTokenId: position.positionTokenId,
            liquidity,
            amountA: live.amountA,
            amountB: live.amountB,
            percentBps,
            slippageBps,
          });
          const nonce = await resolveFreeExecutionNonce(
            publicClient,
            d.permissionRegistry,
            position.legPermissionId,
          );

          setProgress("awaiting-exit");
          setStatusMessage(
            `Confirm partial withdraw leg ${position.legIndex} (${percent}%) — tokens to YOUR wallet…`,
          );
          setLegResults((prev) =>
            prev.map((r) =>
              r.legIndex === position.legIndex ? { ...r, status: "submitting" } : r,
            ),
          );

          const hash = await walletClient.writeContract({
            address: d.clExecutor,
            abi: concentratedLiquidityExecutorAbi,
            functionName: "exitLeg",
            args: [sid, leg as never, nonce],
          } as never);
          setLastTxHash(hash);
          await waitForSuccessfulTransactionReceipt(publicClient, hash);
          setLegResults((prev) =>
            prev.map((r) =>
              r.legIndex === position.legIndex
                ? { ...r, status: "confirmed", txHash: hash }
                : r,
            ),
          );
        }

        setProgress("confirmed");
        setStatusMessage(
          `Partial withdraw ${percent}% confirmed — pool tokens sent to your wallet`,
        );
        submittingRef.current = false;
        await refreshPositions();
      } catch (err) {
        setProgress("failed");
        const reject = userRejectMessage(err);
        const message =
          reject ??
          (err instanceof Error ? err.message : "Partial withdraw failed");
        setError(message);
        setLegResults((prev) =>
          prev.map((r) =>
            r.status === "skipped" || r.status === "confirmed"
              ? r
              : { ...r, status: "failed", error: message },
          ),
        );
      } finally {
        submittingRef.current = false;
      }
    },
    [
      approveOpenPositionsFast,
      ensureReady,
      positions,
      publicClient,
      refreshPositions,
      slippageBps,
      strategyExpired,
      strategyRevoked,
    ],
  );

  /**
   * Legacy adapters lack decreaseLiquidityTo. Registry is non-proxy — Safe cannot add
   * rebindStrategyLegAdapters to live bytecode. Supported route for ANY % (incl. 100%):
   * owner calls each NPM (batched per NPM contract) then Uni SwapRouter → USDC.
   * No NFT permit/approve — avoids wallet “ERC20 approve to unverified adapter” blocks.
   * LP mins use configured slippageBps (default 500 = 5%).
   */
  const withdrawLegacyPercentViaOwnerNpm = useCallback(
    async (percent: number) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setError(null);
      setApprovalTxHashes([]);
      setDirectPlan(null);

      const open = [...positions].sort((a, b) => a.legIndex - b.legIndex);
      setLegResults(
        Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, i) => {
          const hit = open.find((p) => p.legIndex === i);
          return {
            legIndex: i,
            status: hit ? ("pending" as const) : ("skipped" as const),
          };
        }),
      );

      try {
        const { d, account, walletClient } = ensureReady();
        if (open.length === 0) {
          // Allow recover-only when resuming an incomplete withdraw with no LPs left.
          const cp = readWithdrawCheckpoint(account, expectedChainId);
          if (!isCheckpointIncomplete(cp)) {
            throw new Error("No open positions to exit");
          }
        }
        if (d.network === "hardhat-local" || expectedChainId !== 8453) {
          throw new Error(
            "Owner NPM percent withdraw is only available on Base mainnet positions.",
          );
        }

        const pct = Math.round(percent);
        if (!Number.isFinite(percent) || pct < 1 || pct > 100) {
          throw new Error("Withdraw percent must be between 1 and 100");
        }
        const percentBps = BigInt(pct * 100);
        const fullExit = pct === 100;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

        const existingCp = readWithdrawCheckpoint(account, expectedChainId);
        if (
          existingCp &&
          isCheckpointIncomplete(existingCp) &&
          existingCp.percent !== pct
        ) {
          throw new Error(
            `An incomplete ${existingCp.percent}% withdraw is still pending (residue not yet sold to USDC). Tap “Resume incomplete withdraw” to finish it before starting a new ${pct}% withdraw.`,
          );
        }
        const resumeSame =
          existingCp &&
          isCheckpointIncomplete(existingCp) &&
          existingCp.percent === pct;
        /** NPM already finished — only sell withdrawal residue to USDC (never re-apply %). */
        const resumeRecoverOnly =
          Boolean(resumeSame) &&
          (existingCp!.phase === "recover" ||
            existingCp!.phase === "failed_incomplete") &&
          existingCp!.completedNpmKeys.length > 0;

        const startBlock = await discoveryClient.getBlockNumber({
          cacheTime: 0,
        });
        let readBlockFloor = startBlock;
        const readBaseline = async (token: Address): Promise<bigint> =>
          (await discoveryClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
            blockNumber: startBlock,
          })) as bigint;

        const usdcBefore = resumeSame
          ? BigInt(existingCp!.baseline.usdc)
          : await readBaseline(BASE_TOKENS.USDC.address);
        const cbBtcBefore = resumeSame
          ? BigInt(existingCp!.baseline.cbBtc)
          : await readBaseline(BASE_TOKENS.cbBTC.address);
        const wethBefore = resumeSame
          ? BigInt(existingCp!.baseline.weth)
          : await readBaseline(BASE_TOKENS.WETH.address);

        const checkpoint: WithdrawCheckpoint = resumeSame
          ? { ...existingCp! }
          : {
              version: 1,
              wallet: account,
              chainId: expectedChainId,
              percent: pct,
              startedAt: Date.now(),
              updatedAt: Date.now(),
              phase: "npm",
              baseline: {
                usdc: usdcBefore.toString(),
                cbBtc: cbBtcBefore.toString(),
                weth: wethBefore.toString(),
              },
              completedNpmKeys: [],
            };
        if (resumeRecoverOnly) {
          checkpoint.phase = "recover";
          setStatusMessage(
            `Resuming residue→USDC only (skipping ${checkpoint.completedNpmKeys.length} completed NPM batch(es); will not re-apply ${pct}%)…`,
          );
        } else if (resumeSame) {
          setStatusMessage(
            `Resuming incomplete ${pct}% withdraw (skipping ${checkpoint.completedNpmKeys.length} completed NPM batch(es))…`,
          );
        }
        writeWithdrawCheckpoint(checkpoint);
        setIncompleteWithdraw(checkpoint);

        type PreparedLeg = {
          position: (typeof open)[number];
          calls: Hex[];
        };
        const prepared: PreparedLeg[] = [];

        if (!resumeRecoverOnly) {
        for (const position of open) {
          if (
            checkpoint.completedNpmKeys.includes(position.npm.toLowerCase())
          ) {
            setLegResults((prev) =>
              prev.map((r) =>
                r.legIndex === position.legIndex
                  ? { ...r, status: "confirmed" as const }
                  : r,
              ),
            );
            continue;
          }
          setStatusMessage(
            `Preparing owner NPM decrease ${pct}% · leg ${position.legIndex + 1}/${FIVE_POOL_LEG_COUNT}…`,
          );
          setProgress("awaiting-exit");

          const owner = (await publicClient.readContract({
            address: position.npm,
            abi: erc721PositionAbi,
            functionName: "ownerOf",
            args: [position.positionTokenId],
          })) as Address;
          assertWalletOwnsPosition(account, owner, position.positionTokenId);

          const isAero =
            position.protocol === "aerodrome-slipstream" ||
            position.protocol === "aerodrome";
          const posAbi = isAero ? aeroNpmPositionsAbi : uniV3NpmPositionsAbi;
          const posRow = await publicClient.readContract({
            address: position.npm,
            abi: posAbi,
            functionName: "positions",
            args: [position.positionTokenId],
          });
          const liqNow = BigInt(posRow[7] as bigint);
          if (liqNow <= BigInt(0)) {
            setLegResults((prev) =>
              prev.map((r) =>
                r.legIndex === position.legIndex
                  ? { ...r, status: "skipped" as const }
                  : r,
              ),
            );
            continue;
          }
          const liqOut = fullExit
            ? liqNow
            : (liqNow * percentBps) / BigInt(10_000);
          if (liqOut > liqNow) {
            throw new Error(
              `NPM decrease liquidity ${liqOut.toString()} exceeds live position liquidity ${liqNow.toString()} for tokenId ${position.positionTokenId.toString()} — refresh and retry`,
            );
          }
          if (liqOut <= BigInt(0)) {
            throw new Error(
              `Partial liquidity rounds to zero for tokenId ${position.positionTokenId.toString()}`,
            );
          }

          const mins = await quoteNpmDecreaseMins({
            publicClient,
            npm: position.npm,
            account,
            tokenId: position.positionTokenId,
            liquidity: liqOut,
            deadline,
            slippageBps,
          });
          const burnAfter = fullExit || liqOut >= liqNow;
          const { calls } = buildNpmWithdrawMulticallCalls({
            tokenId: position.positionTokenId,
            liquidity: liqOut,
            amount0Min: mins.amount0Min,
            amount1Min: mins.amount1Min,
            deadline,
            recipient: account,
            burnAfter,
          });
          prepared.push({ position, calls });
        }
        } // !resumeRecoverOnly

        // One multicall per NPM contract (legs sharing Aero/Uni NPM share one tx).
        const batches = new Map<
          string,
          { npm: Address; legIndexes: number[]; calls: Hex[] }
        >();
        for (const row of prepared) {
          const key = row.position.npm.toLowerCase();
          if (checkpoint.completedNpmKeys.includes(key)) continue;
          const cur = batches.get(key) ?? {
            npm: row.position.npm,
            legIndexes: [] as number[],
            calls: [] as Hex[],
          };
          cur.legIndexes.push(row.position.legIndex);
          cur.calls.push(...row.calls);
          batches.set(key, cur);
        }

        const plannedTxs = [...batches.values()].map((b) => ({
          to: b.npm,
          data: encodeNpmMulticall(b.calls),
        }));

        if (plannedTxs.length > 0) {
        setStatusMessage("Checking Base ETH balance for batched NPM + Uni gas…");
        const { maxFeePerGas, maxPriorityFeePerGas } =
          await requireNativeEthForOwnerWithdraw({
          publicClient,
          account,
          txs: plannedTxs,
        });

        let batchIndex = 0;
        for (const batch of batches.values()) {
          batchIndex += 1;
          const multicallData = encodeNpmMulticall(batch.calls);
          setStatusMessage(
            `Owner NPM multicall ${batchIndex}/${batches.size} (${batch.legIndexes.length} leg(s), no NFT permit)…`,
          );
          for (const legIndex of batch.legIndexes) {
            setLegResults((prev) =>
              prev.map((r) =>
                r.legIndex === legIndex ? { ...r, status: "submitting" } : r,
              ),
            );
          }

          try {
            await publicClient.call({
              account,
              to: batch.npm,
              data: multicallData,
            });
          } catch (simErr) {
            const detail =
              simErr instanceof Error ? simErr.message : String(simErr);
            throw new Error(
              `Owner NPM multicall simulation failed for legs [${batch.legIndexes.join(",")}]: ${detail.slice(0, 280)}`,
            );
          }

          // Buffer gas — live OOG at estimate==limit 565311 (0x80fa91ef…).
          const gasEstimate = await discoveryClient.estimateGas({
            account,
            to: batch.npm,
            data: multicallData,
          });
          const npmGas = applyOwnerNpmMulticallGasBuffer(gasEstimate);

          const hash = await walletClient.sendTransaction({
            account,
            to: batch.npm,
            data: multicallData,
            chain: walletClient.chain ?? undefined,
            gas: npmGas,
            maxFeePerGas,
            maxPriorityFeePerGas,
          } as never);
          setLastTxHash(hash);
          const npmReceipt = await waitForSuccessfulTransactionReceipt(
            publicClient,
            hash,
            {
              gasLimit: npmGas,
              outOfGasMessage: OWNER_NPM_MULTICALL_OOG_USER_MESSAGE,
            },
          );
          readBlockFloor = maxBlock(
            readBlockFloor,
            npmReceipt.blockNumber ?? null,
          );
          for (const legIndex of batch.legIndexes) {
            setLegResults((prev) =>
              prev.map((r) =>
                r.legIndex === legIndex
                  ? { ...r, status: "confirmed", txHash: hash }
                  : r,
              ),
            );
          }
          checkpoint.completedNpmKeys = [
            ...new Set([
              ...checkpoint.completedNpmKeys,
              batch.npm.toLowerCase(),
            ]),
          ];
          checkpoint.phase = "npm";
          writeWithdrawCheckpoint(checkpoint);
          setIncompleteWithdraw({ ...checkpoint });
        }
        } // plannedTxs.length > 0

        checkpoint.phase = "recover";
        writeWithdrawCheckpoint(checkpoint);
        setIncompleteWithdraw({ ...checkpoint });

        setStatusMessage(
          "Converting withdrawal residue (cbBTC/WETH) → USDC via Uniswap…",
        );
        // HTTP read client — wallet eth_call is stale after approve and caused live STF.
        const recoverReadClient = discoveryClient;
        if (!wallet.provider) {
          throw new Error("Wallet provider required for residue→USDC");
        }
        const recoverWalletClient = createWalletClient({
          account,
          chain: walletClient.chain ?? chain,
          transport: custom(wrapProviderForceRecoverGas(wallet.provider)),
        });
        const waitReceipt = (
          hash: Hex,
          opts?: { gasLimit?: bigint; outOfGasMessage?: string },
        ) => waitForSuccessfulTransactionReceipt(recoverReadClient, hash, opts);
        const walletEstimateGas = async (args: {
          to: Address;
          data: Hex;
        }) => {
          try {
            return await publicClient.estimateGas({
              account,
              to: args.to,
              data: args.data,
            });
          } catch {
            return null;
          }
        };

        /** Plan only withdrawal delta at HTTP head (never pinned historical floor). */
        const readResidueAtHead = async () => {
          await waitForReadClientBlock({
            client: recoverReadClient,
            minBlock: readBlockFloor,
          });
          const cbBal = (await recoverReadClient.readContract({
            address: BASE_TOKENS.cbBTC.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          })) as bigint;
          const wethBal = (await recoverReadClient.readContract({
            address: BASE_TOKENS.WETH.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          })) as bigint;
          return planLooseAssetRecoveries({
            publicClient: recoverReadClient,
            account,
            applyDustFilter: true,
            maxByToken: {
              cbBTC: residueFromBaseline({
                current: cbBal,
                baseline: cbBtcBefore,
              }),
              WETH: residueFromBaseline({
                current: wethBal,
                baseline: wethBefore,
              }),
            },
          });
        };

        for (let round = 0; round < 4; round += 1) {
          const planned = await readResidueAtHead();
          if (planned.length === 0) break;

          const legs = [];
          for (const row of planned) {
            const quoted = await quoteTokenToUsdcViaOracle({
              publicClient: recoverReadClient,
              oracleGuard: d.oracleGuard as Address,
              tokenIn: row.tokenIn,
              amountIn: row.amountIn,
            });
            if (quoted <= BigInt(0)) {
              throw new Error(
                `OracleGuard returned zero USDC for ${row.symbol} recover`,
              );
            }
            legs.push({
              tokenIn: row.tokenIn,
              symbol: row.symbol,
              amountIn: row.amountIn,
              quotedUsdcOut: quoted,
            });
          }

          setStatusMessage(
            `Max-approve + Uni multicall sweep ${legs.map((l) => l.symbol).join("+")} → USDC…`,
          );

          if (legs.length === 1) {
            const row = legs[0]!;
            const result = await recoverLooseAssetToUsdcFully({
              publicClient: recoverReadClient,
              walletClient: recoverWalletClient as never,
              account,
              tokenIn: row.tokenIn,
              amountIn: row.amountIn,
              quotedUsdcOut: row.quotedUsdcOut,
              slippageBps: EXIT_UNWIND_SLIPPAGE_BPS,
              walletEstimateGas,
              waitReceipt,
            });
            readBlockFloor = maxBlock(readBlockFloor, result.blockNumber);
            setLastTxHash(result.swapHash);
          } else {
            const result = await sweepAllResidueToUsdcOnce({
              publicClient: recoverReadClient,
              walletClient: recoverWalletClient as never,
              account,
              legs,
              slippageBps: EXIT_UNWIND_SLIPPAGE_BPS,
              deadline,
              walletEstimateGas,
              waitReceipt,
            });
            readBlockFloor = maxBlock(readBlockFloor, result.blockNumber);
            setLastTxHash(result.sweepHash);
          }
        }

        {
          const leftover = await readResidueAtHead();
          if (leftover.length > 0) {
            checkpoint.phase = "failed_incomplete";
            checkpoint.lastError = `Non-USDC withdrawal residue remains: ${leftover.map((r) => r.symbol).join(", ")}`;
            writeWithdrawCheckpoint(checkpoint);
            setIncompleteWithdraw({ ...checkpoint });
            throw new Error(
              `${checkpoint.lastError}. Tap Resume incomplete withdraw to finish USDC conversion without re-exiting completed LPs.`,
            );
          }
        }

        await waitForReadClientBlock({
          client: recoverReadClient,
          minBlock: readBlockFloor,
        });
        const usdcAfter = (await recoverReadClient.readContract({
          address: BASE_TOKENS.USDC.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        })) as bigint;
        if (usdcAfter <= usdcBefore) {
          if (resumeRecoverOnly) {
            // Leftover already empty at head — residue was zero or cleared externally.
            checkpoint.phase = "complete";
            writeWithdrawCheckpoint(checkpoint);
            clearWithdrawCheckpoint(account, expectedChainId);
            setIncompleteWithdraw(null);
            setProgress("confirmed");
            setStatusMessage(
              "Withdrawal residue already cleared — no stranded cbBTC/WETH",
            );
            await refreshPositions();
            await refreshStrandedAssets();
            return;
          }
          throw new Error("Owner NPM percent withdraw completed but USDC balance did not increase");
        }

        checkpoint.phase = "complete";
        writeWithdrawCheckpoint(checkpoint);
        clearWithdrawCheckpoint(account, expectedChainId);
        setIncompleteWithdraw(null);

        setProgress("confirmed");
        setStatusMessage(
          `Received ${(Number(usdcAfter - usdcBefore) / 1e6).toFixed(4)} USDC — residue cleared (owner NPM + Uni unwind)`,
        );
        await refreshPositions();
        await refreshStrandedAssets();
      } catch (err) {
        const reject = userRejectMessage(err);
        const isScopedRecoverCopy =
          err instanceof Error &&
          (err.message === RECOVER_APPROVE_OOG_USER_MESSAGE ||
            err.message === RECOVER_SWAP_OOG_USER_MESSAGE);
        const message =
          reject ??
          (isScopedRecoverCopy
            ? (err as Error).message
            : err instanceof Error
              ? `${err.message} — owner NPM multicall/recover failed; incomplete withdraw can be resumed`
              : "Owner NPM percent withdraw failed — incomplete withdraw can be resumed");
        try {
          const { account } = ensureReady();
          const existing =
            readWithdrawCheckpoint(account, expectedChainId) ?? null;
          if (existing && existing.phase !== "complete") {
            existing.phase = "failed_incomplete";
            existing.lastError = message.slice(0, 400);
            writeWithdrawCheckpoint(existing);
            setIncompleteWithdraw({ ...existing });
          }
        } catch {
          // ensureReady may fail if wallet disconnected mid-flight
        }
        setError(message);
        setProgress("failed");
        setLegResults((prev) =>
          prev.map((r) =>
            r.status === "skipped" || r.status === "confirmed"
              ? r
              : { ...r, status: "failed", error: message },
          ),
        );
      } finally {
        submittingRef.current = false;
      }
    },
    [
      discoveryClient,
      ensureReady,
      expectedChainId,
      chain,
      positions,
      publicClient,
      refreshPositions,
      refreshStrandedAssets,
      slippageBps,
      wallet,
    ],
  );

  /**
   * Finish an interrupted legacy withdraw: remaining open LPs + residue→USDC only
   * (does not reset baseline; skips completed NPM batches).
   */
  const resumeIncompleteWithdraw = useCallback(async () => {
    const { account } = ensureReady();
    const cp = readWithdrawCheckpoint(account, expectedChainId);
    if (!isCheckpointIncomplete(cp)) {
      setError("No incomplete withdraw to resume.");
      return;
    }
    await withdrawLegacyPercentViaOwnerNpm(cp!.percent);
  }, [ensureReady, expectedChainId, withdrawLegacyPercentViaOwnerNpm]);

  /**
   * @deprecated Product Withdraw uses withdrawPercent. Kept for API compatibility.
   */
  const exitDirectNpmPercent = useCallback(
    async (percent: number) => {
      await withdrawLegacyPercentViaOwnerNpm(percent);
    },
    [withdrawLegacyPercentViaOwnerNpm],
  );

  /**
   * Product Withdraw (any % including 100%):
   * Owner NPM batched multicall (per NPM) + residue-only Uni→USDC recover.
   * Works for both primary and legacy adapters because the user owns the LP NFTs.
   * Avoids cold NFT permit/approve to IndexLa adapters (≫2 wallet confirms + unverified warnings).
   * Atomic exitAllToUsdc remains available via exitAllToUsdc() when NFT authority is already set.
   */
  const withdrawPercent = useCallback(
    async (percent: number) => {
      const pct = Math.round(percent);
      if (!Number.isFinite(percent) || pct < 1 || pct > 100) {
        throw new Error("Withdraw percent must be between 1 and 100");
      }

      // Feature-flagged Ops Gateway path. After any gateway broadcast, do NOT fall back to
      // owner-NPM exit (would re-decrease liquidity / double-spend). Fall back only when the
      // gateway path never submitted a user tx (preflight / capability / quote failures).
      if (isOpsGatewayWithdrawAvailable(deployments) && wallet.provider && wallet.address) {
        let gatewayBroadcasted = false;
        try {
          const { d, account } = ensureReady();
          setProgress("awaiting-exit");
          setStatusMessage("Ops Gateway withdraw (USDC-only)…");
          const open = [...positions].sort((a, b) => a.legIndex - b.legIndex);
          const result = await withdrawPercentViaOpsGateway({
            deployments: d,
            account,
            provider: wallet.provider,
            publicClient: discoveryClient,
            positions: open.map((p) => ({
              npm: p.nftContract,
              positionTokenId: p.positionTokenId,
              liquidity: p.liquidity,
              tokenA: p.tokenA,
              tokenB: p.tokenB,
            })),
            percent: pct,
            minUsdcOut: BigInt(1),
            onStatus: setStatusMessage,
            onBroadcast: () => {
              gatewayBroadcasted = true;
            },
          });
          setApprovalTxHashes(result.txHashes);
          setLastTxHash(result.txHashes[result.txHashes.length - 1] ?? null);
          if (result.txHashes.length > 0) gatewayBroadcasted = true;
          setProgress("confirmed");
          setStatusMessage(
            result.promptClaim.mayClaimLe3
              ? "Withdraw complete (USDC only)."
              : `Withdraw complete (USDC only). ${result.promptClaim.copy}`,
          );
          await refreshPositions();
          return;
        } catch (err) {
          if (gatewayBroadcasted) {
            setProgress("failed");
            setError(
              `${err instanceof Error ? err.message : "Gateway withdraw failed"} — ` +
                `a gateway transaction was already submitted. Do not retry owner-NPM exit; ` +
                `use Resume incomplete withdraw / refresh positions to avoid double-exit.`,
            );
            return;
          }
          setStatusMessage(
            `Gateway withdraw unavailable (${err instanceof Error ? err.message : "error"}) — using owner NPM + recover…`,
          );
        }
      }

      await withdrawLegacyPercentViaOwnerNpm(pct);
    },
    [
      deployments,
      discoveryClient,
      ensureReady,
      positions,
      refreshPositions,
      wallet.address,
      wallet.provider,
      withdrawLegacyPercentViaOwnerNpm,
    ],
  );

  const runManageAll = useCallback(
    async (mode: "harvest" | "compound") => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setError(null);
      setApprovalTxHashes([]);
      setDirectPlan(null);

      const open = [...positions].sort((a, b) => a.legIndex - b.legIndex);
      setLegResults(
        Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, i) => {
          const hit = open.find((p) => p.legIndex === i);
          return {
            legIndex: i,
            status: hit ? ("pending" as const) : ("skipped" as const),
          };
        }),
      );

      try {
        const { d, strategyId: sid, walletClient } = ensureReady();
        if (open.length === 0) throw new Error(`No open positions to ${mode}`);
        if (strategyRevoked || strategyExpired) {
          throw new Error(`Strategy revoked or expired — ${mode} requires active permissions.`);
        }
        if (!isExitAllToUsdcAvailable(d)) {
          throw new Error(
            `${mode} is not enabled on this deployment yet. Deposit, Harvest, Compound, and USDC Withdraw unlock together.`,
          );
        }

        const byLeg = new Map(open.map((p) => [p.legIndex, p]));
        const legs = Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, i) => {
          const p = byLeg.get(i);
          if (!p) {
            return {
              legIndex: i,
              adapter: "0x0000000000000000000000000000000000000000" as Address,
              tokenA: "0x0000000000000000000000000000000000000000" as Address,
              tokenB: "0x0000000000000000000000000000000000000000" as Address,
              positionTokenId: BigInt(0),
              amountAMin: BigInt(0),
              amountBMin: BigInt(0),
              slippageBps,
            };
          }
          return {
            legIndex: i,
            adapter: p.adapter,
            tokenA: p.tokenA,
            tokenB: p.tokenB,
            positionTokenId: p.positionTokenId,
            amountAMin: BigInt(0),
            amountBMin: BigInt(0),
            slippageBps,
          };
        });

        setProgress("awaiting-approval");
        const hashes = await approveOpenPositionsFast(walletClient, open);
        setApprovalTxHashes(hashes);

        const permissionIds = Array.from({ length: FIVE_POOL_LEG_COUNT }, (_, i) => {
          const p = byLeg.get(i);
          return p?.legPermissionId ?? null;
        });
        const nonceBase = await resolveAutomationAllNonceBase(
          publicClient,
          d.permissionRegistry,
          permissionIds,
        );

        const stack = resolveClStackForAdapters(
          d,
          open.map((p) => p.adapter),
        );

        setProgress("awaiting-exit");
        setStatusMessage(
          mode === "harvest"
            ? "Confirm Harvest All — fees and rewards to your wallet…"
            : "Confirm Compound All — reinvest LP fees into positions…",
        );
        setLegResults((prev) =>
          prev.map((r) => (r.status === "skipped" ? r : { ...r, status: "submitting" })),
        );

        const hash = await walletClient.writeContract({
          address: stack.clExecutor,
          abi: concentratedLiquidityExecutorAbi,
          functionName: mode === "harvest" ? "harvestAll" : "compoundAll",
          args: [sid, legs as never, nonceBase],
        } as never);
        setLastTxHash(hash);
        await waitForSuccessfulTransactionReceipt(publicClient, hash);
        setLegResults((prev) =>
          prev.map((r) =>
            r.status === "skipped" ? r : { ...r, status: "confirmed", txHash: hash },
          ),
        );
        setProgress("confirmed");
        setStatusMessage(mode === "harvest" ? "Harvest All confirmed" : "Compound All confirmed");
        submittingRef.current = false;
        await refreshPositions();
      } catch (err) {
        setProgress("failed");
        const reject = userRejectMessage(err);
        const message =
          reject ??
          (err instanceof Error ? `${err.message} — ${mode} reverted` : `${mode} failed`);
        setError(message);
        setLegResults((prev) =>
          prev.map((r) =>
            r.status === "skipped" || r.status === "confirmed"
              ? r
              : { ...r, status: "failed", error: message },
          ),
        );
        submittingRef.current = false;
      }
    },
    [
      approveOpenPositionsFast,
      ensureReady,
      positions,
      publicClient,
      refreshPositions,
      slippageBps,
      strategyExpired,
      strategyRevoked,
    ],
  );

  const harvestAll = useCallback(async () => runManageAll("harvest"), [runManageAll]);
  const compoundAll = useCallback(async () => runManageAll("compound"), [runManageAll]);

  const emergencyExitLeg = useCallback(
    async (legIndex: number) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setError(null);
      setApprovalTxHashes([]);
      setDirectPlan(null);
      setLegResults([{ legIndex, status: "pending" }]);

      try {
        const { d, account, strategyId: sid, walletClient } = ensureReady();
        const position = positions.find((p) => p.legIndex === legIndex);
        if (!position) throw new Error(`No open position for leg ${legIndex}`);

        const live = await readLiveExitAmountsForPosition(publicClient, position, account);
        const leg = buildFullExitLegParams({
          legIndex: position.legIndex,
          adapter: position.adapter,
          tokenA: position.tokenA,
          tokenB: position.tokenB,
          positionTokenId: position.positionTokenId,
          amountA: live.amountA,
          amountB: live.amountB,
          slippageBps,
        });

        setProgress("awaiting-approval");
        setLegResults([{ legIndex, status: "approving" }]);
        const approveHash = await approveNftIfNeeded(walletClient, position);
        if (approveHash) setApprovalTxHashes([approveHash]);

        const nonce = await resolveFreeExecutionNonce(
          publicClient,
          d.permissionRegistry,
          position.legPermissionId,
        );

        setProgress("awaiting-exit");
        setStatusMessage("Confirm emergencyExitLeg…");
        setLegResults([{ legIndex, status: "submitting" }]);
        const hash = await walletClient.writeContract({
          address: d.clExecutor,
          abi: concentratedLiquidityExecutorAbi,
          functionName: "emergencyExitLeg",
          args: [sid, leg as never, nonce],
        } as never);
        setLastTxHash(hash);
        await waitForSuccessfulTransactionReceipt(publicClient, hash);
        setLegResults([{ legIndex, status: "confirmed", txHash: hash }]);
        setProgress("confirmed");
        setStatusMessage("Emergency exit confirmed");
        submittingRef.current = false;
        await refreshPositions();
      } catch (err) {
        setProgress("failed");
        const reject = userRejectMessage(err);
        const message = reject ?? (err instanceof Error ? err.message : "Emergency exit failed");
        setError(message);
        setLegResults([{ legIndex, status: "failed", error: message }]);
      } finally {
        submittingRef.current = false;
      }
    },
    [approveNftIfNeeded, ensureReady, positions, publicClient, refreshPositions, slippageBps],
  );

  /** Sequential emergency exits — continues after individual failures. */
  const emergencyExitAllSequential = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setApprovalTxHashes([]);
    setDirectPlan(null);

    const open = [...positions].sort((a, b) => a.legIndex - b.legIndex);
    const results: PerLegExitResult[] = open.map((p) => ({
      legIndex: p.legIndex,
      status: "pending",
    }));
    setLegResults(results);

    try {
      const { d, account, strategyId: sid, walletClient } = ensureReady();
      if (open.length === 0) throw new Error("No open positions");

      const hashes: Hex[] = [];
      let anyFail = false;
      let anyOk = false;

      for (const position of open) {
        try {
          const live = await readLiveExitAmountsForPosition(publicClient, position, account);
          const leg = buildFullExitLegParams({
            legIndex: position.legIndex,
            adapter: position.adapter,
            tokenA: position.tokenA,
            tokenB: position.tokenB,
            positionTokenId: position.positionTokenId,
            amountA: live.amountA,
            amountB: live.amountB,
            slippageBps,
          });

          setProgress("awaiting-approval");
          setStatusMessage(`Emergency: approve leg ${position.legIndex}…`);
          setLegResults((prev) =>
            prev.map((r) =>
              r.legIndex === position.legIndex ? { ...r, status: "approving" } : r,
            ),
          );
          const ah = await approveNftIfNeeded(walletClient, position);
          if (ah) hashes.push(ah);
          setApprovalTxHashes([...hashes]);

          const nonce = await resolveFreeExecutionNonce(
            publicClient,
            d.permissionRegistry,
            position.legPermissionId,
          );

          setProgress("awaiting-exit");
          setStatusMessage(`Emergency exitLeg ${position.legIndex}…`);
          setLegResults((prev) =>
            prev.map((r) =>
              r.legIndex === position.legIndex ? { ...r, status: "submitting" } : r,
            ),
          );
          const hash = await walletClient.writeContract({
            address: d.clExecutor,
            abi: concentratedLiquidityExecutorAbi,
            functionName: "emergencyExitLeg",
            args: [sid, leg as never, nonce],
          } as never);
          setLastTxHash(hash);
          await waitForSuccessfulTransactionReceipt(publicClient, hash);
          anyOk = true;
          setLegResults((prev) =>
            prev.map((r) =>
              r.legIndex === position.legIndex
                ? { ...r, status: "confirmed", txHash: hash }
                : r,
            ),
          );
        } catch (err) {
          anyFail = true;
          const reject = userRejectMessage(err);
          const message = reject ?? (err instanceof Error ? err.message : "Emergency exit failed");
          setLegResults((prev) =>
            prev.map((r) =>
              r.legIndex === position.legIndex
                ? { ...r, status: "failed", error: message }
                : r,
            ),
          );
          // Continue remaining legs
        }
      }

      submittingRef.current = false;
      await refreshPositions();
      if (anyOk && anyFail) {
        setProgress("partial");
        setStatusMessage("Emergency Exit All finished with partial failures");
        setError("One or more emergency exits failed — remaining open positions are still shown");
      } else if (anyOk) {
        setProgress("confirmed");
        setStatusMessage("Emergency Exit All confirmed");
      } else {
        setProgress("failed");
        setError("All emergency exits failed");
        setStatusMessage("Emergency Exit All failed");
      }
    } catch (err) {
      setProgress("failed");
      setError(userRejectMessage(err) ?? (err instanceof Error ? err.message : "Emergency Exit All failed"));
      setStatusMessage("Emergency Exit All failed");
    } finally {
      submittingRef.current = false;
    }
  }, [
    approveNftIfNeeded,
    ensureReady,
    positions,
    publicClient,
    refreshPositions,
    slippageBps,
  ]);

  const revokeStrategy = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    try {
      const { d, strategyId: sid, walletClient } = ensureReady();
      setProgress("awaiting-exit");
      setStatusMessage("Confirm revokeStrategy…");
      const hash = await walletClient.writeContract({
        address: d.strategyRegistry,
        abi: strategyPermissionRegistryAbi,
        functionName: "revokeStrategy",
        args: [sid],
      } as never);
      setLastTxHash(hash);
      await waitForSuccessfulTransactionReceipt(publicClient, hash);
      setStatusMessage("Strategy revoked — use emergency exit for remaining NFTs");
      setProgress("confirmed");
      submittingRef.current = false;
      await refreshPositions();
    } catch (err) {
      setProgress("failed");
      setError(userRejectMessage(err) ?? (err instanceof Error ? err.message : "Revoke failed"));
    } finally {
      submittingRef.current = false;
    }
  }, [ensureReady, publicClient, refreshPositions]);

  const showDirectExitPlan = useCallback(
    async (legIndex: number) => {
      const position = positions.find((p) => p.legIndex === legIndex);
      if (!position || !deployments || !wallet.address) {
        setError("Position not found");
        setDirectPlan(null);
        return;
      }
      try {
        // SC-F05: live amounts before building NPM calldata (no approval/tx here).
        const live = await readLiveExitAmountsForPosition(
          publicClient,
          position,
          wallet.address,
        );
        const plan = buildDirectNpmExitPlan({
          network: deployments.network,
          position,
          amountA: live.amountA,
          amountB: live.amountB,
          liquidity: live.liquidity > BigInt(0) ? live.liquidity : position.liquidity,
          deadlineSec: BigInt(Math.floor(Date.now() / 1000) + 3600),
        });
        if (!plan.decreaseLiquidityCalldata && plan.mode === "npm-owner") {
          setDirectPlan(null);
          setError(plan.steps.join(" "));
          return;
        }
        setDirectPlan(plan);
        setError(null);
        setStatusMessage("Direct protocol exit plan ready — INDEXLA not required on Base NPM path");
      } catch (err) {
        setDirectPlan(null);
        setError(
          err instanceof Error ? err.message : "Live exit valuation failed for direct NPM plan",
        );
      }
    },
    [deployments, positions, publicClient, wallet.address],
  );

  const busy =
    progress === "loading-positions" ||
    progress === "awaiting-approval" ||
    progress === "awaiting-exit";

  return {
    deployments,
    deploymentsLoading,
    deploymentsError,
    wallet,
    expectedChainId,
    onExpectedChain,
    strategyId,
    strategyRegistered,
    strategyRevoked,
    strategyExpired,
    positions,
    positionsLoading,
    positionsError,
    stale,
    progress,
    statusMessage,
    error,
    lastTxHash,
    explorerUrl: lastTxHash ? explorerTxUrl(expectedChainId, lastTxHash) : null,
    approvalTxHashes,
    legResults,
    directPlan,
    busy,
    refreshPositions,
    exitIndividual,
    exitAll,
    exitAllToUsdc,
    exitAllToUsdcAvailable: isExitAllToUsdcAvailable(deployments),
    /** Feature flag only — % UI always shown when cutover is live. Stack gating is in exitAllToUsdc. */
    exitPercentToUsdcAvailable: isExitPercentToUsdcAvailable(deployments),
    opsGatewayAvailable: isOpsGatewayWithdrawAvailable(deployments),
    coldWithdrawPromptHint: coldWithdrawPromptClaim({ atomicBatchSupported: false }).copy,
    /** Owner NPM path supports any % on both stacks (user owns LP NFTs). */
    exitPercentExecutable: positions.length > 0,
    withdrawStackKind:
      positions.length === 0 || !deployments
        ? ("primary" as const)
        : resolveClStackForAdapters(
            deployments,
            positions.map((p) => p.adapter),
          ).kind,
    exitPartialPercentToWallet,
    withdrawPercent,
    resumeIncompleteWithdraw,
    incompleteWithdraw,
    strandedAssets,
    refreshStrandedAssets,
    harvestAll,
    compoundAll,
    emergencyExitLeg,
    emergencyExitAllSequential,
    revokeStrategy,
    showDirectExitPlan,
  };
}
