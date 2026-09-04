/**
 * Upcoming Stable Club demo strategies — display-only.
 * Never wire to wallet, approvals, deposits, or contracts.
 */

export type DemoStrategyRisk = "lower" | "medium" | "higher";

export type DemoStrategyPool = {
  pair: string;
  platform: string;
  chain: string;
  indicativeApy: string;
  poolFee: string;
  liveDataUrl?: string;
  liveDataLabel?: string;
};

export type DemoStrategyProduct = {
  id: string;
  title: string;
  riskLabel: string;
  risk: DemoStrategyRisk;
  badge: "UPCOMING · DEMO ONLY · NOT ACTIVE";
  pools: readonly DemoStrategyPool[];
};

export const STABLE_CLUB_DEMO_PRODUCTS: readonly DemoStrategyProduct[] = [
  {
    id: "stable-to-stable",
    title: "Stable → Stable",
    riskLabel: "Lower Risk",
    risk: "lower",
    badge: "UPCOMING · DEMO ONLY · NOT ACTIVE",
    pools: [
      {
        pair: "RLUSD/USDC",
        platform: "Curve",
        chain: "Ethereum",
        indicativeApy: "5%–8%",
        poolFee: "Dynamic",
        liveDataUrl: "https://defillama.com/yields/pool/e91e23af-9099-45d9-8ba5-ea5b4638e453",
        liveDataLabel: "Live Data",
      },
      {
        pair: "PYUSD/USDC",
        platform: "Curve",
        chain: "Ethereum",
        indicativeApy: "3%–6%",
        poolFee: "Dynamic",
      },
      {
        pair: "USDC/crvUSD",
        platform: "Curve",
        chain: "Ethereum",
        indicativeApy: "3%–5%",
        poolFee: "Dynamic",
      },
      {
        pair: "USDT/crvUSD",
        platform: "Curve",
        chain: "Ethereum",
        indicativeApy: "3%–5%",
        poolFee: "Dynamic",
      },
      {
        pair: "frxUSD/crvUSD",
        platform: "Curve/Convex",
        chain: "Ethereum",
        indicativeApy: "4%–6%",
        poolFee: "Dynamic",
      },
    ],
  },
  {
    id: "stable-to-eth-btc",
    title: "Stable → ETH/BTC",
    riskLabel: "Medium Risk",
    risk: "medium",
    badge: "UPCOMING · DEMO ONLY · NOT ACTIVE",
    pools: [
      {
        pair: "USDC/cbBTC CL100",
        platform: "Aerodrome",
        chain: "Base",
        indicativeApy: "25%–70%",
        poolFee: "Dynamic, approximately 0.02%",
        liveDataUrl: "https://defillama.com/yields/pool/ff82c362-dea1-4946-b3b1-92ebd5100b1e",
        liveDataLabel: "Live Breakdown",
      },
      {
        pair: "USDC/cbBTC",
        platform: "Uniswap V3",
        chain: "Base",
        indicativeApy: "20%–35%",
        poolFee: "0.05%",
      },
      {
        pair: "USDC/WETH",
        platform: "Uniswap V3",
        chain: "Ethereum",
        indicativeApy: "11%–20%",
        poolFee: "0.05%",
      },
      {
        pair: "USDT/WETH",
        platform: "Uniswap V3",
        chain: "Ethereum",
        indicativeApy: "15%–45%",
        poolFee: "0.30%",
      },
      {
        pair: "USDC/WBTC",
        platform: "Uniswap V3",
        chain: "Ethereum",
        indicativeApy: "8%–20%",
        poolFee: "0.30%",
      },
    ],
  },
  {
    id: "bitcoin-to-blue-chips",
    title: "Bitcoin → Other Blue Chips",
    riskLabel: "Higher Risk",
    risk: "higher",
    badge: "UPCOMING · DEMO ONLY · NOT ACTIVE",
    pools: [
      {
        pair: "cbBTC/WETH CL10",
        platform: "Aerodrome",
        chain: "Base",
        indicativeApy: "80%–350%",
        poolFee: "Approximately 0.05%",
      },
      {
        pair: "cbBTC/WETH CL100",
        platform: "Aerodrome",
        chain: "Base",
        indicativeApy: "10%–80%",
        poolFee: "Approximately 0.30%",
      },
      {
        pair: "cbBTC/WETH",
        platform: "Uniswap V3",
        chain: "Base",
        indicativeApy: "40%–125%",
        poolFee: "0.05%",
      },
      {
        pair: "cbBTC/WETH",
        platform: "PancakeSwap V3",
        chain: "Base",
        indicativeApy: "20%–50%",
        poolFee: "0.01%–0.05%",
      },
      {
        pair: "cbBTC/SOL",
        platform: "Orca",
        chain: "Solana",
        indicativeApy: "70%–110%",
        poolFee: "Dynamic",
      },
    ],
  },
] as const;

export const STABLE_CLUB_DEMO_POOL_COUNT = STABLE_CLUB_DEMO_PRODUCTS.reduce(
  (n, p) => n + p.pools.length,
  0,
);

export const STABLE_CLUB_CATEGORY_COPY = {
  heading: "Three Strategies. Built for Different Risk Levels.",
  subheading:
    "From stablecoin-focused liquidity to higher-growth blue-chip pools—choose the strategy that fits you.",
  categories: [
    {
      id: "stable-to-stable",
      title: "Stable → Stable",
      riskLabel: "Lower Risk",
      body: "Put stablecoins to work across five selected stable-to-stable pools. Designed for steadier returns, lower price volatility and reduced impermanent-loss exposure.",
    },
    {
      id: "stable-to-eth-btc",
      title: "Stable → ETH/BTC",
      riskLabel: "Medium Risk",
      body: "Pair stablecoins with ETH and Bitcoin to capture higher trading fees and growth potential. Offers greater upside than stable-only pools, with increased price and impermanent-loss risk.",
    },
    {
      id: "bitcoin-to-blue-chips",
      title: "Bitcoin → Other Blue Chips",
      riskLabel: "Higher Risk",
      body: "Provide Bitcoin liquidity alongside ETH, SOL and other leading crypto assets. Built for stronger yield potential, with higher volatility and greater impermanent-loss exposure.",
    },
  ],
  activationNote:
    "When these upcoming strategies are activated, INDEXLA will automatically harvest and compound their earned fees.",
} as const;
