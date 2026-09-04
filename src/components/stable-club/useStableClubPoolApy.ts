"use client";

import { useEffect, useState } from "react";
import type { OfficialStableClubPool } from "@/lib/stable-club/official-pools";
import type { PoolApyQuote } from "@/lib/stable-club/pool-apy";

export function useStableClubPoolApyMap(): {
  byPoolId: Record<string, PoolApyQuote>;
  loading: boolean;
} {
  const [byPoolId, setByPoolId] = useState<Record<string, PoolApyQuote>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/stable-club/pool-apy", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setByPoolId({});
          return;
        }
        const json = (await res.json()) as { quotes?: PoolApyQuote[] };
        const map: Record<string, PoolApyQuote> = {};
        for (const quote of json.quotes ?? []) {
          map[quote.poolId] = quote;
        }
        if (!cancelled) setByPoolId(map);
      } catch {
        if (!cancelled) setByPoolId({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { byPoolId, loading };
}

export function formatOfficialPoolFee(pool: OfficialStableClubPool): string {
  if (pool.feeOrTick.kind === "fee") {
    return `${(pool.feeOrTick.feeBps / 100).toFixed(2)}%`;
  }
  if (pool.feeOrTick.tickSpacing === 10) return "Approximately 0.05%";
  if (pool.feeOrTick.tickSpacing === 100) return "Approximately 0.30%";
  return `CL${pool.feeOrTick.tickSpacing}`;
}

export function formatApyDisplay(quote: PoolApyQuote | undefined, loading: boolean): string {
  if (loading) return "…";
  if (!quote || quote.status !== "available" || quote.apyPercent == null) return "—";
  return `${quote.apyPercent.toFixed(1)}%`;
}

export function protocolDisplayName(protocol: OfficialStableClubPool["protocol"]): string {
  if (protocol === "uniswap-v3") return "Uniswap V3";
  return "Aerodrome";
}
