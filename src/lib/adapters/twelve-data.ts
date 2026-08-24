import type {
  AssetPerformancePoint,
  AssetPerformanceResult,
  CoinGeckoAvailability,
} from "@/lib/market/asset-performance";
import {
  resolveTwelveDataSymbols,
} from "@/lib/market/twelve-data-symbols";

type CacheEntry<T> = { expires: number; value: T };

const cache = new Map<string, CacheEntry<unknown>>();
const QUOTE_TTL_MS = 60_000;
/** Daily bars change slowly; long TTL avoids burning free-tier credits. */
const HISTORY_TTL_MS = 60 * 60_000;
const PERF_TTL_MS = 5 * 60_000;

/**
 * Twelve Data counts each symbol in a batch as one credit.
 * Allow a short burst (free-tier ~8/min), then wait for the window to refill.
 */
const MAX_CREDITS_PER_MINUTE = 8;
let creditWindowStartedAt = 0;
let creditsUsedInWindow = 0;
let requestQueue: Promise<void> = Promise.resolve();

function getEnv() {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim() ?? "";
  const baseUrl = (
    process.env.TWELVE_DATA_API_BASE_URL || "https://api.twelvedata.com"
  ).replace(/\/$/, "");
  return { apiKey, baseUrl, configured: apiKey.length > 0 };
}

function getCached<T>(key: string): T | null {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCache<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { expires: Date.now() + ttlMs, value });
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function throttle(credits = 1): Promise<void> {
  const cost = Math.max(1, credits);
  requestQueue = requestQueue.then(async () => {
    const now = Date.now();
    if (now - creditWindowStartedAt >= 60_000) {
      creditWindowStartedAt = now;
      creditsUsedInWindow = 0;
    }
    if (creditsUsedInWindow + cost > MAX_CREDITS_PER_MINUTE) {
      const wait = Math.max(
        0,
        60_000 - (now - creditWindowStartedAt) + 250,
      );
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      creditWindowStartedAt = Date.now();
      creditsUsedInWindow = 0;
    }
    creditsUsedInWindow += cost;
  });
  await requestQueue;
}

type TdFetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  rateLimited: boolean;
  error?: string;
};

