"use client";

import { useEffect, useState } from "react";
import type { DegenCoinMarketPoint } from "@/lib/adapters/coingecko";
import type { DegenProduct } from "@/lib/domain/degen-club";

export type DegenPriceMap = Record<string, DegenCoinMarketPoint>;

export function enrichDegenProduct(
  product: DegenProduct,
  prices: DegenPriceMap,
): DegenProduct {
  return {
    ...product,
    allocations: product.allocations.map((a) => {
      const live = a.coingeckoId ? prices[a.coingeckoId] : undefined;
      return {
        ...a,
        imageUrl: live?.imageUrl ?? a.imageUrl ?? null,
        priceUsd: live?.priceUsd ?? a.priceUsd ?? null,
        marketCapUsd: live?.marketCapUsd ?? a.marketCapUsd ?? null,
        change7dPercent: live?.change7dPercent ?? a.change7dPercent ?? null,
        change30dPercent: live?.change30dPercent ?? a.change30dPercent ?? null,
        ticker: a.ticker ?? (live?.symbol ? live.symbol.toUpperCase() : a.ticker),
        name: a.name ?? live?.name ?? a.name,
      };
    }),
  };
}

export function useDegenPrices() {
  const [prices, setPrices] = useState<DegenPriceMap>({});
  const [stale, setStale] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market/degen-prices")
      .then((r) => r.json())
      .then((data: { byId?: DegenPriceMap; stale?: boolean }) => {
        if (cancelled) return;
        setPrices(data.byId ?? {});
        setStale(Boolean(data.stale));
      })
      .catch(() => {
        if (!cancelled) setStale(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { prices, stale };
}

export function formatDegenLivePrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

export function formatDegenMarketCap(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

export function formatDegenChange(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}
