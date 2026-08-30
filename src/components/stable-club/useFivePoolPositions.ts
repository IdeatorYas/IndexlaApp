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
import {
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_CHAIN_ID,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";
import { assertChainEnvironmentMatch } from "@/lib/stable-club/chain-isolation";
import { explorerTxUrl } from "@/lib/stable-club/five-pool-deposit";
import {
  FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS,
  aeroFactoryGetPoolAbi,
  aeroNpmPositionsAbi,
  assertWalletOwnsPosition,
  buildDirectNpmExitPlan,
  buildExitAllLegs,
  buildFullExitLegParams,
  buildPositionDiscoveryBlockRanges,
  collectTokenIdsFromTransferLogs,
  exactPoolBindingExpectations,
  interpretLiveExitAmounts,
  matchExactPoolMintTokenId,
  resolvePositionDiscoveryFromBlock,
  toFivePoolPosition,
  uniV3FactoryGetPoolAbi,
  uniV3NpmPositionsAbi,
  type DirectNpmExitPlan,
  type FivePoolExitProgress,
  type FivePoolPosition,
  type NpmPositionIdentity,
  type PerLegExitResult,
  type StrategyLegBinding,
} from "@/lib/stable-club/five-pool-positions";
import { FIVE_POOL_LEG_COUNT } from "@/lib/stable-club/five-pool-strategy";
import { erc721PositionAbi } from "@/lib/stable-club/nft-approval";
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

function encodeExitExecutionNonce(callerNonce: bigint): bigint {
  if (callerNonce >= EXIT_EXECUTION_NONCE_DOMAIN) {
    throw new Error("Invalid exit execution nonce domain");
  }
  return EXIT_EXECUTION_NONCE_DOMAIN | callerNonce;
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

  const refreshPositions = useCallback(async () => {
    if (!deployments || !wallet.address) {
      setPositions([]);
      setStrategyId(null);
      setStrategyRegistered(false);
      return;
    }

    setPositionsLoading(true);
    setPositionsError(null);
    setStale(false);
    try {
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
      } as never);
      const strategyUser = (strategy as { user: Address }).user;
      const revoked = Boolean((strategy as { revoked: boolean }).revoked);
      const expiresAt = BigInt((strategy as { expiresAt: bigint }).expiresAt);
      const now = BigInt(Math.floor(Date.now() / 1000));
      const registered =
        strategyUser.toLowerCase() === wallet.address.toLowerCase() && strategyUser !== "0x0000000000000000000000000000000000000000";
      setStrategyRegistered(registered);
      setStrategyRevoked(revoked);
      setStrategyExpired(expiresAt > BigInt(0) && expiresAt <= now);

      if (!registered) {
        setPositions([]);
        return;
      }

      const discovered: FivePoolPosition[] = [];
      const fromBlock = resolvePositionDiscoveryFromBlock({
        network: deployments.network,
        chainId: deployments.chainId,
        discoveryStartBlock: deployments.discoveryStartBlock,
      });
      const latestBlock = await publicClient.getBlockNumber();
      const logRanges = buildPositionDiscoveryBlockRanges(fromBlock, latestBlock);
      const isVerifiedLocal =
        deployments.network === "hardhat-local" && deployments.chainId === 31337;
      const claimedTokenIds = new Set<string>();

      for (let legIndex = 0; legIndex < FIVE_POOL_LEG_COUNT; legIndex++) {
        const legRaw = await publicClient.readContract({
          address: deployments.strategyRegistry,
          abi: strategyPermissionRegistryAbi,
          functionName: "getLeg",
          args: [sid, BigInt(legIndex)],
        });
        const leg = legRaw as StrategyLegBinding;
        if (!leg.adapter || leg.adapter === "0x0000000000000000000000000000000000000000") {
          continue;
        }

        const adapterMeta = deployments.adapters.find(
          (a) => a.adapter.toLowerCase() === leg.adapter.toLowerCase(),
        );
        if (!adapterMeta) {
          setStale(true);
          continue;
        }

        const binding = exactPoolBindingExpectations(leg.poolId);
        if (!binding) {
          // Exact pool identity cannot be proven — no executable exit for this leg.
          setStale(true);
          continue;
        }

        const nftContract =
          deployments.network === "hardhat-local" ? adapterMeta.adapter : adapterMeta.npm;

        const transferEvent = parseAbiItem(
          "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
        );
        const logs: { args?: { tokenId?: bigint } | null }[] = [];
        for (const range of logRanges) {
          const chunk = await publicClient.getLogs({
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
        const candidates = collectTokenIdsFromTransferLogs(logs);

        const isUni =
          binding.protocol === "uniswap-v3" || binding.protocol === "uniswap";
        const isAero =
          binding.protocol === "aerodrome-slipstream" || binding.protocol === "aerodrome";

        const tokenId = await matchExactPoolMintTokenId({
          candidates,
          user: wallet.address,
          expectedTokenA: leg.tokenA,
          expectedTokenB: leg.tokenB,
          protocol: binding.protocol,
          expectedPool: binding.expectedPool,
          factory: binding.factory,
          expectedFee: binding.expectedFee,
          expectedTickSpacing: binding.expectedTickSpacing,
          claimedTokenIds,
          readOwner: (id) =>
            publicClient.readContract({
              address: adapterMeta.adapter,
              abi: concentratedLiquidityAdapterAbi,
              functionName: "ownerOf",
              args: [id],
            }),
          readNpmPosition: async (id): Promise<NpmPositionIdentity> => {
            if (isVerifiedLocal) {
              // Local mock NFT has no Uni/Aero positions(); synthesize fee/tickSpacing
              // from catalogue after token reads. Factory proof is short-circuited below.
              const [token0, token1] = await publicClient.readContract({
                address: adapterMeta.adapter,
                abi: concentratedLiquidityAdapterAbi,
                functionName: "positionTokens",
                args: [id],
              });
              let liquidity = BigInt(0);
              try {
                liquidity = await publicClient.readContract({
                  address: adapterMeta.adapter,
                  abi: concentratedLiquidityAdapterAbi,
                  functionName: "liquidityOf",
                  args: [id],
                });
              } catch {
                liquidity = BigInt(0);
              }
              if (isUni) {
                return {
                  token0,
                  token1,
                  fee: binding.expectedFee,
                  liquidity,
                };
              }
              return {
                token0,
                token1,
                tickSpacing: binding.expectedTickSpacing,
                liquidity,
              };
            }
            if (isUni) {
              const pos = await publicClient.readContract({
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
              const pos = await publicClient.readContract({
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
            if (isVerifiedLocal) {
              // Mock adapters are poolId-scoped; catalogue pool is the configured binding target.
              return binding.expectedPool;
            }
            if (isUni && fee != null) {
              return publicClient.readContract({
                address: binding.factory,
                abi: uniV3FactoryGetPoolAbi,
                functionName: "getPool",
                args: [token0, token1, fee],
              });
            }
            if (isAero && tickSpacing != null) {
              return publicClient.readContract({
                address: binding.factory,
                abi: aeroFactoryGetPoolAbi,
                functionName: "getPool",
                args: [token0, token1, tickSpacing],
              });
            }
            throw new Error("Factory pool resolution requires fee or tickSpacing");
          },
          readAmounts: (id) =>
            publicClient.readContract({
              address: adapterMeta.adapter,
              abi: concentratedLiquidityAdapterAbi,
              functionName: "positionAmounts",
              args: [id],
            }),
        });

        if (tokenId == null) continue;
        claimedTokenIds.add(tokenId.toString());

        const owner = await publicClient.readContract({
          address: adapterMeta.adapter,
          abi: concentratedLiquidityAdapterAbi,
          functionName: "ownerOf",
          args: [tokenId],
        });
        if (owner.toLowerCase() !== wallet.address.toLowerCase()) continue;

        const [amount0, amount1] = await publicClient.readContract({
          address: adapterMeta.adapter,
          abi: concentratedLiquidityAdapterAbi,
          functionName: "positionAmounts",
          args: [tokenId],
        });

        let liquidity = BigInt(0);
        try {
          liquidity = await publicClient.readContract({
            address: adapterMeta.adapter,
            abi: concentratedLiquidityAdapterAbi,
            functionName: "liquidityOf",
            args: [tokenId],
          });
        } catch {
          liquidity = amount0 + amount1;
        }

        const approved = await publicClient.readContract({
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
            rangeStatus: deployments.network === "hardhat-local" ? "unknown" : "unknown",
          }),
        );
      }

      setPositions(discovered.sort((a, b) => a.legIndex - b.legIndex));
    } catch (err) {
      setPositionsError(err instanceof Error ? err.message : "Failed to load positions");
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  }, [deployments, expectedChainId, publicClient, wallet.address]);

  useEffect(() => {
    void refreshPositions();
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
      await waitForSuccessfulTransactionReceipt(publicClient, hash);
      return hash;
    },
    [publicClient],
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
      const hashes: Hex[] = [];
      for (const position of open) {
        setStatusMessage(
          `Approve NFT #${position.positionTokenId.toString()} (leg ${position.legIndex})…`,
        );
        setLegResults((prev) =>
          prev.map((r) =>
            r.legIndex === position.legIndex ? { ...r, status: "approving" } : r,
          ),
        );
        const h = await approveNftIfNeeded(walletClient, position);
        if (h) hashes.push(h);
      }
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
        "Confirm atomic exitAll — one transaction; on revert no positions exit…",
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
      setStatusMessage("Exit All confirmed (atomic)");
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
    approveNftIfNeeded,
    ensureReady,
    positions,
    publicClient,
    refreshPositions,
    slippageBps,
    strategyExpired,
    strategyRevoked,
  ]);

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
    emergencyExitLeg,
    emergencyExitAllSequential,
    revokeStrategy,
    showDirectExitPlan,
  };
}
