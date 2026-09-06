"use client";

import {
  formatApyDisplay,
  formatApyPart,
  formatOfficialPoolFee,
  formatTvlUsd,
  protocolDisplayName,
  useStableClubPoolApyMap,
} from "@/components/stable-club/useStableClubPoolApy";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { STAGE1_FIVE_POOL_BETA_POOL_IDS } from "@/lib/stable-club/stage1-launch";

const SHORT_DESC: Record<string, string> = {
  "USDC-cbBTC-AERO-CL100": "Legacy Aerodrome CL100 USDC/cbBTC liquidity.",
  "USDC-cbBTC-UNI-005": "Uniswap V3 0.05% USDC/cbBTC concentrated liquidity.",
  "cbBTC-WETH-AERO-CL10": "Aerodrome CL10 cbBTC/WETH — tighter range, higher IL.",
  "cbBTC-WETH-AERO-CL100": "Legacy Aerodrome CL100 cbBTC/WETH liquidity.",
  "cbBTC-WETH-UNI-005": "Uniswap V3 0.05% cbBTC/WETH concentrated liquidity.",
};

/**
 * Available Pools — the five legs of the single Stable Club strategy (not separate products).
 */
export function StableClubAvailablePools() {
  const { byPoolId, loading, fetchedAt, source } = useStableClubPoolApyMap();
  const pools = OFFICIAL_STABLE_CLUB_BASE_POOLS.filter((p) =>
    (STAGE1_FIVE_POOL_BETA_POOL_IDS as readonly string[]).includes(p.id),
  );

  return (
    <section
      className="overflow-hidden rounded-2xl border border-[#c5d4e8] bg-gradient-to-b from-white to-[#f3f7fc] shadow-[0_8px_28px_rgba(11,31,58,0.07)]"
      aria-label="Available Pools"
    >
      <header className="border-b border-[#d7e0ec] bg-[linear-gradient(120deg,#0b1f3a,#1a4f8c)] px-5 py-4 text-white sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
          Single strategy · five legs
        </p>
        <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Available Pools</h2>
        <p className="mt-1 text-xs text-white/65">
          Equal 20% allocation · Live APY via {source ?? "DefiLlama"}
          {fetchedAt ? ` · ${new Date(fetchedAt).toLocaleTimeString()}` : ""}
        </p>
      </header>

      <div className="divide-y divide-[#e8eef5]">
        {pools.map((pool) => {
          const quote = byPoolId[pool.id];
          const pair = `${pool.tokenA.symbol === "WBTC" ? "cbBTC" : pool.tokenA.symbol}/${
            pool.tokenB.symbol === "WBTC" ? "cbBTC" : pool.tokenB.symbol
          }`;
          return (
            <article key={pool.id} className="px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0b1f3a] text-[10px] font-bold text-white">
                    {protocolDisplayName(pool.protocol).slice(0, 3).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-[#0b1f3a]">
                      {pair}
                      <span className="ml-2 text-xs font-semibold text-[#5b6b7c]">
                        {protocolDisplayName(pool.protocol)} · {formatOfficialPoolFee(pool)}
                      </span>
                    </h3>
                    <p className="mt-1 text-xs leading-snug text-[#5b6b7c]">
                      {SHORT_DESC[pool.id] ?? pool.label.replace(/WBTC/gi, "cbBTC")}
                    </p>
                  </div>
                </div>
                <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                  20% allocation
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                <div className="rounded-lg bg-[#f8fafc] px-2.5 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5b6b7c]">
                    Live APY
                  </dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-emerald-700">
                    {formatApyDisplay(quote, loading)}
                  </dd>
                </div>
                <div className="rounded-lg bg-[#f8fafc] px-2.5 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5b6b7c]">
                    Fee APY
                  </dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-[#0b1f3a]">
                    {formatApyPart(quote?.apyBasePercent, loading)}
                  </dd>
                </div>
                <div className="rounded-lg bg-[#f8fafc] px-2.5 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5b6b7c]">
                    Reward APY
                  </dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-[#0b1f3a]">
                    {formatApyPart(quote?.apyRewardPercent, loading)}
                  </dd>
                </div>
                <div className="rounded-lg bg-[#f8fafc] px-2.5 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5b6b7c]">
                    TVL
                  </dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-[#0b1f3a]">
                    {loading ? "…" : formatTvlUsd(quote?.tvlUsd)}
                  </dd>
                </div>
                <div className="rounded-lg bg-[#f8fafc] px-2.5 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5b6b7c]">
                    Risk
                  </dt>
                  <dd className="mt-0.5 font-semibold capitalize text-[#0b1f3a]">{pool.riskLevel}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
