"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import {
  formatApyDisplay,
  formatOfficialPoolFee,
  protocolDisplayName,
  useStableClubPoolApyMap,
} from "@/components/stable-club/useStableClubPoolApy";
import { usePositionClaimableFees } from "@/components/stable-club/usePositionClaimableFees";
import { usePositionUsdValue } from "@/components/stable-club/usePositionUsdValue";
import type { useFivePoolPositions } from "@/components/stable-club/useFivePoolPositions";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import { isExitAllToUsdcAvailable } from "@/lib/stable-club/exit-to-usdc";
import {
  allocationPercentFromBps,
  formatPositionValueDisplay,
} from "@/lib/stable-club/position-display";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { TOKEN_LOGO_URLS } from "@/lib/stable-club/pool-product-meta";

type PositionsApi = ReturnType<typeof useFivePoolPositions>;

function tokenDecimals(symbol: string): number {
  const hit = OFFICIAL_STABLE_CLUB_BASE_POOLS.flatMap((p) => [p.tokenA, p.tokenB]).find(
    (t) => t.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  return hit?.decimals ?? 18;
}

function sym(s: string): string {
  return s.toUpperCase() === "WBTC" ? "cbBTC" : s;
}

function TokenPairMarks({ a, b }: { a: string; b: string }) {
  const sa = TOKEN_LOGO_URLS[sym(a)];
  const sb = TOKEN_LOGO_URLS[sym(b)];
  return (
    <div className="relative flex shrink-0 items-center">
      {sa ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sa} alt="" className="h-7 w-7 rounded-full ring-1 ring-white" />
      ) : (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0b1f3a] text-[9px] font-bold text-white">
          {sym(a).slice(0, 2)}
        </span>
      )}
      {sb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sb} alt="" className="-ml-2 h-7 w-7 rounded-full ring-1 ring-white" />
      ) : (
        <span className="-ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#1a4f8c] text-[9px] font-bold text-white">
          {sym(b).slice(0, 2)}
        </span>
      )}
    </div>
  );
}

