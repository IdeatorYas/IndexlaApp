"use client";

import { useMemo, useState } from "react";
import {
  formatApyDisplay,
  useStableClubPoolApyMap,
} from "@/components/stable-club/useStableClubPoolApy";
import type { useFivePoolPositions } from "@/components/stable-club/useFivePoolPositions";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  allocationPercentFromBps,
  formatPositionValueDisplay,
} from "@/lib/stable-club/position-display";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";
import { isLaunchAutomationEnabledForEnvironment } from "@/lib/stable-club/local-automation-policy";

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

/**
 * Connected + open positions: one table, three strategy-level actions.
 */
export function StableClubPositionDashboard({
  positionsApi,
}: {
  positionsApi: PositionsApi;
}) {
  const p = positionsApi;
  const wallet = useStableClubWallet();
  const { byPoolId: apyByPoolId, loading: apyLoading } = useStableClubPoolApyMap();
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const harvestEnabled = isLaunchAutomationEnabledForEnvironment("harvest", null);
  const compoundEnabled = isLaunchAutomationEnabledForEnvironment("compound", null);

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
        return {
          key: `${pos.legIndex}-${pos.positionTokenId.toString()}`,
          poolName: pos.poolLabel,
          apy,
          allocation: allocationPercentFromBps(pos.allocationBps),
          value: formatPositionValueDisplay({
            amountA: pos.amountA,
            amountB: pos.amountB,
            tokenASymbol: pos.tokenASymbol,
            tokenBSymbol: pos.tokenBSymbol,
            decimalsA: tokenDecimals(pos.tokenASymbol),
            decimalsB: tokenDecimals(pos.tokenBSymbol),
          }),
        };
      });
  }, [apyByPoolId, apyLoading, p.positions]);

  const withdrawDisabled =
    p.busy ||
    p.positions.length === 0 ||
    p.strategyRevoked ||
    p.strategyExpired ||
    !p.onExpectedChain;

  const onWithdrawAll = () => {
    setLocalMsg(null);
    void p.exitAll();
  };

  return (
    <section
      id="my-stable-club-position"
      className="rounded-2xl border border-[#d7e0ec] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,58,0.06)] sm:p-6"
      aria-label="My Stable Club Position"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e6edf5] pb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5b6b7c]">
            Stable Club · Base
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0b1f3a] sm:text-[1.75rem]">
            My Stable Club Position
          </h1>
        </div>
        <div className="text-right text-sm text-[#5b6b7c]">
          <p className="font-mono text-[#0b1f3a]">
            {wallet.address
              ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
              : "—"}
          </p>
          <button
            type="button"
            disabled={p.busy || p.positionsLoading}
            onClick={() => void p.refreshPositions()}
            className="mt-1 text-xs font-semibold text-[#1a4f8c] underline-offset-2 hover:underline disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </header>

      {p.positionsLoading ? (
        <p className="mt-5 text-sm text-[#5b6b7c]">Loading on-chain positions…</p>
      ) : null}
      {p.positionsError ? (
        <p className="mt-5 text-sm text-[#b42318]" role="alert">
          Could not load positions: {p.positionsError}
        </p>
      ) : null}

      {!p.positionsLoading && rows.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-[15px] text-[#0b1f3a]">
            <thead>
              <tr className="border-b border-[#e6edf5] text-[12px] font-bold uppercase tracking-[0.08em] text-[#5b6b7c]">
                <th className="py-2.5 pr-3 font-bold">Pool</th>
                <th className="py-2.5 pr-3 font-bold">Live APY</th>
                <th className="py-2.5 pr-3 font-bold">Allocation</th>
                <th className="py-2.5 font-bold">Position value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[#eef3f8]">
                  <td className="py-3.5 pr-3 font-semibold">{row.poolName}</td>
                  <td className="py-3.5 pr-3 tabular-nums text-emerald-700">{row.apy}</td>
                  <td className="py-3.5 pr-3 tabular-nums">{row.allocation}</td>
                  <td className="py-3.5 font-mono text-[13px] sm:text-[14px]">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-6 grid gap-2 sm:grid-cols-3">
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
              Harvest All
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
              Compound All
            </button>
          </ComingSoonTip>
        )}

        <button
          type="button"
          disabled={withdrawDisabled}
          onClick={onWithdrawAll}
          className="h-12 rounded-xl bg-[#0b1f3a] text-sm font-bold uppercase tracking-[0.06em] text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          Withdraw All
        </button>
      </div>

      {p.statusMessage ? (
        <p className="mt-3 text-sm text-emerald-800">{p.statusMessage}</p>
      ) : null}
      {p.error ? (
        <p className="mt-2 text-sm text-[#b42318]" role="alert">
          {p.error}
        </p>
      ) : null}
      {localMsg ? <p className="mt-2 text-sm text-[#5b6b7c]">{localMsg}</p> : null}
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
    </section>
  );
}
