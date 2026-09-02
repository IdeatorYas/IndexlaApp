"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, custom, http, type Address, type PublicClient } from "viem";
import { base } from "viem/chains";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  STABLE_CLUB_LOCAL_CHAIN,
  STABLE_CLUB_LOCAL_CHAIN_ID,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";
import {
  attestPhase2aDeployments,
  isValidPhase2aPublicDeployments,
  type StableClubPhase2aPublicDeployments,
} from "@/lib/stable-club/phase2a-deployments";
import {
  evaluateStableClubBetaReadiness,
  readRegisteredCataloguePoolIds,
  type StableClubBetaReadiness,
} from "@/lib/stable-club/stable-club-beta-readiness";
import type { Stage1FivePoolBetaPoolId } from "@/lib/stable-club/stage1-launch";

type Phase2aResponse =
  | { configured: false; message: string }
  | { configured: true; deployments: StableClubPhase2aPublicDeployments };

export function useStableClubBetaReadiness() {
  const wallet = useStableClubWallet();
  const [deployments, setDeployments] = useState<StableClubPhase2aPublicDeployments | null>(null);
  const [attestationPassed, setAttestationPassed] = useState(false);
  const [activatedOnChainIds, setActivatedOnChainIds] = useState<Stage1FivePoolBetaPoolId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/stable-club/phase2a-deployments");
        const json = (await res.json()) as Phase2aResponse;
        if (cancelled) return;
        if (!json.configured || !isValidPhase2aPublicDeployments(json.deployments)) {
          setDeployments(null);
          setAttestationPassed(false);
          setActivatedOnChainIds([]);
          setError(!json.configured ? json.message : "Invalid Phase 2a deployments");
          return;
        }
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
        setAttestationPassed(true);
      } catch (err) {
        if (!cancelled) {
          setDeployments(null);
          setAttestationPassed(false);
          setActivatedOnChainIds([]);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshActivation();
  }, [refreshActivation]);

  const readiness: StableClubBetaReadiness = useMemo(
    () =>
      evaluateStableClubBetaReadiness({
        attestationPassed,
        isBaseProduction,
        activatedOnChainIds,
      }),
    [activatedOnChainIds, attestationPassed, isBaseProduction],
  );

  return {
    deployments,
    readiness,
    loading,
    error,
    isLocalHardhat,
    refreshActivation,
  };
}
