"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
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
import { STABLE_CLUB_BASE_RPC_PROXY_PATH } from "@/lib/stable-club/base-rpc-client";
import { createStableClubBaseReadTransport } from "@/lib/stable-club/base-rpc-transport";
import { assertChainEnvironmentMatch } from "@/lib/stable-club/chain-isolation";
import { explorerTxUrl } from "@/lib/stable-club/five-pool-deposit";
import {
  aggregateExitProceeds,
  buildExitToUsdcPreview,
  isExitAllToUsdcAvailable,
  padExitUnwindSwaps,
} from "@/lib/stable-club/exit-to-usdc";
import { BASE_TOKENS } from "@/lib/stable-club/official-pools";
import { quoteTokenToUsdcViaOracle } from "@/components/stable-club/usePositionUsdValue";
import {
  FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS,
  aeroFactoryGetPoolAbi,
  aeroNpmPositionsAbi,
  assertWalletOwnsPosition,
  buildDirectNpmExitPlan,
  buildExitAllLegs,
  buildFullExitLegParams,
  buildPartialExitLegParams,
  buildPositionDiscoveryBlockRanges,
  collectOwnedNftTokenIdsWithRetry,
  collectTokenIdsFromTransferLogs,
  erc721EnumerableAbi,
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
  FIVE_POOL_POSITIONS_REFRESH_EVENT,
} from "@/lib/stable-club/positions-refresh";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import {
  attestPhase2aDeployments,
  isValidPhase2aPublicDeployments,
  requireAttestedPhase2aDeployments,
  type StableClubPhase2aPublicDeployments,
} from "@/lib/stable-club/phase2a-deployments";
import { base } from "viem/chains";

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

  const [deployments, setDeployments] = useState<StableClubPhase2aPublicDeployments | null>(null);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [deploymentsError, setDeploymentsError] = useState<string | null>(null);

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

  const refreshPositions = useCallback(async () => {
    if (!deployments || !wallet.address) {
      setPositions([]);
      setStrategyId(null);
      setStrategyRegistered(false);
      return;
    }

    const generation = ++refreshGenerationRef.current;
    setPositionsLoading(true);
    setPositionsError(null);
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
        const adapterMeta = deployments.adapters.find(
          (a) => a.adapter.toLowerCase() === leg.adapter.toLowerCase(),
        );
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
        setStale(true);
        setPositionsError(
          "Could not resolve LP NFTs yet — previous positions kept if shown. Tap Refresh.",
        );
        // Keep last-good positions (do not setPositions([])).
      }
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
  }, [deployments, discoveryClient, expectedChainId, wallet.address]);

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
      const hash = await walletClient.writeContract({
        address: position.nftContract,
        abi: erc721PositionAbi,
        functionName: "approve",
        args: [position.adapter, position.positionTokenId],
      } as never);
      if (opts?.waitForReceipt !== false) {
        await waitForSuccessfulTransactionReceipt(publicClient, hash);
      }
      return hash;
    },
    [publicClient],
  );

  /**
   * Sign all missing NFT approvals first (no per-tx mining wait), then confirm receipts in parallel.
   * Cuts withdraw latency from ~5 serial mine-waits to one parallel confirm batch.
   */
  const approveOpenPositionsFast = useCallback(
    async (
      walletClient: ReturnType<typeof createWalletClient>,
      open: FivePoolPosition[],
    ): Promise<Hex[]> => {
      const hashes: Hex[] = [];
      let signIndex = 0;
      const needCount = open.length;
      for (const position of open) {
        signIndex += 1;
        setStatusMessage(
          `Sign NFT approval ${signIndex}/${needCount} (no wait between signatures)…`,
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
        setStatusMessage(`Confirming ${hashes.length} approval(s) on Base…`);
        await Promise.all(
          hashes.map((h) => waitForSuccessfulTransactionReceipt(publicClient, h)),
        );
      }
      return hashes;
    },
    [approveNftIfNeeded, publicClient],
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
   */
  const exitAllToUsdc = useCallback(async () => {
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

      setStatusMessage("Checking network gas vs SafetyController ceiling…");
      await requireGasPriceWithinSafetyCeiling({
        publicClient,
        safetyController: d.safetyController as Address,
      });

      const byLeg = new Map(open.map((p) => [p.legIndex, p]));
      const liveAmountsByLeg = new Map<number, { amountA: bigint; amountB: bigint }>();
      for (const position of open) {
        const live = await readLiveExitAmountsForPosition(publicClient, position, account);
        liveAmountsByLeg.set(position.legIndex, {
          amountA: live.amountA,
          amountB: live.amountB,
        });
      }
      const legs = buildExitAllLegs(byLeg, liveAmountsByLeg, slippageBps);

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
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
      const quoteCache = new Map<string, bigint>();
      for (const [tokenIn, amountIn] of [
        [BASE_TOKENS.cbBTC.address, proceeds.cbBtc],
        [BASE_TOKENS.WETH.address, proceeds.weth],
      ] as const) {
        if (amountIn <= BigInt(0)) continue;
        const quoted = await quoteTokenToUsdcViaOracle({
          publicClient,
          oracleGuard: d.oracleGuard as Address,
          tokenIn,
          amountIn,
        });
        if (quoted <= BigInt(0)) {
          throw new Error("OracleGuard returned zero USDC for exit unwind");
        }
        quoteCache.set(`${tokenIn.toLowerCase()}:${amountIn.toString()}`, quoted);
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
        "Confirm Withdraw — USDC is sent to YOUR wallet in the same transaction…",
      );
      setLegResults((prev) =>
        prev.map((r) => (r.status === "skipped" ? r : { ...r, status: "submitting" })),
      );

      const swaps = padExitUnwindSwaps(preview.unwindSwaps);
      const hash = await walletClient.writeContract({
        address: d.clExecutor,
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
      setStatusMessage("Withdraw confirmed — USDC sent to your wallet");
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
   * Product Withdraw — direct to verified Uniswap V3 / Aerodrome Slipstream NPM.
   * Never calls INDEXLA executor/adapters (avoids MetaMask "ERC20 approve to unverified contract").
   * Proceeds collect to the user wallet. No NFT approve-to-adapter.
   */
  const exitDirectNpmPercent = useCallback(
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
        const { account, walletClient, d } = ensureReady();
        if (open.length === 0) throw new Error("No open positions to withdraw");
        if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
          throw new Error("Withdraw percent must be between 1 and 100");
        }
        if (d.network === "hardhat-local") {
          throw new Error(
            "Direct NPM withdraw is Base-only. Use local Exit All / Emergency on Hardhat.",
          );
        }

        const fullExit = Math.round(percent) === 100;
        const percentBps = fullExit ? 10_000 : Math.round(percent * 100);

        type Built = {
          legIndex: number;
          npm: Address;
          decreaseData: Hex;
          collectData: Hex;
          burnData: Hex | null;
        };
        const built: Built[] = [];

        for (const position of open) {
          assertWalletOwnsPosition(account, position.owner, position.positionTokenId);
          const live = await readLiveExitAmountsForPosition(publicClient, position, account);
          let liquidity = live.liquidity > BigInt(0) ? live.liquidity : position.liquidity;
          let amountA = live.amountA;
          let amountB = live.amountB;
          if (!fullExit) {
            const bps = BigInt(percentBps);
            liquidity = (liquidity * bps) / BigInt(10_000);
            amountA = (amountA * bps) / BigInt(10_000);
            amountB = (amountB * bps) / BigInt(10_000);
            if (liquidity <= BigInt(0)) {
              throw new Error(
                `Partial withdraw rounds to zero liquidity for leg ${position.legIndex}`,
              );
            }
          }
          const plan = buildDirectNpmExitPlan({
            network: d.network,
            position,
            amountA,
            amountB,
            liquidity,
            deadlineSec: BigInt(Math.floor(Date.now() / 1000) + 3600),
            slippageBps,
          });
          if (
            plan.mode !== "npm-owner" ||
            !plan.decreaseLiquidityCalldata ||
            !plan.collectCalldata
          ) {
            throw new Error(
              plan.steps.join(" ") ||
                `Direct NPM withdraw unavailable for leg ${position.legIndex}`,
            );
          }
          built.push({
            legIndex: position.legIndex,
            npm: plan.nftContract,
            decreaseData: plan.decreaseLiquidityCalldata,
            collectData: plan.collectCalldata,
            burnData: fullExit ? plan.burnCalldata : null,
          });
          setLegResults((prev) =>
            prev.map((r) =>
              r.legIndex === position.legIndex ? { ...r, status: "pending" } : r,
            ),
          );
        }

        const sendPhase = async (
          label: string,
          items: { legIndex: number; npm: Address; data: Hex }[],
        ): Promise<Hex[]> => {
          const hashes: Hex[] = [];
          let i = 0;
          for (const item of items) {
            i += 1;
            setProgress("awaiting-exit");
            setStatusMessage(
              `Sign ${label} ${i}/${items.length} on verified NPM (tokens → your wallet)…`,
            );
            setLegResults((prev) =>
              prev.map((r) =>
                r.legIndex === item.legIndex ? { ...r, status: "submitting" } : r,
              ),
            );
            const hash = await walletClient.sendTransaction({
              to: item.npm,
              data: item.data,
              account,
            });
            hashes.push(hash);
            setLastTxHash(hash);
          }
          if (hashes.length > 0) {
            setStatusMessage(`Confirming ${hashes.length} ${label} tx(s) on Base…`);
            await Promise.all(
              hashes.map((h) => waitForSuccessfulTransactionReceipt(publicClient, h)),
            );
          }
          return hashes;
        };

        await sendPhase(
          "decreaseLiquidity",
          built.map((b) => ({
            legIndex: b.legIndex,
            npm: b.npm,
            data: b.decreaseData,
          })),
        );

        const collectHashes = await sendPhase(
          "collect",
          built.map((b) => ({
            legIndex: b.legIndex,
            npm: b.npm,
            data: b.collectData,
          })),
        );

        const burns = built.filter((b): b is Built & { burnData: Hex } => b.burnData != null);
        const burnHashes =
          burns.length > 0
            ? await sendPhase(
                "burn",
                burns.map((b) => ({
                  legIndex: b.legIndex,
                  npm: b.npm,
                  data: b.burnData,
                })),
              )
            : [];

        const finalHash = burnHashes.at(-1) ?? collectHashes.at(-1);

        setLegResults((prev) =>
          prev.map((r) =>
            r.status === "skipped"
              ? r
              : { ...r, status: "confirmed", txHash: finalHash },
          ),
        );
        setProgress("confirmed");
        setStatusMessage(
          fullExit
            ? "Withdraw 100% confirmed — pool tokens collected to your wallet via verified NPM"
            : `Withdraw ${Math.round(percent)}% confirmed — pool tokens collected to your wallet via verified NPM`,
        );
        submittingRef.current = false;
        await refreshPositions();
      } catch (err) {
        setProgress("failed");
        const reject = userRejectMessage(err);
        const message =
          reject ??
          (err instanceof Error ? err.message : "Direct NPM withdraw failed");
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
    [ensureReady, positions, publicClient, refreshPositions, slippageBps],
  );

  /** Product Withdraw: always verified NPM → user wallet (never INDEXLA executor). */
  const withdrawPercent = useCallback(
    async (percent: number) => {
      await exitDirectNpmPercent(percent);
    },
    [exitDirectNpmPercent],
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
          address: d.clExecutor,
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
    exitPartialPercentToWallet,
    withdrawPercent,
    harvestAll,
    compoundAll,
    emergencyExitLeg,
    emergencyExitAllSequential,
    revokeStrategy,
    showDirectExitPlan,
  };
}
