"use client";

import Link from "next/link";
import { StableClubExecutionPanel } from "@/components/stable-club/StableClubExecutionPanel";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import {
  STABLE_CLUB_CHAIN,
  STABLE_CLUB_CHAIN_ID,
  STABLE_CLUB_EXECUTION_FEE_BPS,
  STABLE_CLUB_LOCAL_RPC_URL,
} from "@/lib/stable-club/constants";
import { STABLE_CLUB_INTERNAL_TEST_POOL } from "@/lib/stable-club/test-pool";

export function StableClubView({
  feeRecipientConfigured,
  baseRpcConfigured,
  preferLocalHardhat = true,
}: {
  feeRecipientConfigured: boolean;
  baseRpcConfigured: boolean;
  preferLocalHardhat?: boolean;
}) {
  const wallet = useStableClubWallet();
  const onExpectedChain =
    wallet.chainId ===
    (preferLocalHardhat ? STABLE_CLUB_CHAIN_ID : STABLE_CLUB_CHAIN_ID);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="app-panel-soft rounded-[14px] border border-app-line p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-brand">
          Stable Club · Step 1
        </p>
        <h1 className="app-display mt-1 text-2xl font-bold text-app-ink sm:text-3xl">
          Base Foundation + Core Execution
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-app-muted">
          Non-custodial liquidity automation shell. Users own LP tokens/NFTs.
          INDEXLA contracts do not retain funds after execution.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">
            Development only
          </span>
          <span className="rounded-md border border-app-line bg-app-panel px-2 py-1 text-[10px] font-semibold text-app-dim">
            {STABLE_CLUB_CHAIN.name} · chainId {STABLE_CLUB_CHAIN.id}
          </span>
        </div>
      </header>

      <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Wallet · Base (local Hardhat for Step 1)</h2>
        <p className="mt-1 text-xs text-app-muted">
          Connect an EVM wallet. For local execution use RPC {STABLE_CLUB_LOCAL_RPC_URL}.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {wallet.status === "disconnected" || wallet.status === "connecting" ? (
            <button
              type="button"
              disabled={wallet.status === "connecting"}
              onClick={() => void wallet.connect()}
              className="app-btn-primary h-9 px-4 text-xs font-bold"
            >
              {wallet.status === "connecting" ? "Connecting…" : "Connect Wallet"}
            </button>
          ) : (
            <>
              <span className="rounded-md border border-app-line bg-app-panel px-2 py-1 font-mono text-[11px] text-app-ink">
                {wallet.address}
              </span>
              {wallet.status === "wrong-network" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void wallet.switchToLocalHardhat()}
                    className="app-btn-secondary h-9 px-3 text-xs font-bold"
                  >
                    Switch to local Hardhat
                  </button>
                  <button
                    type="button"
                    onClick={() => void wallet.switchToBase()}
                    className="app-btn-secondary h-9 px-3 text-xs font-bold"
                  >
                    Switch to Base
                  </button>
                </>
              ) : (
                <span className="rounded-md border border-app-success/30 bg-app-success/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-app-success">
                  Connected · chain {wallet.chainId}
                </span>
              )}
              <button
                type="button"
                onClick={wallet.disconnect}
                className="app-btn-secondary h-9 px-3 text-xs font-bold"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
        {wallet.error ? (
          <p className="mt-2 text-[11px] text-app-danger">{wallet.error}</p>
        ) : null}
        <p className="mt-2 text-[11px] text-app-dim">
          Status: {wallet.status}
          {wallet.status === "connected" && !onExpectedChain ? " · verify chainId" : ""}
        </p>
      </section>

      <StableClubExecutionPanel />

      <section className="app-panel rounded-[14px] border border-app-line p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Step 1 architecture</h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-app-muted">
          <li>Stateless Executor with allowlisted pools, tokens and adapters only</li>
          <li>
            Permission Registry — reusable strategy permissions; unique execution nonce
            per action
          </li>
          <li>
            Fee Router — {STABLE_CLUB_EXECUTION_FEE_BPS / 100}% charged on swaps only
          </li>
          <li>No vault, wrapper token, or internal user balance ledger</li>
          <li>Emergency exit, pause and immediate revocation supported on-chain</li>
        </ul>
        <p className="mt-3 text-[11px] text-app-dim">
          Fee recipient configured: {feeRecipientConfigured ? "yes" : "pending"}
          {" · "}
          Base RPC configured (server/fork tests): {baseRpcConfigured ? "yes" : "no"}
        </p>
      </section>

      <section className="rounded-[14px] border border-dashed border-amber-500/40 bg-amber-500/5 p-4 sm:p-5">
        <h2 className="text-sm font-bold text-app-ink">Internal test pool (dev only)</h2>
        <p className="mt-1 text-xs text-app-muted">{STABLE_CLUB_INTERNAL_TEST_POOL.note}</p>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-app-dim">Pool ID</dt>
            <dd className="mt-0.5 font-mono text-[11px] text-app-ink">
              {STABLE_CLUB_INTERNAL_TEST_POOL.id}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-app-dim">Adapter</dt>
            <dd className="mt-0.5 text-app-ink">{STABLE_CLUB_INTERNAL_TEST_POOL.adapterKind}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-app-dim">
          Official Base catalogue pools ({5}) are not enabled in Step 1.
        </p>
      </section>

      <p className="text-center text-[11px] text-app-dim">
        OpenServ, auto-harvest/compound/rebalance and official pool integrations begin in Step 2.
        {" "}
        <Link href="/app" className="text-app-brand underline-offset-2 hover:underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
