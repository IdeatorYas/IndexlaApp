/**
 * US equity / ETF symbols served by Twelve Data (not CoinGecko).
 * Crypto stays on CoinGecko via coingecko-ids.ts.
 */

import { normalizeTickerKey } from "@/lib/market/coingecko-ids";

/** Canonical Twelve Data symbol by normalized ticker key. */
export const TWELVE_DATA_SYMBOL_BY_TICKER: Record<string, string> = {
  aapl: "AAPL",
  msft: "MSFT",
  googl: "GOOGL",
  amzn: "AMZN",
  meta: "META",
  nvda: "NVDA",
  tsla: "TSLA",
  pltr: "PLTR",
  crm: "CRM",
  now: "NOW",
  snow: "SNOW",
  amd: "AMD",
  tsm: "TSM",
  avgo: "AVGO",
  asml: "ASML",
  arm: "ARM",
  mu: "MU",
  mrvl: "MRVL",
  coin: "COIN",
  mstr: "MSTR",
  hood: "HOOD",
  crcl: "CRCL",
  mara: "MARA",
  riot: "RIOT",
  iren: "IREN",
  rklb: "RKLB",
  asts: "ASTS",
  ionq: "IONQ",
  rgti: "RGTI",
  qqq: "QQQ",
  xlk: "XLK",
  smh: "SMH",
  soxx: "SOXX",
  botz: "BOTZ",
  spy: "SPY",
  isrg: "ISRG",
  abb: "ABB",
  rok: "ROK",
  sym: "SYM",
  blk: "BLK",
  jpm: "JPM",
  ndaq: "NDAQ",
  ice: "ICE",
  rblx: "RBLX",
  u: "U",
  ttwo: "TTWO",
  ea: "EA",
  eqix: "EQIX",
  vrt: "VRT",
  anet: "ANET",
  amt: "AMT",
  v: "V",
  ma: "MA",
  pypl: "PYPL",
  xyz: "XYZ",
};

export function getTwelveDataSymbol(
  assetIdOrTicker: string,
): string | null {
  const key = normalizeTickerKey(assetIdOrTicker);
  return TWELVE_DATA_SYMBOL_BY_TICKER[key] ?? null;
}

export function resolveTwelveDataSymbols(assetIds: string[]): {
  mapped: { ticker: string; symbol: string }[];
  unmapped: string[];
} {
  const mapped: { ticker: string; symbol: string }[] = [];
  const unmapped: string[] = [];
  const seen = new Set<string>();

  for (const raw of assetIds) {
    const ticker = normalizeTickerKey(raw);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    const symbol = getTwelveDataSymbol(ticker);
    if (symbol) mapped.push({ ticker, symbol });
    else unmapped.push(ticker);
  }

  return { mapped, unmapped };
}
