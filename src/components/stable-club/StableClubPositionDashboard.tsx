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
import {
  allocationPercentFromBps,
  FIVE_POOL_DEFAULT_ALLOCATION_BPS,
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
        <img src={sa} alt="" className="h-8 w-8 rounded-full ring-1 ring-white" />
      ) : (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-[10px] font-bold text-white">
          {sym(a).slice(0, 2)}
        </span>
      )}
      {sb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sb} alt="" className="-ml-2.5 h-8 w-8 rounded-full ring-1 ring-white" />
      ) : (
        <span className="-ml-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-brand)] text-[10px] font-bold text-white">
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
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const claimable = usePositionClaimableFees(
    p.positions.map((pos) => ({
      legIndex: pos.legIndex,
      npm: pos.npm,
      positionTokenId: pos.positionTokenId,
    })),
    refreshEpoch,
  );
  const usdValue = usePositionUsdValue(
    p.positions.map((pos) => ({
      legIndex: pos.legIndex,
      tokenA: pos.tokenA,
      tokenB: pos.tokenB,
      amountA: pos.amountA,
      amountB: pos.amountB,
    })),
    refreshEpoch,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [withdrawPreset, setWithdrawPreset] = useState<20 | 50 | 100 | "custom">(100);
  const [customPercent, setCustomPercent] = useState("50");
  const [now, setNow] = useState(() => Date.now());
  const [lastRefreshAt, setLastRefreshAt] = useState(0);

  const harvestCompoundReady = p.exitAllToUsdcAvailable;
  const exitPercentEnabled = p.exitPercentToUsdcAvailable;
  const exitPercentExecutable = p.exitPercentExecutable !== false;
  const withdrawStackKind = p.withdrawStackKind ?? "primary";
  const refreshPositions = p.refreshPositions;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!p.busy) {
        void refreshPositions({ quiet: true }).then(() => {
          setLastRefreshAt(Date.now());
          setRefreshEpoch((n) => n + 1);
        });
      }
    }, 45_000);
    return () => window.clearInterval(id);
  }, [p.busy, refreshPositions]);

  useEffect(() => {
    if (!p.positionsLoading && lastRefreshAt === 0) {
      setLastRefreshAt(Date.now());
    }
  }, [p.positionsLoading, lastRefreshAt]);

  /**
   * Only the connected wallet’s discovered LPs with liquidity.
   * Catalogue placeholders are never shown as fake “Pending” positions.
   */
  const rows = useMemo(() => {
    const catalogueByHash = new Map(
      OFFICIAL_STABLE_CLUB_BASE_POOLS.map((c) => [c.poolIdHash.toLowerCase(), c]),
    );
    const active = p.positions.filter((pos) => pos.liquidity > BigInt(0));
    return active.map((pos) => {
      const catalogue = catalogueByHash.get(pos.poolId.toLowerCase());
      const claim = claimable.rows.find((r) => r.legIndex === pos.legIndex);
      const legUsd = usdValue.rows.find((r) => r.legIndex === pos.legIndex);
      const tokenASymbol = pos.tokenASymbol;
      const tokenBSymbol = pos.tokenBSymbol;
      const allocationBps = pos.allocationBps ?? FIVE_POOL_DEFAULT_ALLOCATION_BPS;
      return {
        key: `${pos.poolId}-${pos.positionTokenId.toString()}`,
        pair: `${sym(tokenASymbol)}/${sym(tokenBSymbol)}`,
        protocol: catalogue
          ? protocolDisplayName(catalogue.protocol)
          : (pos.protocol ?? "CL"),
        feeLabel: catalogue ? formatOfficialPoolFee(catalogue) : "",
        tokenASymbol,
        tokenBSymbol,
        apy: catalogue
          ? formatApyDisplay(apyByPoolId[catalogue.id], apyLoading)
          : "—",
        allocation: allocationPercentFromBps(allocationBps),
        allocationPct: Number(allocationBps) / 100,
        value:
          legUsd?.valueUsdc != null
            ? `$${Number(formatUnits(legUsd.valueUsdc, 6)).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}`
            : formatPositionValueDisplay({
                amountA: pos.amountA,
                amountB: pos.amountB,
                tokenASymbol: sym(tokenASymbol),
                tokenBSymbol: sym(tokenBSymbol),
                decimalsA: tokenDecimals(tokenASymbol),
                decimalsB: tokenDecimals(tokenBSymbol),
              }),
        claimableUsd: claim?.approxUsdc ?? 0,
        active: pos.rangeStatus !== "out-of-range",
        nftCount: 1,
        discovered: true,
      };
    });
  }, [
    apyByPoolId,
    apyLoading,
    claimable.rows,
    p.positions,
    usdValue.rows,
  ]);

  const hasSettledDiscovery = !p.positionsLoading;
  const showRpcError =
    hasSettledDiscovery && Boolean(p.positionsError) && rows.length === 0;
  const isEmpty = hasSettledDiscovery && rows.length === 0 && !showRpcError;

  const blendedApy = useMemo(() => {
    const nums = rows
      .map((r) => Number(r.apy.replace("%", "")))
      .filter((n) => Number.isFinite(n));
    if (apyLoading && rows.length === 0) return "…";
    if (!nums.length) return rows.length === 0 ? "—" : "Unavailable";
    return `${(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)}%`;
  }, [apyLoading, rows]);

  const totalValue =
    usdValue.totalUsdc != null ? Number(formatUnits(usdValue.totalUsdc, 6)) : null;
  const secondsAgo = Math.max(0, Math.floor((now - lastRefreshAt) / 1000));
  const updatedLabel = !hasSettledDiscovery
    ? "Syncing LPs…"
    : lastRefreshAt === 0
      ? "Ready"
      : secondsAgo < 5
        ? "Updated just now"
        : `Updated ${secondsAgo}s ago`;

  const withdrawBusy =
    p.busy ||
    p.positions.length === 0 ||
    p.strategyRevoked ||
    p.strategyExpired ||
    !p.onExpectedChain;

  const addFundsBusy = p.busy || p.strategyRevoked || p.strategyExpired || !p.onExpectedChain;

  const withdrawPercent = !exitPercentEnabled
    ? 100
    : withdrawPreset === "custom"
      ? Number.parseFloat(customPercent)
      : withdrawPreset;
  const withdrawPercentValid =
    Number.isFinite(withdrawPercent) &&
    withdrawPercent >= 1 &&
    withdrawPercent <= 100;
  const withdrawConfirmReady = exitPercentEnabled
    ? withdrawPercentValid
    : true;

  const uniqueAdapters = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const pos of p.positions) {
      const key = pos.adapter.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pos.adapter);
    }
    return out;
  }, [p.positions]);

  const markRefreshed = () => {
    setLastRefreshAt(Date.now());
    setRefreshEpoch((n) => n + 1);
  };

  const afterAction = async (fn: () => Promise<void>) => {
    await fn();
    await refreshPositions();
    markRefreshed();
  };

  const actionBtn =
    "h-12 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-bg-elevated)] text-[12px] font-extrabold uppercase tracking-[0.07em] text-[var(--color-ink)] transition hover:bg-[var(--color-panel)] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section
      id="my-stable-club-position"
      className="app-panel overflow-hidden rounded-2xl"
      aria-label="My Stable Club Position"
    >
      <div className="bg-[linear-gradient(125deg,#07111f_0%,#0d1b33_42%,#1d4ed8_100%)] px-4 py-5 text-white sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Live on Base
            </div>
            <h1 className="mt-2.5 text-[1.65rem] font-extrabold tracking-[-0.03em] sm:text-[1.85rem]">
              My Position
            </h1>
            <p className="mt-1.5 text-[12px] font-medium text-white/65">
              {wallet.address
                ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
                : "Wallet"}
              {" · "}
              {updatedLabel}
              {fetchedAt
                ? ` · APY ${source ?? "DefiLlama"} ${new Date(fetchedAt).toLocaleTimeString()}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!depositsEnabled || addFundsBusy}
              onClick={() => onAddFunds?.()}
              className={
                addFundsOpen
                  ? "rounded-lg border border-white bg-white px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#07111f]"
                  : "rounded-lg border border-white/25 bg-[#2563eb] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] disabled:opacity-45"
              }
            >
              Add Funds
            </button>
            <button
              type="button"
              disabled={p.busy || p.positionsLoading}
              onClick={() =>
                void refreshPositions().then(() => {
                  markRefreshed();
                })
              }
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold disabled:opacity-45"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-xl bg-white/10 px-4 py-3.5 sm:col-span-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
              Total Position Value
            </p>
            <p className="mt-1.5 text-[2.05rem] font-extrabold tabular-nums tracking-tight leading-none">
              {usdValue.loading
                ? "…"
                : totalValue != null
                  ? `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : "Unavailable"}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
              Blended APY
            </p>
            <p className="mt-1.5 text-[1.55rem] font-extrabold tabular-nums text-teal-200">
              {blendedApy}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
              Claimable Rewards
            </p>
            <p className="mt-1.5 text-[1.55rem] font-extrabold tabular-nums text-emerald-300">
              {claimable.loading
                ? "…"
                : `≈ $${claimable.totalApproxUsdc.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}`}
            </p>
          </div>
        </div>

        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/15">
          <div className="flex h-full">
            {rows.length === 0 ? (
              <div className="h-full w-full bg-white/10" />
            ) : (
              rows.map((row, i) => (
              <div
                key={row.key}
                style={{
                  width: `${Math.max(100 / Math.max(rows.length, 1), row.allocationPct)}%`,
                  background: ["#2dd4bf", "#38bdf8", "#818cf8", "#34d399", "#22d3ee"][i % 5],
                  opacity: 1,
                }}
              />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="px-3 py-3.5 sm:px-5 sm:py-4">
        {p.stale && rows.length > 0 ? (
          <p className="mb-2 text-sm text-amber-800 dark:text-amber-300" role="status">
            {p.positionsError ??
              "Position data may be incomplete — tap Refresh if a pool looks missing."}
          </p>
        ) : null}

        {!hasSettledDiscovery ? (
          <div
            className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-4 py-8"
            role="status"
            aria-busy="true"
          >
            <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--color-brand)]/30" />
            <p className="text-sm font-semibold text-[var(--color-ink-muted)]">
              Loading your LP positions…
            </p>
          </div>
        ) : showRpcError ? (
          <div
            className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-panel)] px-4 py-8 text-center"
            role="alert"
          >
            <p className="text-sm font-semibold text-[var(--color-danger)]">
              Couldn’t load positions
            </p>
            <p className="max-w-sm text-[13px] text-[var(--color-ink-muted)]">
              {p.positionsError}
            </p>
            <button
              type="button"
              disabled={p.busy}
              onClick={() => void refreshPositions().then(() => markRefreshed())}
              className="h-10 rounded-xl bg-[var(--color-brand)] px-4 text-[11px] font-extrabold uppercase tracking-[0.07em] text-white disabled:opacity-40"
            >
              Retry
            </button>
          </div>
        ) : isEmpty ? (
          <div
            className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-4 py-8 text-center"
            role="status"
          >
            <p className="text-base font-bold text-[var(--color-ink)]">No active positions</p>
            <p className="max-w-sm text-[13px] text-[var(--color-ink-muted)]">
              This wallet has no open Stable Club LP NFTs. Deposit USDC to open five-pool
              positions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[var(--color-ink)]">
              <thead>
                <tr className="border-b border-[var(--color-panel-border)] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--color-ink-dim)]">
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
                  <tr key={row.key} className="border-b border-[var(--color-panel-border)]/60">
                    <td className="py-3 pr-2">
                      <div className="flex items-center gap-2.5">
                        <TokenPairMarks a={row.tokenASymbol} b={row.tokenBSymbol} />
                        <div>
                          <p className="text-[15px] font-extrabold leading-tight tracking-tight">
                            {row.pair}
                          </p>
                          <p className="mt-0.5 text-[11px] font-semibold text-[var(--color-ink-dim)]">
                            {row.protocol}
                            {row.feeLabel ? ` · ${row.feeLabel}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-2 font-mono text-[14px] font-bold">{row.value}</td>
                    <td className="py-3 pr-2 text-[14px] font-extrabold tabular-nums">
                      {row.allocation}
                    </td>
                    <td className="py-3 pr-2 text-[14px] font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {row.apy}
                    </td>
                    <td className="py-3 pr-2 text-[14px] font-bold tabular-nums">
                      ≈ ${row.claimableUsd.toFixed(2)}
                    </td>
                    <td className="py-3">
                      <span
                        className={
                          row.active
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                            : "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
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
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            disabled={!depositsEnabled || addFundsBusy}
            onClick={() => onAddFunds?.()}
            className={
              addFundsOpen
                ? "h-12 rounded-xl border-2 border-[var(--color-ink)]/20 bg-[var(--color-brand)]/10 text-[12px] font-extrabold uppercase tracking-[0.07em] text-[var(--color-ink)] disabled:opacity-40"
                : actionBtn
            }
          >
            Add Funds
          </button>
          <button
            type="button"
            disabled={!harvestCompoundReady || withdrawBusy}
            onClick={() => void afterAction(() => p.harvestAll())}
            className={actionBtn}
          >
            Harvest
          </button>
          <button
            type="button"
            disabled={!harvestCompoundReady || withdrawBusy}
            onClick={() => void afterAction(() => p.compoundAll())}
            className={actionBtn}
          >
            Compound
          </button>
          <button
            type="button"
            disabled={withdrawBusy}
            onClick={() => {
              setWithdrawPreset(100);
              setCustomPercent("50");
              setConfirmOpen(true);
            }}
            className="h-12 rounded-xl bg-[var(--color-brand)] text-[12px] font-extrabold uppercase tracking-[0.07em] text-white shadow-[0_8px_22px_rgba(37,99,235,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Withdraw
          </button>
        </div>

        {p.statusMessage ? (
          <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">{p.statusMessage}</p>
        ) : null}
        {p.error ? (
          <p className="mt-2 text-sm text-[var(--color-danger)]" role="alert">
            {p.error}
          </p>
        ) : null}
        {p.lastTxHash && p.explorerUrl ? (
          <p className="mt-2 font-mono text-[11px]">
            <a
              href={p.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-brand)] underline-offset-2 hover:underline"
            >
              BaseScan {p.lastTxHash.slice(0, 10)}…
            </a>
          </p>
        ) : null}
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_srgb,var(--color-ink)_45%,transparent)] p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm Withdraw"
            className="w-full max-w-md rounded-2xl bg-[var(--color-bg-elevated)] p-5 text-[var(--color-ink)] shadow-xl"
          >
            <h2 className="text-lg font-bold text-[var(--color-ink)]">Withdraw · Receive USDC</h2>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              Removes liquidity as NFT owner across all five pools (batched per NPM), then
              automatically sells withdrawal residue (cbBTC + WETH) to{" "}
              <span className="font-semibold">USDC only</span> in your wallet. Success is shown
              only after USDC increases and residue is cleared. At 100%, removes all remaining
              liquidity.
            </p>

            {exitPercentEnabled ? (
              <>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {([20, 50, 100] as const).map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setWithdrawPreset(pct)}
                      className={
                        withdrawPreset === pct
                          ? "h-11 rounded-xl bg-[var(--color-brand)] text-sm font-bold text-white"
                          : "h-11 rounded-xl border border-[var(--color-panel-border)] text-sm font-semibold text-[var(--color-ink)]"
                      }
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setWithdrawPreset("custom")}
                  className={
                    withdrawPreset === "custom"
                      ? "mt-2 h-11 w-full rounded-xl bg-[var(--color-brand)] text-sm font-bold text-white"
                      : "mt-2 h-11 w-full rounded-xl border border-[var(--color-panel-border)] text-sm font-semibold text-[var(--color-ink)]"
                  }
                >
                  Custom %
                </button>
                {withdrawPreset === "custom" ? (
                  <label className="mt-3 block text-sm text-[var(--color-ink-muted)]">
                    Percent (1–100)
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={customPercent}
                      onChange={(e) => setCustomPercent(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-bg-elevated)] px-3 font-semibold text-[var(--color-ink)]"
                    />
                  </label>
                ) : null}
                {!withdrawPercentValid ? (
                  <p className="mt-2 text-sm text-[var(--color-danger)]" role="alert">
                    Enter a percent between 1 and 100.
                  </p>
                ) : !exitPercentExecutable && Math.round(withdrawPercent) !== 100 ? (
                  <p className="mt-2 text-sm text-[var(--color-danger)]" role="alert">
                    Custom % is not available on this deployment. Choose{" "}
                    <span className="font-semibold">100%</span> for atomic USDC exit.
                  </p>
                ) : withdrawStackKind === "legacy" ? (
                  <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                    Removes {Math.round(withdrawPercent)}% of remaining LP liquidity as NFT
                    owner (no permit) → sells non-USDC on Uniswap → USDC to your wallet.
                    NPM calls are batched per position manager to save gas. Needs a small
                    amount of Base ETH for gas (~a few thousandths).
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                    Removes {Math.round(withdrawPercent)}% of remaining LP liquidity → sells
                    non-USDC → sends USDC only to your wallet (one atomic tx).
                  </p>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
                Exits <span className="font-semibold">100%</span> of remaining LP liquidity →
                sells non-USDC → sends USDC only to your wallet.
              </p>
            )}

            {usdValue.totalUsdc != null && usdValue.totalUsdc > BigInt(0) ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                <li className="flex justify-between">
                  <span className="text-[var(--color-ink-muted)]">Est. remaining LP (USDC)</span>
                  <span className="font-semibold">${formatUnits(usdValue.totalUsdc, 6)}</span>
                </li>
              </ul>
            ) : null}

            <div className="mt-4 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-3.5 py-3 text-[12px] leading-snug text-[var(--color-ink)]">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                Authority step · Base
              </p>
              <p className="mt-2 text-[var(--color-ink-muted)]">
                {withdrawStackKind === "legacy" ? (
                  <>
                    Legacy positions call each protocol NPM as NFT owner (
                    <span className="font-mono text-[var(--color-ink)]">decreaseLiquidity</span> /{" "}
                    <span className="font-mono text-[var(--color-ink)]">collect</span>), batched per NPM —
                    no <span className="font-mono text-[var(--color-ink)]">approve</span> /{" "}
                    <span className="font-mono text-[var(--color-ink)]">permit</span> to IndexLa adapters
                    (those adapters are not Basescan-verified yet, which triggered wallet
                    “approves ERC20 to an unverified contract”). Then Uniswap SwapRouter sells
                    cbBTC/WETH → USDC. Top up Base ETH if the app reports a gas shortfall.
                  </>
                ) : (
                  <>
                    Withdraw asks for an{" "}
                    <span className="font-semibold text-[var(--color-ink)]">LP NFT permit</span> (EIP-712
                    signature + on-chain <span className="font-mono text-[var(--color-ink)]">permit</span>{" "}
                    selector{" "}
                    <span className="font-mono font-semibold text-[var(--color-ink)]">0x7ac2ff7b</span>) —
                    not ERC20/ERC721 <span className="font-mono text-[var(--color-ink)]">approve</span>{" "}
                    (<span className="font-mono text-[var(--color-ink)]">0x095ea7b3</span>). Authority is one
                    tokenId → one IndexLa adapter; funds stay in the LP until the atomic exit tx
                    (reverts on failure).
                  </>
                )}
              </p>
              <p className="mt-2 text-[var(--color-ink-muted)]">
                Path:{" "}
                <span className="font-semibold text-[var(--color-ink)]">
                  owner NPM + auto Uni→USDC
                </span>
                {withdrawStackKind === "legacy" ? " (legacy adapters)" : " (primary adapters)"}.
              </p>
              <p className="mt-2 text-[11px] leading-snug text-[var(--color-ink-dim)]">
                Wallet confirms (cold): up to 3 NPM multicalls (one per NPM contract) + up to 2
                Uni max-approves (skipped if already live) + 1 residue→USDC multicall sweep.
              </p>
              <p className="mt-2 text-[var(--color-ink-muted)]">
                Open Basescan for each adapter (green check = verified source):
              </p>
              {uniqueAdapters.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {uniqueAdapters.map((adapter) => (
                    <li key={adapter}>
                      <a
                        href={`https://basescan.org/address/${adapter}#code`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[var(--color-brand)] underline-offset-2 hover:underline"
                      >
                        {adapter}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-10 rounded-xl border border-[var(--color-panel-border)] text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  p.busy ||
                  !withdrawConfirmReady ||
                  (exitPercentEnabled &&
                    !exitPercentExecutable &&
                    Math.round(withdrawPercent) !== 100)
                }
                onClick={() => {
                  const pct = exitPercentEnabled ? Math.round(withdrawPercent) : 100;
                  setConfirmOpen(false);
                  void afterAction(() => p.withdrawPercent(pct));
                }}
                className="h-10 rounded-xl bg-[var(--color-brand)] text-sm font-bold text-white disabled:opacity-45"
              >
                Confirm USDC
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
