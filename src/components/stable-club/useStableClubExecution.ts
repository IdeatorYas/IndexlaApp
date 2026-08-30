"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  erc20Abi,
  permissionRegistryAbi,
  stableClubExecutorAbi,
  testPoolAdapterAbi,
} from "@/lib/stable-club/abis";
import type { StableClubLocalDeployments } from "@/lib/stable-club/deployments";
import { computeStableClubPermissionId } from "@/lib/stable-club/permission-id";
import {
  buildDefaultPermissionScope,
  toOnChainPermission,
} from "@/lib/stable-club/permissions";
import {
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_CHAIN_ID,
  STABLE_CLUB_LOCAL_RPC_URL,
  STABLE_CLUB_USDC_DECIMALS,
} from "@/lib/stable-club/constants";
import { assertChainEnvironmentMatch } from "@/lib/stable-club/chain-isolation";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";
import {
  createSyncSubmissionLock,
  resolveNextPermissionExecutionNonce,
  SUBMISSION_IN_PROGRESS_MESSAGE,
} from "@/lib/stable-club/permission-execution-nonce";

/** Defensive minOut for TestPoolAdapter 50/50 exit (1% slack below expected split). */
function testPoolExitMins(lpAmount: bigint): { minA: bigint; minB: bigint } {
  const two = BigInt(2);
  const zero = BigInt(0);
  const one = BigInt(1);
  const pctNum = BigInt(99);
  const pctDen = BigInt(100);
  const half = lpAmount / two;
  const rest = lpAmount - half;
  const minA = half > zero ? (half * pctNum) / pctDen || one : one;
  const minB = rest > zero ? (rest * pctNum) / pctDen || one : one;
  return { minA, minB };
}

type DeploymentsResponse =
  | { configured: false; message: string }
  | { configured: true; deployments: StableClubLocalDeployments };

export type StableClubExecutionState = {
  deployments: StableClubLocalDeployments | null;
  deploymentsLoading: boolean;
  deploymentsError: string | null;
  permissionId: Hex | null;
  permissionRegistered: boolean;
  lpBalance: bigint;
  usdcBalance: bigint;
  busyAction: string | null;
  lastTxHash: Hex | null;
  statusMessage: string | null;
  error: string | null;
};

