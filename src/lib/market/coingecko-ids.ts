/**
 * Central ticker → CoinGecko coin id mapping for INDEXLA catalog assets.
 * Tickers without a CoinGecko id are unsupported here (tokenized stocks /
 * most commodities) and must surface as Unavailable — never fabricate.
 */

export const COINGECKO_ID_BY_TICKER: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  xrp: "ripple",
  bnb: "binancecoin",
  trx: "tron",
  hype: "hyperliquid",
  ada: "cardano",
  avax: "avalanche-2",
  sui: "sui",
  mnt: "mantle",
  pol: "polygon-ecosystem-token",
  arb: "arbitrum",
  op: "optimism",
  strk: "starknet",
  imx: "immutable-x",
  zk: "zksync",
  metis: "metis-token",
  tao: "bittensor",
  near: "near",
  icp: "internet-computer",
  render: "render-token",
  fet: "fetch-ai",
  virtual: "virtual-protocol",
  grt: "the-graph",
  theta: "theta-token",
  ar: "arweave",
  akt: "akash-network",
  fil: "filecoin",
  hnt: "helium",
  iotx: "iotex",
  grass: "grass",
  geod: "geodnet",
  iota: "iota",
  jasmy: "jasmycoin",
  sand: "the-sandbox",
  gala: "gala",
  mana: "decentraland",
  ape: "apecoin",
  axs: "axie-infinity",
  beam: "beam-2",
  ron: "ronin",
  wemix: "wemix-token",
  enj: "enjincoin",
  vvv: "venice-token",
  kite: "kite",
  trac: "origintrail",
  awe: "awe-network",
  arc: "ai-rig-complex",
  link: "chainlink",
  xlm: "stellar",
  ondo: "ondo-finance",
  cfg: "centrifuge",
  mpl: "maple",
  polyx: "polymesh",
  plume: "plume",
  uni: "uniswap",
  aave: "aave",
  ena: "ethena",
  jup: "jupiter-exchange-solana",
  pendle: "pendle",
  morpho: "morpho",
  crv: "curve-dao-token",
  xmr: "monero",
  zec: "zcash",
  dash: "dash",
  dcr: "decred",
  bdx: "beldex",
  scrt: "secret",
  rose: "oasis-network",
  aleo: "aleo",
  nym: "nym",
  zano: "zano",
  pyth: "pyth-network",
  band: "band-protocol",
  trb: "tellor",
  uma: "uma",
  red: "redstone-oracles",
  api3: "api3",
  dia: "dia-data",
  xyo: "xyo-network",
  win: "wink",
  peaq: "peaq-2",
  auki: "auki-labs",
  paxg: "pax-gold",
  inj: "injective-protocol",
  aero: "aerodrome-finance",
  ath: "aethir",
  wif: "dogwifcoin",
  pepe: "pepe",
  doge: "dogecoin",
  shib: "shiba-inu",
};

/** Normalize catalog asset ids / tickers to lowercase lookup keys. */
export function normalizeTickerKey(assetIdOrTicker: string): string {
  return assetIdOrTicker.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getCoinGeckoIdForTicker(
  assetIdOrTicker: string,
): string | null {
  const key = normalizeTickerKey(assetIdOrTicker);
  return COINGECKO_ID_BY_TICKER[key] ?? null;
}

export function resolveCoinGeckoIds(
  assetIds: string[],
): {
  mapped: { ticker: string; coingeckoId: string }[];
  unmapped: string[];
} {
  const mapped: { ticker: string; coingeckoId: string }[] = [];
  const unmapped: string[] = [];
  const seen = new Set<string>();

  for (const raw of assetIds) {
    const ticker = normalizeTickerKey(raw);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    const coingeckoId = getCoinGeckoIdForTicker(ticker);
    if (coingeckoId) {
      mapped.push({ ticker, coingeckoId });
    } else {
      unmapped.push(ticker);
    }
  }

  return { mapped, unmapped };
}
