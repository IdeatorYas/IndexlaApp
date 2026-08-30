"use client";

import { useFivePoolDeposit } from "@/components/stable-club/useFivePoolDeposit";
import { QUOTE_PLAN_MAX_SLIPPAGE_BPS } from "@/lib/stable-club/quote-plan";
import { formatUsdcUnits } from "@/lib/stable-club/five-pool-deposit";

const PROGRESS_LABEL: Record<string, string> = {
  idle: "Ready",
  "preparing-quotes": "1 · Preparing quotes",
  "awaiting-approval": "2 · Awaiting approval / signature",
  "awaiting-deposit": "3 · Awaiting deposit confirmation",
  confirmed: "4 · Confirmed",
  failed: "5 · Failed — retry",
};

export function StableClubFivePoolDepositPanel() {
  const d = useFivePoolDeposit();

  if (d.deploymentsLoading) {
    return (
      <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
        <p className="text-xs text-app-muted">Loading five-pool deployments…</p>
      </section>
    );
  }

  if (!d.deployments) {
    return (
      <section className="rounded-[14px] border border-dashed border-amber-500/40 bg-amber-500/5 p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Five-pool deposit (Phase 2b)</h2>
        <p className="mt-2 text-xs leading-relaxed text-app-muted">
          {d.deploymentsError ??
            "Phase 2a local deployments are required for the five-pool deposit flow."}
        </p>
      </section>
    );
  }

  return (
    <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
      <h2 className="text-sm font-bold text-app-ink">Five-pool deposit</h2>
      <p className="mt-1 text-xs text-app-muted">
        Equal 20% USDC across five official Base pools · Permit2 → CL executor · 1% fee on swaps
        only.
      </p>

      <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-app-dim">CL executor</dt>
          <dd className="mt-0.5 font-mono break-all text-app-ink">{d.deployments.clExecutor}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">USDC balance</dt>
          <dd className="mt-0.5 text-app-ink">{d.usdcBalanceFormatted}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Strategy</dt>
          <dd className="mt-0.5 font-mono break-all text-app-ink">
            {d.strategyRegistered ? d.strategyId : "Not registered"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Progress</dt>
          <dd className="mt-0.5 text-app-ink">{PROGRESS_LABEL[d.progress] ?? d.progress}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Next deposit nonce</dt>
          <dd className="mt-0.5 font-mono text-app-ink">{d.executionNonce.toString()}</dd>
        </div>
      </dl>

      {!d.onExpectedChain ? (
        <p className="mt-3 text-[11px] text-app-danger">
          Wrong network — switch wallet to chain {d.expectedChainId}.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={d.busy || d.strategyRegistered || !d.wallet.address}
          onClick={() => void d.registerStrategy()}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Register five-pool strategy
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block text-xs" htmlFor="five-pool-deposit-usdc">
          <span className="font-semibold text-app-dim">Deposit USDC</span>
          <input
            id="five-pool-deposit-usdc"
            type="text"
            inputMode="decimal"
            value={d.amountInput}
            onChange={(e) => {
              d.setAmountInput(e.target.value);
              d.invalidatePlan();
            }}
            disabled={d.busy}
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <label className="block text-xs" htmlFor="five-pool-swap-slip">
          <span className="font-semibold text-app-dim">
            Swap slippage (bps, max {QUOTE_PLAN_MAX_SLIPPAGE_BPS.toString()})
          </span>
          <input
            id="five-pool-swap-slip"
            type="text"
            inputMode="numeric"
            max={QUOTE_PLAN_MAX_SLIPPAGE_BPS.toString()}
            value={d.swapSlippageInput}
            onChange={(e) => {
              d.setSwapSlippageInput(e.target.value);
              d.invalidatePlan();
            }}
            disabled={d.busy}
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <label className="block text-xs" htmlFor="five-pool-lp-slip">
          <span className="font-semibold text-app-dim">
            LP slippage (bps, max {QUOTE_PLAN_MAX_SLIPPAGE_BPS.toString()})
          </span>
          <input
            id="five-pool-lp-slip"
            type="text"
            inputMode="numeric"
            max={QUOTE_PLAN_MAX_SLIPPAGE_BPS.toString()}
            value={d.lpSlippageInput}
            onChange={(e) => {
              d.setLpSlippageInput(e.target.value);
              d.invalidatePlan();
            }}
            disabled={d.busy}
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={d.busy || !d.wallet.address}
          onClick={() => void d.prepareQuotes()}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          {d.progress === "preparing-quotes" ? "Preparing quotes…" : "Prepare quotes"}
        </button>
        <button
          type="button"
          disabled={d.busy || !d.planReady || !d.strategyRegistered}
          onClick={() => void d.submitDeposit()}
          className="app-btn-primary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          {d.progress === "awaiting-approval" || d.progress === "awaiting-deposit"
            ? "Submitting…"
            : "Deposit (Permit2 → CL)"}
        </button>
      </div>

      {d.preview ? (
        <div className="mt-4 space-y-3 rounded-[12px] border border-app-line bg-app-panel-soft p-3">
          <h3 className="text-xs font-bold text-app-ink">Deposit preview</h3>
          <p className="text-[11px] text-app-muted">{d.preview.feeLabel}</p>
          <p className="text-[11px] text-app-muted">
            Swap slippage {d.preview.swapSlippageBps.toString()} bps · LP slippage{" "}
            {d.preview.lpSlippageBps.toString()} bps · Deadline{" "}
            <span className="font-mono">{d.preview.deadline.toString()}</span> · Quotes age max{" "}
            {d.preview.maxQuoteAgeSec}s · Source {d.preview.quoteSource}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[11px]">
              <thead>
                <tr className="text-app-dim">
                  <th className="py-1 pr-2 font-semibold">Pool</th>
                  <th className="py-1 pr-2 font-semibold">Alloc</th>
                  <th className="py-1 pr-2 font-semibold">Pair</th>
                  <th className="py-1 pr-2 font-semibold">Desired A / B</th>
                  <th className="py-1 font-semibold">Min A / B</th>
                </tr>
              </thead>
              <tbody>
                {d.preview.pools.map((row) => (
                  <tr key={row.poolId} className="border-t border-app-line/60 text-app-ink">
                    <td className="py-1.5 pr-2">{row.poolId}</td>
                    <td className="py-1.5 pr-2 font-mono">
                      {row.allocationBps / 100}% · {formatUsdcUnits(row.allocationUsdc)} USDC
                    </td>
                    <td className="py-1.5 pr-2">
                      {row.tokenASymbol}/{row.tokenBSymbol}
                    </td>
                    <td className="py-1.5 pr-2 font-mono">
                      {row.desiredA.toString()} / {row.desiredB.toString()}
                    </td>
                    <td className="py-1.5 font-mono">
                      {row.amountAMin.toString()} / {row.amountBMin.toString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="text-[11px] font-semibold text-app-dim">Eight swap legs</h4>
            <ul className="mt-1 space-y-1 font-mono text-[10px] text-app-ink">
              {d.preview.swaps.map((s) => (
                <li key={s.slotId}>
                  {s.slotId}: {s.routeKey} → {s.tokenOutSymbol} · gross{" "}
                  {formatUsdcUnits(s.grossUsdcIn)} · net {formatUsdcUnits(s.netUsdcIn)} · out{" "}
                  {s.quotedOut.toString()} · min {s.minOut.toString()}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] text-app-muted">{d.preview.messaging.nonCustodial}</p>
          <p className="text-[11px] text-app-muted">{d.preview.messaging.revocable}</p>
        </div>
      ) : null}

      {d.statusMessage ? (
        <p className="mt-3 text-[11px] text-app-success">{d.statusMessage}</p>
      ) : null}
      {d.error ? <p className="mt-2 text-[11px] text-app-danger">{d.error}</p> : null}
      {d.lastTxHash ? (
        <p className="mt-2 font-mono text-[10px] text-app-dim">
          Tx:{" "}
          {d.explorerUrl ? (
            <a
              href={d.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-app-brand underline-offset-2 hover:underline"
            >
              {d.lastTxHash}
            </a>
          ) : (
            d.lastTxHash
          )}
        </p>
      ) : null}
      {d.approvalTxHashes.length > 0 ? (
        <p className="mt-1 font-mono text-[10px] text-app-dim">
          Approvals: {d.approvalTxHashes.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
