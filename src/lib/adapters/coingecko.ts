import type { MarketAsset } from "@/lib/domain/create";
import type { NetworkId } from "@/lib/domain/types";
import {
  ILLUSTRATIVE_MARKET_CATALOG,
  supportStatusForNetworks,
} from "@/lib/fixtures/market-assets";
import type {
  AssetPerformancePoint,
  AssetPerformanceResult,
  CoinGeckoAvailability,
} from "@/lib/market/asset-performance";
import {
  resolveCoinGeckoIds,
} from "@/lib/market/coingecko-ids";

export type {
  AssetPerformancePoint,
  AssetPerformanceResult,
  AssetPerfStatus,
  CoinGeckoAvailability,
} from "@/lib/market/asset-performance";

export interface CoinGeckoCategory {
  category_id: string;
  name: string;
}

export interface MarketQueryResult {
  assets: MarketAsset[];
  availability: CoinGeckoAvailability;
  fetchedAt: string;
  stale: boolean;
  reason?: string;
  categories?: CoinGeckoCategory[];
}

type CacheEntry<T> = { expires: number; value: T };

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60_000;
const STALE_MS = 5 * 60_000;

function getEnv() {
  const apiKey = process.env.COINGECKO_API_KEY?.trim() ?? "";
  const baseUrl = (
    process.env.COINGECKO_API_BASE_URL || "https://api.coingecko.com/api/v3"
  ).replace(/\/$/, "");
  return { apiKey, baseUrl, configured: apiKey.length > 0 };
}

function getCached<T>(key: string): { value: T; stale: boolean } | null {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  const age = Date.now() - (hit.expires - CACHE_TTL_MS);
  return { value: hit.value, stale: age > STALE_MS || Date.now() > hit.expires };
}

function setCache<T>(key: string, value: T) {
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
}

