"use client";

import { useState } from "react";
import { useStableClubExecution } from "@/components/stable-club/useStableClubExecution";

export function StableClubExecutionPanel() {
  const exec = useStableClubExecution();
  const [depositAmount, setDepositAmount] = useState("200");
  const [swapAmount, setSwapAmount] = useState("0");
  const [removePercent, setRemovePercent] = useState("50");

  const busy = exec.busyAction !== null;

  if (exec.deploymentsLoading) {
    return (
      <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
        <p className="text-xs text-app-muted">Loading local contract deployments…</p>
      </section>
    );
  }

  if (!exec.deployments) {
    return (
      <section className="rounded-[14px] border border-dashed border-amber-500/40 bg-amber-500/5 p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Local contracts not deployed</h2>
        <p className="mt-2 text-xs leading-relaxed text-app-muted">
          {exec.deploymentsError ??
            "Start a local Hardhat node and run the Stable Club deploy script."}
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-4 text-[11px] text-app-dim">
          <li>
            <code className="font-mono">npm run node:local</code>
          </li>
          <li>
            <code className="font-mono">npm run deploy:stable-club:local</code>
          </li>
          <li>Connect wallet to {exec.localRpcUrl} (chainId {exec.expectedChainId})</li>
        </ol>
      </section>
    );
  }

  const d = exec.deployments;

  return (
    <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
      <h2 className="text-sm font-bold text-app-ink">Step 1 execution (local test pool)</h2>
      <p className="mt-1 text-xs text-app-muted">
        Wired to local deployments · TEST ONLY · not official catalogue pools.
      </p>

      <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-app-dim">Executor</dt>
          <dd className="mt-0.5 font-mono break-all text-app-ink">{d.executor}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Test adapter</dt>
          <dd className="mt-0.5 font-mono break-all text-app-ink">{d.testAdapter}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">USDC balance</dt>
          <dd className="mt-0.5 text-app-ink">{exec.usdcBalanceFormatted}</dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">LP balance (test)</dt>
          <dd className="mt-0.5 text-app-ink">{exec.lpBalanceFormatted}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold text-app-dim">Permission ID</dt>
          <dd className="mt-0.5 font-mono break-all text-app-ink">
            {exec.permissionId ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-app-dim">Next execution nonce</dt>
          <dd className="mt-0.5 font-mono text-app-ink">{exec.executionNonce.toString()}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || exec.permissionRegistered}
          onClick={() => void exec.registerPermission()}
          className="app-btn-primary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Register strategy permission
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs" htmlFor="stable-club-deposit-usdc">
          <span className="font-semibold text-app-dim">Deposit USDC</span>
          <input
            id="stable-club-deposit-usdc"
            type="text"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <label className="block text-xs" htmlFor="stable-club-swap-usdc">
          <span className="font-semibold text-app-dim">Swap portion USDC</span>
          <input
            id="stable-club-swap-usdc"
            type="text"
            value={swapAmount}
            onChange={(e) => setSwapAmount(e.target.value)}
            className="mt-1 w-full rounded-md border border-app-line bg-app-panel px-2 py-1.5 font-mono text-xs"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !exec.permissionRegistered}
          onClick={() => void exec.depositAndAddLiquidity(depositAmount, swapAmount)}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Deposit &amp; add liquidity
        </button>
        <button
          type="button"
          disabled={busy || !exec.permissionRegistered || exec.lpBalance === BigInt(0)}
          onClick={() => {
            const pct = BigInt(Math.min(100, Math.max(1, Number(removePercent) || 50)));
            const amount = (exec.lpBalance * pct) / BigInt(100);
            void exec.removeLiquidity(amount > BigInt(0) ? amount : BigInt(1));
          }}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Remove {removePercent}% liquidity
        </button>
        <label className="flex items-center gap-1 text-[11px] text-app-dim">
          <span>%</span>
          <input
            type="text"
            value={removePercent}
            onChange={(e) => setRemovePercent(e.target.value)}
            className="w-12 rounded border border-app-line bg-app-panel px-1 py-0.5 font-mono text-xs"
          />
        </label>
        <button
          type="button"
          disabled={busy || !exec.permissionRegistered || exec.lpBalance === BigInt(0)}
          onClick={() => void exec.withdrawAll()}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Withdraw all
        </button>
        <button
          type="button"
          disabled={busy || !exec.permissionRegistered}
          onClick={() => void exec.pauseAutomation()}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Pause automation
        </button>
        <button
          type="button"
          disabled={busy || !exec.permissionRegistered}
          onClick={() => void exec.revokePermissionDirect()}
          className="app-btn-secondary h-9 px-3 text-xs font-bold disabled:opacity-50"
        >
          Revoke permission (direct)
        </button>
        <button
          type="button"
          disabled={busy || exec.lpBalance === BigInt(0) || !exec.permissionId}
          onClick={() => void exec.emergencyExit()}
          className="h-9 rounded-md border border-app-danger/40 bg-app-danger/10 px-3 text-xs font-bold text-app-danger disabled:opacity-50"
        >
          Emergency exit
        </button>
      </div>

      {exec.statusMessage ? (
        <p className="mt-3 text-[11px] text-app-success">{exec.statusMessage}</p>
      ) : null}
      {exec.lastTxHash ? (
        <p className="mt-1 font-mono text-[10px] text-app-dim">Tx: {exec.lastTxHash}</p>
      ) : null}
      {exec.error ? (
        <p className="mt-2 text-[11px] text-app-danger">{exec.error}</p>
      ) : null}
      {busy ? (
        <p className="mt-2 text-[11px] text-app-muted">Running: {exec.busyAction}…</p>
      ) : null}

      <p className="mt-3 text-[10px] text-app-dim">
        Strategy permissions are reusable. Each execution consumes a unique on-chain
        execution nonce (next: {exec.executionNonce.toString()}). Emergency exit
        remains available while you hold LP, including after revoke, expiry, or pause.
      </p>
    </section>
  );
}
