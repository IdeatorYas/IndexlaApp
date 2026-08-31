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
  type Hex,
} from "viem";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_CHAIN_ID,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";
import {
  verifiedStep2Adapters,
  type StableClubLocalDeployments,
} from "@/lib/stable-club/deployments";
import { computeStableClubPermissionId } from "@/lib/stable-club/permission-id";
import { toOnChainPermission } from "@/lib/stable-club/permissions";
import { buildHarvestOptInPermissionScope } from "@/lib/stable-club/harvest-validation";
import { permissionRegistryAbi } from "@/lib/stable-club/abis";
import { resolveNextPermissionExecutionNonce } from "@/lib/stable-club/permission-execution-nonce";
import { OpenServMonitor } from "@/lib/stable-club/openserv";
import { HarvestAuditStore } from "@/lib/stable-club/harvest-audit";
import {
  executeAuthorizedHarvest,
  mapHarvestResultToUiStatus,
  type ExecuteHarvestInput,
  type HarvestUiStatus,
} from "@/lib/stable-club/harvest";
import { getOfficialPoolById } from "@/lib/stable-club/official-pools";
import { STAGE1_PRIVATE_BETA_POOL_ID } from "@/lib/stable-club/stage1-launch";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";

type DeploymentsResponse =
  | { configured: false; message: string }
  | { configured: true; deployments: StableClubLocalDeployments };

export function useStableClubHarvest() {
  const wallet = useStableClubWallet();
  const monitorRef = useRef(new OpenServMonitor(60, 10));
  const auditRef = useRef(new HarvestAuditStore());
  const [deployments, setDeployments] = useState<StableClubLocalDeployments | null>(null);
  const [permissionRegistered, setPermissionRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uiStatus, setUiStatus] = useState<HarvestUiStatus>({
    status: "idle",
    message: null,
    lastTxHash: null,
    lastValidationCode: null,
  });
  const [proposalCount, setProposalCount] = useState(0);
  const [circuitBroken, setCircuitBroken] = useState(false);

  const cataloguePool = getOfficialPoolById(STAGE1_PRIVATE_BETA_POOL_ID);
  const poolCatalogueId = STAGE1_PRIVATE_BETA_POOL_ID;

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
    return computeStableClubPermissionId({
      user: wallet.address,
      chainId: deployments.chainId,
      poolId: cataloguePool.poolIdHash,
      tokenA: cataloguePool.tokenA.address,
      tokenB: cataloguePool.tokenB.address,
    });
  }, [wallet.address, cataloguePool, deployments]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stable-club/deployments");
        const json = (await res.json()) as DeploymentsResponse;
        if (!cancelled && json.configured) setDeployments(json.deployments);
      } catch {
        if (!cancelled) setDeployments(null);
      }
    })();
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
  }, [deployments, permissionId, publicClient, uiStatus.lastTxHash]);

  const registerHarvestPermission = useCallback(async () => {
    if (!walletClient || !wallet.address || !deployments || !cataloguePool || !permissionId) {
      throw new Error("Wallet and deployments required");
    }
    setBusy(true);
    setUiStatus((s) => ({ ...s, status: "awaiting-wallet", message: "Registering permission…" }));
    try {
      const scope = buildHarvestOptInPermissionScope({
        user: wallet.address,
        chainId: deployments.chainId,
        poolId: cataloguePool.poolIdHash,
        tokenA: cataloguePool.tokenA.address,
        tokenB: cataloguePool.tokenB.address,
      });
      const hash = await walletClient.writeContract({
        address: deployments.permissionRegistry,
        abi: permissionRegistryAbi,
        functionName: "registerPermission",
        args: [toOnChainPermission(scope)],
      });
      await waitForSuccessfulTransactionReceipt(publicClient, hash);
      setPermissionRegistered(true);
      setUiStatus({
        status: "confirmed",
        message: "Harvest permission registered",
        lastTxHash: hash,
        lastValidationCode: null,
      });
    } finally {
      setBusy(false);
    }
  }, [walletClient, wallet.address, deployments, cataloguePool, permissionId, publicClient]);

  const runHarvest = useCallback(
    async (input: { positionTokenId: string; adapter: Address; feesUsd: number; gasUsd: number; manual?: boolean }) => {
      if (!walletClient || !wallet.address || !deployments || !cataloguePool || !permissionId) {
        setUiStatus({
          status: "failed",
          message: "Connect wallet and load deployments",
          lastTxHash: null,
          lastValidationCode: "missing-deployments",
        });
        return;
      }
      setBusy(true);
      setUiStatus((s) => ({ ...s, status: "validating", message: "Validating harvest…" }));
      try {
        const executionNonce = await resolveNextPermissionExecutionNonce(
          publicClient,
          deployments.permissionRegistry,
          permissionId,
        );
        const verified = verifiedAdapters.find((a) => a.poolId === poolCatalogueId);
        const adapter = input.adapter ?? verified?.adapter;
        if (!adapter) {
          setUiStatus({
            status: "failed",
            message: "No verified adapter",
            lastTxHash: null,
            lastValidationCode: "missing-adapter",
          });
          return;
        }
        const result = await executeAuthorizedHarvest({
          deployments,
          verifiedAdapters,
          walletAddress: wallet.address,
          walletChainId: wallet.chainId ?? deployments.chainId,
          poolCatalogueId,
          poolIdHash: cataloguePool.poolIdHash,
          tokenA: cataloguePool.tokenA.address,
          tokenB: cataloguePool.tokenB.address,
          positionTokenId: input.positionTokenId,
          permissionId,
          executionNonce,
          adapter,
          optInEnabled: permissionRegistered,
          feesUsd: input.feesUsd,
          gasUsd: input.gasUsd,
          idempotencyKey: keccak256(stringToHex(`harvest-${permissionId}-${executionNonce}`)),
          manual: input.manual ?? true,
          monitor: monitorRef.current,
          audit: auditRef.current,
          publicClient: publicClient as ExecuteHarvestInput["publicClient"],
          walletClient: walletClient as ExecuteHarvestInput["walletClient"],
        });
        setProposalCount(monitorRef.current.listProposals().length);
        setCircuitBroken(monitorRef.current.circuitBroken);
        setUiStatus(mapHarvestResultToUiStatus(result));
      } finally {
        setBusy(false);
      }
    },
    [
      walletClient,
      wallet.address,
      wallet.chainId,
      deployments,
      cataloguePool,
      permissionId,
      verifiedAdapters,
      permissionRegistered,
      publicClient,
      poolCatalogueId,
    ],
  );

  const auditEvents = auditRef.current.list();

  return {
    deployments,
    cataloguePool,
    poolCatalogueId,
    permissionId,
    permissionRegistered,
    registerHarvestPermission,
    runHarvest,
    busy,
    uiStatus,
    proposalCount,
    circuitBroken,
    auditEvents,
    verifiedAdapters,
  };
}
