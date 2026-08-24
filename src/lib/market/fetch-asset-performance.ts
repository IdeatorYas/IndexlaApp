import { fetchAssetPerformance as fetchCryptoPerformance } from "@/lib/adapters/coingecko";
import { fetchStockAssetPerformance } from "@/lib/adapters/twelve-data";
import type {
  AssetPerformancePoint,
  AssetPerformanceResult,
  CoinGeckoAvailability,
} from "@/lib/market/asset-performance";
import { getCoinGeckoIdForTicker, normalizeTickerKey } from "@/lib/market/coingecko-ids";
import { getTwelveDataSymbol } from "@/lib/market/twelve-data-symbols";

function unavailablePoint(ticker: string): AssetPerformancePoint {
  return {
    ticker,
    coingeckoId: null,
    priceUsd: null,
    change24hPercent: null,
    change7dPercent: null,
    change30dPercent: null,
    status: "unavailable",
  };
}

function emptyResult(): AssetPerformanceResult {
  return {
    byTicker: {},
    availability: "live",
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}

function mergeAvailability(
  a: CoinGeckoAvailability,
  b: CoinGeckoAvailability,
): CoinGeckoAvailability {
  const rank: CoinGeckoAvailability[] = [
    "live",
    "fallback",
    "rate-limited",
    "error",
    "unconfigured",
  ];
  // Prefer the more severe signal when either side failed; live if either succeeded with data.
  if (a === "rate-limited" || b === "rate-limited") return "rate-limited";
  if (a === "unconfigured" && b === "unconfigured") return "unconfigured";
  if (a === "live" || b === "live") return "live";
  if (a === "fallback" || b === "fallback") return "fallback";
  const ai = rank.indexOf(a);
  const bi = rank.indexOf(b);
  return ai >= bi ? a : b;
}

/**
 * Unified asset performance:
 * - CoinGecko for crypto
 * - Twelve Data for stocks / ETFs
 * Never fabricates values. Server-only (uses secret API keys).
 */
export async function fetchUnifiedAssetPerformance(
  assetIds: string[],
): Promise<AssetPerformanceResult> {
  const crypto: string[] = [];
  const stocks: string[] = [];
  const unsupported: string[] = [];
  const seen = new Set<string>();

  for (const raw of assetIds) {
    const ticker = normalizeTickerKey(raw);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    if (getCoinGeckoIdForTicker(ticker)) crypto.push(ticker);
    else if (getTwelveDataSymbol(ticker)) stocks.push(ticker);
    else unsupported.push(ticker);
  }

  const byTicker: Record<string, AssetPerformancePoint> = {};
  for (const ticker of unsupported) {
    byTicker[ticker] = unavailablePoint(ticker);
  }

  const [cryptoResult, stockResult] = await Promise.all([
    crypto.length > 0 ? fetchCryptoPerformance(crypto) : emptyResult(),
    stocks.length > 0 ? fetchStockAssetPerformance(stocks) : emptyResult(),
  ]);

  Object.assign(byTicker, cryptoResult.byTicker, stockResult.byTicker);

  const availability =
    crypto.length === 0 && stocks.length === 0
      ? "live"
      : crypto.length === 0
        ? stockResult.availability
        : stocks.length === 0
          ? cryptoResult.availability
          : mergeAvailability(
              cryptoResult.availability,
              stockResult.availability,
            );

  const reason = [cryptoResult.reason, stockResult.reason]
    .filter(Boolean)
    .join("; ");

  return {
    byTicker,
    availability,
    fetchedAt: new Date().toISOString(),
    stale: cryptoResult.stale || stockResult.stale || availability !== "live",
    reason: reason || undefined,
  };
}