export function useStableClubExecution() {
  const wallet = useStableClubWallet();
  const submissionLockRef = useRef(createSyncSubmissionLock());
  const [deployments, setDeployments] = useState<StableClubLocalDeployments | null>(
    null,
  );
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [deploymentsError, setDeploymentsError] = useState<string | null>(null);
  const [permissionId, setPermissionId] = useState<Hex | null>(null);
  const [permissionRegistered, setPermissionRegistered] = useState(false);
  const [lpBalance, setLpBalance] = useState(BigInt(0));
  const [usdcBalance, setUsdcBalance] = useState(BigInt(0));
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hex | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      return createPublicClient({
        chain,
        transport: custom(wallet.provider),
      });
    }
    return createPublicClient({
      chain,
      transport: http(rpc),
    });
  }, [chain, deployments?.rpcUrl, wallet.provider]);

  const walletClient = useMemo(() => {
    if (!wallet.provider || !wallet.address) return null;
    return createWalletClient({
      account: wallet.address,
      chain,
      transport: custom(wallet.provider),
    });
  }, [chain, wallet.address, wallet.provider]);

  const refreshBalances = useCallback(async () => {
    if (!deployments || !wallet.address) return;
    const [lp, usdc] = await Promise.all([
      publicClient.readContract({
        address: deployments.testAdapter,
        abi: testPoolAdapterAbi,
        functionName: "balanceOf",
        args: [wallet.address],
      }),
      publicClient.readContract({
        address: deployments.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet.address],
      }),
    ]);
    setLpBalance(lp);
    setUsdcBalance(usdc);
  }, [deployments, publicClient, wallet.address]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDeploymentsLoading(true);
      setDeploymentsError(null);
      try {
        const res = await fetch("/api/stable-club/deployments");
        const json = (await res.json()) as DeploymentsResponse;
        if (cancelled) return;
        if (!json.configured) {
          setDeployments(null);
          setDeploymentsError(json.message);
          return;
        }
        setDeployments(json.deployments);
      } catch {
        if (!cancelled) {
          setDeploymentsError("Unable to load local Stable Club deployments.");
        }
      } finally {
        if (!cancelled) setDeploymentsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deployments || !permissionId) {
      setPermissionRegistered(false);
      return;
    }
    void publicClient
      .readContract({
        address: deployments.permissionRegistry,
        abi: permissionRegistryAbi,
        functionName: "getPermission",
        args: [permissionId],
      })
      .then((perm) => {
        setPermissionRegistered(
          perm.user !== "0x0000000000000000000000000000000000000000" && !perm.revoked,
        );
      })
      .catch(() => setPermissionRegistered(false));
  }, [deployments, permissionId, publicClient, lastTxHash]);

  useEffect(() => {
    if (!deployments || !wallet.address) return;
    void refreshBalances();
  }, [deployments, wallet.address, refreshBalances, lastTxHash]);

  useEffect(() => {
    if (!deployments || !wallet.address) {
      setPermissionId(null);
      return;
    }
    setPermissionId(
      computeStableClubPermissionId({
        user: wallet.address,
        chainId: deployments.chainId,
        poolId: deployments.poolId,
        tokenA: deployments.usdc,
        tokenB: deployments.weth,
      }),
    );
  }, [deployments, wallet.address]);

  const ensureReady = useCallback(() => {
    if (!deployments) throw new Error("Local deployments are not configured.");
    if (!wallet.address || !walletClient) throw new Error("Connect your wallet first.");
    if (wallet.chainId !== deployments.chainId) {
      throw new Error(
        `Switch wallet to the local Hardhat network (chainId ${STABLE_CLUB_LOCAL_CHAIN_ID}).`,
      );
    }
    assertChainEnvironmentMatch({
      walletChainId: wallet.chainId,
      deploymentChainId: deployments.chainId,
      network: deployments.network,
    });
    return { d: deployments, account: wallet.address, client: walletClient };
  }, [deployments, wallet.address, wallet.chainId, walletClient]);

  /**
   * SC-F08: sync lock acquired before any async work; busyAction is UI-only.
   * SC-F01: successful-receipt enforcement preserved.
   * Never advances a client nonce counter after success/failure.
   */
  const runGuarded = useCallback(
    async (action: string, fn: () => Promise<Hex>) => {
      const lock = submissionLockRef.current;
      if (!lock.tryAcquire()) {
        const message = SUBMISSION_IN_PROGRESS_MESSAGE;
        setError(message);
        throw new Error(message);
      }
      setBusyAction(action);
      setError(null);
      setStatusMessage(null);
      try {
        const hash = await fn();
        setLastTxHash(hash);
        await waitForSuccessfulTransactionReceipt(publicClient, hash);
        await refreshBalances();
        setStatusMessage(`${action} confirmed.`);
        return hash;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Transaction failed.";
        setError(message);
        throw err;
      } finally {
        lock.release();
        setBusyAction(null);
      }
    },
    [publicClient, refreshBalances],
  );

  /** ERC20 approve must succeed on-chain before a dependent executor call. */
  const approveErc20OrThrow = useCallback(
    async (
      client: NonNullable<ReturnType<typeof createWalletClient>>,
      account: Address,
      token: Address,
      spender: Address,
      amount: bigint,
    ) => {
      const hash = await client.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
        chain,
        account,
      });
      await waitForSuccessfulTransactionReceipt(publicClient, hash);
      return hash;
    },
    [chain, publicClient],
  );

  const readNextExecutionNonce = useCallback(
    async (permissionRegistry: Address, pid: Hex) => {
      return resolveNextPermissionExecutionNonce(
        publicClient,
        permissionRegistry,
        pid,
      );
    },
    [publicClient],
  );

  const registerPermission = useCallback(async () => {
    await runGuarded("Register permission", async () => {
      const { d, account, client } = ensureReady();
      if (!permissionId) throw new Error("Permission id unavailable.");

      const scope = buildDefaultPermissionScope({
        user: account,
        chainId: d.chainId,
        poolId: d.poolId,
        tokenA: d.usdc,
        tokenB: d.weth,
      });

      const hash = await client.writeContract({
        address: d.permissionRegistry,
        abi: permissionRegistryAbi,
        functionName: "registerPermission",
        args: [toOnChainPermission(scope)],
        chain,
        account,
      });
      setPermissionRegistered(true);
      return hash;
    });
  }, [chain, ensureReady, permissionId, runGuarded]);

  const depositAndAddLiquidity = useCallback(
    async (depositUsdc: string, swapUsdc: string) => {
      await runGuarded("Deposit & add liquidity", async () => {
        const { d, account, client } = ensureReady();
        if (!permissionId) throw new Error("Permission id unavailable.");

        const depositAmount = parseUnits(depositUsdc || "0", STABLE_CLUB_USDC_DECIMALS);
        const swapAmount = parseUnits(swapUsdc || "0", STABLE_CLUB_USDC_DECIMALS);

        if (swapAmount > depositAmount) {
          throw new Error("swapAmount cannot exceed depositAmount");
        }
        const executorPull = depositAmount - swapAmount;
        if (swapAmount > BigInt(0)) {
          await approveErc20OrThrow(client, account, d.usdc, d.feeRouter, swapAmount);
        }
        if (executorPull > BigInt(0)) {
          await approveErc20OrThrow(client, account, d.usdc, d.executor, executorPull);
        }

        // SC-F08: chain nonce immediately before building the executable executor tx.
        const nonce = await readNextExecutionNonce(d.permissionRegistry, permissionId);

        return client.writeContract({
          address: d.executor,
          abi: stableClubExecutorAbi,
          functionName: "depositAndAddLiquidity",
          args: [
            permissionId,
            nonce,
            d.testAdapter,
            d.usdc,
            d.usdc,
            d.weth,
            depositAmount,
            swapAmount,
            swapAmount > BigInt(0) ? (swapAmount * BigInt(99)) / BigInt(100) : BigInt(0),
            BigInt(1),
            BigInt(500),
          ],
          chain,
          account,
        });
      });
    },
    [approveErc20OrThrow, chain, ensureReady, permissionId, readNextExecutionNonce, runGuarded],
  );

  const removeLiquidity = useCallback(
    async (lpAmount: bigint) => {
      await runGuarded("Remove liquidity", async () => {
        const { d, account, client } = ensureReady();
        if (!permissionId) throw new Error("Permission id unavailable.");

        await approveErc20OrThrow(client, account, d.testAdapter, d.executor, lpAmount);

        const nonce = await readNextExecutionNonce(d.permissionRegistry, permissionId);
        const { minA, minB } = testPoolExitMins(lpAmount);
        return client.writeContract({
          address: d.executor,
          abi: stableClubExecutorAbi,
          functionName: "removeLiquidity",
          args: [
            permissionId,
            nonce,
            d.testAdapter,
            d.usdc,
            d.weth,
            lpAmount,
            minA,
            minB,
            BigInt(500),
          ],
          chain,
          account,
        });
      });
    },
    [approveErc20OrThrow, chain, ensureReady, permissionId, readNextExecutionNonce, runGuarded],
  );

  const withdrawAll = useCallback(async () => {
    await runGuarded("Withdraw all", async () => {
      const { d, account, client } = ensureReady();
      if (!permissionId) throw new Error("Permission id unavailable.");
      if (lpBalance === BigInt(0)) throw new Error("No LP balance to withdraw.");

      await approveErc20OrThrow(client, account, d.testAdapter, d.executor, lpBalance);

      const nonce = await readNextExecutionNonce(d.permissionRegistry, permissionId);
      const { minA, minB } = testPoolExitMins(lpBalance);
      return client.writeContract({
        address: d.executor,
        abi: stableClubExecutorAbi,
        functionName: "withdrawAll",
        args: [
          permissionId,
          nonce,
          d.testAdapter,
          d.usdc,
          d.weth,
          lpBalance,
          minA,
          minB,
          BigInt(500),
        ],
        chain,
        account,
      });
    });
  }, [
    approveErc20OrThrow,
    chain,
    ensureReady,
    lpBalance,
    permissionId,
    readNextExecutionNonce,
    runGuarded,
  ]);

  const pauseAutomation = useCallback(async () => {
    await runGuarded("Pause automation", async () => {
      const { d, account, client } = ensureReady();
      if (!permissionId) throw new Error("Permission id unavailable.");

      return client.writeContract({
        address: d.executor,
        abi: stableClubExecutorAbi,
        functionName: "pauseAutomation",
        args: [permissionId],
        chain,
        account,
      });
    });
  }, [chain, ensureReady, permissionId, runGuarded]);

  const revokePermissionDirect = useCallback(async () => {
    await runGuarded("Revoke permission", async () => {
      const { d, account, client } = ensureReady();
      if (!permissionId) throw new Error("Permission id unavailable.");

      const hash = await client.writeContract({
        address: d.permissionRegistry,
        abi: permissionRegistryAbi,
        functionName: "revoke",
        args: [permissionId],
        chain,
        account,
      });
      setPermissionRegistered(false);
      return hash;
    });
  }, [chain, ensureReady, permissionId, runGuarded]);

  const emergencyExit = useCallback(async () => {
    await runGuarded("Emergency exit", async () => {
      const { d, account, client } = ensureReady();
      if (!permissionId) throw new Error("Permission id unavailable.");
      if (lpBalance === BigInt(0)) throw new Error("No LP balance for emergency exit.");

      await approveErc20OrThrow(client, account, d.testAdapter, d.executor, lpBalance);

      const nonce = await readNextExecutionNonce(d.permissionRegistry, permissionId);
      const { minA, minB } = testPoolExitMins(lpBalance);
      return client.writeContract({
        address: d.executor,
        abi: stableClubExecutorAbi,
        functionName: "emergencyExit",
        args: [
          permissionId,
          nonce,
          d.testAdapter,
          d.usdc,
          d.weth,
          lpBalance,
          minA,
          minB,
        ],
        chain,
        account,
      });
    });
  }, [
    approveErc20OrThrow,
    chain,
    ensureReady,
    lpBalance,
    permissionId,
    readNextExecutionNonce,
    runGuarded,
  ]);

  return {
    deployments,
    deploymentsLoading,
    deploymentsError,
    permissionId,
    permissionRegistered,
    lpBalance,
    usdcBalance,
    busyAction,
    lastTxHash,
    statusMessage,
    error,
    lpBalanceFormatted: formatUnits(lpBalance, STABLE_CLUB_USDC_DECIMALS),
    usdcBalanceFormatted: formatUnits(usdcBalance, STABLE_CLUB_USDC_DECIMALS),
    registerPermission,
    depositAndAddLiquidity,
    removeLiquidity,
    withdrawAll,
    pauseAutomation,
    revokePermissionDirect,
    emergencyExit,
    refreshBalances,
    localRpcUrl: deployments?.rpcUrl ?? STABLE_CLUB_LOCAL_RPC_URL,
    expectedChainId: deployments?.chainId ?? STABLE_CLUB_LOCAL_CHAIN_ID,
  };
}
