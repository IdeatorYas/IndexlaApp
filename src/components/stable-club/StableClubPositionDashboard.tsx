"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatApyDisplay,
  useStableClubPoolApyMap,
} from "@/components/stable-club/useStableClubPoolApy";
import type { useFivePoolPositions } from "@/components/stable-club/useFivePoolPositions";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  buildExitToUsdcPreview,
  isExitAllToUsdcAvailable,
} from "@/lib/stable-club/exit-to-usdc";
import {
  allocationPercentFromBps,
  formatPositionTokenAmount,
  formatPositionValueDisplay,
} from "@/lib/stable-club/position-display";
import { BASE_TOKENS, OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { isLaunchAutomationEnabledForEnvironment } from "@/lib/stable-club/local-automation-policy";
import { formatUnits } from "viem";

type PositionsApi = ReturnType<typeof useFivePoolPositions>;

function ComingSoonTip({ children }: { children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex w-full sm:w-auto">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 hidden w-max -translate-x-1/2 rounded-md bg-[#0b1f3a] px-2 py-1 text-[11px] font-medium text-white shadow-md group-hover:block group-focus-within:block"
      >
        Coming soon
      </span>
    </span>
  );
}

function tokenDecimals(symbol: string): number {
  const hit = OFFICIAL_STABLE_CLUB_BASE_POOLS.flatMap((p) => [p.tokenA, p.tokenB]).find(
    (t) => t.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  return hit?.decimals ?? 18;
}

function shortPair(label: string, tokenA: string, tokenB: string): string {
  const a = tokenA === "WBTC" ? "cbBTC" : tokenA;
  const b = tokenB === "WBTC" ? "cbBTC" : tokenB;
  if (label.includes("/")) {
    return label.replace(/WBTC/gi, "cbBTC").split("—")[0]?.trim() || `${a}/${b}`;
  }
  return `${a}/${b}`;
}

function protocolBadge(protocol: string): string {
  if (protocol.includes("aerodrome")) return "Aero";
  if (protocol.includes("uniswap")) return "Uni V3";
  return "CL";
}

/**
 * Premium live five-pool position dashboard.
 * Withdraw All = USDC-only path (exitAllToUsdc). Legacy exitAll is not exposed.
 */
export function StableClubPositionDashboard({
  positionsApi,
}: {
  positionsApi: PositionsApi;
}) {
  const p = positionsApi;
  const wallet = useStableClubWallet();
  const { byPoolId: apyByPoolId, loading: apyLoading } = useStableClubPoolApyMap();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lastRefreshAt, setLastRefreshAt] = useState(() => Date.now());

  const harvestEnabled = isLaunchAutomationEnabledForEnvironment("harvest", null);
  const compoundEnabled = isLaunchAutomationEnabledForEnvironment("compound", null);
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
        const pair = shortPair(
          pos.poolLabel,
          pos.tokenASymbol,
          pos.tokenBSymbol,
        );
        return {
          key: `${pos.legIndex}-${pos.positionTokenId.toString()}`,
          pair,
          protocol: protocolBadge(catalogue?.protocol ?? pos.protocol ?? ""),
          apy,
          allocation: allocationPercentFromBps(pos.allocationBps),
          allocationPct: Number(pos.allocationBps) / 100,
          value: formatPositionValueDisplay({
            amountA: pos.amountA,
            amountB: pos.amountB,
            tokenASymbol: pos.tokenASymbol === "WBTC" ? "cbBTC" : pos.tokenASymbol,
            tokenBSymbol: pos.tokenBSymbol === "WBTC" ? "cbBTC" : pos.tokenBSymbol,
            decimalsA: tokenDecimals(pos.tokenASymbol),
            decimalsB: tokenDecimals(pos.tokenBSymbol),
          }),
          earnings:
            pos.tokenASymbol.toUpperCase() === "USDC"
              ? `+${formatPositionTokenAmount(pos.amountA > 0n ? 0n : 0n, 6)}`
              : "—",
          active: pos.liquidity > 0n && pos.rangeStatus !== "out-of-range",
          rangeStatus: pos.rangeStatus,
        };
      });
  }, [apyByPoolId, apyLoading, p.positions]);

  const blendedApy = useMemo(() => {
    const nums = rows
      .map((r) => {
        const m = r.apy.replace("%", "");
        const n = Number(m);
        return Number.isFinite(n) ? n : null;
      })
      .filter((n): n is number => n != null);
    if (!nums.length) return "—";
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return `${avg.toFixed(2)}%`;
  }, [rows]);

  const preview = useMemo(() => {
    try {
      return buildExitToUsdcPreview({
        positions: p.positions.map((pos) => ({
          tokenA: pos.tokenA,
          tokenB: pos.tokenB,
          tokenASymbol: pos.tokenASymbol,
          tokenBSymbol: pos.tokenBSymbol,
          amountA: pos.amountA,
          amountB: pos.amountB,
        })),
        quoteTokenToUsdc: (tokenIn, amountIn) => {
          // Display-only heuristic until reverse routes are live (not used for broadcast mins on Base).
          if (tokenIn.toLowerCase() === BASE_TOKENS.cbBTC.address.toLowerCase()) {
            // ~$100k / BTC → 1e8 units → USDC 6dp
            return (amountIn * 100_000n * 1_000_000n) / 100_000_000n;
          }
          if (tokenIn.toLowerCase() === BASE_TOKENS.WETH.address.toLowerCase()) {
            return (amountIn * 2_500n * 1_000_000n) / 10n ** 18n;
          }
          return 0n;
        },
        deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
        depositedUsdc: null,
      });
    } catch {
      return null;
    }
  }, [p.positions]);

  const totalPositionLabel = preview
    ? `$${Number(formatUnits(preview.estimatedUsdcOut, 6)).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })}`
    : "—";

  const withdrawDisabled =
    p.busy ||
    p.positions.length === 0 ||
    p.strategyRevoked ||
    p.strategyExpired ||
    !p.onExpectedChain;

  const onWithdrawAll = () => {
    setConfirmOpen(true);
  };

  const confirmWithdraw = () => {
    setConfirmOpen(false);
    void p.exitAllToUsdc();
  };

  const secondsAgo = Math.max(0, Math.floor((now - lastRefreshAt) / 1000));

  return (
    <section
      id="my-stable-club-position"
      className="overflow-hidden rounded-2xl border border-[#c5d4e8] bg-gradient-to-b from-white via-[#f7fafc] to-[#eef4fb] shadow-[0_8px_30px_rgba(11,31,58,0.08)]"
      aria-label="My Stable Club Position"
    >
      <div className="border-b border-[#d7e0ec]/bg-[linear-gradient(120deg,#0b1f3a_0%,#163a66_55%,#1a4f8c_100%)] px-5 py-5 text-white sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live on Base
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-[1.85rem]">
              My Stable Club Position
            </h1>
            <p className="mt-1 text-sm text-white/70">
              {wallet.address
                ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
                : "—"}
              <span className="mx-2 text-white/40">·</span>
              Updated {secondsAgo < 5 ? "just now" : `${secondsAgo}s ago`}
            </p>
          </div>
          <button
            type="button"
            disabled={p.busy || p.positionsLoading}
            onClick={() => {
              void p.refreshPositions().then(() => setLastRefreshAt(Date.now()));
            }}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Total Position Value
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
              {totalPositionLabel}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Total Deposited
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">—</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Live P/L
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-300">
              {preview && preview.priceImpactBps > 0
                ? `${preview.priceImpactBps} bps vs deposit`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-white/55">Blended APY {blendedApy}</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">
            <span>Allocation</span>
            <span>5 pools · 20% each</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-white/15">
            {rows.map((row, i) => (
              <div
                key={row.key}
                className="h-full animate-[pulse_3s_ease-in-out_infinite] first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${Math.max(row.allocationPct, 8)}%`,
                  background: [
                    "#38bdf8",
                    "#60a5fa",
                    "#818cf8",
                    "#34d399",
                    "#2dd4bf",
                  ][i % 5],
                  animationDelay: `${i * 0.2}s`,
                }}
                title={`${row.pair} ${row.allocation}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-5">
        {p.positionsLoading ? (
          <p className="text-sm text-[#5b6b7c]">Loading on-chain positions…</p>
        ) : null}
        {p.positionsError ? (
          <p className="text-sm text-[#b42318]" role="alert">
            Could not load positions: {p.positionsError}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[14px] text-[#0b1f3a]">
            <thead>
              <tr className="border-b border-[#e6edf5] text-[11px] font-bold uppercase tracking-[0.08em] text-[#5b6b7c]">
                <th className="py-2.5 pr-3">Pool</th>
                <th className="py-2.5 pr-3">Live value</th>
                <th className="py-2.5 pr-3">Alloc</th>
                <th className="py-2.5 pr-3">APY</th>
                <th className="py-2.5 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[#eef3f8]">
                  <td className="py-3.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0b1f3a] text-[10px] font-bold text-white">
                        {row.protocol.slice(0, 3).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-semibold leading-tight">{row.pair}</p>
                        <p className="text-[11px] text-[#5b6b7c]">{row.protocol}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 pr-3 font-mono text-[13px]">{row.value}</td>
                  <td className="py-3.5 pr-3 tabular-nums font-semibold">{row.allocation}</td>
                  <td className="py-3.5 pr-3 tabular-nums text-emerald-700">{row.apy}</td>
                  <td className="py-3.5">
                    <span
                      className={
                        row.active
                          ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                          : "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                      }
                    >
                      <span
                        className={
                          row.active
                            ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                            : "h-1.5 w-1.5 rounded-full bg-amber-500"
                        }
                      />
                      {row.active ? "Active" : "Check range"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr]">
          {harvestEnabled ? (
            <button
              type="button"
              disabled
              className="h-12 rounded-xl bg-[#0b1f3a] text-sm font-bold uppercase tracking-[0.06em] text-white opacity-50"
            >
              Harvest All
            </button>
          ) : (
            <ComingSoonTip>
              <button
                type="button"
                disabled
                className="h-12 w-full cursor-not-allowed rounded-xl border border-[#d7e0ec] bg-[#f5f8fc] text-sm font-bold uppercase tracking-[0.06em] text-[#8a97a8]"
              >
                Harvest All · Coming Soon
              </button>
            </ComingSoonTip>
          )}

          {compoundEnabled ? (
            <button
              type="button"
              disabled
              className="h-12 rounded-xl bg-[#0b1f3a] text-sm font-bold uppercase tracking-[0.06em] text-white opacity-50"
            >
              Compound All
            </button>
          ) : (
            <ComingSoonTip>
              <button
                type="button"
                disabled
                className="h-12 w-full cursor-not-allowed rounded-xl border border-[#d7e0ec] bg-[#f5f8fc] text-sm font-bold uppercase tracking-[0.06em] text-[#8a97a8]"
              >
                Compound All · Coming Soon
              </button>
            </ComingSoonTip>
          )}

          <button
            type="button"
            disabled={withdrawDisabled}
            onClick={onWithdrawAll}
            className="h-12 rounded-xl bg-[#0b1f3a] text-sm font-bold uppercase tracking-[0.06em] text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            Withdraw All · Receive USDC
          </button>
        </div>

        {!usdcExitReady ? (
          <p className="mt-3 text-xs leading-relaxed text-[#5b6b7c]" role="status">
            USDC-only Withdraw All is implemented locally and awaiting Base upgrade
            (`exitAllToUsdc` + reverse swap routes). Mixed-asset `exitAll` is blocked in this UI.
          </p>
        ) : null}

        {p.statusMessage ? (
          <p className="mt-3 text-sm text-emerald-800">{p.statusMessage}</p>
        ) : null}
        {p.error ? (
          <p className="mt-2 text-sm text-[#b42318]" role="alert">
            {p.error}
          </p>
        ) : null}
        {p.lastTxHash && p.explorerUrl ? (
          <p className="mt-2 font-mono text-xs text-[#5b6b7c]">
            <a
              href={p.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#1a4f8c] underline-offset-2 hover:underline"
            >
              {p.lastTxHash}
            </a>
          </p>
        ) : null}
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1f3a]/45 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm Withdraw All"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-bold text-[#0b1f3a]">Withdraw All · Receive USDC</h2>
            {usdcExitReady && preview ? (
              <ul className="mt-4 space-y-2 text-sm text-[#0b1f3a]">
                <li className="flex justify-between">
                  <span className="text-[#5b6b7c]">Estimated USDC</span>
                  <span className="font-semibold tabular-nums">
                    ${formatUnits(preview.estimatedUsdcOut, 6)}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-[#5b6b7c]">Minimum USDC</span>
                  <span className="font-semibold tabular-nums">
                    ${formatUnits(preview.minUsdcOut, 6)}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-[#5b6b7c]">Price impact (vs $20)</span>
                  <span className="font-semibold tabular-nums">{preview.priceImpactBps} bps</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-[#5b6b7c]">Gas</span>
                  <span className="font-semibold">Network estimate at confirm</span>
                </li>
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-[#5b6b7c]">
                This action is not enabled on live Base until the contract upgrade is deployed.
                Estimated display value: {totalPositionLabel}. No transaction will be broadcast.
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-11 rounded-xl border border-[#d7e0ec] text-sm font-semibold text-[#0b1f3a]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!usdcExitReady || p.busy}
                onClick={confirmWithdraw}
                className="h-11 rounded-xl bg-[#0b1f3a] text-sm font-bold text-white disabled:opacity-45"
              >
                {usdcExitReady ? "Confirm" : "Unavailable"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
