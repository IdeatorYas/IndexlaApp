"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { base } from "viem/chains";
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

/**
 * Beta readiness for deposits. Pool-activation reads are view-only and MUST use
 * HTTP RPC — never the wallet EIP-1193 provider. Mobile wallets (MetaMask in-app,
 * WalletConnect) often reject eth_call with "user rejected the request", which
 * previously cleared activations and falsely showed DEPOSIT UNAVAILABLE.
 */
export function useStableClubBetaReadiness() {
  const bootstrap = usePhase2aBootstrap();
  const deployments = bootstrap.deployments;
  const attestationPassed = bootstrap.isSuccess && deployments != null;
  const [activatedOnChainIds, setActivatedOnChainIds] = useState<
    Stage1FivePoolBetaPoolId[]
  >([]);
  const [activationError, setActivationError] = useState<string | null>(null);

  const isBaseProduction = deployments?.network === "base" && deployments.chainId === 8453;
  const isLocalHardhat =
    deployments?.network === "hardhat-local" && deployments.chainId === STABLE_CLUB_LOCAL_CHAIN_ID;

  const chain = isLocalHardhat ? STABLE_CLUB_LOCAL_CHAIN : base;
  const rpc = deployments?.rpcUrl ?? (isLocalHardhat ? STABLE_CLUB_LOCAL_RPC_URL : undefined);

  const publicClient = useMemo(() => {
    if (!rpc) return null;
    return createPublicClient({ chain, transport: http(rpc) });
  }, [chain, rpc]);

  const refreshActivation = useCallback(async () => {
    if (!deployments || !publicClient || !attestationPassed) {
      setActivatedOnChainIds([]);
      setActivationError(null);
      return;
    }
    try {
      const ids = await readRegisteredCataloguePoolIds(
        publicClient as PublicClient,
        deployments.clExecutor as Address,
      );
      setActivatedOnChainIds(ids);
      setActivationError(null);
    } catch (err) {
      setActivatedOnChainIds([]);
      const raw = err instanceof Error ? err.message : String(err);
      setActivationError(
        /reject|denied|cancel/i.test(raw)
          ? "Could not verify pool activation (wallet rejected a read). Retry — reads use the app RPC, not a wallet signature."
          : `Could not verify pool activation: ${raw.slice(0, 180)}`,
      );
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
    error: bootstrap.error ?? activationError,
    isLocalHardhat,
    refreshActivation,
    refetchBootstrap: bootstrap.refetch,
  };
}
