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
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0b1f3a] text-[10px] font-bold text-white">
          {sym(a).slice(0, 2)}
        </span>
      )}
      {sb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sb} alt="" className="-ml-2.5 h-8 w-8 rounded-full ring-1 ring-white" />
      ) : (
        <span className="-ml-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1a4f8c] text-[10px] font-bold text-white">
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
  const [lastRefreshAt, setLastRefreshAt] = useState(() => Date.now());

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
        void refreshPositions().then(() => {
          setLastRefreshAt(Date.now());
          setRefreshEpoch((n) => n + 1);
        });
      }
    }, 45_000);
    return () => window.clearInterval(id);
  }, [p.busy, refreshPositions]);

  /**
   * Always render all five official catalogue pools.
   * Live discovery fills value/claimable; missing legs stay visible (no disappearing rows).
   */
  const rows = useMemo(() => {
    const positionsByPool = new Map<string, typeof p.positions>();
    for (const pos of p.positions) {
      const key = pos.poolId.toLowerCase();
      const list = positionsByPool.get(key) ?? [];
      list.push(pos);
      positionsByPool.set(key, list);
    }

    return OFFICIAL_STABLE_CLUB_BASE_POOLS.map((catalogue) => {
      const live = positionsByPool.get(catalogue.poolIdHash.toLowerCase()) ?? [];
      const allocationBps =
        live[0]?.allocationBps ?? FIVE_POOL_DEFAULT_ALLOCATION_BPS;
      let amountA = BigInt(0);
      let amountB = BigInt(0);
      let claimableUsd = 0;
      let valueUsdc: bigint | null = null;
      let active = false;
      for (const pos of live) {
        amountA += pos.amountA;
        amountB += pos.amountB;
        const claim = claimable.rows.find((r) => r.legIndex === pos.legIndex);
        claimableUsd += claim?.approxUsdc ?? 0;
        const legUsd = usdValue.rows.find((r) => r.legIndex === pos.legIndex);
        if (legUsd?.valueUsdc != null) {
          valueUsdc = (valueUsdc ?? BigInt(0)) + legUsd.valueUsdc;
        }
        active =
          active ||
          (pos.liquidity > BigInt(0) && pos.rangeStatus !== "out-of-range");
      }
      const tokenASymbol = live[0]?.tokenASymbol ?? catalogue.tokenA.symbol;
      const tokenBSymbol = live[0]?.tokenBSymbol ?? catalogue.tokenB.symbol;
      const discovered = live.length > 0;
      return {
        key: catalogue.poolIdHash,
        pair: `${sym(tokenASymbol)}/${sym(tokenBSymbol)}`,
        protocol: protocolDisplayName(catalogue.protocol),
        feeLabel: formatOfficialPoolFee(catalogue),
        tokenASymbol,
        tokenBSymbol,
        apy: formatApyDisplay(apyByPoolId[catalogue.id], apyLoading),
        allocation: allocationPercentFromBps(allocationBps),
        allocationPct: Number(allocationBps) / 100,
        value: !discovered
          ? p.positionsLoading
            ? "…"
            : "—"
          : valueUsdc != null
            ? `$${Number(formatUnits(valueUsdc, 6)).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}`
            : formatPositionValueDisplay({
                amountA,
                amountB,
                tokenASymbol: sym(tokenASymbol),
                tokenBSymbol: sym(tokenBSymbol),
                decimalsA: tokenDecimals(tokenASymbol),
                decimalsB: tokenDecimals(tokenBSymbol),
              }),
        claimableUsd: discovered ? claimableUsd : 0,
        active: discovered ? active : false,
        nftCount: live.length,
        discovered,
      };
    });
  }, [
    apyByPoolId,
    apyLoading,
    claimable.rows,
    p.positions,
    p.positionsLoading,
    usdValue.rows,
  ]);

  const blendedApy = useMemo(() => {
    const nums = rows
      .filter((r) => r.discovered)
      .map((r) => Number(r.apy.replace("%", "")))
      .filter((n) => Number.isFinite(n));
    if (apyLoading) return "…";
    if (!nums.length) return "Unavailable";
    return `${(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)}%`;
  }, [apyLoading, rows]);

  const totalValue =
    usdValue.totalUsdc != null ? Number(formatUnits(usdValue.totalUsdc, 6)) : null;
  const secondsAgo = Math.max(0, Math.floor((now - lastRefreshAt) / 1000));

  const actionsBusy =
    p.busy ||
    p.positions.length === 0 ||
    p.strategyRevoked ||
    p.strategyExpired ||
    !p.onExpectedChain;

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
    "h-12 rounded-xl border border-[#0b1f3a]/18 bg-white text-[12px] font-extrabold uppercase tracking-[0.07em] text-[#0b1f3a] transition hover:bg-[#f5f9fc] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section
      id="my-stable-club-position"
      className="overflow-hidden rounded-2xl border border-[#b8cce3] bg-gradient-to-b from-white to-[#f2f7fc] shadow-[0_12px_40px_rgba(11,31,58,0.10)]"
      aria-label="My Stable Club Position"
    >
      <div className="bg-[linear-gradient(125deg,#071526_0%,#0b1f3a_40%,#1a4f8c_100%)] px-4 py-5 text-white sm:px-6 sm:py-6">
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
              {p.positionsLoading
                ? "Syncing LPs…"
                : secondsAgo < 5
                  ? "Updated just now"
                  : `Updated ${secondsAgo}s ago`}
              {fetchedAt
                ? ` · APY ${source ?? "DefiLlama"} ${new Date(fetchedAt).toLocaleTimeString()}`
                : ""}
            </p>
          </div>
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
            {rows.map((row, i) => (
              <div
                key={row.key}
                style={{
                  width: `${Math.max(row.allocationPct, 10)}%`,
                  background: ["#2dd4bf", "#38bdf8", "#818cf8", "#34d399", "#22d3ee"][i % 5],
                  opacity: row.discovered ? 1 : 0.35,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 py-3.5 sm:px-5 sm:py-4">
        {p.stale || p.positionsError ? (
          <p className="mb-2 text-sm text-amber-800" role="status">
            {p.positionsError ??
              "Position data may be incomplete — tap Refresh if a pool looks missing."}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[#0b1f3a]">
            <thead>
              <tr className="border-b border-[#e6edf5] text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#5b6b7c]">
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
                        <p className="text-[15px] font-extrabold leading-tight tracking-tight">
                          {row.pair}
                          {row.nftCount > 1 ? (
                            <span className="ml-1.5 text-[10px] font-bold text-[#5b6b7c]">
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
                  <td className="py-3 pr-2 font-mono text-[14px] font-bold">{row.value}</td>
                  <td className="py-3 pr-2 text-[14px] font-extrabold tabular-nums">
                    {row.allocation}
                  </td>
                  <td className="py-3 pr-2 text-[14px] font-extrabold tabular-nums text-emerald-700">
                    {row.apy}
                  </td>
                  <td className="py-3 pr-2 text-[14px] font-bold tabular-nums">
                    {row.discovered ? `≈ $${row.claimableUsd.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-3">
                    <span
                      className={
                        !row.discovered
                          ? "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-600"
                          : row.active
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700"
                            : "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700"
                      }
                    >
                      {!row.discovered
                        ? p.positionsLoading
                          ? "Syncing"
                          : "Pending"
                        : row.active
                          ? "Active"
                          : "Check"}
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
                ? "h-12 rounded-xl border-2 border-[#0b1f3a] bg-[#0b1f3a]/[0.06] text-[12px] font-extrabold uppercase tracking-[0.07em] text-[#0b1f3a] disabled:opacity-40"
                : actionBtn
            }
          >
            Add Funds
          </button>
          <button
            type="button"
            disabled={!harvestCompoundReady || actionsBusy}
            onClick={() => void afterAction(() => p.harvestAll())}
            className={actionBtn}
          >
            Harvest
          </button>
          <button
            type="button"
            disabled={!harvestCompoundReady || actionsBusy}
            onClick={() => void afterAction(() => p.compoundAll())}
            className={actionBtn}
          >
            Compound
          </button>
          <button
            type="button"
            disabled={actionsBusy}
            onClick={() => {
              setWithdrawPreset(100);
              setCustomPercent("50");
              setConfirmOpen(true);
            }}
            className="h-12 rounded-xl bg-[#0b1f3a] text-[12px] font-extrabold uppercase tracking-[0.07em] text-white shadow-[0_8px_22px_rgba(11,31,58,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Withdraw
          </button>
        </div>

        {p.incompleteWithdraw || p.strandedAssets.length > 0 ? (
          <div
            className="mt-4 rounded-xl border border-[#d7e0ec] bg-[#f8fafc] px-3.5 py-3 text-sm text-[#0b1f3a]"
            role="status"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#5b6b7c]">
              {p.incompleteWithdraw
                ? "Incomplete withdraw"
                : "Stranded wallet assets"}
            </p>
            {p.strandedAssets.length > 0 ? (
              <ul className="mt-2 space-y-1 font-mono text-[13px] font-semibold">
                {p.strandedAssets.map((row) => (
                  <li key={`${row.tokenIn}-${row.amountIn.toString()}`} className="flex justify-between gap-3">
                    <span>{row.symbol}</span>
                    <span>
                      {formatUnits(row.amountIn, tokenDecimals(row.symbol))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-[#5b6b7c]">
                Remaining LP batch(es) still need to exit, then residue converts to USDC.
              </p>
            )}
            <p className="mt-2 text-[12px] leading-snug text-[#5b6b7c]">
              {p.incompleteWithdraw ? (
                <>
                  Withdrawal residue from an interrupted exit (cbBTC is often shown as WBTC in
                  wallets, plus WETH). Resume converts <strong>only</strong> this residue to USDC
                  and finishes any remaining LP — it does not re-exit completed batches or touch
                  pre-withdraw balances.
                </>
              ) : (
                <>
                  These balances are in your wallet. Resume appears when an interrupted Withdraw
                  checkpoint exists so unrelated holdings stay untouched.
                </>
              )}
            </p>
            <button
              type="button"
              disabled={actionsBusy || !p.incompleteWithdraw}
              onClick={() => void p.resumeIncompleteWithdraw()}
              className="mt-3 h-10 w-full rounded-xl bg-[#0b1f3a] text-[11px] font-extrabold uppercase tracking-[0.07em] text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Resume incomplete withdraw → USDC
            </button>
          </div>
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
            aria-label="Confirm Withdraw"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-bold text-[#0b1f3a]">Withdraw · Receive USDC</h2>
            <p className="mt-2 text-sm text-[#5b6b7c]">
              Atomic INDEXLA executor exit: close remaining LP liquidity → unwind non-USDC → send{" "}
              <span className="font-semibold">USDC only</span> to your wallet. One executor
              transaction (NFT adapter approvals first if still needed). Never calls Uniswap/Aerodrome
              NPM from your wallet. Reverts on failure.
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
                          ? "h-11 rounded-xl bg-[#0b1f3a] text-sm font-bold text-white"
                          : "h-11 rounded-xl border border-[#d7e0ec] text-sm font-semibold text-[#0b1f3a]"
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
                      ? "mt-2 h-11 w-full rounded-xl bg-[#0b1f3a] text-sm font-bold text-white"
                      : "mt-2 h-11 w-full rounded-xl border border-[#d7e0ec] text-sm font-semibold text-[#0b1f3a]"
                  }
                >
                  Custom %
                </button>
                {withdrawPreset === "custom" ? (
                  <label className="mt-3 block text-sm text-[#5b6b7c]">
                    Percent (1–100)
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={customPercent}
                      onChange={(e) => setCustomPercent(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-[#d7e0ec] px-3 font-semibold text-[#0b1f3a]"
                    />
                  </label>
                ) : null}
                {!withdrawPercentValid ? (
                  <p className="mt-2 text-sm text-[#b42318]" role="alert">
                    Enter a percent between 1 and 100.
                  </p>
                ) : !exitPercentExecutable && Math.round(withdrawPercent) !== 100 ? (
                  <p className="mt-2 text-sm text-[#b42318]" role="alert">
                    Custom % is not available on this deployment. Choose{" "}
                    <span className="font-semibold">100%</span> for atomic USDC exit.
                  </p>
                ) : withdrawStackKind === "legacy" ? (
                  <p className="mt-2 text-sm text-[#5b6b7c]">
                    Removes {Math.round(withdrawPercent)}% of remaining LP liquidity as NFT
                    owner (no permit) → sells non-USDC on Uniswap → USDC to your wallet.
                    NPM calls are batched per position manager to save gas. Needs a small
                    amount of Base ETH for gas (~a few thousandths).
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[#5b6b7c]">
                    Removes {Math.round(withdrawPercent)}% of remaining LP liquidity → sells
                    non-USDC → sends USDC only to your wallet (one atomic tx).
                  </p>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-[#5b6b7c]">
                Exits <span className="font-semibold">100%</span> of remaining LP liquidity →
                sells non-USDC → sends USDC only to your wallet.
              </p>
            )}

            {usdValue.totalUsdc != null && usdValue.totalUsdc > BigInt(0) ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                <li className="flex justify-between">
                  <span className="text-[#5b6b7c]">Est. remaining LP (USDC)</span>
                  <span className="font-semibold">${formatUnits(usdValue.totalUsdc, 6)}</span>
                </li>
              </ul>
            ) : null}

            <div className="mt-4 rounded-xl border border-[#d7e0ec] bg-[#f8fafc] px-3.5 py-3 text-[12px] leading-snug text-[#0b1f3a]">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#5b6b7c]">
                Authority step · Base
              </p>
              <p className="mt-2 text-[#5b6b7c]">
                {withdrawStackKind === "legacy" ? (
                  <>
                    Legacy positions call each protocol NPM as NFT owner (
                    <span className="font-mono text-[#0b1f3a]">decreaseLiquidity</span> /{" "}
                    <span className="font-mono text-[#0b1f3a]">collect</span>), batched per NPM —
                    no <span className="font-mono text-[#0b1f3a]">approve</span> /{" "}
                    <span className="font-mono text-[#0b1f3a]">permit</span> to IndexLa adapters
                    (those adapters are not Basescan-verified yet, which triggered wallet
                    “approves ERC20 to an unverified contract”). Then Uniswap SwapRouter sells
                    cbBTC/WETH → USDC. Top up Base ETH if the app reports a gas shortfall.
                  </>
                ) : (
                  <>
                    Withdraw asks for an{" "}
                    <span className="font-semibold text-[#0b1f3a]">LP NFT permit</span> (EIP-712
                    signature + on-chain <span className="font-mono text-[#0b1f3a]">permit</span>{" "}
                    selector{" "}
                    <span className="font-mono font-semibold text-[#0b1f3a]">0x7ac2ff7b</span>) —
                    not ERC20/ERC721 <span className="font-mono text-[#0b1f3a]">approve</span>{" "}
                    (<span className="font-mono text-[#0b1f3a]">0x095ea7b3</span>). Authority is one
                    tokenId → one IndexLa adapter; funds stay in the LP until the atomic exit tx
                    (reverts on failure).
                  </>
                )}
              </p>
              <p className="mt-2 text-[#5b6b7c]">
                Stack:{" "}
                <span className="font-semibold text-[#0b1f3a]">
                  {withdrawStackKind === "legacy"
                    ? "legacy adapters (100% = atomic INDEXLA; custom % = owner NPM)"
                    : "current adapters (% exits enabled)"}
                </span>
                .
              </p>
              <p className="mt-2 text-[#5b6b7c]">
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
                        className="font-mono text-[#1a4f8c] underline-offset-2 hover:underline"
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
                className="h-10 rounded-xl border border-[#d7e0ec] text-sm font-semibold"
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
                className="h-10 rounded-xl bg-[#0b1f3a] text-sm font-bold text-white disabled:opacity-45"
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
