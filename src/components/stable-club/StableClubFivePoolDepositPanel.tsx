"use client";

import { useEffect, useMemo } from "react";
import { useStableClubDevPanelAllowed } from "@/components/stable-club/useStableClubDevPanelAllowed";
import { useFivePoolDeposit } from "@/components/stable-club/useFivePoolDeposit";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import { parseUsdcDepositInput, formatUsdcUnits } from "@/lib/stable-club/five-pool-deposit";
import {
  FIVE_POOL_ALLOCATION_BPS_PER_LEG,
  FIVE_POOL_TOTAL_ALLOCATION_BPS,
} from "@/lib/stable-club/five-pool-strategy";
import {
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  type OfficialStableClubPool,
} from "@/lib/stable-club/official-pools";
import { QUOTE_PLAN_MAX_SLIPPAGE_BPS } from "@/lib/stable-club/quote-plan";
import { STABLE_CLUB_CHAIN_ID } from "@/lib/stable-club/constants";
import { STABLE_CLUB_MIN_DEPOSIT_USD } from "@/lib/stable-club/pool-product-meta";
import {
  formatApyDisplay,
  formatOfficialPoolFee,
  protocolDisplayName,
  useStableClubPoolApyMap,
} from "@/components/stable-club/useStableClubPoolApy";
import { AssetIcon } from "@/components/ui/AssetIcons";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";

const PROGRESS_LABEL: Record<string, string> = {
  idle: "Ready",
  "preparing-quotes": "1 · Preparing quotes",
  "awaiting-approval": "2 · Awaiting approval / signature",
  "awaiting-deposit": "3 · Awaiting deposit confirmation",
  confirmed: "4 · Confirmed",
  failed: "5 · Failed — retry",
};

const ALLOCATION_PERCENT = FIVE_POOL_ALLOCATION_BPS_PER_LEG / 100;
const TOTAL_ALLOCATION_PERCENT = FIVE_POOL_TOTAL_ALLOCATION_BPS / 100;

function protocolLabel(pool: OfficialStableClubPool): string {
  return protocolDisplayName(pool.protocol);
}

function walletStatusLabel(status: string, address: string | null | undefined): string {
  if (status === "connected" && address) {
    return `Connected · ${address.slice(0, 6)}…${address.slice(-4)}`;
  }
  if (status === "connecting") return "Connecting…";
  if (status === "wrong-network") return "Connected · wrong network";
  return "Not connected";
}

function logDepositBlockers(blockers: readonly string[], deploymentsError: string | null) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  const payload = {
    depositBlockers: blockers,
    deploymentsError,
  };
  // Internal diagnostics only — never shown in customer UI.
  console.info("[Stable Club] deposit fail-closed diagnostics", payload);
}

