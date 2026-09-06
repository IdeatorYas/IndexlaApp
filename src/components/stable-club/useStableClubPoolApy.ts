"use client";

import { useEffect, useState } from "react";
import type { PoolApyQuote } from "@/lib/stable-club/pool-apy";

export type StableClubPoolApyState = {
  byPoolId: Record<string, PoolApyQuote>;
  loading: boolean;
  fetchedAt: string | null;
  source: string | null;
};

export function useStableClubPoolApyMap(): StableClubPoolApyState {
  const [byPoolId, setByPoolId] = useState<Record<string, PoolApyQuote>>({});
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/stable-club/pool-apy", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setByPoolId({});
            setFetchedAt(null);
            setSource(null);
          }
          return;
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
        if (!cancelled) {
          setByPoolId(map);
          setFetchedAt(json.fetchedAt ?? null);
          setSource(json.source ?? "defillama-yields");
        }
      } catch {
        if (!cancelled) {
          setByPoolId({});
          setFetchedAt(null);
          setSource(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { byPoolId, loading, fetchedAt, source };
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

export function formatApyDisplay(quote: PoolApyQuote | undefined, loading: boolean): string {
  if (loading) return "…";
  if (!quote || quote.status !== "available" || quote.apyPercent == null) return "—";
  return `${quote.apyPercent.toFixed(1)}%`;
}

export function formatApyPart(value: number | null | undefined, loading: boolean): string {
  if (loading) return "…";
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function protocolDisplayName(protocol: "uniswap-v3" | "aerodrome-slipstream"): string {
  if (protocol === "uniswap-v3") return "Uniswap V3";
  return "Aerodrome";
}

export function formatTvlUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}
