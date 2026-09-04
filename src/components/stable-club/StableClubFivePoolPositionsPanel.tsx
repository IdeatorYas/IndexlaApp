"use client";

import { useFivePoolPositions } from "@/components/stable-club/useFivePoolPositions";

const PROGRESS_LABEL: Record<string, string> = {
  idle: "Ready",
  "loading-positions": "Loading positions…",
  "awaiting-approval": "Awaiting NFT approval",
  "awaiting-exit": "Awaiting exit confirmation",
  confirmed: "Confirmed",
  partial: "Partial — some exits failed",
  failed: "Failed — retry",
};

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
        <h2 className="text-sm font-bold text-app-ink">Five-pool positions & exits</h2>
        <p className="mt-2 text-xs leading-relaxed text-app-muted">
          {p.deploymentsError ??
            "Phase 2a local deployments are required for live position discovery."}
        </p>
      </section>
    );
  }

  return (
    <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
      <h2 className="text-sm font-bold text-app-ink">Five-pool positions & exits</h2>
      <p className="mt-1 text-xs text-app-muted">
        On-chain NFT discovery after deposit · INDEXLA exits require per-token NFT approve(adapter,
        tokenId) · Exit All is atomic on-chain · Emergency is per-leg (sequential when batched) ·
        Exit is not risk-free and does not guarantee value preservation.
      </p>

      <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="font-semibold text-app-dim">Strategy</dt>
          <dd className="mt-0.5 font-mono break-all text-app-ink">
            {p.strategyRegistered ? p.strategyId : "Not registered"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Open positions</dt>
          <dd className="mt-0.5 text-app-ink">{p.positions.length} / 5</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Progress</dt>
          <dd className="mt-0.5 text-app-ink">{PROGRESS_LABEL[p.progress] ?? p.progress}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Permission state</dt>
          <dd className="mt-0.5 text-app-ink">
            {p.strategyRevoked
              ? "Revoked — use emergency"
              : p.strategyExpired
                ? "Expired — use emergency"
                : "Active"}
          </dd>
        </div>
      </dl>

      {!p.onExpectedChain ? (
        <p className="mt-3 text-[11px] text-app-danger">
          Wrong network — switch wallet to chain {p.expectedChainId}.
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
          disabled={p.busy || p.positions.length === 0 || p.strategyRevoked || p.strategyExpired}
          onClick={() => void p.exitAll()}
          className="app-btn-primary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Exit All (atomic)
        </button>
        <button
          type="button"
          disabled={p.busy || p.positions.length === 0}
          onClick={() => void p.emergencyExitAllSequential()}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Emergency Exit All (sequential)
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
        <p className="mt-3 text-[11px] text-app-danger">RPC / discovery: {p.positionsError}</p>
      ) : null}
      {p.stale ? (
        <p className="mt-2 text-[11px] text-amber-600">
          Partial discovery — some adapters missing from deployments payload.
        </p>
      ) : null}

      {!p.positionsLoading && p.positions.length === 0 ? (
        <p className="mt-4 text-xs text-app-muted">
          No open Stable Club NFTs for this wallet. Deposit USDC in the five-pool panel to mint
          five positions.
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {p.positions.map((pos) => (
          <li
            key={`${pos.legIndex}-${pos.positionTokenId.toString()}`}
            className="rounded-lg border border-app-line bg-app-bg/40 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-app-ink">
                  Leg {pos.legIndex} · {pos.poolLabel}
                </p>
                <p className="mt-0.5 text-[11px] text-app-muted">
                  {pos.pairLabel} · {pos.protocol} · NFT #{pos.positionTokenId.toString()}
                </p>
              </div>
              <div className="text-right text-[10px] text-app-dim">
                <p>{pos.allocationBps.toString()} bps</p>
                <p>Range: {pos.rangeStatus}</p>
                <p>{pos.adapterApproved ? "Adapter approved" : "Approval required"}</p>
              </div>
            </div>
            <dl className="mt-2 grid gap-1 text-[10px] sm:grid-cols-2">
              <div>
                <dt className="text-app-dim">Amounts (A / B)</dt>
                <dd className="font-mono text-app-ink">
                  {pos.amountA.toString()} / {pos.amountB.toString()}
                </dd>
              </div>
              <div>
                <dt className="text-app-dim">Liquidity</dt>
                <dd className="font-mono text-app-ink">{pos.liquidity.toString()}</dd>
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
                Exit position
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
                Direct protocol exit
              </button>
            </div>
          </li>
        ))}
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
            Mode: {p.directPlan.mode} · NFT {p.directPlan.nftContract} #{p.directPlan.tokenId.toString()}
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] text-app-ink">
            {p.directPlan.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {p.directPlan.decreaseLiquidityCalldata ? (
            <div className="mt-2 space-y-1 font-mono text-[9px] break-all text-app-dim">
              <p>decreaseLiquidity: {p.directPlan.decreaseLiquidityCalldata}</p>
              <p>collect: {p.directPlan.collectCalldata}</p>
              <p>burn: {p.directPlan.burnCalldata}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {p.statusMessage ? (
        <p className="mt-3 text-[11px] text-app-success">{p.statusMessage}</p>
      ) : null}
      {p.error ? <p className="mt-2 text-[11px] text-app-danger">{p.error}</p> : null}
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
      {p.approvalTxHashes.length > 0 ? (
        <p className="mt-1 font-mono text-[10px] text-app-dim">
          Approvals: {p.approvalTxHashes.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
