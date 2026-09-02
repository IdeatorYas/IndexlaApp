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
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";
import {
  verifiedStep2Adapters,
  type StableClubLocalDeployments,
} from "@/lib/stable-club/deployments";
import { hydrateLocalDeploymentsFromApi } from "@/lib/stable-club/runtime-deployments";
import {
  computeStableClubScopedPermissionId,
  PERMISSION_SCOPE_COMPOUND,
} from "@/lib/stable-club/permission-id";
import { toOnChainPermission } from "@/lib/stable-club/permissions";
import {
  buildCompoundOptInPermissionScope,
  COMPOUND_OPENSERV_CONNECTED,
  deriveCompoundSpendFromLiveFees,
  parsePositionTokenId,
  permissionMaskIncludesCompound,
} from "@/lib/stable-club/compound-validation";
import { permissionRegistryAbi } from "@/lib/stable-club/abis";
import { resolveNextPermissionExecutionNonce } from "@/lib/stable-club/permission-execution-nonce";
import { CompoundAuditStore } from "@/lib/stable-club/compound-audit";
import {
  compoundAutomationStatusMessage,
  executeAuthorizedCompound,
  mapCompoundResultToUiStatus,
  readLiveCollectibleFees,
  readOnChainTokenDecimals,
  type CompoundSpendInput,
  type CompoundUiStatus,
  type ExecuteCompoundInput,
} from "@/lib/stable-club/compound";
import { getOfficialPoolById } from "@/lib/stable-club/official-pools";
import { STAGE1_PRIVATE_BETA_POOL_ID } from "@/lib/stable-club/stage1-launch";
import { waitForSuccessfulTransactionReceipt } from "@/lib/stable-club/transaction-receipt";

type DeploymentsResponse =
  | { configured: false; message: string }
  | { configured: true; deployments: StableClubLocalDeployments };

