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
  STABLE_CLUB_CHAIN_ID,
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";
import { explorerTxUrl } from "@/lib/stable-club/five-pool-deposit";
import {
  FIVE_POOL_DEFAULT_EXIT_SLIPPAGE_BPS,
  assertWalletOwnsPosition,
  buildDirectNpmExitPlan,
  buildExitAllLegs,
  buildFullExitLegParams,
  collectTokenIdsFromTransferLogs,
  matchMintTokenId,
  toFivePoolPosition,
  type DirectNpmExitPlan,
  type FivePoolExitProgress,
  type FivePoolPosition,
  type PerLegExitResult,
  type StrategyLegBinding,
} from "@/lib/stable-club/five-pool-positions";
import { FIVE_POOL_LEG_COUNT } from "@/lib/stable-club/five-pool-strategy";
import { erc721PositionAbi } from "@/lib/stable-club/nft-approval";
import {
  isValidPhase2aPublicDeployments,
  type StableClubPhase2aPublicDeployments,
} from "@/lib/stable-club/phase2a-deployments";

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
      args: [permissionId, n],
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
        args: [pid, base + BigInt(i)],
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

  const expectedChainId = deployments?.chainId ?? STABLE_CLUB_CHAIN_ID;
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
      const fromBlock = BigInt(0);

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

        const nftContract =
          deployments.network === "hardhat-local" ? adapterMeta.adapter : adapterMeta.npm;

        const transferEvent = parseAbiItem(
          "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
        );
        const logs = await publicClient.getLogs({
          address: nftContract,
          event: transferEvent,
          args: {
            from: "0x0000000000000000000000000000000000000000",
            to: wallet.address,
          },
          fromBlock,
          toBlock: "latest",
        });
        const candidates = collectTokenIdsFromTransferLogs(logs);

        const tokenId = await matchMintTokenId({
          candidates,
          user: wallet.address,
          expectedTokenA: leg.tokenA,
          expectedTokenB: leg.tokenB,
          readOwner: (id) =>
            publicClient.readContract({
              address: adapterMeta.adapter,
              abi: concentratedLiquidityAdapterAbi,
              functionName: "ownerOf",
              args: [id],
            }),
          readTokens: (id) =>
            publicClient.readContract({
              address: adapterMeta.adapter,
              abi: concentratedLiquidityAdapterAbi,
              functionName: "positionTokens",
              args: [id],
            }),
          readAmounts: (id) =>
            publicClient.readContract({
              address: adapterMeta.adapter,
              abi: concentratedLiquidityAdapterAbi,
              functionName: "positionAmounts",
              args: [id],
            }),
        });

        if (tokenId == null) continue;

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
    if (!deployments || !wallet.address || !wallet.provider) {
      throw new Error("Wallet and deployments required");
    }
    if (!onExpectedChain) {
      throw new Error(`Wrong network — switch to chain ${expectedChainId}`);
    }
    if (!strategyId || !strategyRegistered) {
      throw new Error("Five-pool strategy not registered");
    }
    return {
      d: deployments,
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
      await publicClient.waitForTransactionReceipt({ hash });
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

        const liveOwner = await publicClient.readContract({
          address: position.adapter,
          abi: concentratedLiquidityAdapterAbi,
          functionName: "ownerOf",
          args: [position.positionTokenId],
        });
        assertWalletOwnsPosition(account, liveOwner, position.positionTokenId);

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
        const leg = buildFullExitLegParams({
          legIndex: position.legIndex,
          adapter: position.adapter,
          tokenA: position.tokenA,
          tokenB: position.tokenB,
          positionTokenId: position.positionTokenId,
          amountA: position.amountA,
          amountB: position.amountB,
          slippageBps,
        });

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
        await publicClient.waitForTransactionReceipt({ hash });
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
      setProgress("awaiting-approval");
      const hashes: Hex[] = [];
      for (const position of open) {
        const liveOwner = await publicClient.readContract({
          address: position.adapter,
          abi: concentratedLiquidityAdapterAbi,
          functionName: "ownerOf",
          args: [position.positionTokenId],
        });
        assertWalletOwnsPosition(account, liveOwner, position.positionTokenId);
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
      const legs = buildExitAllLegs(byLeg, slippageBps);

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
      await publicClient.waitForTransactionReceipt({ hash });
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

        const liveOwner = await publicClient.readContract({
          address: position.adapter,
          abi: concentratedLiquidityAdapterAbi,
          functionName: "ownerOf",
          args: [position.positionTokenId],
        });
        assertWalletOwnsPosition(account, liveOwner, position.positionTokenId);

        setProgress("awaiting-approval");
        setLegResults([{ legIndex, status: "approving" }]);
        const approveHash = await approveNftIfNeeded(walletClient, position);
        if (approveHash) setApprovalTxHashes([approveHash]);

        const nonce = await resolveFreeExecutionNonce(
          publicClient,
          d.permissionRegistry,
          position.legPermissionId,
        );
        const leg = buildFullExitLegParams({
          legIndex: position.legIndex,
          adapter: position.adapter,
          tokenA: position.tokenA,
          tokenB: position.tokenB,
          positionTokenId: position.positionTokenId,
          amountA: position.amountA,
          amountB: position.amountB,
          slippageBps,
        });

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
        await publicClient.waitForTransactionReceipt({ hash });
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
          const liveOwner = await publicClient.readContract({
            address: position.adapter,
            abi: concentratedLiquidityAdapterAbi,
            functionName: "ownerOf",
            args: [position.positionTokenId],
          });
          assertWalletOwnsPosition(account, liveOwner, position.positionTokenId);

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
          const leg = buildFullExitLegParams({
            legIndex: position.legIndex,
            adapter: position.adapter,
            tokenA: position.tokenA,
            tokenB: position.tokenB,
            positionTokenId: position.positionTokenId,
            amountA: position.amountA,
            amountB: position.amountB,
            slippageBps,
          });

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
          await publicClient.waitForTransactionReceipt({ hash });
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
      await publicClient.waitForTransactionReceipt({ hash });
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
    (legIndex: number) => {
      const position = positions.find((p) => p.legIndex === legIndex);
      if (!position || !deployments) {
        setError("Position not found");
        return;
      }
      const plan = buildDirectNpmExitPlan({
        network: deployments.network,
        position,
        liquidity: position.liquidity,
        deadlineSec: BigInt(Math.floor(Date.now() / 1000) + 3600),
      });
      setDirectPlan(plan);
      setStatusMessage("Direct protocol exit plan ready — INDEXLA not required on Base NPM path");
    },
    [deployments, positions],
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
