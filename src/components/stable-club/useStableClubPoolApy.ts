"use client";

import { useQuery } from "@tanstack/react-query";
import type { PoolApyQuote } from "@/lib/stable-club/pool-apy";

export type StableClubPoolApyState = {
  byPoolId: Record<string, PoolApyQuote>;
  loading: boolean;
  fetchedAt: string | null;
  source: string | null;
};

const POOL_APY_QUERY_KEY = ["stable-club", "pool-apy"] as const;

async function fetchPoolApyMap(): Promise<{
  byPoolId: Record<string, PoolApyQuote>;
  fetchedAt: string | null;
  source: string | null;
}> {
  const res = await fetch("/api/stable-club/pool-apy", { cache: "no-store" });
  if (!res.ok) {
    return { byPoolId: {}, fetchedAt: null, source: null };
  }
  const json = (await res.json()) as {
    quotes?: PoolApyQuote[];
    fetchedAt?: string;
    source?: string;
  };
  const map: Record<string, PoolApyQuote> = {};
  for (const quote of json.quotes ?? []) {
    map[quote.poolId] = quote;
  }
  return {
    byPoolId: map,
    fetchedAt: json.fetchedAt ?? null,
    source: json.source ?? "defillama-yields",
  };
}

export function useStableClubPoolApyMap(): StableClubPoolApyState {
  const query = useQuery({
    queryKey: POOL_APY_QUERY_KEY,
    queryFn: fetchPoolApyMap,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    byPoolId: query.data?.byPoolId ?? {},
    loading: query.isPending || (query.isFetching && !query.data),
    fetchedAt: query.data?.fetchedAt ?? null,
    source: query.data?.source ?? null,
  };
}

export function formatOfficialPoolFee(pool: {
  feeOrTick: { kind: "fee"; feeBps: number } | { kind: "tickSpacing"; tickSpacing: number };
}): string {
  if (pool.feeOrTick.kind === "fee") {
    return `${(pool.feeOrTick.feeBps / 100).toFixed(2)}%`;
  }
  if (pool.feeOrTick.tickSpacing === 10) return "~0.05%";
  if (pool.feeOrTick.tickSpacing === 100) return "~0.30%";
  return `CL${pool.feeOrTick.tickSpacing}`;
}

/**
 * Live APY for UI: never blank or "—".
 * - loading → "…"
 * - available (incl. 0) → "0.00%" / "12.34%"
 * - genuine fetch/match failure → "Unavailable"
 */
export function formatApyDisplay(quote: PoolApyQuote | undefined, loading: boolean): string {
  if (loading) return "…";
  if (!quote || quote.status !== "available" || quote.apyPercent == null) {
    return "Unavailable";
  }
  return `${quote.apyPercent.toFixed(2)}%`;
}

/** Fee / reward APY parts — zero rewards show 0.00%, never dashes. */
export function formatApyPart(value: number | null | undefined, loading: boolean): string {
  if (loading) return "…";
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(2)}%`;
}

/** Zero is a valid live value (e.g. reward APY with no incentives). */
export function formatApyPartAllowZero(
  value: number | null | undefined,
  loading: boolean,
  quoteAvailable: boolean,
): string {
  if (loading) return "…";
  if (!quoteAvailable) return "Unavailable";
  if (value == null || !Number.isFinite(value)) return "0.00%";
  return `${value.toFixed(2)}%`;
}

export function protocolDisplayName(protocol: "uniswap-v3" | "aerodrome-slipstream"): string {
  if (protocol === "uniswap-v3") return "Uniswap V3";
  return "Aerodrome";
}

export function formatTvlUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}
