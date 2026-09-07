"use client";

import { useMemo } from "react";
import {
  formatApyDisplay,
  formatApyPartAllowZero,
  formatOfficialPoolFee,
  formatTvlUsd,
  protocolDisplayName,
  useStableClubPoolApyMap,
} from "@/components/stable-club/useStableClubPoolApy";
import { DegenChainLogo } from "@/components/degen-club/DegenChainLogo";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { TOKEN_LOGO_URLS } from "@/lib/stable-club/pool-product-meta";
import { STAGE1_FIVE_POOL_BETA_POOL_IDS } from "@/lib/stable-club/stage1-launch";

function tokenSymbol(symbol: string): string {
  return symbol.toUpperCase() === "WBTC" ? "cbBTC" : symbol;
}

function TokenMark({ symbol }: { symbol: string }) {
  const key = tokenSymbol(symbol);
  const src = TOKEN_LOGO_URLS[key];
  if (!src) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0b1f3a] text-[9px] font-bold text-white">
        {key.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-7 w-7 rounded-full bg-white ring-1 ring-[#d7e0ec]" />
  );
}

function ProtocolMark({ protocol }: { protocol: "uniswap-v3" | "aerodrome-slipstream" }) {
  if (protocol === "uniswap-v3") {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#FF007A] text-[8px] font-black text-white"
        title="Uniswap V3"
      >
        U
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#3B8CFF] text-[8px] font-black text-white"
      title="Aerodrome"
    >
      A
    </span>
  );
}

/**
 * Available Pools — premium five-leg panel for the single Stable Club strategy.
 */
export function StableClubAvailablePools({
  showDepositCta = false,
  depositsEnabled = false,
  onDepositClick,
}: {
  showDepositCta?: boolean;
  depositsEnabled?: boolean;
  onDepositClick?: () => void;
} = {}) {
  const { byPoolId, loading, fetchedAt } = useStableClubPoolApyMap();
  const pools = OFFICIAL_STABLE_CLUB_BASE_POOLS.filter((p) =>
    (STAGE1_FIVE_POOL_BETA_POOL_IDS as readonly string[]).includes(p.id),
  );

  const blendedApy = useMemo(() => {
    const vals = pools
      .map((p) => byPoolId[p.id])
      .filter((q) => q?.status === "available" && q.apyPercent != null)
      .map((q) => q!.apyPercent as number);
    if (loading) return "…";
    if (!vals.length) return "Unavailable";
    return `${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)}%`;
  }, [byPoolId, loading, pools]);

  return (
    <section
      className="overflow-hidden rounded-2xl border border-[#b8cce3] bg-white shadow-[0_12px_40px_rgba(11,31,58,0.10)]"
      aria-label="Available Pools"
    >
      <header className="relative overflow-hidden bg-[linear-gradient(135deg,#04101f_0%,#0b1f3a_45%,#0052FF_160%)] px-5 py-6 text-white sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#0052FF]/25 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl bg-white/10 p-2.5 ring-1 ring-white/20 backdrop-blur-sm">
              <DegenChainLogo chain="base" size={56} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-extrabold tracking-[-0.03em] sm:text-2xl">
                  TOP BASE CHAIN LPs
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300 ring-1 ring-emerald-400/30">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  LIVE BETA
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-white/75">
                One USDC deposit · Five LP positions · 20% each
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-left ring-1 ring-white/15 sm:min-w-[9.5rem] sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">
              Live blended APY
            </p>
            <p className="mt-0.5 text-2xl font-extrabold tabular-nums tracking-tight text-teal-200">
              {blendedApy}
            </p>
            {fetchedAt ? (
              <p className="mt-0.5 text-[10px] text-white/45">
                {new Date(fetchedAt).toLocaleTimeString()}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="divide-y divide-[#e8eef5]">
        {pools.map((pool) => {
          const quote = byPoolId[pool.id];
          const available = quote?.status === "available";
          const pair = `${tokenSymbol(pool.tokenA.symbol)}/${tokenSymbol(pool.tokenB.symbol)}`;
          return (
            <article
              key={pool.id}
              className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-[#f7fafc] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative flex shrink-0 items-center">
                  <TokenMark symbol={pool.tokenA.symbol} />
                  <span className="-ml-2">
                    <TokenMark symbol={pool.tokenB.symbol} />
                  </span>
                  <span className="absolute -bottom-1 -right-1">
                    <ProtocolMark protocol={pool.protocol} />
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-bold tracking-tight text-[#0b1f3a]">
                    {pair}
                  </h3>
                  <p className="mt-0.5 text-[11px] font-semibold text-[#5b6b7c]">
                    {protocolDisplayName(pool.protocol)} · {formatOfficialPoolFee(pool)}
                  </p>
                </div>
                <span className="ml-1 hidden shrink-0 rounded-full bg-[#0b1f3a]/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#0b1f3a] sm:inline-flex">
                  20%
                </span>
              </div>

              <dl className="grid grid-cols-4 gap-2 text-sm sm:max-w-[22rem] sm:flex-1">
                <div>
                  <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a9aab]">
                    Live APY
                  </dt>
                  <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-emerald-700">
                    {formatApyDisplay(quote, loading)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a9aab]">
                    Fee APY
                  </dt>
                  <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#0b1f3a]">
                    {formatApyPartAllowZero(quote?.apyBasePercent, loading, Boolean(available))}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a9aab]">
                    Reward APY
                  </dt>
                  <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#0b1f3a]">
                    {formatApyPartAllowZero(quote?.apyRewardPercent, loading, Boolean(available))}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a9aab]">
                    TVL
                  </dt>
                  <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#0b1f3a]">
                    {loading
                      ? "…"
                      : available && quote?.tvlUsd != null
                        ? formatTvlUsd(quote.tvlUsd)
                        : "Unavailable"}
                  </dd>
                </div>
              </dl>

              <span className="inline-flex w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700 sm:hidden">
                20% allocation
              </span>
            </article>
          );
        })}
      </div>

      {showDepositCta ? (
        <div className="border-t border-[#e8eef5] bg-[#f7fafc] px-5 py-5 sm:px-7">
          <button
            type="button"
            disabled={!depositsEnabled}
            onClick={onDepositClick}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-[#0b1f3a] text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_8px_24px_rgba(11,31,58,0.22)] transition hover:brightness-110 disabled:opacity-45"
          >
            {depositsEnabled ? "Deposit USDC" : "Deposit unavailable"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
