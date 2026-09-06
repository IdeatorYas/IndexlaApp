"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import {
  formatApyDisplay,
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

type PositionsApi = ReturnType<typeof useFivePoolPositions>;

const SHORT_DESC: Record<string, string> = {
  "USDC-cbBTC-AERO-CL100": "Aerodrome legacy CL100",
  "USDC-cbBTC-UNI-005": "Uniswap 0.05% USDC/cbBTC",
  "cbBTC-WETH-AERO-CL10": "Aerodrome CL10 · higher IL",
  "cbBTC-WETH-AERO-CL100": "Aerodrome legacy CL100",
  "cbBTC-WETH-UNI-005": "Uniswap 0.05% cbBTC/WETH",
};

function tokenDecimals(symbol: string): number {
  const hit = OFFICIAL_STABLE_CLUB_BASE_POOLS.flatMap((p) => [p.tokenA, p.tokenB]).find(
    (t) => t.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  return hit?.decimals ?? 18;
}

function sym(s: string): string {
  return s.toUpperCase() === "WBTC" ? "cbBTC" : s;
}

export function StableClubPositionDashboard({
  positionsApi,
}: {
  positionsApi: PositionsApi;
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

  const rows = useMemo(() => {
    return [...p.positions]
      .sort((a, b) => a.legIndex - b.legIndex)
      .map((pos) => {
        const catalogue = OFFICIAL_STABLE_CLUB_BASE_POOLS.find(
          (pool) => pool.poolIdHash.toLowerCase() === pos.poolId.toLowerCase(),
        );
        const apy = formatApyDisplay(
          catalogue ? apyByPoolId[catalogue.id] : undefined,
          apyLoading,
        );
        const claim = claimable.rows.find((r) => r.legIndex === pos.legIndex);
        const legUsd = usdValue.rows.find((r) => r.legIndex === pos.legIndex);
        return {
          key: `${pos.legIndex}-${pos.positionTokenId.toString()}`,
          pair: `${sym(pos.tokenASymbol)}/${sym(pos.tokenBSymbol)}`,
          protocol: catalogue
            ? protocolDisplayName(catalogue.protocol)
            : String(pos.protocol ?? "CL"),
          desc: catalogue ? SHORT_DESC[catalogue.id] ?? catalogue.label : pos.poolLabel,
          apy,
          allocation: allocationPercentFromBps(pos.allocationBps),
          allocationPct: Number(pos.allocationBps) / 100,
          value:
            legUsd != null
              ? `$${Number(formatUnits(legUsd.valueUsdc, 6)).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}`
              : formatPositionValueDisplay({
                  amountA: pos.amountA,
                  amountB: pos.amountB,
                  tokenASymbol: sym(pos.tokenASymbol),
                  tokenBSymbol: sym(pos.tokenBSymbol),
                  decimalsA: tokenDecimals(pos.tokenASymbol),
                  decimalsB: tokenDecimals(pos.tokenBSymbol),
                }),
          claimableUsd: claim?.approxUsdc ?? 0,
          active: pos.liquidity > BigInt(0) && pos.rangeStatus !== "out-of-range",
        };
      });
  }, [apyByPoolId, apyLoading, claimable.rows, p.positions, usdValue.rows]);

  const blendedApy = useMemo(() => {
    const nums = rows
      .map((r) => Number(r.apy.replace("%", "")))
      .filter((n) => Number.isFinite(n));
    if (!nums.length) return "—";
    return `${(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)}%`;
  }, [rows]);

  const totalValue =
    usdValue.totalUsdc != null
      ? Number(formatUnits(usdValue.totalUsdc, 6))
      : null;
  const secondsAgo = Math.max(0, Math.floor((now - lastRefreshAt) / 1000));

  const actionsDisabled =
    !usdcExitReady ||
    p.busy ||
    p.positions.length === 0 ||
    p.strategyRevoked ||
    p.strategyExpired ||
    !p.onExpectedChain;

  return (
    <section
      id="my-stable-club-position"
      className="overflow-hidden rounded-2xl border border-[#c5d4e8] bg-gradient-to-b from-white to-[#f2f7fc] shadow-[0_8px_28px_rgba(11,31,58,0.08)]"
      aria-label="My Stable Club Position"
    >
      <div className="bg-[linear-gradient(125deg,#071526_0%,#0b1f3a_40%,#1a4f8c_100%)] px-4 py-4 text-white sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Live on Base
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">My Position</h1>
            <p className="mt-0.5 text-[11px] text-white/60">
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
            className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="col-span-2 rounded-xl bg-white/10 px-3 py-2.5 sm:col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
              Total Position Value
            </p>
            <p className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight">
              {usdValue.loading
                ? "…"
                : totalValue != null
                  ? `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
              Deposited
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">—</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
              Live P/L
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-300">—</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
              Blended APY
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-teal-200">{blendedApy}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
              Rewards available to claim
            </p>
            <p className="text-base font-semibold tabular-nums text-emerald-300">
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

      <div className="px-3 py-3 sm:px-5 sm:py-4">
        {p.positionsError ? (
          <p className="mb-2 text-sm text-[#b42318]" role="alert">
            {p.positionsError}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-[13px] text-[#0b1f3a]">
            <thead>
              <tr className="border-b border-[#e6edf5] text-[10px] font-bold uppercase tracking-[0.08em] text-[#5b6b7c]">
                <th className="py-2 pr-2">Pool</th>
                <th className="py-2 pr-2">Value</th>
                <th className="py-2 pr-2">Alloc</th>
                <th className="py-2 pr-2">APY</th>
                <th className="py-2 pr-2">Claimable</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[#eef3f8]">
                  <td className="py-2.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#0b1f3a] text-[9px] font-bold text-white">
                        {row.protocol.slice(0, 3).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-semibold leading-tight">{row.pair}</p>
                        <p className="text-[10px] text-[#5b6b7c]">{row.desc}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 font-mono text-[12px]">{row.value}</td>
                  <td className="py-2.5 pr-2 tabular-nums font-semibold">{row.allocation}</td>
                  <td className="py-2.5 pr-2 tabular-nums text-emerald-700">{row.apy}</td>
                  <td className="py-2.5 pr-2 tabular-nums text-[#0b1f3a]">
                    ≈ ${row.claimableUsd.toFixed(2)}
                  </td>
                  <td className="py-2.5">
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

        {usdcExitReady ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => void p.harvestAll()}
              className="h-11 rounded-xl border border-[#0b1f3a]/20 bg-white text-xs font-bold uppercase tracking-[0.06em] text-[#0b1f3a] disabled:opacity-45"
            >
              Harvest All
            </button>
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => void p.compoundAll()}
              className="h-11 rounded-xl border border-[#0b1f3a]/20 bg-white text-xs font-bold uppercase tracking-[0.06em] text-[#0b1f3a] disabled:opacity-45"
            >
              Compound All
            </button>
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => setConfirmOpen(true)}
              className="h-11 rounded-xl bg-[#0b1f3a] text-xs font-bold uppercase tracking-[0.06em] text-white disabled:opacity-45"
            >
              Withdraw All · Receive USDC
            </button>
          </div>
        ) : (
          <p className="mt-4 text-[11px] leading-relaxed text-[#5b6b7c]">
            Harvest, Compound, and USDC Withdraw stay locked until the Safe-owned stack is configured
            and Base E2E proves exitAllToUsdc. Deposit unlocks with the same gate. Legacy mixed-asset
            exitAll is never offered.
          </p>
        )}

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
                  <span className="font-semibold">
                    ${formatUnits(usdValue.totalUsdc, 6)}
                  </span>
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
                  void p.exitAllToUsdc();
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
