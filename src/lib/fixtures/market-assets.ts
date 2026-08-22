import type { MarketAsset } from "@/lib/domain/create";
import type { NetworkId } from "@/lib/domain/types";

/**
 * Future live providers for tokenized stocks / commodities / real estate.
 * Not implemented — do not invent a live source.
 */
export interface TokenizedAssetProvider {
  readonly id: "tokenized-stocks" | "tokenized-commodities" | "tokenized-real-estate";
  readonly status: "fixture-only" | "disabled";
  listAssets(): Promise<MarketAsset[]>;
}

export const ILLUSTRATIVE_TOKENIZED_ASSETS: MarketAsset[] = [
  {
    id: "fixture-aapl",
    symbol: "AAPL",
    name: "Apple (Tokenized)",
    imageUrl: null,
    priceUsd: 228.4,
    marketCapUsd: 3_400_000_000_000,
    volume24hUsd: 42_000_000,
    change24hPercent: 0.8,
    networkIds: ["ethereum", "base"],
    assetType: "tokenized-stock",
    contractAddress: null,
    supportStatus: "coming-soon",
    source: "illustrative-fixture",
    categoryIds: ["tokenized-stocks"],
    isIllustrative: true,
  },
  {
    id: "fixture-nvda",
    symbol: "NVDA",
    name: "NVIDIA (Tokenized)",
    imageUrl: null,
    priceUsd: 118.2,
    marketCapUsd: 2_900_000_000_000,
    volume24hUsd: 68_000_000,
    change24hPercent: 1.4,
    networkIds: ["ethereum"],
    assetType: "tokenized-stock",
    contractAddress: null,
    supportStatus: "coming-soon",
    source: "illustrative-fixture",
    categoryIds: ["tokenized-stocks"],
    isIllustrative: true,
  },
  {
    id: "fixture-gold",
    symbol: "XAU",
    name: "Gold (Tokenized)",
    imageUrl: null,
    priceUsd: 2_410,
    marketCapUsd: 18_000_000_000,
    volume24hUsd: 120_000_000,
    change24hPercent: -0.3,
    networkIds: ["ethereum"],
    assetType: "tokenized-commodity",
    contractAddress: null,
    supportStatus: "coming-soon",
    source: "illustrative-fixture",
    categoryIds: ["commodities"],
    isIllustrative: true,
  },
  {
    id: "fixture-reits",
    symbol: "REIT",
    name: "Real Estate Basket (Tokenized)",
    imageUrl: null,
    priceUsd: 54.1,
    marketCapUsd: 420_000_000,
    volume24hUsd: 3_200_000,
    change24hPercent: 0.2,
    networkIds: ["ethereum", "base"],
    assetType: "tokenized-real-estate",
    contractAddress: null,
    supportStatus: "coming-soon",
    source: "illustrative-fixture",
    categoryIds: ["rwa"],
    isIllustrative: true,
  },
];

