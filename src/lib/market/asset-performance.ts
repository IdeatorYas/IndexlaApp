export type CoinGeckoAvailability =
  | "live"
  | "fallback"
  | "rate-limited"
  | "error"
  | "unconfigured";

export type AssetPerfStatus = "live" | "unavailable" | "error";

export interface AssetPerformancePoint {
  ticker: string;
  coingeckoId: string | null;
  priceUsd: number | null;
  change24hPercent: number | null;
  change7dPercent: number | null;
  change30dPercent: number | null;
  status: AssetPerfStatus;
}

export interface AssetPerformanceResult {
  byTicker: Record<string, AssetPerformancePoint>;
  availability: CoinGeckoAvailability;
  fetchedAt: string;
  stale: boolean;
  reason?: string;
}
