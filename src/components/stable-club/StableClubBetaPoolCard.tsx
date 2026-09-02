"use client";

import Image from "next/image";
import type { OfficialStableClubPool } from "@/lib/stable-club/official-pools";
import {
  TOKEN_LOGO_URLS,
  formatFeeOrTick,
  formatProtocolLabel,
  formatRiskLabel,
  resolvePoolProductCategory,
} from "@/lib/stable-club/pool-product-meta";
import type { PoolApyQuote } from "@/lib/stable-club/pool-apy";
import { FIVE_POOL_ALLOCATION_BPS_PER_LEG } from "@/lib/stable-club/five-pool-strategy";

function TokenPairLogos({ pool }: { pool: OfficialStableClubPool }) {
  const logos = [pool.tokenA.symbol, pool.tokenB.symbol].map(
    (sym) => TOKEN_LOGO_URLS[sym] ?? null,
  );
  return (
    <div className="flex -space-x-2">
      {logos.map((src, i) => (
        <span
          key={i}
          className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-app-panel bg-app-elevated"
        >
          {src ? (
            <Image src={src} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
          ) : (
            <span className="text-[10px] font-bold text-app-muted">?</span>
          )}
        </span>
      ))}
    </div>
  );
}

export type PoolComponentPositionStatus = "open" | "none";

export function StableClubBetaPoolCard({
  pool,
  apy,
  positionStatus,
}: {
  pool: OfficialStableClubPool;
  apy: PoolApyQuote | undefined;
  positionStatus: PoolComponentPositionStatus;
}) {
  const category = resolvePoolProductCategory(pool.id);
  const pairLabel = `${pool.tokenA.symbol} / ${pool.tokenB.symbol}`;
  const apyLabel =
    apy?.status === "available" && apy.apyPercent != null
      ? `${apy.apyPercent.toFixed(2)}%`
      : "Unavailable";
  const allocationPct = FIVE_POOL_ALLOCATION_BPS_PER_LEG / 100;

  return (
    <article className="flex flex-col rounded-[16px] border border-app-line bg-app-panel/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <TokenPairLogos pool={pool} />
        <span className="rounded-full bg-app-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-brand">
          {allocationPct}% of strategy
        </span>
      </div>

      <h3 className="mt-3 text-base font-bold text-app-ink">{pairLabel}</h3>
      <p className="text-[11px] text-app-muted">{formatProtocolLabel(pool.protocol)}</p>

      <dl className="mt-3 grid gap-2 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-app-dim">Fee / tick</dt>
          <dd className="font-medium text-app-ink">{formatFeeOrTick(pool)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-app-dim">Network</dt>
          <dd className="font-medium text-app-ink">Base</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-app-dim">Est. pool APY</dt>
          <dd className="font-medium text-app-ink">{apyLabel}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-app-dim">Risk</dt>
          <dd className="font-medium text-app-ink">{formatRiskLabel(pool.riskLevel)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-app-dim">Category</dt>
          <dd className="font-medium text-app-ink">{category}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-app-dim">Your position</dt>
          <dd
            className={[
              "font-medium",
              positionStatus === "open" ? "text-emerald-600 dark:text-emerald-300" : "text-app-dim",
            ].join(" ")}
          >
            {positionStatus === "open" ? "Open LP NFT" : "No position"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
