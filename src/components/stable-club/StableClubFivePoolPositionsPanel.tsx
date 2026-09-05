"use client";

import { useFivePoolPositions } from "@/components/stable-club/useFivePoolPositions";
import {
  formatPositionTokenAmount,
  positionStatusLabel,
} from "@/lib/stable-club/position-display";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";

const PROGRESS_LABEL: Record<string, string> = {
  idle: "Ready",
  "loading-positions": "Loading positions…",
  "awaiting-approval": "Awaiting NFT approval",
  "awaiting-exit": "Awaiting exit confirmation",
  confirmed: "Confirmed",
  partial: "Partial — some exits failed",
  failed: "Failed — retry",
};

function tokenDecimals(symbol: string | undefined): number {
  if (!symbol) return 18;
  const hit = OFFICIAL_STABLE_CLUB_BASE_POOLS.flatMap((p) => [p.tokenA, p.tokenB]).find(
    (t) => t.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  return hit?.decimals ?? 18;
}

export function StableClubFivePoolPositionsPanel() {
  const p = useFivePoolPositions();

  if (p.deploymentsLoading) {
    return (
      <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
        <p className="text-xs text-app-muted">Loading five-pool positions…</p>
      </section>
    );
  }

  if (!p.deployments) {
    return (
      <section className="rounded-[14px] border border-dashed border-amber-500/40 bg-amber-500/5 p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Your five-pool positions</h2>
        <p className="mt-2 text-xs leading-relaxed text-app-muted">
          {p.deploymentsError ??
            "Stable Club deployments are required for live position discovery. Positions are not shown until on-chain data loads."}
        </p>
      </section>
    );
  }

  const openCount = p.positions.length;
  const allocationEach =
    openCount > 0 ? `${(100 / 5).toFixed(0)}% per pool (equal weight)` : "—";

  return (
    <section
      id="five-pool-positions"
      className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5"
      aria-label="Stable Club five-pool positions"
    >
      <h2 className="text-sm font-bold text-app-ink">Your five-pool positions</h2>
      <p className="mt-1 text-xs text-app-muted">
        Live on-chain NFT discovery for this wallet. Values come from Base RPC — never demo
        placeholders. Exit / Withdraw uses INDEXLA executor paths (NFT approve required). Harvest
        and Compound stay disabled until Stage automation is production-ready.
      </p>

      <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-semibold text-app-dim">Strategy</dt>
          <dd className="mt-0.5 font-mono break-all text-app-ink">
            {p.strategyRegistered ? p.strategyId : "Not registered"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Open positions</dt>
          <dd className="mt-0.5 text-app-ink">{openCount} / 5</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Allocation</dt>
          <dd className="mt-0.5 text-app-ink">{allocationEach}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Permission</dt>
          <dd className="mt-0.5 text-app-ink">
            {p.strategyRevoked
              ? "Revoked — use emergency exit"
              : p.strategyExpired
                ? "Expired — use emergency exit"
                : p.strategyRegistered
                  ? "Active"
                  : "None"}
          </dd>
        </div>
      </dl>

      {!p.onExpectedChain ? (
        <p className="mt-3 text-[11px] text-app-danger" role="alert">
          Wrong network — switch wallet to chain {p.expectedChainId} to load positions.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={p.busy}
          onClick={() => void p.refreshPositions()}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Refresh positions
        </button>
        <button
          type="button"
          disabled={p.busy || openCount === 0 || p.strategyRevoked || p.strategyExpired}
          onClick={() => void p.exitAll()}
          className="app-btn-primary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Withdraw all (atomic exit)
        </button>
        <button
          type="button"
          disabled={p.busy || openCount === 0}
          onClick={() => void p.emergencyExitAllSequential()}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Emergency withdraw all
        </button>
        <button
          type="button"
          disabled={p.busy || !p.strategyRegistered || p.strategyRevoked}
          onClick={() => void p.revokeStrategy()}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Revoke strategy
        </button>
      </div>

      {p.positionsLoading ? (
        <p className="mt-4 text-xs text-app-muted">Scanning on-chain NFT mints…</p>
      ) : null}
      {p.positionsError ? (
        <p className="mt-3 text-[11px] text-app-danger" role="alert">
          Could not load positions: {p.positionsError}
        </p>
      ) : null}
      {p.stale ? (
        <p className="mt-2 text-[11px] text-amber-600" role="status">
          Partial discovery — one or more legs could not be matched to catalogue pools. Do not
          assume a full five-pool book until all five appear.
        </p>
      ) : null}

      {!p.positionsLoading && !p.positionsError && openCount === 0 ? (
        <p className="mt-4 text-xs text-app-muted">
          No open Stable Club NFTs found for this wallet on Base. After a successful deposit,
          positions should appear here automatically — use Refresh if they do not.
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {p.positions.map((pos) => {
          const status = positionStatusLabel({
            liquidity: pos.liquidity,
            amountA: pos.amountA,
            amountB: pos.amountB,
            rangeStatus: pos.rangeStatus,
          });
          const decA = tokenDecimals(pos.tokenASymbol);
          const decB = tokenDecimals(pos.tokenBSymbol);
          return (
            <li
              key={`${pos.legIndex}-${pos.positionTokenId.toString()}`}
              className="rounded-lg border border-app-line bg-app-bg/40 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-app-ink">
                    Pool {pos.legIndex + 1} · {pos.poolLabel}
                  </p>
                  <p className="mt-0.5 text-[11px] text-app-muted">
                    {pos.pairLabel} · {pos.protocol} · NFT #{pos.positionTokenId.toString()}
                  </p>
                </div>
                <div className="text-right text-[10px] text-app-dim">
                  <p className="font-semibold text-app-ink">{status}</p>
                  <p>{pos.allocationBps.toString()} bps allocation</p>
                  <p>{pos.adapterApproved ? "Adapter approved" : "Approval required for exit"}</p>
                </div>
              </div>
              <dl className="mt-2 grid gap-1 text-[10px] sm:grid-cols-2">
                <div>
                  <dt className="text-app-dim">Position amounts ({pos.tokenASymbol} / {pos.tokenBSymbol})</dt>
                  <dd className="font-mono text-app-ink">
                    {formatPositionTokenAmount(pos.amountA, decA)} /{" "}
                    {formatPositionTokenAmount(pos.amountB, decB)}
                  </dd>
                </div>
                <div>
                  <dt className="text-app-dim">Liquidity</dt>
                  <dd className="font-mono text-app-ink">{pos.liquidity.toString()}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-app-dim">Uncollected fees</dt>
                  <dd className="text-app-muted">
                    Collected on harvest/exit — not shown as earned USDC until a production harvest
                    path is enabled.
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-app-dim">NFT / protocol</dt>
                  <dd className="font-mono break-all text-app-ink">
                    {pos.explorerNftUrl ? (
                      <a
                        href={pos.explorerNftUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-app-brand underline-offset-2 hover:underline"
                      >
                        {pos.nftContract} #{pos.positionTokenId.toString()}
                      </a>
                    ) : (
                      `${pos.nftContract} #${pos.positionTokenId.toString()}`
                    )}{" "}
                    · {pos.protocolExplorerHint}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={p.busy || p.strategyRevoked || p.strategyExpired}
                  onClick={() => void p.exitIndividual(pos.legIndex)}
                  className="app-btn-secondary h-8 px-2.5 text-[11px] font-bold disabled:opacity-50"
                >
                  Withdraw / Exit
                </button>
                <button
                  type="button"
                  disabled={p.busy}
                  onClick={() => void p.emergencyExitLeg(pos.legIndex)}
                  className="app-btn-secondary h-8 px-2.5 text-[11px] font-bold disabled:opacity-50"
                >
                  Emergency exit
                </button>
                <button
                  type="button"
                  disabled={p.busy}
                  onClick={() => p.showDirectExitPlan(pos.legIndex)}
                  className="app-btn-secondary h-8 px-2.5 text-[11px] font-bold disabled:opacity-50"
                >
                  Direct protocol exit plan
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {p.legResults.length > 0 ? (
        <div className="mt-4 rounded-lg border border-app-line p-3">
          <h3 className="text-xs font-bold text-app-ink">Per-leg exit progress</h3>
          <ul className="mt-2 space-y-1 text-[10px] font-mono text-app-ink">
            {p.legResults.map((r) => (
              <li key={r.legIndex}>
                leg {r.legIndex}: {r.status}
                {r.txHash ? ` · ${r.txHash}` : ""}
                {r.error ? ` · ${r.error}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.directPlan ? (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <h3 className="text-xs font-bold text-app-ink">Direct protocol / NPM escape</h3>
          <p className="mt-1 text-[11px] text-app-muted">{p.directPlan.disclaimer}</p>
          <p className="mt-1 font-mono text-[10px] text-app-dim">
            Mode: {p.directPlan.mode} · NFT {p.directPlan.nftContract} #
            {p.directPlan.tokenId.toString()}
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] text-app-ink">
            {p.directPlan.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {p.statusMessage ? (
        <p className="mt-3 text-[11px] text-app-success">{p.statusMessage}</p>
      ) : null}
      {p.error ? (
        <p className="mt-2 text-[11px] text-app-danger" role="alert">
          {p.error}
        </p>
      ) : null}
      {p.lastTxHash ? (
        <p className="mt-2 font-mono text-[10px] text-app-dim">
          Tx:{" "}
          {p.explorerUrl ? (
            <a
              href={p.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-app-brand underline-offset-2 hover:underline"
            >
              {p.lastTxHash}
            </a>
          ) : (
            p.lastTxHash
          )}
        </p>
      ) : null}
      <p className="mt-3 text-[10px] text-app-dim">
        Progress: {PROGRESS_LABEL[p.progress] ?? p.progress}
      </p>
    </section>
  );
}
