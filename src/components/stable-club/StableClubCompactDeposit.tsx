"use client";

import { useEffect, useRef, useState } from "react";
import { useFivePoolDeposit } from "@/components/stable-club/useFivePoolDeposit";
import { useStableClubWallet } from "@/components/wallet/StableClubWalletProvider";
import { STABLE_CLUB_CHAIN_ID } from "@/lib/stable-club/constants";

/**
 * Compact deposit / Add Funds form — equal 20% allocation across five Base pools.
 */
export function StableClubCompactDeposit({
  depositsEnabled,
  onDepositSuccess,
  title = "Deposit USDC",
  subtitle = "One deposit · equal 20% allocation across five Base pools",
  compact = false,
}: {
  depositsEnabled: boolean;
  onDepositSuccess?: () => void;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  const d = useFivePoolDeposit();
  const wallet = useStableClubWallet();
  const [panelError, setPanelError] = useState<string | null>(null);
  const notifiedTx = useRef<string | null>(null);
  const wrongNetwork = wallet.chainId != null && wallet.chainId !== STABLE_CLUB_CHAIN_ID;
  const busy = d.deploymentsLoading || d.busy;
  const failClosed = !d.deploymentsLoading && (!depositsEnabled || !d.deployments);

  useEffect(() => {
    if (d.progress !== "confirmed" || !d.lastTxHash) return;
    if (notifiedTx.current === d.lastTxHash) return;
    notifiedTx.current = d.lastTxHash;
    onDepositSuccess?.();
  }, [d.progress, d.lastTxHash, onDepositSuccess]);

  const onDeposit = () => {
    setPanelError(null);
    if (failClosed) {
      setPanelError(
        "Deposits are unavailable until USDC-only Withdraw All (exitAllToUsdc) is enabled on Base.",
      );
      return;
    }
    if (wrongNetwork) {
      void wallet.switchToBase();
      return;
    }
    void d.depositIntoFivePoolStrategy();
  };

  return (
    <section
      className={
        compact
          ? "rounded-xl border border-[#d7e0ec] bg-[#f8fafc] p-4"
          : "rounded-2xl border border-[#d7e0ec] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,58,0.06)] sm:p-6"
      }
      aria-label="Deposit into Stable Club"
    >
      <h1
        className={
          compact
            ? "text-lg font-bold tracking-tight text-[#0b1f3a]"
            : "text-2xl font-bold tracking-tight text-[#0b1f3a]"
        }
      >
        {title}
      </h1>
      <p className="mt-1 text-sm text-[#5b6b7c]">{subtitle}</p>

      {wrongNetwork ? (
        <p className="mt-4 text-sm text-[#b42318]" role="alert">
          Wrong network — switch to Base.
        </p>
      ) : null}

      <label className="mt-5 block text-sm font-semibold text-[#0b1f3a]" htmlFor="sc-compact-usdc">
        USDC amount
        <input
          id="sc-compact-usdc"
          type="text"
          inputMode="decimal"
          value={d.amountInput}
          onChange={(e) => {
            d.setAmountInput(e.target.value);
            d.invalidatePlan();
          }}
          className="mt-2 h-12 w-full rounded-xl border border-[#d7e0ec] bg-white px-3 text-base text-[#0b1f3a] outline-none focus:border-[#1a4f8c]"
          placeholder="20"
          autoComplete="off"
        />
      </label>

      <button
        type="button"
        disabled={busy || failClosed}
        onClick={onDeposit}
        className="mt-5 h-12 w-full rounded-xl bg-[#0b1f3a] text-sm font-bold uppercase tracking-[0.06em] text-white disabled:opacity-45"
      >
        {failClosed
          ? "Deposit unavailable"
          : d.busy
            ? "Working…"
            : wrongNetwork
              ? "Switch to Base"
              : title.includes("Add")
                ? "Add Funds"
                : "Deposit USDC"}
      </button>

      {d.statusMessage ? (
        <p className="mt-3 text-sm text-emerald-800">{d.statusMessage}</p>
      ) : null}
      {panelError || d.error ? (
        <p className="mt-2 text-sm text-[#b42318]" role="alert">
          {panelError ?? d.error}
        </p>
      ) : null}
      {d.lastTxHash && d.explorerUrl ? (
        <p className="mt-2 font-mono text-xs text-[#5b6b7c]">
          <a
            href={d.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[#1a4f8c] underline-offset-2 hover:underline"
          >
            {d.lastTxHash}
          </a>
        </p>
      ) : null}
    </section>
  );
}
