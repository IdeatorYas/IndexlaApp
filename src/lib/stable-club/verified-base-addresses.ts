/**
 * Base (8453) addresses verified from official sources + live bytecode / feed checks.
 * Never invent or silently substitute. Pending items stay null / unverified.
 */
import type { Address } from "viem";

export const BASE_CHAIN_ID = 8453 as const;

/** Uniswap Permit2 CREATE2 singleton — Uniswap deployments docs + Base preinstalls. */
export const BASE_PERMIT2 = {
  address: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
  sources: [
    "https://developers.uniswap.org/docs/protocols/v4/deployments",
    "https://docs.base.org/base-chain/specs/protocol/execution/evm/preinstalls",
  ] as const,
  verifiedOnFork: true,
  notes: "Canonical Permit2; DOMAIN_SEPARATOR readable on Base mainnet.",
};

/**
 * Safe{Wallet} stack — Base genesis preinstalls (official Base docs).
 * Prefer SafeL2 singleton for user/gov Safes on Base.
 */
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
  /** Safe ProxyFactory v1.3.0 — bytecode present; proxyCreationCode() succeeds on Base. */
  proxyFactoryV130: {
    address: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2" as Address,
    source: "https://github.com/safe-global/safe-deployments (v1.3.0 proxy_factory)",
    verifiedOnFork: true,
  },
} as const;

export type OracleFeedRecord = {
  pair: string;
  /** Token this feed prices for INDEXLA (may be wrapped asset using BTC/USD). */
  indexesToken: Address | null;
  address: Address;
  decimals: 8;
  descriptionOnChain: string;
  sources: readonly string[];
  verifiedOnFork: true;
  /**
   * true only when address matches an official Chainlink docs / data.chain.link listing
   * that we could confirm in this session. On-chain description alone is not enough for launch.
   */
  officialDocsConfirmed: boolean;
  notes: string;
};

/**
 * Chainlink-compatible AggregatorV3 proxies probed on Base.
 * USDC: on-chain "USDC / USD" + ecosystem listing (Sumer docs). Cross-check data.chain.link before launch.
 * BTC: on-chain "BTC / USD" used by Aave V3 Base for cbBTC. Official Chainlink HTML registry scrape blocked —
 * remains pending docs confirmation (not silent substitution).
 */
export const BASE_ORACLE_FEEDS = {
  ethUsd: {
    pair: "ETH / USD",
    indexesToken: "0x4200000000000000000000000000000000000006" as Address,
    address: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70" as Address,
    decimals: 8,
    descriptionOnChain: "ETH / USD",
    sources: [
      "https://docs.chain.link/data-feeds/price-feeds/addresses",
      "on-chain AggregatorV3 description + latestRoundData",
    ],
    verifiedOnFork: true,
    officialDocsConfirmed: true,
    notes: "Widely published Base ETH/USD proxy; live rounds verified.",
  },
  usdcUsd: {
    pair: "USDC / USD",
    indexesToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    address: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B" as Address,
    decimals: 8,
    descriptionOnChain: "USDC / USD",
    sources: [
      "https://docs.sumer.money/developers/price-feeds/chainlink-price-feeds-on-base",
      "on-chain AggregatorV3 description + latestRoundData",
      "https://data.chain.link/feeds/base/base/usdc-usd (confirm address in UI before launch)",
    ],
    verifiedOnFork: true,
    officialDocsConfirmed: false,
    notes:
      "Old candidate 0x…Be50fE has empty bytecode — do not use. This proxy returns USDC / USD. Confirm against data.chain.link before mainnet.",
  },
  btcUsd: {
    pair: "BTC / USD",
    indexesToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    address: "0x3A932b286715abc4A86a4ACAF68A6cdD89E0d446" as Address,
    decimals: 8,
    descriptionOnChain: "BTC / USD",
    sources: [
      "https://github.com/bgd-labs/aave-address-book (AaveV3Base ASSETS.cbBTC.ORACLE)",
      "on-chain AggregatorV3 description + latestRoundData",
      "https://data.chain.link/feeds/base/base/btc-usd (confirm address in UI before launch)",
    ],
    verifiedOnFork: true,
    officialDocsConfirmed: false,
    notes:
      "Prices cbBTC via BTC/USD. Official Chainlink docs address must be human-confirmed before mainnet; do not treat Aave listing alone as final.",
  },
} as const satisfies Record<string, OracleFeedRecord>;

/** Rejected empty-bytecode candidates (do not use). */
export const REJECTED_ORACLE_CANDIDATES = [
  "0x7e860098f58bbfC8648a4311B374b1D669Be50Fe",
  "0x64C911996D3c6AC71F9Bda319F22AD0632DD249B",
  "0x07DA0e77e10873DEfA36220b89218952090bD270",
] as const;

export function isCanonicalBasePermit2(address: string): boolean {
  return address.toLowerCase() === BASE_PERMIT2.address.toLowerCase();
}

export function oraclesPendingOfficialDocsConfirmation(): string[] {
  return Object.values(BASE_ORACLE_FEEDS)
    .filter((f) => !f.officialDocsConfirmed)
    .map((f) => f.pair);
}
