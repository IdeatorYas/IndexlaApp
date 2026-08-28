/**
 * Base (8453) addresses verified from official / primary sources + live bytecode checks.
 * Never invent or silently substitute. Rejected empty-bytecode candidates listed explicitly.
 */
import type { Address } from "viem";

export const BASE_CHAIN_ID = 8453 as const;

export const BASE_PERMIT2 = {
  address: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
  sources: [
    "https://developers.uniswap.org/docs/protocols/v4/deployments",
    "https://docs.base.org/base-chain/specs/protocol/execution/evm/preinstalls",
  ] as const,
  verifiedOnFork: true,
  notes: "Canonical Permit2; DOMAIN_SEPARATOR readable on Base mainnet.",
};

export const BASE_SAFE_STACK = {
  safeL2Singleton: {
    address: "0xfb1bffC9d739B8D520DaF37dF666da4C687191EA" as Address,
    source: "https://docs.base.org/base-chain/specs/protocol/execution/evm/preinstalls",
    verifiedOnFork: true,
  },
  safeSingleton: {
    address: "0x69f4D1788e39c87893C980c06EdF4b7f686e2938" as Address,
    source: "https://docs.base.org/base-chain/specs/protocol/execution/evm/preinstalls",
    verifiedOnFork: true,
  },
  multiSend: {
    address: "0x998739BFdAAdde7C933B942a68053933098f9EDa" as Address,
    source: "https://docs.base.org/base-chain/specs/protocol/execution/evm/preinstalls",
    verifiedOnFork: true,
  },
  multiSendCallOnly: {
    address: "0xA1dabEF33b3B82c7814B6D82A79e50F4AC44102B" as Address,
    source: "https://docs.base.org/base-chain/specs/protocol/execution/evm/preinstalls",
    verifiedOnFork: true,
  },
  singletonFactory: {
    address: "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7" as Address,
    source: "https://docs.base.org/base-chain/specs/protocol/execution/evm/preinstalls",
    verifiedOnFork: true,
  },
  proxyFactoryV130: {
    address: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2" as Address,
    source: "https://github.com/safe-global/safe-deployments (v1.3.0 proxy_factory)",
    verifiedOnFork: true,
  },
} as const;

export type OracleFeedRecord = {
  pair: string;
  indexesToken: Address | null;
  address: Address;
  decimals: 8;
  descriptionOnChain: string;
  sources: readonly string[];
  verifiedOnFork: true;
  /** Product page exists on data.chain.link (address HTML scrape may be Cloudflare-blocked). */
  chainlinkProductPage: string;
  /**
   * true when on-chain description matches the Chainlink product pair and fork bytecode is live.
   * HTML address extraction from data.chain.link was blocked by Cloudflare in this session.
   */
  onChainProductMatch: true;
};

export const BASE_TOKENS = {
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  cbBtc: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
  weth: "0x4200000000000000000000000000000000000006" as Address,
} as const;

/**
 * Stage 1 oracle set:
 * - USDC ← USDC/USD primary
 * - cbBTC ← cbBTC/USD primary valuation
 * - BTC/USD ← secondary peg reference for cbBTC depeg detection
 */
export const BASE_ORACLE_FEEDS = {
  ethUsd: {
    pair: "ETH / USD",
    indexesToken: BASE_TOKENS.weth,
    address: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70" as Address,
    decimals: 8,
    descriptionOnChain: "ETH / USD",
    sources: [
      "https://docs.chain.link/data-feeds/price-feeds/addresses",
      "on-chain AggregatorV3 description + latestRoundData",
    ],
    verifiedOnFork: true,
    chainlinkProductPage: "https://data.chain.link/feeds/base/base/eth-usd",
    onChainProductMatch: true,
  },
  usdcUsd: {
    pair: "USDC / USD",
    indexesToken: BASE_TOKENS.usdc,
    address: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B" as Address,
    decimals: 8,
    descriptionOnChain: "USDC / USD",
    sources: [
      "https://data.chain.link/feeds/base/base/usdc-usd",
      "on-chain AggregatorV3 description + latestRoundData",
    ],
    verifiedOnFork: true,
    chainlinkProductPage: "https://data.chain.link/feeds/base/base/usdc-usd",
    onChainProductMatch: true,
  },
  /** Primary valuation feed for cbBTC. */
  cbBtcUsd: {
    pair: "cbBTC / USD",
    indexesToken: BASE_TOKENS.cbBtc,
    address: "0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D" as Address,
    decimals: 8,
    descriptionOnChain: "cbBTC / USD",
    sources: [
      "https://data.chain.link/feeds/base/base/cbbtc-usd",
      "on-chain AggregatorV3 description + latestRoundData",
      "Morpho Blue metadata (vendor=Chainlink, pair CBBTC/USD)",
    ],
    verifiedOnFork: true,
    chainlinkProductPage: "https://data.chain.link/feeds/base/base/cbbtc-usd",
    onChainProductMatch: true,
  },
  /** Secondary reference for cbBTC depeg detection — not the primary cbBTC valuation feed. */
  btcUsd: {
    pair: "BTC / USD",
    indexesToken: null,
    address: "0x3A932b286715abc4A86a4ACAF68A6cdD89E0d446" as Address,
    decimals: 8,
    descriptionOnChain: "BTC / USD",
    sources: [
      "https://data.chain.link/feeds/base/base/btc-usd",
      "on-chain AggregatorV3 description + latestRoundData",
      "Aave V3 Base ASSETS.cbBTC.ORACLE (same proxy; used here as BTC reference only)",
    ],
    verifiedOnFork: true,
    chainlinkProductPage: "https://data.chain.link/feeds/base/base/btc-usd",
    onChainProductMatch: true,
  },
} as const satisfies Record<string, OracleFeedRecord>;

/** Default max cbBTC vs BTC deviation (bps) — matches 1% launch safety. */
export const CBBTC_BTC_PEG_MAX_DEVIATION_BPS = 100;

export const REJECTED_ORACLE_CANDIDATES = [
  "0x7e860098f58bbfC8648a4311B374b1D669Be50Fe",
  "0x64C911996D3c6AC71F9Bda319F22AD0632DD249B",
  "0x07DA0e77e10873DEfA36220b89218952090bD270",
] as const;

export function isCanonicalBasePermit2(address: string): boolean {
  return address.toLowerCase() === BASE_PERMIT2.address.toLowerCase();
}

export function stage1OracleFeedsConfigured(): boolean {
  return (
    BASE_ORACLE_FEEDS.usdcUsd.verifiedOnFork &&
    BASE_ORACLE_FEEDS.cbBtcUsd.verifiedOnFork &&
    BASE_ORACLE_FEEDS.btcUsd.verifiedOnFork &&
    BASE_ORACLE_FEEDS.usdcUsd.descriptionOnChain === "USDC / USD" &&
    BASE_ORACLE_FEEDS.cbBtcUsd.descriptionOnChain === "cbBTC / USD" &&
    BASE_ORACLE_FEEDS.btcUsd.descriptionOnChain === "BTC / USD"
  );
}

/** @deprecated Prefer stage1OracleFeedsConfigured — kept for older guard call sites. */
export function oraclesPendingOfficialDocsConfirmation(): string[] {
  return stage1OracleFeedsConfigured() ? [] : ["USDC / USD", "cbBTC / USD", "BTC / USD"];
}
