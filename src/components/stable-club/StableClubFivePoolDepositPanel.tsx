"use client";



import { useMemo } from "react";

import { useStableClubDevPanelAllowed } from "@/components/stable-club/useStableClubDevPanelAllowed";

import { useFivePoolDeposit } from "@/components/stable-club/useFivePoolDeposit";

import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";

import { parseUsdcDepositInput, formatUsdcUnits } from "@/lib/stable-club/five-pool-deposit";

import { FIVE_POOL_ALLOCATION_BPS_PER_LEG } from "@/lib/stable-club/five-pool-strategy";

import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";

import { QUOTE_PLAN_MAX_SLIPPAGE_BPS } from "@/lib/stable-club/quote-plan";

import { STABLE_CLUB_MIN_DEPOSIT_USD } from "@/lib/stable-club/pool-product-meta";



const PROGRESS_LABEL: Record<string, string> = {

  idle: "Ready",

  "preparing-quotes": "1 · Preparing quotes",

  "awaiting-approval": "2 · Awaiting approval / signature",

  "awaiting-deposit": "3 · Awaiting deposit confirmation",

  confirmed: "4 · Confirmed",

  failed: "5 · Failed — retry",

};



export function StableClubFivePoolDepositPanel({

  depositsEnabled = true,

  variant = "product",

  devPanelAllowed = false,

}: {

  depositsEnabled?: boolean;

  variant?: "product" | "dev";

  devPanelAllowed?: boolean;

}) {

  const walletDevOk = useStableClubDevPanelAllowed(devPanelAllowed);

  const d = useFivePoolDeposit();

  const wallet = useStableClubWallet();

  const hideDevPanel = variant === "dev" && (!devPanelAllowed || !walletDevOk);

  const isProduct = variant === "product";
  const fieldIdSuffix = isProduct ? "product" : "dev";

  const wrongNetwork = wallet.chainId != null && !d.onExpectedChain;



  const allocationPreview = useMemo(() => {

    const parsed = parseUsdcDepositInput(d.amountInput);

    if (!parsed.ok) return null;

    const perLeg =

      (parsed.grossUsdc * BigInt(FIVE_POOL_ALLOCATION_BPS_PER_LEG)) / BigInt(10_000);

    return OFFICIAL_STABLE_CLUB_BASE_POOLS.map((pool) => ({

      poolId: pool.id,

      pair: `${pool.tokenA.symbol}/${pool.tokenB.symbol}`,

      usdc: perLeg,

    }));

  }, [d.amountInput]);



  const primaryLabel = useMemo(() => {

    if (wallet.status !== "connected" && wallet.status !== "wrong-network") {

      return "Connect Wallet";

    }

    if (wrongNetwork) return d.expectedChainId === 8453 ? "Switch to Base" : `Switch network`;

    if (!depositsEnabled) return "Ready for activation";

    if (d.busy) return "Processing…";

    return "Deposit Into 5-Pool Strategy";

  }, [depositsEnabled, d.busy, d.expectedChainId, wallet.status, wrongNetwork]);



  const primaryDisabled =

    depositsEnabled &&

    wallet.status === "connected" &&

    !wrongNetwork &&

    (d.busy || !d.wallet.address);



  const onPrimaryClick = () => {

    if (wallet.status !== "connected" && wallet.status !== "wrong-network") {

      void wallet.connect();

      return;

    }

    if (wrongNetwork) {

      void wallet.switchToBase();

      return;

    }

    if (!depositsEnabled) return;

    void d.depositIntoFivePoolStrategy();

  };



  const wrongNetworkMessage = (

    <p className="mt-3 text-[11px] text-app-danger">

      Wrong network — switch wallet to chain {d.expectedChainId}.

    </p>

  );

  if (hideDevPanel) {

    return null;

  }

  if (d.deploymentsLoading) {

    return (

      <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">

        <p className="text-xs text-app-muted">Loading five-pool strategy deployments…</p>

        {wrongNetwork ? wrongNetworkMessage : null}

      </section>

    );

  }



  if (!d.deployments) {

    return (

      <section className="rounded-[14px] border border-dashed border-amber-500/40 bg-amber-500/5 p-4 sm:p-5">

        <h2 className="text-sm font-bold text-app-ink">

          {isProduct ? "Five-Pool USDC Strategy" : "Five-pool deposit (Phase 2b)"}

        </h2>

        <p className="mt-2 text-xs leading-relaxed text-app-muted">

          {d.deploymentsError ??

            "Phase 2a deployments are required for the five-pool strategy flow."}

        </p>

        {wrongNetwork ? wrongNetworkMessage : null}

      </section>

    );

  }



  return (

    <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">

      <h2 className="text-sm font-bold text-app-ink">

        {isProduct ? "Five-Pool USDC Strategy" : "Five-pool deposit"}

      </h2>

      <p className="mt-1 text-xs text-app-muted">

        {isProduct

          ? "One atomic depositFivePoolStrategy transaction allocates 20% USDC into each of five Base pools. You directly own every LP NFT."

          : "Equal 20% USDC across five official Base pools · Permit2 → CL executor · 1% fee on swaps only."}

      </p>

      {!depositsEnabled ? (

        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">

          Atomic deposit disabled until trusted Base manifest attestation and on-chain governance

          activation are complete for all five pools.

        </p>

      ) : null}



      {isProduct ? (

        <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">

          <div>

            <dt className="font-semibold text-app-dim">USDC balance</dt>

            <dd className="mt-0.5 text-app-ink">{d.usdcBalanceFormatted}</dd>

          </div>

          <div>

            <dt className="font-semibold text-app-dim">Min deposit</dt>

            <dd className="mt-0.5 text-app-ink">${STABLE_CLUB_MIN_DEPOSIT_USD} USDC</dd>

          </div>

        </dl>

      ) : (

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

      )}



      {wrongNetwork || (d.wallet.chainId != null && !d.onExpectedChain) ? wrongNetworkMessage : null}



      {!isProduct ? (

        <div className="mt-4 flex flex-wrap gap-2">

          <button

            type="button"

            disabled={d.busy || d.strategyRegistered || !d.wallet.address || !depositsEnabled}

            onClick={() => void d.registerStrategy()}

            className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"

          >

            Register five-pool strategy

          </button>

        </div>

      ) : null}



      <div className="mt-4 grid gap-3 sm:grid-cols-3">

        <label className="block text-xs sm:col-span-1" htmlFor={`five-pool-deposit-usdc-${fieldIdSuffix}`}>

          <span className="font-semibold text-app-dim">Total deposit (USDC)</span>

          <input

            id={`five-pool-deposit-usdc-${fieldIdSuffix}`}

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

        {!isProduct ? (

          <>

            <label className="block text-xs" htmlFor={`five-pool-swap-slip-${fieldIdSuffix}`}>

              <span className="font-semibold text-app-dim">

                Swap slippage (bps, max {QUOTE_PLAN_MAX_SLIPPAGE_BPS.toString()})

              </span>

              <input

                id={`five-pool-swap-slip-${fieldIdSuffix}`}

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

            <label className="block text-xs" htmlFor={`five-pool-lp-slip-${fieldIdSuffix}`}>

              <span className="font-semibold text-app-dim">

                LP slippage (bps, max {QUOTE_PLAN_MAX_SLIPPAGE_BPS.toString()})

              </span>

              <input

                id={`five-pool-lp-slip-${fieldIdSuffix}`}

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

          </>

        ) : null}

      </div>



      {isProduct && allocationPreview ? (

        <div className="mt-4 rounded-[12px] border border-app-line bg-app-panel-soft p-3">

          <h3 className="text-xs font-bold text-app-ink">20% allocation preview</h3>

          <ul className="mt-2 space-y-1 text-[11px] text-app-muted">

            {allocationPreview.map((row) => (

              <li key={row.poolId} className="flex justify-between gap-2">

                <span>

                  {row.pair} · 20%

                </span>

                <span className="font-mono text-app-ink">{formatUsdcUnits(row.usdc)} USDC</span>

              </li>

            ))}

          </ul>

        </div>

      ) : null}



      <div className="mt-4 flex flex-wrap gap-2">

        {isProduct ? (

          <button

            type="button"

            disabled={primaryDisabled}

            onClick={onPrimaryClick}

            className="app-gradient-btn h-10 w-full px-4 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"

          >

            {primaryLabel}

          </button>

        ) : (

          <>

            <button

              type="button"

              disabled={d.busy || !d.wallet.address || !depositsEnabled}

              onClick={() => void d.prepareQuotes()}

              className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"

            >

              {d.progress === "preparing-quotes" ? "Preparing quotes…" : "Prepare quotes"}

            </button>

            <button

              type="button"

              disabled={d.busy || !d.planReady || !d.strategyRegistered || !depositsEnabled}

              onClick={() => void d.submitDeposit()}

              className="app-btn-primary h-9 px-3 text-xs font-bold disabled:opacity-50"

            >

              {d.progress === "awaiting-approval" || d.progress === "awaiting-deposit"

                ? "Submitting…"

                : "Deposit Into 5-Pool Strategy"}

            </button>

          </>

        )}

      </div>



      {isProduct && d.progress !== "idle" ? (

        <p className="mt-2 text-[11px] text-app-dim">

          {PROGRESS_LABEL[d.progress] ?? d.progress}

        </p>

      ) : null}



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