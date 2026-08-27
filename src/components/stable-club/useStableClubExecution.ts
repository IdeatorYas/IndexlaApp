"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseUnits,
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
  STABLE_CLUB_CHAIN_ID,
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_RPC_URL,
  STABLE_CLUB_USDC_DECIMALS,
} from "@/lib/stable-club/constants";

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
  executionNonce: bigint;
  busyAction: string | null;
  lastTxHash: Hex | null;
  statusMessage: string | null;
  error: string | null;
};

export function useStableClubExecution() {
  const wallet = useStableClubWallet();
  const [deployments, setDeployments] = useState<StableClubLocalDeployments | null>(
    null,
  );
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [deploymentsError, setDeploymentsError] = useState<string | null>(null);
  const [permissionId, setPermissionId] = useState<Hex | null>(null);
  const [permissionRegistered, setPermissionRegistered] = useState(false);
  const [lpBalance, setLpBalance] = useState(BigInt(0));
  const [usdcBalance, setUsdcBalance] = useState(BigInt(0));
  const [executionNonce, setExecutionNonce] = useState(BigInt(1));
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
      throw new Error("Switch wallet to the local Base Hardhat network (chainId 8453).");
    }
    return { d: deployments, account: wallet.address, client: walletClient };
  }, [deployments, wallet.address, wallet.chainId, walletClient]);

  const runTx = useCallback(
    async (action: string, fn: () => Promise<Hex>) => {
      setBusyAction(action);
      setError(null);
      setStatusMessage(null);
      try {
        const hash = await fn();
        setLastTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
        setExecutionNonce((n) => n + BigInt(1));
        await refreshBalances();
        setStatusMessage(`${action} confirmed.`);
        return hash;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Transaction failed.";
        setError(message);
        throw err;
      } finally {
        setBusyAction(null);
      }
    },
    [publicClient, refreshBalances],
  );

  const registerPermission = useCallback(async () => {
    const { d, account, client } = ensureReady();
    if (!permissionId) throw new Error("Permission id unavailable.");

    const scope = buildDefaultPermissionScope({
      user: account,
      chainId: d.chainId,
      poolId: d.poolId,
      tokenA: d.usdc,
      tokenB: d.weth,
    });

    await runTx("Register permission", () =>
      client.writeContract({
        address: d.permissionRegistry,
        abi: permissionRegistryAbi,
        functionName: "registerPermission",
        args: [toOnChainPermission(scope)],
        chain,
        account,
      }),
    );
    setPermissionRegistered(true);
  }, [chain, ensureReady, permissionId, runTx]);

  const depositAndAddLiquidity = useCallback(
    async (depositUsdc: string, swapUsdc: string) => {
      const { d, account, client } = ensureReady();
      if (!permissionId) throw new Error("Permission id unavailable.");

      const depositAmount = parseUnits(depositUsdc || "0", STABLE_CLUB_USDC_DECIMALS);
      const swapAmount = parseUnits(swapUsdc || "0", STABLE_CLUB_USDC_DECIMALS);
      const nonce = executionNonce;

      if (swapAmount > BigInt(0)) {
        await client.writeContract({
          address: d.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [d.feeRouter, swapAmount],
          chain,
          account,
        });
      }
      await client.writeContract({
        address: d.usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [d.executor, depositAmount],
        chain,
        account,
      });

      await runTx("Deposit & add liquidity", () =>
        client.writeContract({
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
            BigInt(1),
            BigInt(500),
          ],
          chain,
          account,
        }),
      );
    },
    [chain, ensureReady, executionNonce, permissionId, runTx],
  );

  const removeLiquidity = useCallback(
    async (lpAmount: bigint) => {
      const { d, account, client } = ensureReady();
      if (!permissionId) throw new Error("Permission id unavailable.");
      const nonce = executionNonce;

      await client.writeContract({
        address: d.testAdapter,
        abi: erc20Abi,
        functionName: "approve",
        args: [d.executor, lpAmount],
        chain,
        account,
      });

      await runTx("Remove liquidity", () =>
        client.writeContract({
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
            BigInt(0),
            BigInt(0),
            BigInt(500),
          ],
          chain,
          account,
        }),
      );
    },
    [chain, ensureReady, executionNonce, permissionId, runTx],
  );

  const withdrawAll = useCallback(async () => {
    const { d, account, client } = ensureReady();
    if (!permissionId) throw new Error("Permission id unavailable.");
    if (lpBalance === BigInt(0)) throw new Error("No LP balance to withdraw.");
    const nonce = executionNonce;

    await client.writeContract({
      address: d.testAdapter,
      abi: erc20Abi,
      functionName: "approve",
      args: [d.executor, lpBalance],
      chain,
      account,
    });

    await runTx("Withdraw all", () =>
      client.writeContract({
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
          BigInt(0),
          BigInt(0),
          BigInt(500),
        ],
        chain,
        account,
      }),
    );
  }, [chain, ensureReady, executionNonce, lpBalance, permissionId, runTx]);

  const pauseAutomation = useCallback(async () => {
    const { d, account, client } = ensureReady();
    if (!permissionId) throw new Error("Permission id unavailable.");

    await runTx("Pause automation", () =>
      client.writeContract({
        address: d.executor,
        abi: stableClubExecutorAbi,
        functionName: "pauseAutomation",
        args: [permissionId],
        chain,
        account,
      }),
    );
  }, [chain, ensureReady, permissionId, runTx]);

  const revokePermissionDirect = useCallback(async () => {
    const { d, account, client } = ensureReady();
    if (!permissionId) throw new Error("Permission id unavailable.");

    await runTx("Revoke permission", () =>
      client.writeContract({
        address: d.permissionRegistry,
        abi: permissionRegistryAbi,
        functionName: "revoke",
        args: [permissionId],
        chain,
        account,
      }),
    );
    setPermissionRegistered(false);
  }, [chain, ensureReady, permissionId, runTx]);

  const emergencyExit = useCallback(async () => {
    const { d, account, client } = ensureReady();
    if (!permissionId) throw new Error("Permission id unavailable.");
    if (lpBalance === BigInt(0)) throw new Error("No LP balance for emergency exit.");
    const nonce = executionNonce;

    await client.writeContract({
      address: d.testAdapter,
      abi: erc20Abi,
      functionName: "approve",
      args: [d.executor, lpBalance],
      chain,
      account,
    });

    await runTx("Emergency exit", () =>
      client.writeContract({
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
          BigInt(0),
          BigInt(0),
        ],
        chain,
        account,
      }),
    );
  }, [chain, ensureReady, executionNonce, lpBalance, permissionId, runTx]);

  return {
    deployments,
    deploymentsLoading,
    deploymentsError,
    permissionId,
    permissionRegistered,
    lpBalance,
    usdcBalance,
    executionNonce,
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
    expectedChainId: deployments?.chainId ?? STABLE_CLUB_CHAIN_ID,
  };
}