async function cgFetch<T>(path: string): Promise<{
  ok: boolean;
  status: number;
  data: T | null;
  rateLimited: boolean;
  error?: string;
}> {
  const { apiKey, baseUrl, configured } = getEnv();
  if (!configured) {
    return {
      ok: false,
      status: 0,
      data: null,
      rateLimited: false,
      error: "CoinGecko API key not configured",
    };
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        "x-cg-demo-api-key": apiKey,
      },
      next: { revalidate: 60 },
    });

    if (res.status === 429) {
      return {
        ok: false,
        status: 429,
        data: null,
        rateLimited: true,
        error: "CoinGecko rate limit reached",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: null,
        rateLimited: false,
        error: `CoinGecko HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, rateLimited: false };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      rateLimited: false,
      error: e instanceof Error ? e.message : "CoinGecko request failed",
    };
  }
}

function guessNetworks(item: {
  id?: string;
  symbol?: string;
}): NetworkId[] {
  const id = (item.id || "").toLowerCase();
  const symbol = (item.symbol || "").toLowerCase();
  if (id.includes("solana") || symbol === "sol" || id.includes("dogwif")) {
    return ["solana"];
  }
  if (id.includes("arbitrum") || symbol === "arb") return ["arbitrum"];
  if (id.includes("bnb") || symbol === "bnb") return ["bnb"];
  return ["ethereum", "base"];
}

function mapMarketCoin(
  coin: {
    id: string;
    symbol: string;
    name: string;
    image?: string;
    current_price?: number;
    market_cap?: number;
    total_volume?: number;
    price_change_percentage_24h?: number;
  },
  categoryIds: string[],
): MarketAsset {
  const networkIds = guessNetworks(coin);
  return {
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    imageUrl: coin.image ?? null,
    priceUsd: coin.current_price ?? null,
    marketCapUsd: coin.market_cap ?? null,
    volume24hUsd: coin.total_volume ?? null,
    change24hPercent: coin.price_change_percentage_24h ?? null,
    networkIds,
    assetType: categoryIds.some((c) => c.includes("meme"))
      ? "memecoin"
      : "crypto",
    contractAddress: null,
    supportStatus: supportStatusForNetworks(networkIds),
    source: "coingecko",
    categoryIds,
    isIllustrative: false,
  };
}

function fallbackAssets(filter?: {
  categoryId?: string | null;
  query?: string;
  network?: string | null;
}): MarketAsset[] {
  let list = [...ILLUSTRATIVE_MARKET_CATALOG];
  if (filter?.categoryId) {
    const cat = filter.categoryId.toLowerCase();
    list = list.filter(
      (a) =>
        a.categoryIds.some((c) => c.toLowerCase().includes(cat)) ||
        cat === "other",
    );
    if (list.length === 0) list = [...ILLUSTRATIVE_MARKET_CATALOG];
  }
  if (filter?.network && filter.network !== "all") {
    list = list.filter((a) =>
      a.networkIds.includes(filter.network as NetworkId),
    );
  }
  if (filter?.query?.trim()) {
    const q = filter.query.trim().toLowerCase();
    list = list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.symbol.toLowerCase().includes(q) ||
        (a.contractAddress ?? "").toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }
  return list.map((a) => ({ ...a, stale: true }));
}

export async function listCoinGeckoCategories(): Promise<MarketQueryResult> {
  const cacheKey = "categories";
  const cached = getCached<CoinGeckoCategory[]>(cacheKey);
  if (cached && !cached.stale) {
    return {
      assets: [],
      categories: cached.value,
      availability: "live",
      fetchedAt: new Date().toISOString(),
      stale: false,
    };
  }

  const result = await cgFetch<CoinGeckoCategory[]>("/coins/categories/list");
  if (result.ok && Array.isArray(result.data)) {
    setCache(cacheKey, result.data);
    return {
      assets: [],
      categories: result.data,
      availability: "live",
      fetchedAt: new Date().toISOString(),
      stale: false,
    };
  }

  if (cached) {
    return {
      assets: [],
      categories: cached.value,
      availability: result.rateLimited ? "rate-limited" : "fallback",
      fetchedAt: new Date().toISOString(),
      stale: true,
      reason: result.error,
    };
  }

  return {
    assets: [],
    categories: [],
    availability: result.rateLimited
      ? "rate-limited"
      : getEnv().configured
        ? "error"
        : "unconfigured",
    fetchedAt: new Date().toISOString(),
    stale: true,
    reason: result.error,
  };
}

export async function listMarketAssets(input: {
  coingeckoCategoryId?: string | null;
  query?: string;
  network?: string | null;
  includeTokenized?: boolean;
}): Promise<MarketQueryResult> {
  const {
    coingeckoCategoryId,
    query,
    network,
    includeTokenized = true,
  } = input;
  const cacheKey = `markets:${coingeckoCategoryId ?? "all"}:${query ?? ""}:${network ?? "all"}`;
  const cached = getCached<MarketAsset[]>(cacheKey);
  if (cached && !cached.stale) {
    return {
      assets: cached.value,
      availability: "live",
      fetchedAt: new Date().toISOString(),
      stale: false,
    };
  }

  let liveAssets: MarketAsset[] = [];
  let availability: CoinGeckoAvailability = "live";
  let reason: string | undefined;

  if (coingeckoCategoryId) {
    const path = `/coins/markets?vs_currency=usd&category=${encodeURIComponent(coingeckoCategoryId)}&order=market_cap_desc&per_page=50&page=1&sparkline=false`;
    const result = await cgFetch<
      Array<{
        id: string;
        symbol: string;
        name: string;
        image?: string;
        current_price?: number;
        market_cap?: number;
        total_volume?: number;
        price_change_percentage_24h?: number;
      }>
    >(path);

    if (result.ok && Array.isArray(result.data)) {
      liveAssets = result.data.map((coin) =>
        mapMarketCoin(coin, [coingeckoCategoryId]),
      );
      setCache(cacheKey, liveAssets);
    } else {
      availability = result.rateLimited ? "rate-limited" : "fallback";
      reason = result.error;
      liveAssets = fallbackAssets({
        categoryId: coingeckoCategoryId,
        query,
        network,
      }).filter((a) => a.source === "illustrative-fixture" && a.assetType !== "tokenized-stock" && a.assetType !== "tokenized-commodity" && a.assetType !== "tokenized-real-estate");
    }
  } else {
    const path =
      "/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=80&page=1&sparkline=false";
    const result = await cgFetch<
      Array<{
        id: string;
        symbol: string;
        name: string;
        image?: string;
        current_price?: number;
        market_cap?: number;
        total_volume?: number;
        price_change_percentage_24h?: number;
      }>
    >(path);

    if (result.ok && Array.isArray(result.data)) {
      liveAssets = result.data.map((coin) => mapMarketCoin(coin, []));
      setCache(cacheKey, liveAssets);
    } else {
      availability = result.rateLimited ? "rate-limited" : "fallback";
      reason = result.error;
      liveAssets = fallbackAssets({ query, network }).filter(
        (a) =>
          a.assetType === "crypto" ||
          a.assetType === "memecoin" ||
          a.assetType === "stablecoin",
      );
    }
  }

  let assets = [...liveAssets];
  if (includeTokenized) {
    assets = [
      ...assets,
      ...ILLUSTRATIVE_MARKET_CATALOG.filter((a) =>
        [
          "tokenized-stock",
          "tokenized-commodity",
          "tokenized-real-estate",
        ].includes(a.assetType),
      ),
    ];
  }

  if (network && network !== "all") {
    assets = assets.filter((a) =>
      a.networkIds.includes(network as NetworkId),
    );
  }

  if (query?.trim()) {
    const q = query.trim().toLowerCase();
    assets = assets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.symbol.toLowerCase().includes(q) ||
        (a.contractAddress ?? "").toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }

  if (availability === "live" && assets.length === 0 && !query) {
    assets = fallbackAssets({
      categoryId: coingeckoCategoryId,
      query,
      network,
    });
    availability = "fallback";
    reason = "Empty CoinGecko response — using illustrative fixtures";
  }

  return {
    assets,
    availability,
    fetchedAt: new Date().toISOString(),
    stale: availability !== "live",
    reason,
  };
}

type MarketsPerfCoin = {
  id: string;
  symbol: string;
  current_price?: number | null;
  price_change_percentage_24h?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
};

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

/**
 * Live 24H / 7D / 30D performance for catalog tickers via CoinGecko markets.
 * Unmapped tickers (tokenized stocks / unsupported commodities) → Unavailable.
 * Never fabricates percentages.
 */
export async function fetchAssetPerformance(
  assetIds: string[],
): Promise<AssetPerformanceResult> {
  const { mapped, unmapped } = resolveCoinGeckoIds(assetIds);
  const byTicker: Record<string, AssetPerformancePoint> = {};

  for (const ticker of unmapped) {
    byTicker[ticker] = unavailablePoint(ticker);
  }

  if (mapped.length === 0) {
    return {
      byTicker,
      availability: "live",
      fetchedAt: new Date().toISOString(),
      stale: false,
      reason:
        unmapped.length > 0
          ? "No CoinGecko-backed assets in request"
          : undefined,
    };
  }

  const idsKey = mapped
    .map((m) => m.coingeckoId)
    .sort()
    .join(",");
  const cacheKey = `perf:${idsKey}`;
  const cached = getCached<Record<string, AssetPerformancePoint>>(cacheKey);

  if (cached && !cached.stale) {
    return {
      byTicker: { ...byTicker, ...cached.value },
      availability: "live",
      fetchedAt: new Date().toISOString(),
      stale: false,
    };
  }

  const path =
    `/coins/markets?vs_currency=usd&ids=${encodeURIComponent(idsKey)}` +
    `&order=market_cap_desc&per_page=${mapped.length}&page=1&sparkline=false` +
    `&price_change_percentage=24h,7d,30d`;

  const result = await cgFetch<MarketsPerfCoin[]>(path);

  if (result.ok && Array.isArray(result.data)) {
    const byGeckoId = new Map(result.data.map((coin) => [coin.id, coin]));
    const liveSlice: Record<string, AssetPerformancePoint> = {};

    for (const { ticker, coingeckoId } of mapped) {
      const coin = byGeckoId.get(coingeckoId);
      if (!coin) {
        liveSlice[ticker] = {
          ticker,
          coingeckoId,
          priceUsd: null,
          change24hPercent: null,
          change7dPercent: null,
          change30dPercent: null,
          status: "unavailable",
        };
        continue;
      }

      const change24h =
        coin.price_change_percentage_24h_in_currency ??
        coin.price_change_percentage_24h ??
        null;
      const change7d = coin.price_change_percentage_7d_in_currency ?? null;
      const change30d = coin.price_change_percentage_30d_in_currency ?? null;

      liveSlice[ticker] = {
        ticker,
        coingeckoId,
        priceUsd: coin.current_price ?? null,
        change24hPercent: change24h,
        change7dPercent: change7d,
        change30dPercent: change30d,
        status: "live",
      };
    }

    setCache(cacheKey, liveSlice);
    return {
      byTicker: { ...byTicker, ...liveSlice },
      availability: "live",
      fetchedAt: new Date().toISOString(),
      stale: false,
    };
  }

  if (cached) {
    return {
      byTicker: { ...byTicker, ...cached.value },
      availability: result.rateLimited ? "rate-limited" : "fallback",
      fetchedAt: new Date().toISOString(),
      stale: true,
      reason: result.error,
    };
  }

  for (const { ticker, coingeckoId } of mapped) {
    byTicker[ticker] = {
      ticker,
      coingeckoId,
      priceUsd: null,
      change24hPercent: null,
      change7dPercent: null,
      change30dPercent: null,
      status: "error",
    };
  }

  return {
    byTicker,
    availability: result.rateLimited
      ? "rate-limited"
      : getEnv().configured
        ? "error"
        : "unconfigured",
    fetchedAt: new Date().toISOString(),
    stale: true,
    reason: result.error,
  };
}