export function StableClubPositionDashboard({
  positionsApi,
  depositsEnabled = false,
  onAddFunds,
  addFundsOpen = false,
}: {
  positionsApi: PositionsApi;
  depositsEnabled?: boolean;
  onAddFunds?: () => void;
  addFundsOpen?: boolean;
}) {
  const p = positionsApi;
  const wallet = useStableClubWallet();
  const { byPoolId: apyByPoolId, loading: apyLoading, fetchedAt, source } =
    useStableClubPoolApyMap();
  const claimable = usePositionClaimableFees(
    p.positions.map((pos) => ({
      legIndex: pos.legIndex,
      npm: pos.npm,
      positionTokenId: pos.positionTokenId,
    })),
  );
  const usdValue = usePositionUsdValue(
    p.positions.map((pos) => ({
      legIndex: pos.legIndex,
      tokenA: pos.tokenA,
      tokenB: pos.tokenB,
      amountA: pos.amountA,
      amountB: pos.amountB,
    })),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lastRefreshAt, setLastRefreshAt] = useState(() => Date.now());

  const usdcExitReady = isExitAllToUsdcAvailable(p.deployments);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!p.busy) void p.refreshPositions().then(() => setLastRefreshAt(Date.now()));
    }, 45_000);
    return () => window.clearInterval(id);
  }, [p]);

  /** Aggregate multiple NFTs that share a pool into one dashboard row. */
  const rows = useMemo(() => {
    const byPool = new Map<
      string,
      {
        poolId: string;
        pair: string;
        protocol: string;
        feeLabel: string;
        apy: string;
        allocationBps: bigint;
        amountA: bigint;
        amountB: bigint;
        tokenASymbol: string;
        tokenBSymbol: string;
        claimableUsd: number;
        valueUsdc: bigint | null;
        active: boolean;
        nftCount: number;
      }
    >();

    const sorted = [...p.positions].sort((a, b) => a.legIndex - b.legIndex);
    for (const pos of sorted) {
      const catalogue = OFFICIAL_STABLE_CLUB_BASE_POOLS.find(
        (pool) => pool.poolIdHash.toLowerCase() === pos.poolId.toLowerCase(),
      );
      const key = pos.poolId.toLowerCase();
      const claim = claimable.rows.find((r) => r.legIndex === pos.legIndex);
      const legUsd = usdValue.rows.find((r) => r.legIndex === pos.legIndex);
      const existing = byPool.get(key);
      if (!existing) {
        byPool.set(key, {
          poolId: pos.poolId,
          pair: `${sym(pos.tokenASymbol)}/${sym(pos.tokenBSymbol)}`,
          protocol: catalogue
            ? protocolDisplayName(catalogue.protocol)
            : String(pos.protocol ?? "CL"),
          feeLabel: catalogue ? formatOfficialPoolFee(catalogue) : "",
          apy: formatApyDisplay(
            catalogue ? apyByPoolId[catalogue.id] : undefined,
            apyLoading,
          ),
          allocationBps: pos.allocationBps,
          amountA: pos.amountA,
          amountB: pos.amountB,
          tokenASymbol: pos.tokenASymbol,
          tokenBSymbol: pos.tokenBSymbol,
          claimableUsd: claim?.approxUsdc ?? 0,
          valueUsdc: legUsd?.valueUsdc ?? null,
          active: pos.liquidity > BigInt(0) && pos.rangeStatus !== "out-of-range",
          nftCount: 1,
        });
      } else {
        existing.amountA += pos.amountA;
        existing.amountB += pos.amountB;
        existing.claimableUsd += claim?.approxUsdc ?? 0;
        if (legUsd?.valueUsdc != null) {
          existing.valueUsdc = (existing.valueUsdc ?? BigInt(0)) + legUsd.valueUsdc;
        }
        existing.active =
          existing.active ||
          (pos.liquidity > BigInt(0) && pos.rangeStatus !== "out-of-range");
        existing.nftCount += 1;
      }
    }

    return [...byPool.values()].map((row) => ({
      key: row.poolId,
      pair: row.pair,
      protocol: row.protocol,
      feeLabel: row.feeLabel,
      tokenASymbol: row.tokenASymbol,
      tokenBSymbol: row.tokenBSymbol,
      apy: row.apy,
      allocation: allocationPercentFromBps(row.allocationBps),
      allocationPct: Number(row.allocationBps) / 100,
      value:
        row.valueUsdc != null
          ? `$${Number(formatUnits(row.valueUsdc, 6)).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}`
          : formatPositionValueDisplay({
              amountA: row.amountA,
              amountB: row.amountB,
              tokenASymbol: sym(row.tokenASymbol),
              tokenBSymbol: sym(row.tokenBSymbol),
              decimalsA: tokenDecimals(row.tokenASymbol),
              decimalsB: tokenDecimals(row.tokenBSymbol),
            }),
      claimableUsd: row.claimableUsd,
      active: row.active,
      nftCount: row.nftCount,
    }));
  }, [apyByPoolId, apyLoading, claimable.rows, p.positions, usdValue.rows]);

  const blendedApy = useMemo(() => {
    const nums = rows
      .map((r) => Number(r.apy.replace("%", "")))
      .filter((n) => Number.isFinite(n));
    if (!nums.length) return "Unavailable";
    return `${(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)}%`;
  }, [rows]);

  const totalValue =
    usdValue.totalUsdc != null ? Number(formatUnits(usdValue.totalUsdc, 6)) : null;
  const secondsAgo = Math.max(0, Math.floor((now - lastRefreshAt) / 1000));

  const actionsBusy =
    p.busy ||
    p.positions.length === 0 ||
    p.strategyRevoked ||
    p.strategyExpired ||
    !p.onExpectedChain;

  const afterAction = async (fn: () => Promise<void>) => {
    await fn();
    await p.refreshPositions();
    setLastRefreshAt(Date.now());
  };

  return (
    <section
      id="my-stable-club-position"
      className="overflow-hidden rounded-2xl border border-[#b8cce3] bg-gradient-to-b from-white to-[#f2f7fc] shadow-[0_12px_40px_rgba(11,31,58,0.10)]"
      aria-label="My Stable Club Position"
    >
      <div className="bg-[linear-gradient(125deg,#071526_0%,#0b1f3a_40%,#1a4f8c_100%)] px-4 py-5 text-white sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Live on Base
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">
              My Position
            </h1>
            <p className="mt-1 text-xs text-white/60">
              {wallet.address
                ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
                : "—"}
              {" · "}
              {secondsAgo < 5 ? "Updated just now" : `Updated ${secondsAgo}s ago`}
              {fetchedAt
                ? ` · APY ${source ?? "DefiLlama"} ${new Date(fetchedAt).toLocaleTimeString()}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={p.busy || p.positionsLoading}
            onClick={() => void p.refreshPositions().then(() => setLastRefreshAt(Date.now()))}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold"
          >
            Refresh
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <div className="col-span-2 rounded-xl bg-white/10 px-3.5 py-3 sm:col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
              Total Position Value
            </p>
            <p className="mt-1 text-[2rem] font-extrabold tabular-nums tracking-tight leading-none">
              {usdValue.loading
                ? "…"
                : totalValue != null
                  ? `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : "Unavailable"}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
              Deposited
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums">—</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
              Live P/L
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-emerald-300">—</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
              Blended APY
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-teal-200">{blendedApy}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/10 px-3.5 py-2.5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
              Rewards available to claim
            </p>
            <p className="text-base font-bold tabular-nums text-emerald-300">
              {claimable.loading
                ? "…"
                : `≈ $${claimable.totalApproxUsdc.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}`}
            </p>
          </div>
          <div className="h-2.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/15 sm:w-48">
            <div className="flex h-full">
              {rows.map((row, i) => (
                <div
                  key={row.key}
                  style={{
                    width: `${Math.max(row.allocationPct, 10)}%`,
                    background: ["#2dd4bf", "#38bdf8", "#818cf8", "#34d399", "#22d3ee"][i % 5],
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 py-3.5 sm:px-5 sm:py-4">
        {p.positionsError ? (
          <p className="mb-2 text-sm text-[#b42318]" role="alert">
            {p.positionsError}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px] text-[#0b1f3a]">
            <thead>
              <tr className="border-b border-[#e6edf5] text-[10px] font-bold uppercase tracking-[0.08em] text-[#5b6b7c]">
                <th className="py-2.5 pr-2">Pool</th>
                <th className="py-2.5 pr-2">Value</th>
                <th className="py-2.5 pr-2">Alloc</th>
                <th className="py-2.5 pr-2">APY</th>
                <th className="py-2.5 pr-2">Claimable</th>
                <th className="py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[#eef3f8]">
                  <td className="py-3 pr-2">
                    <div className="flex items-center gap-2.5">
                      <TokenPairMarks a={row.tokenASymbol} b={row.tokenBSymbol} />
                      <div>
                        <p className="text-[14px] font-bold leading-tight tracking-tight">
                          {row.pair}
                          {row.nftCount > 1 ? (
                            <span className="ml-1.5 text-[10px] font-semibold text-[#5b6b7c]">
                              · {row.nftCount} LPs
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-[#5b6b7c]">
                          {row.protocol}
                          {row.feeLabel ? ` · ${row.feeLabel}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-2 font-mono text-[13px] font-semibold">{row.value}</td>
                  <td className="py-3 pr-2 text-[13px] font-bold tabular-nums">{row.allocation}</td>
                  <td className="py-3 pr-2 text-[13px] font-bold tabular-nums text-emerald-700">
                    {row.apy}
                  </td>
                  <td className="py-3 pr-2 text-[13px] font-semibold tabular-nums">
                    ≈ ${row.claimableUsd.toFixed(2)}
                  </td>
                  <td className="py-3">
                    <span
                      className={
                        row.active
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
                          : "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"
                      }
                    >
                      {row.active ? "Active" : "Check"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            disabled={!depositsEnabled || actionsBusy}
            onClick={onAddFunds}
            className={
              addFundsOpen
                ? "h-11 rounded-xl border-2 border-[#0b1f3a] bg-[#0b1f3a]/5 text-xs font-bold uppercase tracking-[0.06em] text-[#0b1f3a] disabled:opacity-45"
                : "h-11 rounded-xl border border-[#0b1f3a]/20 bg-white text-xs font-bold uppercase tracking-[0.06em] text-[#0b1f3a] disabled:opacity-45"
            }
          >
            Add Funds
          </button>
          <button
            type="button"
            disabled={!usdcExitReady || actionsBusy}
            onClick={() => void afterAction(() => p.harvestAll())}
            className="h-11 rounded-xl border border-[#0b1f3a]/20 bg-white text-xs font-bold uppercase tracking-[0.06em] text-[#0b1f3a] disabled:opacity-45"
          >
            Harvest All
          </button>
          <button
            type="button"
            disabled={!usdcExitReady || actionsBusy}
            onClick={() => void afterAction(() => p.compoundAll())}
            className="h-11 rounded-xl border border-[#0b1f3a]/20 bg-white text-xs font-bold uppercase tracking-[0.06em] text-[#0b1f3a] disabled:opacity-45"
          >
            Compound All
          </button>
          <button
            type="button"
            disabled={!usdcExitReady || actionsBusy}
            onClick={() => setConfirmOpen(true)}
            className="h-11 rounded-xl bg-[#0b1f3a] text-xs font-bold uppercase tracking-[0.06em] text-white disabled:opacity-45"
          >
            Withdraw All · Receive USDC
          </button>
        </div>

        {!usdcExitReady ? (
          <p className="mt-3 text-[11px] leading-relaxed text-[#5b6b7c]">
            Harvest, Compound, and USDC Withdraw require features.exitAllToUsdc on this deployment.
          </p>
        ) : null}

        {p.statusMessage ? <p className="mt-2 text-sm text-emerald-800">{p.statusMessage}</p> : null}
        {p.error ? (
          <p className="mt-2 text-sm text-[#b42318]" role="alert">
            {p.error}
          </p>
        ) : null}
        {p.lastTxHash && p.explorerUrl ? (
          <p className="mt-2 font-mono text-[11px]">
            <a
              href={p.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#1a4f8c] underline-offset-2 hover:underline"
            >
              BaseScan {p.lastTxHash.slice(0, 10)}…
            </a>
          </p>
        ) : null}
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1f3a]/50 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm Withdraw All"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-bold text-[#0b1f3a]">Withdraw All · Receive USDC</h2>
            <p className="mt-2 text-sm text-[#5b6b7c]">
              Atomic exitAllToUsdc — closes all legs, unwinds to USDC, reverts on failure.
            </p>
            {usdValue.totalUsdc != null && usdValue.totalUsdc > BigInt(0) ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                <li className="flex justify-between">
                  <span className="text-[#5b6b7c]">Est. position value</span>
                  <span className="font-semibold">${formatUnits(usdValue.totalUsdc, 6)}</span>
                </li>
                <li className="text-[11px] text-[#5b6b7c]">
                  Exact min USDC is set at confirm from OracleGuard + 1% slippage.
                </li>
              </ul>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-10 rounded-xl border border-[#d7e0ec] text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={p.busy}
                onClick={() => {
                  setConfirmOpen(false);
                  void afterAction(() => p.exitAllToUsdc());
                }}
                className="h-10 rounded-xl bg-[#0b1f3a] text-sm font-bold text-white disabled:opacity-45"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
