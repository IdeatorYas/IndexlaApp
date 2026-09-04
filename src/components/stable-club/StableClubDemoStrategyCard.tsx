"use client";

import type { DemoStrategyProduct } from "@/lib/stable-club/demo-strategies";

function PairGlyph({ pair }: { pair: string }) {
  const [a, b] = pair.split(/[/\s]/).filter(Boolean);
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/20 text-[11px] font-bold text-sky-200 ring-1 ring-sky-400/30">
        {(a ?? "?").slice(0, 3)}
      </span>
      <span className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] font-bold text-indigo-100 ring-1 ring-indigo-400/30">
        {(b ?? "?").slice(0, 3)}
      </span>
    </span>
  );
}

export function StableClubDemoStrategyCard({ product }: { product: DemoStrategyProduct }) {
  return (
    <section
      className="stable-club-strategy-box"
      data-strategy={product.id}
      data-status="upcoming-demo"
      aria-label={`${product.title} upcoming demo strategy`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300/90">
            {product.badge}
          </p>
          <h2 className="app-display mt-2 text-xl font-bold text-app-ink sm:text-2xl">
            {product.title}
          </h2>
          <p className="mt-1 text-sm font-semibold text-sky-300">{product.riskLabel}</p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-app-dim">
              <th className="pb-2 pr-3 font-semibold">Pool</th>
              <th className="pb-2 pr-3 font-semibold">DeFi App</th>
              <th className="pb-2 pr-3 font-semibold">Chain</th>
              <th className="pb-2 pr-3 font-semibold">Indicative Recent APY</th>
              <th className="pb-2 font-semibold">Pool Fee</th>
            </tr>
          </thead>
          <tbody>
            {product.pools.map((pool) => (
              <tr key={`${product.id}-${pool.pair}-${pool.platform}`} className="sc-pool-row align-middle">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-3">
                    <PairGlyph pair={pool.pair} />
                    <div>
                      <p className="text-[15px] font-bold leading-tight text-app-ink">{pool.pair}</p>
                      {pool.liveDataUrl ? (
                        <a
                          href={pool.liveDataUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-[11px] font-semibold text-sky-300 underline-offset-2 hover:underline"
                        >
                          {pool.liveDataLabel ?? "Live Data"}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-3">
                  <p className="font-semibold text-app-ink">{pool.platform}</p>
                </td>
                <td className="py-3 pr-3">
                  <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-200">
                    {pool.chain}
                  </span>
                </td>
                <td className="py-3 pr-3 font-semibold text-emerald-300">{pool.indicativeApy}</td>
                <td className="py-3 text-app-muted">{pool.poolFee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        disabled
        className="app-gradient-btn mt-6 h-11 w-full cursor-not-allowed px-4 text-sm font-bold opacity-50"
        aria-disabled="true"
      >
        Coming Soon
      </button>
    </section>
  );
}
