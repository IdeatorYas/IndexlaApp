"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, custom, http, type Address, type PublicClient } from "viem";
import { base } from "viem/chains";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import { usePhase2aBootstrap } from "@/components/stable-club/usePhase2aBootstrap";
import {
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_CHAIN_ID,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";
import {
  evaluateStableClubBetaReadiness,
  readRegisteredCataloguePoolIds,
  type StableClubBetaReadiness,
} from "@/lib/stable-club/stable-club-beta-readiness";
import { isExitAllToUsdcAvailable } from "@/lib/stable-club/exit-to-usdc";
import type { Stage1FivePoolBetaPoolId } from "@/lib/stable-club/stage1-launch";

export function useStableClubBetaReadiness() {
  const wallet = useStableClubWallet();
  const bootstrap = usePhase2aBootstrap();
  const deployments = bootstrap.deployments;
  const attestationPassed = bootstrap.isSuccess && deployments != null;
  const [activatedOnChainIds, setActivatedOnChainIds] = useState<
    Stage1FivePoolBetaPoolId[]
  >([]);

  const isBaseProduction = deployments?.network === "base" && deployments.chainId === 8453;
  const isLocalHardhat =
    deployments?.network === "hardhat-local" && deployments.chainId === STABLE_CLUB_LOCAL_CHAIN_ID;

  const chain = isLocalHardhat ? STABLE_CLUB_LOCAL_CHAIN : base;
  const rpc = deployments?.rpcUrl ?? (isLocalHardhat ? STABLE_CLUB_LOCAL_RPC_URL : undefined);

  const publicClient = useMemo(() => {
    if (wallet.provider) {
      return createPublicClient({ chain, transport: custom(wallet.provider) });
    }
    if (!rpc) return null;
    return createPublicClient({ chain, transport: http(rpc) });
  }, [chain, rpc, wallet.provider]);

  const refreshActivation = useCallback(async () => {
    if (!deployments || !publicClient || !attestationPassed) {
      setActivatedOnChainIds([]);
      return;
    }
    try {
      const ids = await readRegisteredCataloguePoolIds(
        publicClient as PublicClient,
        deployments.clExecutor as Address,
      );
      setActivatedOnChainIds(ids);
    } catch {
      setActivatedOnChainIds([]);
    }
  }, [attestationPassed, deployments, publicClient]);

  useEffect(() => {
    void refreshActivation();
  }, [refreshActivation]);

  const readiness: StableClubBetaReadiness = useMemo(
    () =>
      evaluateStableClubBetaReadiness({
        attestationPassed,
        isBaseProduction,
        activatedOnChainIds,
        exitAllToUsdcAvailable: isExitAllToUsdcAvailable(deployments),
      }),
    [activatedOnChainIds, attestationPassed, deployments, isBaseProduction],
  );

  return {
    deployments,
    readiness,
    loading: bootstrap.loading && !attestationPassed,
    error: bootstrap.error,
    isLocalHardhat,
    refreshActivation,
    refetchBootstrap: bootstrap.refetch,
  };
}
