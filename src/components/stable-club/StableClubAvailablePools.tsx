"use client";

import { useMemo, type ReactNode } from "react";
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
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-[10px] font-bold text-white">
        {key.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-8 w-8 rounded-full bg-[var(--color-bg-elevated)] ring-1 ring-[#d7e0ec]" />
  );
}

function ProtocolLogo({ protocol }: { protocol: "uniswap-v3" | "aerodrome-slipstream" }) {
  if (protocol === "uniswap-v3") {
    return (
      <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="#FF007A" />
        <path
          fill="#fff"
          d="M9.2 21.6c1.6-3.8 4.2-6.3 7.4-6.8.4-2.1 1.5-3.6 3.1-4.2.5-.2 1-.2 1.4 0 .7.3 1.1 1 1.1 2 0 .4 0 .8-.2 1.2l-1.1 3.1c1.7.8 2.8 2.2 3 4 .2 1.8-.6 3.4-2.1 4.3-1 .6-2.1.8-3.3.6-1.9-.3-3.5-1.6-4.4-3.5-.6 1.4-1.5 2.5-2.7 3.1-.5.3-1.1.3-1.6.1-.7-.3-1.1-1-1.1-1.9 0-.4.1-.8.5-1.5l.1-.2Zm4.2-1.1c.7 1.6 1.9 2.7 3.3 2.9 1 .2 1.9 0 2.6-.4.9-.5 1.3-1.5 1.2-2.6-.1-1.2-.9-2.2-2.2-2.7l-4.9 2.8Zm5.2-7.7c-.8.3-1.4 1.2-1.6 2.5l3.1-1.1c.1-.3.1-.5.1-.7 0-.4-.1-.6-.3-.7-.3-.1-.7 0-1.3.3Z"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#3B8CFF" />
      <path
        fill="#fff"
        d="M8.5 20.5 16 7.5l7.5 13H20l-4-7.1L12 20.5H8.5Zm3.2 2.2h8.6L16 16.8l-4.3 5.9Z"
      />
    </svg>
  );
}

/**
 * Available Pools — premium five-leg panel for the single Stable Club strategy.
 */
export function StableClubAvailablePools({
  showDepositCta = false,
  depositsEnabled = false,
  onDepositClick,
  depositSlot,
}: {
  showDepositCta?: boolean;
  depositsEnabled?: boolean;
  onDepositClick?: () => void;
  /** Optional deposit form rendered inside this panel (users without positions). */
  depositSlot?: ReactNode;
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
      className="overflow-hidden rounded-2xl app-panel"
      aria-label="Available Pools"
    >
      <header className="relative overflow-hidden bg-[linear-gradient(135deg,#07111f_0%,#0d1b33_42%,#2563eb_155%)] px-5 py-7 text-white sm:px-7 sm:py-8">
        <div className="pointer-events-none absolute -right-12 -top-14 h-48 w-48 rounded-full bg-[#0052FF]/30 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="shrink-0 rounded-2xl bg-white/12 p-3 ring-1 ring-white/25 backdrop-blur-sm">
              <DegenChainLogo chain="base" size={72} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-[1.35rem] font-extrabold tracking-[-0.035em] sm:text-[1.75rem]">
                  TOP BASE CHAIN LPs
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300 ring-1 ring-emerald-400/35">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  LIVE BETA
                </span>
              </div>
              <p className="mt-2.5 text-[13px] font-medium leading-snug text-white/80 sm:text-sm">
                One USDC deposit · Five LP positions · 20% each
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3.5 text-left ring-1 ring-white/20 sm:min-w-[10.5rem] sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
              Live blended APY
            </p>
            <p className="mt-1 text-[1.75rem] font-extrabold tabular-nums tracking-tight text-teal-200">
              {blendedApy}
            </p>
            {fetchedAt ? (
              <p className="mt-1 text-[10px] text-white/45">
                {new Date(fetchedAt).toLocaleTimeString()}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="divide-y divide-[var(--color-panel-border)]">
        {pools.map((pool) => {
          const quote = byPoolId[pool.id];
          const available = quote?.status === "available";
          const pair = `${tokenSymbol(pool.tokenA.symbol)}/${tokenSymbol(pool.tokenB.symbol)}`;
          return (
            <article
              key={pool.id}
              className="flex flex-col gap-3 px-4 py-3 transition-colors duration-200 hover:bg-[var(--color-panel)] sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-6 sm:py-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative flex shrink-0 items-center">
                  <TokenMark symbol={pool.tokenA.symbol} />
                  <span className="-ml-2.5">
                    <TokenMark symbol={pool.tokenB.symbol} />
                  </span>
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-[var(--color-bg-elevated)] p-0.5 shadow-sm ring-1 ring-[var(--color-panel-border)]">
                    <ProtocolLogo protocol={pool.protocol} />
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-extrabold tracking-tight text-[var(--color-ink)] sm:text-base">
                    {pair}
                  </h3>
                  <p className="mt-0.5 text-[11px] font-semibold text-[var(--color-ink-muted)]">
                    {protocolDisplayName(pool.protocol)} · {formatOfficialPoolFee(pool)}
                  </p>
                </div>
                <span className="ml-auto shrink-0 rounded-full bg-[var(--color-ink)]/[0.07] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--color-ink)] sm:ml-2">
                  20%
                </span>
              </div>

              <dl className="grid grid-cols-4 gap-2 sm:w-[22rem] sm:shrink-0">
                <div>
                  <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-dim)]">
                    Live APY
                  </dt>
                  <dd className="mt-0.5 text-[13px] font-extrabold tabular-nums text-emerald-700 sm:text-sm">
                    {formatApyDisplay(quote, loading)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-dim)]">
                    Fee APY
                  </dt>
                  <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-[var(--color-ink)] sm:text-sm">
                    {formatApyPartAllowZero(quote?.apyBasePercent, loading, Boolean(available))}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-dim)]">
                    Reward APY
                  </dt>
                  <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-[var(--color-ink)] sm:text-sm">
                    {formatApyPartAllowZero(quote?.apyRewardPercent, loading, Boolean(available))}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-dim)]">
                    TVL
                  </dt>
                  <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-[var(--color-ink)] sm:text-sm">
                    {loading
                      ? "…"
                      : available && quote?.tvlUsd != null
                        ? formatTvlUsd(quote.tvlUsd)
                        : "Unavailable"}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>

      {depositSlot ? (
        <div className="border-t border-[var(--color-panel-border)] bg-[var(--color-panel)] px-4 py-4 sm:px-6 sm:py-5">
          {depositSlot}
        </div>
      ) : null}

      {showDepositCta && !depositSlot ? (
        <div className="border-t border-[var(--color-panel-border)] bg-[var(--color-panel)] px-5 py-5 sm:px-7">
          <button
            type="button"
            disabled={!depositsEnabled}
            onClick={onDepositClick}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--color-brand)] text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_8px_24px_rgba(11,31,58,0.22)] transition hover:brightness-110 disabled:opacity-45"
          >
            {depositsEnabled ? "Add Funds" : "Add Funds unavailable"}
          </button>
          <p className="mt-2 text-center text-[12px] text-[var(--color-ink-muted)]">
            Deposit USDC into My Position · equal 20% across all five pools
          </p>
        </div>
      ) : null}
    </section>
  );
}