export function StableClubFivePoolDepositPanel({
  depositsEnabled = true,
  depositBlockers = [],
  variant = "product",
  devPanelAllowed = false,
}: {
  depositsEnabled?: boolean;
  depositBlockers?: readonly string[];
  variant?: "product" | "dev";
  devPanelAllowed?: boolean;
}) {
  const walletDevOk = useStableClubDevPanelAllowed(devPanelAllowed);
  const d = useFivePoolDeposit();
  const wallet = useStableClubWallet();
  const { byPoolId: apyByPoolId, loading: apyLoading } = useStableClubPoolApyMap();
  const hideDevPanel = variant === "dev" && (!devPanelAllowed || !walletDevOk);
  const isProduct = variant === "product";
  const fieldIdSuffix = isProduct ? "product" : "dev";
  const productOnBase = wallet.chainId === STABLE_CLUB_CHAIN_ID;
  const wrongNetwork = isProduct
    ? wallet.chainId != null && !productOnBase
    : wallet.chainId != null && !d.onExpectedChain;

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

  const failClosed = !d.deploymentsLoading && (!depositsEnabled || !d.deployments);

  useEffect(() => {
    if (isProduct && failClosed) {
      logDepositBlockers(depositBlockers, d.deploymentsError);
    }
  }, [depositBlockers, d.deploymentsError, failClosed, isProduct]);

  const primaryDisabled =
    d.deploymentsLoading ||
    failClosed ||
    d.busy ||
    wallet.status !== "connected" ||
    wrongNetwork ||
    !d.wallet.address ||
    (!isProduct && !d.planReady);

  const onPrimaryClick = () => {
    if (!isProduct) return;
    if (failClosed || wrongNetwork || wallet.status !== "connected") return;
    void d.depositIntoFivePoolStrategy();
  };

  const wrongNetworkMessage = (
    <p className="mt-3 text-[11px] text-app-danger">
      {isProduct
        ? "Wrong network — switch wallet to Base."
        : `Wrong network — switch wallet to chain ${d.expectedChainId}.`}
    </p>
  );

  const networkStatus = isProduct
    ? productOnBase
      ? "Base"
      : wallet.chainId == null
        ? "Base required"
        : "Not on Base"
    : d.onExpectedChain
      ? `Chain ${d.expectedChainId}`
      : `Need chain ${d.expectedChainId}`;

  const automationCopy = [
    PRIVATE_BETA_LAUNCH_PARAMS.automation.harvestEnabled ? "Auto-Harvest active" : "Auto-Harvest",
    PRIVATE_BETA_LAUNCH_PARAMS.automation.compoundEnabled ? "Auto-Compound active" : "Auto-Compound",
  ].join(" · ");

  if (hideDevPanel) {
    return null;
  }

  if (isProduct) {
    return (
      <section
        id="base-strategy"
        className="stable-club-strategy-box"
        data-strategy="base-five-pool"
        data-status="live-beta"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
              LIVE BETA · BASE
            </p>
            <h2 className="app-display mt-2 text-xl font-bold text-app-ink sm:text-2xl">
              Base Five-Pool Strategy
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              One USDC deposit · {ALLOCATION_PERCENT}% into each official Base pool · {automationCopy} ·
              Non-Custodial
            </p>
          </div>
          <dl className="grid min-w-[200px] gap-2 rounded-[12px] border border-sky-400/20 bg-[rgba(7,22,42,0.45)] px-3 py-2 text-[11px] sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-app-dim">Wallet</dt>
              <dd className="mt-0.5 text-app-ink">
                {walletStatusLabel(wallet.status, wallet.address ?? d.wallet.address)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-app-dim">Network</dt>
              <dd className="mt-0.5 text-app-ink">{networkStatus}</dd>
            </div>
          </dl>
        </div>

        {wrongNetwork ? wrongNetworkMessage : null}

        <label className="mt-5 block text-xs" htmlFor={`five-pool-deposit-usdc-${fieldIdSuffix}`}>
          <span className="font-semibold text-app-dim">USDC amount</span>
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
            placeholder="0.00"
            className="sc-input mt-1 w-full rounded-md px-3 py-3 font-mono text-base"
          />
        </label>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-app-dim">
                <th className="pb-2 pr-3 font-semibold">Asset pair</th>
                <th className="pb-2 pr-3 font-semibold">Platform</th>
                <th className="pb-2 pr-3 font-semibold">Chain</th>
                <th className="pb-2 pr-3 font-semibold">Allocation</th>
                <th className="pb-2 pr-3 font-semibold">Pool fee</th>
                <th className="pb-2 font-semibold">APY</th>
              </tr>
            </thead>
            <tbody>
              {OFFICIAL_STABLE_CLUB_BASE_POOLS.map((pool) => {
                const preview = allocationPreview?.find((row) => row.poolId === pool.id);
                const apy = formatApyDisplay(apyByPoolId[pool.id], apyLoading);
                return (
                  <tr key={pool.id} className="sc-pool-row align-middle" data-pool-id={pool.id}>
                    <td className="py-3.5 pr-3">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center">
                          <AssetIcon assetId={pool.tokenA.symbol} size={36} />
                          <span className="-ml-2">
                            <AssetIcon assetId={pool.tokenB.symbol} size={36} />
                          </span>
                        </span>
                        <div className="min-w-0">
                          <p className="text-[16px] font-bold leading-tight text-app-ink sm:text-[17px]">
                            {pool.tokenA.symbol}/{pool.tokenB.symbol}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] text-app-dim">{pool.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 pr-3">
                      <p className="text-sm font-semibold text-app-ink">{protocolLabel(pool)}</p>
                    </td>
                    <td className="py-3.5 pr-3">
                      <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-200">
                        Base
                      </span>
                    </td>
                    <td className="py-3.5 pr-3">
                      <p className="text-sm font-bold text-app-ink">{ALLOCATION_PERCENT}%</p>
                      {preview ? (
                        <p className="font-mono text-[11px] text-app-dim">
                          {formatUsdcUnits(preview.usdc)} USDC
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3.5 pr-3 text-sm text-app-muted">{formatOfficialPoolFee(pool)}</td>
                    <td className="py-3.5 text-sm font-semibold text-emerald-300">{apy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 flex justify-between text-sm font-bold text-app-ink">
          <span>Total allocation</span>
          <span>{TOTAL_ALLOCATION_PERCENT}%</span>
        </p>

        <button
          type="button"
          disabled={primaryDisabled}
          onClick={onPrimaryClick}
          className="app-gradient-btn mt-5 h-12 w-full px-4 text-sm font-bold shadow-[0_10px_28px_-12px_rgba(37,99,235,0.85)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Deposit Into 5-Pool Strategy
        </button>

        {d.progress !== "idle" ? (
          <p className="mt-3 text-[11px] text-app-dim">{PROGRESS_LABEL[d.progress] ?? d.progress}</p>
        ) : null}
        {d.statusMessage ? (
          <p className="mt-2 text-[11px] text-app-success">{d.statusMessage}</p>
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
      </section>
    );
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
        <h2 className="text-sm font-bold text-app-ink">Five-pool deposit (Phase 2b)</h2>
        <p className="mt-2 text-xs leading-relaxed text-app-muted">
          {d.deploymentsError ?? "Phase 2a deployments are required for the five-pool strategy flow."}
        </p>
        {wrongNetwork ? wrongNetworkMessage : null}
      </section>
    );
  }

  return (
    <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
      <h2 className="text-sm font-bold text-app-ink">Five-pool deposit</h2>
      <p className="mt-1 text-xs text-app-muted">
        Equal 20% USDC across five official Base pools · Permit2 → CL executor · 1% fee on swaps only.
      </p>
      {!depositsEnabled ? (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          Atomic deposit disabled until trusted Base manifest attestation and on-chain governance
          activation are complete for all five pools.
        </p>
      ) : null}

      <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-app-dim">CL executor</dt>
          <dd className="mt-0.5 break-all font-mono text-app-ink">{d.deployments.clExecutor}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">USDC balance</dt>
          <dd className="mt-0.5 text-app-ink">{d.usdcBalanceFormatted}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Strategy</dt>
          <dd className="mt-0.5 break-all font-mono text-app-ink">
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
        <div>
          <dt className="font-semibold text-app-dim">Min deposit</dt>
          <dd className="mt-0.5 text-app-ink">${STABLE_CLUB_MIN_DEPOSIT_USD} USDC</dd>
        </div>
      </dl>

      {wrongNetwork || (d.wallet.chainId != null && !d.onExpectedChain) ? wrongNetworkMessage : null}

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
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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
                  {s.slotId}: {s.routeKey} → {s.tokenOutSymbol} · gross {formatUsdcUnits(s.grossUsdcIn)}{" "}
                  · net {formatUsdcUnits(s.netUsdcIn)} · out {s.quotedOut.toString()} · min{" "}
                  {s.minOut.toString()}
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