export function useStableClubCompound() {
  const wallet = useStableClubWallet();
  const auditRef = useRef(new CompoundAuditStore());
  const [deployments, setDeployments] = useState<StableClubLocalDeployments | null>(null);
  const [permissionRegistered, setPermissionRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uiStatus, setUiStatus] = useState<CompoundUiStatus>({
    status: "idle",
    message: null,
    lastTxHash: null,
    lastValidationCode: null,
    automationAvailable: COMPOUND_OPENSERV_CONNECTED,
  });

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
    return computeStableClubScopedPermissionId({
      user: wallet.address,
      chainId: deployments.chainId,
      poolId: cataloguePool.poolIdHash,
      tokenA: cataloguePool.tokenA.address,
      tokenB: cataloguePool.tokenB.address,
      scope: PERMISSION_SCOPE_COMPOUND,
    });
  }, [wallet.address, cataloguePool, deployments]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stable-club/deployments");
        const json = await res.json();
        if (!cancelled) setDeployments(hydrateLocalDeploymentsFromApi(json));
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
        const registered =
          perm.user !== "0x0000000000000000000000000000000000000000" &&
          !perm.revoked &&
          permissionMaskIncludesCompound(perm.allowedActions);
        setPermissionRegistered(registered);
      })
      .catch(() => setPermissionRegistered(false));
  }, [deployments, permissionId, publicClient, uiStatus.lastTxHash]);

  const registerCompoundPermission = useCallback(async () => {
    if (!walletClient || !wallet.address || !deployments || !cataloguePool || !permissionId) {
      throw new Error("Wallet and deployments required");
    }
    setBusy(true);
    setUiStatus((s) => ({
      ...s,
      status: "awaiting-wallet",
      message: "Registering compound permission…",
      automationAvailable: COMPOUND_OPENSERV_CONNECTED,
    }));
    try {
      const tokenADecimals = await readOnChainTokenDecimals(
        publicClient as ExecuteCompoundInput["publicClient"],
        cataloguePool.tokenA.address,
      );
      if (tokenADecimals == null) {
        setUiStatus({
          status: "failed",
          message: "Could not read on-chain tokenA decimals",
          lastTxHash: null,
          lastValidationCode: "missing-token-decimals",
          automationAvailable: COMPOUND_OPENSERV_CONNECTED,
        });
        return;
      }
      const scope = buildCompoundOptInPermissionScope({
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
        args: [toOnChainPermission(scope), PERMISSION_SCOPE_COMPOUND],
      });
      await waitForSuccessfulTransactionReceipt(publicClient, hash);
      setPermissionRegistered(true);
      setUiStatus({
        status: "confirmed",
        message: "Compound permission registered",
        lastTxHash: hash,
        lastValidationCode: null,
        automationAvailable: COMPOUND_OPENSERV_CONNECTED,
      });
    } finally {
      setBusy(false);
    }
  }, [walletClient, wallet.address, deployments, cataloguePool, permissionId, publicClient]);

  const runCompound = useCallback(
    async (input: {
      positionTokenId: string;
      adapter: Address;
      spend?: Partial<CompoundSpendInput>;
      manual?: boolean;
    }) => {
      if (!walletClient || !wallet.address || !deployments || !cataloguePool || !permissionId) {
        setUiStatus({
          status: "failed",
          message: "Connect wallet and load deployments",
          lastTxHash: null,
          lastValidationCode: "missing-deployments",
          automationAvailable: COMPOUND_OPENSERV_CONNECTED,
        });
        return;
      }
      setBusy(true);
      setUiStatus((s) => ({
        ...s,
        status: "validating",
        message: "Validating compound…",
        automationAvailable: COMPOUND_OPENSERV_CONNECTED,
      }));
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
            automationAvailable: COMPOUND_OPENSERV_CONNECTED,
          });
          return;
        }

        const tokenId = parsePositionTokenId(input.positionTokenId);
        if (tokenId == null) {
          setUiStatus({
            status: "failed",
            message: "Position tokenId must be a positive integer",
            lastTxHash: null,
            lastValidationCode: "invalid-position-token-id",
            automationAvailable: COMPOUND_OPENSERV_CONNECTED,
          });
          return;
        }

        const now = Math.floor(Date.now() / 1000);
        const tokenA = cataloguePool.tokenA.address;
        const tokenB = cataloguePool.tokenB.address;

        let spend: CompoundSpendInput;
        if (input.spend) {
          spend = {
            rewardToken: tokenA,
            tokenA,
            tokenB,
            swapAmount: BigInt(0),
            minAmountOut: BigInt(0),
            amountA: BigInt(0),
            amountB: BigInt(0),
            amountAMin: BigInt(0),
            amountBMin: BigInt(0),
            slippageBps: BigInt(150),
            swapDeadline: BigInt(now + 600),
            quotedAmountOut: BigInt(0),
            ...input.spend,
          };
        } else {
          const fees = await readLiveCollectibleFees(
            publicClient as ExecuteCompoundInput["publicClient"],
            adapter,
            tokenId,
          );
          const derived = deriveCompoundSpendFromLiveFees({
            rewardToken: tokenA,
            tokenA,
            tokenB,
            fees,
            slippageBps: BigInt(150),
            swapDeadlineSec: now + 600,
          });
          if (!derived.ok) {
            setUiStatus({
              status: "failed",
              message: derived.reason,
              lastTxHash: null,
              lastValidationCode: derived.code,
              automationAvailable: COMPOUND_OPENSERV_CONNECTED,
            });
            return;
          }
          spend = derived;
        }

        const result = await executeAuthorizedCompound({
          deployments,
          verifiedAdapters,
          walletAddress: wallet.address,
          walletChainId: wallet.chainId ?? deployments.chainId,
          poolCatalogueId,
          poolIdHash: cataloguePool.poolIdHash,
          positionTokenId: input.positionTokenId,
          permissionId,
          executionNonce,
          adapter,
          optInEnabled: permissionRegistered,
          spend,
          proposalDeadline: BigInt(now + 3600),
          idempotencyKey: keccak256(
            stringToHex(`compound-${permissionId}-${executionNonce}`),
          ),
          manual: input.manual ?? true,
          audit: auditRef.current,
          publicClient: publicClient as ExecuteCompoundInput["publicClient"],
          walletClient: walletClient as ExecuteCompoundInput["walletClient"],
        });
        setUiStatus(mapCompoundResultToUiStatus(result));
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

  return {
    deployments,
    cataloguePool,
    poolCatalogueId,
    permissionId,
    permissionRegistered,
    registerCompoundPermission,
    runCompound,
    busy,
    uiStatus,
    automationAvailable: COMPOUND_OPENSERV_CONNECTED,
    automationStatusMessage: compoundAutomationStatusMessage(),
    auditEvents: auditRef.current.list(),
    verifiedAdapters,
  };
}
