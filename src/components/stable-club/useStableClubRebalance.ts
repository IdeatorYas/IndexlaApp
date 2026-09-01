"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  keccak256,
  stringToHex,
  type Address,
} from "viem";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import { STABLE_CLUB_LOCAL_CHAIN, STABLE_CLUB_LOCAL_RPC_URL } from "@/lib/stable-club/constants";
import {
  verifiedStep2Adapters,
  type StableClubLocalDeployments,
} from "@/lib/stable-club/deployments";
import { hydrateLocalDeploymentsFromApi } from "@/lib/stable-club/runtime-deployments";
import {
  computeStableClubScopedPermissionId,
  PERMISSION_SCOPE_REBALANCE,
} from "@/lib/stable-club/permission-id";
import { toOnChainPermission } from "@/lib/stable-club/permissions";
import {
  buildRebalanceOptInPermissionScope,
  permissionMaskIncludesRebalance,
  REBALANCE_OPENSERV_CONNECTED,
} from "@/lib/stable-club/rebalance-validation";
import { permissionRegistryAbi } from "@/lib/stable-club/abis";
import { resolveNextPermissionExecutionNonce } from "@/lib/stable-club/permission-execution-nonce";
import { RebalanceAuditStore } from "@/lib/stable-club/rebalance-audit";
import {
  executeAuthorizedRebalance,
  mapRebalanceResultToUiStatus,
  rebalanceAutomationStatusMessage,
  type ExecuteRebalanceInput,
  type RebalanceSpendInput,
  type RebalanceUiStatus,
} from "@/lib/stable-club/rebalance";
import { readOnChainTokenDecimals } from "@/lib/stable-club/compound";
import { getOfficialPoolById } from "@/lib/stable-club/official-pools";
import { STAGE1_PRIVATE_BETA_POOL_ID } from "@/lib/stable-club/stage1-launch";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";

type DeploymentsResponse =
  | { configured: false; message: string }
  | { configured: true; deployments: StableClubLocalDeployments };

