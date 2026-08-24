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