const CRYPTO_FALLBACK: MarketAsset[] = [
  {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    imageUrl: null,
    priceUsd: 77_260,
    marketCapUsd: 1_550_000_000_000,
    volume24hUsd: 28_000_000_000,
    change24hPercent: 1.2,
    networkIds: ["ethereum", "base"],
    assetType: "crypto",
    contractAddress: null,
    supportStatus: "supported",
    source: "illustrative-fixture",
    categoryIds: ["layer-1"],
    isIllustrative: true,
  },
  {
    id: "ethereum",
    symbol: "eth",
    name: "Ethereum",
    imageUrl: null,
    priceUsd: 2_427,
    marketCapUsd: 292_000_000_000,
    volume24hUsd: 14_000_000_000,
    change24hPercent: 0.9,
    networkIds: ["ethereum", "base", "arbitrum"],
    assetType: "crypto",
    contractAddress: null,
    supportStatus: "supported",
    source: "illustrative-fixture",
    categoryIds: ["layer-1", "defi"],
    isIllustrative: true,
  },
  {
    id: "solana",
    symbol: "sol",
    name: "Solana",
    imageUrl: null,
    priceUsd: 94.35,
    marketCapUsd: 55_000_000_000,
    volume24hUsd: 3_200_000_000,
    change24hPercent: 2.1,
    networkIds: ["solana"],
    assetType: "crypto",
    contractAddress: null,
    supportStatus: "supported",
    source: "illustrative-fixture",
    categoryIds: ["layer-1"],
    isIllustrative: true,
  },
  {
    id: "dogwifcoin",
    symbol: "wif",
    name: "dogwifhat",
    imageUrl: null,
    priceUsd: 0.72,
    marketCapUsd: 720_000_000,
    volume24hUsd: 180_000_000,
    change24hPercent: -4.5,
    networkIds: ["solana"],
    assetType: "memecoin",
    contractAddress: null,
    supportStatus: "discovery-only",
    source: "illustrative-fixture",
    categoryIds: ["meme-token", "memecoins"],
    isIllustrative: true,
  },
  {
    id: "fetch-ai",
    symbol: "fet",
    name: "Artificial Superintelligence Alliance",
    imageUrl: null,
    priceUsd: 0.68,
    marketCapUsd: 1_600_000_000,
    volume24hUsd: 95_000_000,
    change24hPercent: 3.4,
    networkIds: ["ethereum", "base"],
    assetType: "crypto",
    contractAddress: null,
    supportStatus: "supported",
    source: "illustrative-fixture",
    categoryIds: ["artificial-intelligence", "ai"],
    isIllustrative: true,
  },
  {
    id: "render-token",
    symbol: "rndr",
    name: "Render",
    imageUrl: null,
    priceUsd: 4.1,
    marketCapUsd: 2_100_000_000,
    volume24hUsd: 110_000_000,
    change24hPercent: 1.8,
    networkIds: ["ethereum", "solana"],
    assetType: "crypto",
    contractAddress: null,
    supportStatus: "supported",
    source: "illustrative-fixture",
    categoryIds: ["artificial-intelligence", "ai", "depin"],
    isIllustrative: true,
  },
  {
    id: "aave",
    symbol: "aave",
    name: "Aave",
    imageUrl: null,
    priceUsd: 180,
    marketCapUsd: 2_700_000_000,
    volume24hUsd: 210_000_000,
    change24hPercent: -0.6,
    networkIds: ["ethereum", "base", "arbitrum"],
    assetType: "crypto",
    contractAddress: null,
    supportStatus: "supported",
    source: "illustrative-fixture",
    categoryIds: ["decentralized-finance-defi", "defi"],
    isIllustrative: true,
  },
  {
    id: "arbitrum",
    symbol: "arb",
    name: "Arbitrum",
    imageUrl: null,
    priceUsd: 0.42,
    marketCapUsd: 1_800_000_000,
    volume24hUsd: 140_000_000,
    change24hPercent: 0.4,
    networkIds: ["arbitrum"],
    assetType: "crypto",
    contractAddress: null,
    supportStatus: "supported",
    source: "illustrative-fixture",
    categoryIds: ["layer-2"],
    isIllustrative: true,
  },
];

export const ILLUSTRATIVE_MARKET_CATALOG: MarketAsset[] = [
  ...CRYPTO_FALLBACK,
  ...ILLUSTRATIVE_TOKENIZED_ASSETS,
];

export const tokenizedStocksProvider: TokenizedAssetProvider = {
  id: "tokenized-stocks",
  status: "fixture-only",
  async listAssets() {
    return ILLUSTRATIVE_TOKENIZED_ASSETS.filter(
      (a) => a.assetType === "tokenized-stock",
    );
  },
};

export const tokenizedCommoditiesProvider: TokenizedAssetProvider = {
  id: "tokenized-commodities",
  status: "fixture-only",
  async listAssets() {
    return ILLUSTRATIVE_TOKENIZED_ASSETS.filter(
      (a) => a.assetType === "tokenized-commodity",
    );
  },
};

export const tokenizedRealEstateProvider: TokenizedAssetProvider = {
  id: "tokenized-real-estate",
  status: "fixture-only",
  async listAssets() {
    return ILLUSTRATIVE_TOKENIZED_ASSETS.filter(
      (a) => a.assetType === "tokenized-real-estate",
    );
  },
};

export function supportStatusForNetworks(
  networkIds: NetworkId[],
): MarketAsset["supportStatus"] {
  if (networkIds.includes("robinhood") || networkIds.includes("sui")) {
    return "coming-soon";
  }
  if (networkIds.length === 0) return "unsupported-network";
  return "supported";
}