export function useStableClubRebalance() {
  const wallet = useStableClubWallet();
  const auditRef = useRef(new RebalanceAuditStore());
  const [deployments, setDeployments] = useState<StableClubLocalDeployments | null>(null);
  const [permissionRegistered, setPermissionRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uiStatus, setUiStatus] = useState<RebalanceUiStatus>({
    status: "idle",
    message: null,
    lastTxHash: null,
    lastValidationCode: null,
    automationAvailable: REBALANCE_OPENSERV_CONNECTED,
  });
  const cataloguePool = getOfficialPoolById(STAGE1_PRIVATE_BETA_POOL_ID);
  const poolCatalogueId = STAGE1_PRIVATE_BETA_POOL_ID;
  const chain = useMemo(
    () => deployments?.network === "hardhat-local"
      ? STABLE_CLUB_LOCAL_CHAIN
      : wallet.chain ?? STABLE_CLUB_LOCAL_CHAIN,
    [deployments?.network, wallet.chain],
  );
  const publicClient = useMemo(() => {
    if (wallet.provider) return createPublicClient({ chain, transport: custom(wallet.provider) });
    return createPublicClient({
      chain,
      transport: http(deployments?.rpcUrl ?? STABLE_CLUB_LOCAL_RPC_URL),
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
  const verifiedAdapters = useMemo(() => verifiedStep2Adapters(deployments), [deployments]);
  const permissionId = useMemo(() => {
    if (!wallet.address || !cataloguePool || !deployments) return null;
    return computeStableClubScopedPermissionId({
      user: wallet.address,
      chainId: deployments.chainId,
      poolId: cataloguePool.poolIdHash,
      tokenA: cataloguePool.tokenA.address,
      tokenB: cataloguePool.tokenB.address,
      scope: PERMISSION_SCOPE_REBALANCE,
    });
  }, [wallet.address, cataloguePool, deployments]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/stable-club/deployments")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setDeployments(hydrateLocalDeploymentsFromApi(json));
      })
      .catch(() => {
        if (!cancelled) setDeployments(null);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!deployments || !permissionId) {
      setPermissionRegistered(false);
      return;
    }
    void publicClient.readContract({
      address: deployments.permissionRegistry,
      abi: permissionRegistryAbi,
      functionName: "getPermission",
      args: [permissionId],
    }).then((perm) => {
      setPermissionRegistered(
        perm.user !== "0x0000000000000000000000000000000000000000" &&
        !perm.revoked &&
        permissionMaskIncludesRebalance(perm.allowedActions),
      );
    }).catch(() => setPermissionRegistered(false));
  }, [deployments, permissionId, publicClient, uiStatus.lastTxHash]);

  const registerRebalancePermission = useCallback(async () => {
    if (!walletClient || !wallet.address || !deployments || !cataloguePool || !permissionId) {
      throw new Error("Wallet and deployments required");
    }
    setBusy(true);
    try {
      const tokenADecimals = await readOnChainTokenDecimals(
        publicClient as ExecuteRebalanceInput["publicClient"],
        cataloguePool.tokenA.address,
      );
      if (tokenADecimals == null) {
        setUiStatus({
          status: "failed",
          message: "Could not read on-chain tokenA decimals",
          lastTxHash: null,
          lastValidationCode: "missing-token-decimals",
          automationAvailable: false,
        });
        return;
      }
      const scope = buildRebalanceOptInPermissionScope({
        user: wallet.address,
        chainId: deployments.chainId,
        poolId: cataloguePool.poolIdHash,
        tokenA: cataloguePool.tokenA.address,
        tokenB: cataloguePool.tokenB.address,
        tokenADecimals,
      });
      const hash = await walletClient.writeContract({
        address: deployments.permissionRegistry,
        abi: permissionRegistryAbi,
        functionName: "registerScopedPermission",
        args: [toOnChainPermission(scope), PERMISSION_SCOPE_REBALANCE],
      });
      await waitForSuccessfulTransactionReceipt(publicClient, hash);
      setPermissionRegistered(true);
      setUiStatus({
        status: "confirmed",
        message: "Rebalance permission registered",
        lastTxHash: hash,
        lastValidationCode: null,
        automationAvailable: false,
      });
    } finally {
      setBusy(false);
    }
  }, [walletClient, wallet.address, deployments, cataloguePool, permissionId, publicClient]);

  const runRebalance = useCallback(async (input: {
    positionTokenId: string;
    adapter: Address;
    newTickLower: number;
    newTickUpper: number;
    spend?: Partial<RebalanceSpendInput>;
    manual?: boolean;
  }) => {
    if (!walletClient || !wallet.address || !deployments || !cataloguePool || !permissionId) {
      setUiStatus({
        status: "failed",
        message: "Connect wallet and load deployments",
        lastTxHash: null,
        lastValidationCode: "missing-deployments",
        automationAvailable: false,
      });
      return;
    }
    setBusy(true);
    setUiStatus((status) => ({ ...status, status: "validating", message: "Validating rebalance…" }));
    try {
      const executionNonce = await resolveNextPermissionExecutionNonce(
        publicClient,
        deployments.permissionRegistry,
        permissionId,
      );
      const now = Math.floor(Date.now() / 1000);
      const spend: RebalanceSpendInput = {
        tokenA: cataloguePool.tokenA.address,
        tokenB: cataloguePool.tokenB.address,
        newTickLower: input.newTickLower,
        newTickUpper: input.newTickUpper,
        swapAmount: BigInt(0),
        minAmountOut: BigInt(0),
        closeAmountAMin: BigInt(1),
        closeAmountBMin: BigInt(1),
        mintAmountAMin: BigInt(1),
        mintAmountBMin: BigInt(1),
        slippageBps: BigInt(150),
        swapDeadline: BigInt(now + 600),
        quotedAmountOut: BigInt(0),
        ...input.spend,
      };
      const result = await executeAuthorizedRebalance({
        deployments,
        verifiedAdapters,
        walletAddress: wallet.address,
        walletChainId: wallet.chainId ?? deployments.chainId,
        poolCatalogueId,
        poolIdHash: cataloguePool.poolIdHash,
        positionTokenId: input.positionTokenId,
        permissionId,
        executionNonce,
        adapter: input.adapter,
        optInEnabled: permissionRegistered,
        spend,
        proposalDeadline: BigInt(now + 3600),
        idempotencyKey: keccak256(stringToHex(`rebalance-${permissionId}-${executionNonce}`)),
        manual: input.manual ?? true,
        audit: auditRef.current,
        publicClient: publicClient as ExecuteRebalanceInput["publicClient"],
        walletClient: walletClient as ExecuteRebalanceInput["walletClient"],
      });
      setUiStatus(mapRebalanceResultToUiStatus(result));
    } finally {
      setBusy(false);
    }
  }, [
    walletClient,
    wallet.address,
    wallet.chainId,
    deployments,
    cataloguePool,
    permissionId,
    publicClient,
    verifiedAdapters,
    permissionRegistered,
    poolCatalogueId,
  ]);

  return {
    permissionId,
    permissionRegistered,
    registerRebalancePermission,
    runRebalance,
    busy,
    uiStatus,
    automationAvailable: REBALANCE_OPENSERV_CONNECTED,
    automationStatusMessage: rebalanceAutomationStatusMessage(),
    auditEvents: auditRef.current.list(),
  };
}
