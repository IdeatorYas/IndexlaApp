"use client";

/**
 * Single Phase 2a fetch + on-chain attestation for Stable Club.
 * Shared via React Query so readiness / positions / deposit do not triple-boot.
 */
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import {
  STABLE_CLUB_LOCAL_CHAIN,
} from "@/lib/stable-club/constants";
import { STABLE_CLUB_BASE_RPC_PROXY_PATH } from "@/lib/stable-club/base-rpc-client";
import { createStableClubBaseReadTransport } from "@/lib/stable-club/base-rpc-transport";
import {
  attestPhase2aDeployments,
  isValidPhase2aPublicDeployments,
  type StableClubPhase2aPublicDeployments,
} from "@/lib/stable-club/phase2a-deployments";

export const PHASE2A_BOOTSTRAP_QUERY_KEY = [
  "stable-club",
  "phase2a-bootstrap",
] as const;

type Phase2aResponse =
  | { configured: false; message: string }
  | { configured: true; deployments: StableClubPhase2aPublicDeployments };

export class Phase2aBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Phase2aBootstrapError";
  }
}

export async function fetchAndAttestPhase2aBootstrap(): Promise<StableClubPhase2aPublicDeployments> {
  const res = await fetch("/api/stable-club/phase2a-deployments");
  const json = (await res.json()) as Phase2aResponse;
  if (!json.configured || !isValidPhase2aPublicDeployments(json.deployments)) {
    throw new Phase2aBootstrapError(
      !json.configured ? json.message : "Invalid Phase 2a deployments",
    );
  }
  const candidate = json.deployments;
  const attestChain =
    candidate.network === "hardhat-local" ? STABLE_CLUB_LOCAL_CHAIN : base;
  const attestTransport =
    candidate.network === "hardhat-local"
      ? http(candidate.rpcUrl)
      : candidate.network === "base" ||
          candidate.rpcUrl === STABLE_CLUB_BASE_RPC_PROXY_PATH ||
          candidate.chainId === 8453
        ? createStableClubBaseReadTransport()
        : http(candidate.rpcUrl);
  const attestClient = createPublicClient({
    chain: attestChain,
    transport: attestTransport,
  });
  await attestPhase2aDeployments({
    client: {
      getChainId: () => attestClient.getChainId(),
      getBytecode: (args) => attestClient.getBytecode(args),
    },
    deployments: candidate,
  });
  return candidate;
}

export function usePhase2aBootstrap() {
  const query = useQuery({
    queryKey: PHASE2A_BOOTSTRAP_QUERY_KEY,
    queryFn: fetchAndAttestPhase2aBootstrap,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return {
    deployments: query.data ?? null,
    loading: query.isPending || query.isFetching,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : null,
    refetch: query.refetch,
    isSuccess: query.isSuccess,
  };
}