async function tdFetch<T>(
  pathWithQuery: string,
): Promise<TdFetchResult<T>> {
  const { apiKey, baseUrl, configured } = getEnv();
  if (!configured) {
    return {
      ok: false,
      status: 0,
      data: null,
      rateLimited: false,
      error: "Twelve Data API key not configured",
    };
  }

  const symbolParam = pathWithQuery.match(/[?&]symbol=([^&]+)/)?.[1];
  const creditCost = symbolParam
    ? Math.max(1, decodeURIComponent(symbolParam).split(",").filter(Boolean).length)
    : 1;
  await throttle(creditCost);

  const sep = pathWithQuery.includes("?") ? "&" : "?";
  const url = `${baseUrl}${pathWithQuery}${sep}apikey=${encodeURIComponent(apiKey)}`;

  try {
    // Never let Next.js Data Cache store 429/error bodies — that locks Unavailable.
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (res.status === 429) {
      return {
        ok: false,
        status: 429,
        data: null,
        rateLimited: true,
        error: "Twelve Data rate limit reached",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: null,
        rateLimited: false,
        error: `Twelve Data HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as T & {
      status?: string;
      code?: number;
      message?: string;
    };

    // Twelve Data returns 200 with status:"error" for many failures
    if (
      data &&
      typeof data === "object" &&
      "status" in data &&
      (data as { status?: string }).status === "error"
    ) {
      const code = (data as { code?: number }).code;
      const message =
        (data as { message?: string }).message || "Twelve Data error";
      return {
        ok: false,
        status: code ?? 400,
        data: null,
        rateLimited: code === 429,
        error: message,
      };
    }

    return { ok: true, status: res.status, data: data as T, rateLimited: false };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      rateLimited: false,
      error: e instanceof Error ? e.message : "Twelve Data request failed",
    };
  }
}

export interface StockQuote {
  symbol: string;
  priceUsd: number | null;
  change24hPercent: number | null;
  previousClose: number | null;
  name?: string;
}

export interface DailyBar {
  date: string;
  close: number;
}

export interface StockHistory {
  symbol: string;
  bars: DailyBar[];
}

type QuotePayload = {
  symbol?: string;
  name?: string;
  close?: string | number;
  previous_close?: string | number;
  percent_change?: string | number;
  status?: string;
  message?: string;
  code?: number;
};

type TimeSeriesPayload = {
  meta?: { symbol?: string };
  values?: { datetime?: string; close?: string | number }[];
  status?: string;
  message?: string;
  code?: number;
};

function parseQuote(symbol: string, raw: QuotePayload): StockQuote {
  return {
    symbol,
    name: raw.name,
    priceUsd: asFiniteNumber(raw.close),
    previousClose: asFiniteNumber(raw.previous_close),
    change24hPercent: asFiniteNumber(raw.percent_change),
  };
}

function parseBars(raw: TimeSeriesPayload): DailyBar[] {
  const values = Array.isArray(raw.values) ? raw.values : [];
  const bars: DailyBar[] = [];
  for (const row of values) {
    const close = asFiniteNumber(row.close);
    const date = (row.datetime || "").slice(0, 10);
    if (!date || close == null) continue;
    bars.push({ date, close });
  }
  // Newest first
  bars.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return bars;
}

/**
 * Most recent trading-day close on or before target YYYY-MM-DD (bars newest-first).
 * Skips weekends/holidays by walking back to the prior session — never uses a
 * newer bar, and never fabricates a close when history does not reach the target.
 */
export function closeOnOrBefore(
  bars: DailyBar[],
  targetDate: string,
): number | null {
  for (const bar of bars) {
    if (bar.date <= targetDate) return bar.close;
  }
  return null;
}

export function shiftCalendarDays(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * 7D / 30D % change from Twelve Data daily closes.
 * Lookback is calendar days from the latest session; the comparison close is
 * the last trading day on or before that date (weekend/holiday safe).
 */
export function performanceFromDailyCloses(bars: DailyBar[]): {
  latestClose: number | null;
  change7dPercent: number | null;
  change30dPercent: number | null;
} {
  if (!bars.length) {
    return {
      latestClose: null,
      change7dPercent: null,
      change30dPercent: null,
    };
  }
  const latest = bars[0];
  const close7 = closeOnOrBefore(bars, shiftCalendarDays(latest.date, -7));
  const close30 = closeOnOrBefore(bars, shiftCalendarDays(latest.date, -30));

  const pct = (now: number, then: number | null) => {
    if (then == null || then === 0) return null;
    return ((now - then) / then) * 100;
  };

  return {
    latestClose: latest.close,
    change7dPercent: pct(latest.close, close7),
    change30dPercent: pct(latest.close, close30),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Live quotes for equity/ETF symbols (server-only).
 */
export async function fetchStockQuotes(
  symbols: string[],
): Promise<{
  bySymbol: Record<string, StockQuote>;
  availability: CoinGeckoAvailability;
  reason?: string;
}> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const bySymbol: Record<string, StockQuote> = {};
  if (unique.length === 0) {
    return { bySymbol, availability: "live" };
  }

  if (!getEnv().configured) {
    return {
      bySymbol,
      availability: "unconfigured",
      reason: "Twelve Data API key not configured",
    };
  }

  let rateLimited = false;
  let lastError: string | undefined;

  // Small batches — each symbol costs one credit; keep headroom for history.
  for (const group of chunk(unique, 4)) {
    const cacheKey = `td:quote:${group.slice().sort().join(",")}`;
    const cached = getCached<Record<string, StockQuote>>(cacheKey);
    if (cached) {
      Object.assign(bySymbol, cached);
      continue;
    }

    const path = `/quote?symbol=${encodeURIComponent(group.join(","))}`;
    const result = await tdFetch<QuotePayload | Record<string, QuotePayload>>(
      path,
    );

    if (!result.ok || !result.data) {
      rateLimited = rateLimited || result.rateLimited;
      lastError = result.error;
      if (process.env.NODE_ENV === "development") {
        console.error("[TwelveData][quote]", {
          symbols: group,
          status: result.status,
          error: result.error,
        });
      }
      continue;
    }

    const slice: Record<string, StockQuote> = {};
    if (group.length === 1) {
      const q = parseQuote(group[0], result.data as QuotePayload);
      slice[q.symbol] = q;
    } else {
      const map = result.data as Record<string, QuotePayload>;
      for (const sym of group) {
        const raw = map[sym];
        if (!raw || raw.status === "error") continue;
        slice[sym] = parseQuote(sym, raw);
      }
    }

    setCache(cacheKey, slice, QUOTE_TTL_MS);
    for (const [sym, q] of Object.entries(slice)) {
      setCache(`td:quote:1:${sym}`, { [sym]: q }, QUOTE_TTL_MS);
    }
    Object.assign(bySymbol, slice);
  }

  const availability: CoinGeckoAvailability =
    Object.keys(bySymbol).length > 0
      ? "live"
      : rateLimited
        ? "rate-limited"
        : lastError?.includes("not configured")
          ? "unconfigured"
          : "error";

  return { bySymbol, availability, reason: lastError };
}

/**
 * Daily OHLCV history (closes) for equity/ETF symbols (server-only).
 */
export async function fetchStockDailyHistory(
  symbols: string[],
  outputsize = 40,
): Promise<{
  bySymbol: Record<string, StockHistory>;
  availability: CoinGeckoAvailability;
  reason?: string;
}> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const bySymbol: Record<string, StockHistory> = {};
  if (unique.length === 0) {
    return { bySymbol, availability: "live" };
  }

  if (!getEnv().configured) {
    return {
      bySymbol,
      availability: "unconfigured",
      reason: "Twelve Data API key not configured",
    };
  }

  let rateLimited = false;
  let lastError: string | undefined;

  // Resolve from per-symbol cache first so overlapping portfolios share bars.
  const missing: string[] = [];
  for (const sym of unique) {
    const cached = getCached<StockHistory>(`td:hist:1:${outputsize}:${sym}`);
    if (cached) bySymbol[sym] = cached;
    else missing.push(sym);
  }

  for (const group of chunk(missing, 4)) {
    const path =
      `/time_series?symbol=${encodeURIComponent(group.join(","))}` +
      `&interval=1day&outputsize=${outputsize}&order=DESC`;
    const result = await tdFetch<
      TimeSeriesPayload | Record<string, TimeSeriesPayload>
    >(path);

    if (!result.ok || !result.data) {
      rateLimited = rateLimited || result.rateLimited;
      lastError = result.error;
      if (process.env.NODE_ENV === "development") {
        console.error("[TwelveData][history]", {
          symbols: group,
          status: result.status,
          error: result.error,
        });
      }
      continue;
    }

    const slice: Record<string, StockHistory> = {};
    if (group.length === 1) {
      const bars = parseBars(result.data as TimeSeriesPayload);
      slice[group[0]] = { symbol: group[0], bars };
    } else {
      const map = result.data as Record<string, TimeSeriesPayload>;
      for (const sym of group) {
        const raw = map[sym];
        if (!raw || raw.status === "error") continue;
        slice[sym] = { symbol: sym, bars: parseBars(raw) };
      }
    }

    for (const [sym, hist] of Object.entries(slice)) {
      setCache(`td:hist:1:${outputsize}:${sym}`, hist, HISTORY_TTL_MS);
      bySymbol[sym] = hist;
    }
  }

  const availability: CoinGeckoAvailability =
    Object.keys(bySymbol).length > 0
      ? "live"
      : rateLimited
        ? "rate-limited"
        : lastError?.includes("not configured")
          ? "unconfigured"
          : "error";

  return { bySymbol, availability, reason: lastError };
}

function unavailableStock(ticker: string): AssetPerformancePoint {
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
 * Stock/ETF performance via Twelve Data daily historical closes.
 * Price, 7D, and 30D all derive from daily bars so weekend lookbacks stay
 * consistent and quote batches cannot starve the history credit budget.
 */
export async function fetchStockAssetPerformance(
  assetIds: string[],
): Promise<AssetPerformanceResult> {
  const { mapped, unmapped } = resolveTwelveDataSymbols(assetIds);
  const byTicker: Record<string, AssetPerformancePoint> = {};

  for (const ticker of unmapped) {
    byTicker[ticker] = unavailableStock(ticker);
  }

  if (mapped.length === 0) {
    return {
      byTicker,
      availability: "live",
      fetchedAt: new Date().toISOString(),
      stale: false,
      reason:
        unmapped.length > 0
          ? "No Twelve Data–backed equities in request"
          : undefined,
    };
  }

  const symbols = mapped.map((m) => m.symbol);
  const cacheKey = `td:perf:${symbols.slice().sort().join(",")}`;
  const cached = getCached<Record<string, AssetPerformancePoint>>(cacheKey);
  if (cached) {
    return {
      byTicker: { ...byTicker, ...cached },
      availability: "live",
      fetchedAt: new Date().toISOString(),
      stale: false,
    };
  }

  // Daily history is the sole source for stock/ETF 7D and 30D returns.
  const history = await fetchStockDailyHistory(symbols, 45);

  const liveSlice: Record<string, AssetPerformancePoint> = {};

  for (const { ticker, symbol } of mapped) {
    const hist = history.bySymbol[symbol];
    const fromCloses = performanceFromDailyCloses(hist?.bars ?? []);

    const priceUsd = fromCloses.latestClose;
    const change7dPercent = fromCloses.change7dPercent;
    const change30dPercent = fromCloses.change30dPercent;

    const hasAny =
      priceUsd != null ||
      change7dPercent != null ||
      change30dPercent != null;

    liveSlice[ticker] = {
      ticker,
      coingeckoId: null,
      priceUsd,
      change24hPercent: null,
      change7dPercent,
      change30dPercent,
      status: hasAny ? "live" : "unavailable",
    };
  }

  const anyLive = Object.values(liveSlice).some((p) => p.status === "live");
  const availability: CoinGeckoAvailability = anyLive
    ? "live"
    : history.availability;

  if (anyLive) {
    setCache(cacheKey, liveSlice, PERF_TTL_MS);
  }

  return {
    byTicker: { ...byTicker, ...liveSlice },
    availability,
    fetchedAt: new Date().toISOString(),
    stale: availability !== "live",
    reason: history.reason,
  };
}
