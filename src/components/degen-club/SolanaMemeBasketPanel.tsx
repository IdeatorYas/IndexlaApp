"use client";

import { useMemo, useState } from "react";
import { useSolanaMemeBasket } from "@/components/degen-club/useSolanaMemeBasket";
import { SolanaWalletPickerModal } from "@/components/degen-club/SolanaWalletPickerModal";
import {
  DEFAULT_SLIPPAGE_BPS,
  DEGEN_SOLANA_BASKET,
} from "@/lib/degen-solana/constants";
import { dustThresholdRaw } from "@/lib/degen-solana/balances";
import type { SolanaInjectedWallet } from "@/lib/degen-solana/injected-wallets";

function solToLamports(sol: string): string {
  const n = Number(sol);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Enter a positive SOL amount");
  return BigInt(Math.round(n * 1e9)).toString();
}

const SELL_SHORTCUTS = [25, 50, 75, 100] as const;

export function SolanaMemeBasketPanel({
  weightsPct,
  weightsValid,
}: {
  weightsPct: number[];
  weightsValid: boolean;
}) {
  const {
    wallet,
    balances,
    refreshBalances,
    progress,
    error,
    busy,
    buy,
    sellPercent,
    finishIncomplete,
    hasIncomplete,
  } = useSolanaMemeBasket();

  const [solIn, setSolIn] = useState("0.05");
  const [sellPct, setSellPct] = useState(100);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const holdingsNonZero = useMemo(
    () =>
      (balances?.tokens ?? []).filter((t) => {
        const meta = DEGEN_SOLANA_BASKET.find((m) => m.key === t.key);
        return BigInt(t.amount) > dustThresholdRaw(meta?.decimals ?? 6);
      }),
    [balances],
  );

  const incomplete = hasIncomplete();
  const showRecovery = incomplete.buy || incomplete.sell;

  const loadingLabel = useMemo(() => {
    if (!busy) return null;
    const phase = progress?.phase ?? "";
    if (/wallet|Confirm/i.test(phase)) return "Confirm in wallet…";
    if (/Sending|Confirming|on-chain/i.test(phase)) return "Confirming…";
    return "Preparing…";
  }, [busy, progress?.phase]);

  async function onBuy() {
    setLocalMsg(null);
    if (!weightsValid) {
      setLocalMsg("Allocations must total exactly 100% before buying.");
      return;
    }
    try {
      const result = await buy(solToLamports(solIn), DEFAULT_SLIPPAGE_BPS, weightsPct);
      if (result.complete) {
        setLocalMsg(
          `Buy complete — ${result.heldCount}/${result.basketSize} confirmed · ${result.confirmCount} wallet prompt(s).`,
        );
      } else {
        setLocalMsg(
          `Partial buy — ${result.heldCount} of ${result.basketSize} confirmed. Resume Remaining to finish.`,
        );
      }
    } catch (err) {
      setLocalMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function onSell() {
    setLocalMsg(null);
    try {
      const result = await sellPercent(sellPct, DEFAULT_SLIPPAGE_BPS);
      if (result.complete) {
        setLocalMsg(
          sellPct >= 100
            ? `Sell All complete — ${result.confirmCount} wallet prompt(s). SOL is in your wallet.`
            : `Sold ${sellPct}% — confirmed · ${result.confirmCount} wallet prompt(s).`,
        );
      } else {
        setLocalMsg(
          `Partial sell — ${result.confirmCount} prompt(s) so far. Resume Remaining finishes leftovers only.`,
        );
      }
    } catch (err) {
      setLocalMsg(err instanceof Error ? err.message : String(err));
    }
  }

  function openConnect() {
    setPickError(null);
    setLocalMsg(null);
    const wallets = wallet.listWallets();
    if (wallets.length === 1) {
      void wallet
        .connect(wallets[0])
        .catch((err) => {
          setPickError(err instanceof Error ? err.message : String(err));
          setPickerOpen(true);
        });
      return;
    }
    setPickerOpen(true);
  }

  function onPick(w: SolanaInjectedWallet) {
    setPickError(null);
    void wallet
      .connect(w)
      .then(() => setPickerOpen(false))
      .catch((err) => {
        setPickError(err instanceof Error ? err.message : String(err));
      });
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Invest controls — product chrome, not a separate technical box */}
      <div className="degen-detail-actions degen-detail-actions-inline flex flex-wrap items-end gap-2">
        {!wallet.connected ? (
          <button
            type="button"
            className="degen-btn-primary h-9 flex-1 text-[12px] uppercase tracking-wide"
            disabled={wallet.connecting || busy}
            onClick={openConnect}
          >
            {wallet.connecting ? "Connecting…" : "Connect Wallet"}
          </button>
        ) : (
          <>
            <label className="min-w-[7rem] flex-1 text-xs">
              <span className="text-[var(--degen-muted)]">SOL</span>
              <input
                className="mt-0.5 w-full rounded-lg border border-[var(--degen-border)] bg-transparent px-2 py-1.5 font-mono text-sm"
                value={solIn}
                onChange={(e) => setSolIn(e.target.value)}
                inputMode="decimal"
                aria-label="SOL to invest"
              />
            </label>
            <button
              type="button"
              className="degen-btn-primary h-9 flex-1 text-[12px] uppercase tracking-wide"
              disabled={busy || !weightsValid}
              onClick={() => void onBuy()}
            >
              {busy ? "Working…" : "Buy"}
            </button>
            <button
              type="button"
              className="degen-btn-ghost h-9 px-2 text-[11px] font-mono"
              onClick={() => void wallet.disconnect()}
              title={wallet.publicKey ?? undefined}
            >
              {wallet.publicKey?.slice(0, 4)}…{wallet.publicKey?.slice(-4)}
            </button>
          </>
        )}
      </div>

      <SolanaWalletPickerModal
        open={pickerOpen}
        busy={wallet.connecting}
        error={pickError ?? wallet.error}
        onClose={() => setPickerOpen(false)}
        onPick={onPick}
      />

      {!weightsValid ? (
        <p className="text-center text-xs font-semibold text-[var(--degen-danger,#f87171)]">
          Allocations must equal 100% to Buy
        </p>
      ) : null}

      {wallet.connected ? (
        <p className="text-xs text-[var(--degen-muted)]">
          Wallet SOL: {balances?.solUi?.toFixed(4) ?? "—"}
        </p>
      ) : null}

      {/* My Position — only after holdings exist */}
      {holdingsNonZero.length > 0 ? (
        <section className="degen-detail-section space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="degen-section-title mt-0 text-[0.95rem]">My Position</h2>
            <button
              type="button"
              className="degen-btn-ghost text-[11px]"
              disabled={busy}
              onClick={() => void refreshBalances()}
            >
              Refresh
            </button>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {holdingsNonZero.map((t) => (
              <li
                key={t.key}
                className="flex justify-between px-0.5 py-0.5 text-xs font-mono text-[var(--degen-ink)]"
              >
                <span>{t.ticker}</span>
                <span>{t.uiAmount?.toPrecision?.(6) ?? t.amount}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--degen-muted)]">
                Sell %
              </span>
              <span className="font-mono text-sm text-[var(--degen-ink)]">
                {sellPct}%
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={sellPct}
              onChange={(e) => setSellPct(Number(e.target.value) || 1)}
              className="w-full"
              aria-label="Sell percent of holdings"
            />
            <div className="flex flex-wrap gap-1.5">
              {SELL_SHORTCUTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={[
                    "rounded border px-2 py-0.5 text-[11px] font-semibold",
                    sellPct === p
                      ? "border-[var(--degen-ink)] text-[var(--degen-ink)]"
                      : "border-[var(--degen-border)] text-[var(--degen-muted)]",
                  ].join(" ")}
                  onClick={() => setSellPct(p)}
                >
                  {p}%
                </button>
              ))}
            </div>
            <button
              type="button"
              className="degen-btn-primary h-9 w-full text-[12px] uppercase tracking-wide"
              disabled={busy}
              onClick={() => void onSell()}
            >
              {busy
                ? "Working…"
                : sellPct >= 100
                  ? "Sell All → SOL"
                  : `Sell ${sellPct}% → SOL`}
            </button>
          </div>
        </section>
      ) : null}

      {/* Recovery only when incomplete — hidden in normal use */}
      {showRecovery && !busy ? (
        <div className="flex flex-wrap gap-2">
          {incomplete.buy ? (
            <button
              type="button"
              className="degen-btn-ghost text-[11px]"
              disabled={busy}
              onClick={() =>
                void finishIncomplete("buy")
                  .then((r) =>
                    setLocalMsg(
                      r.complete
                        ? `Buy complete — ${r.heldCount}/${r.basketSize}`
                        : `Still partial — ${r.heldCount}/${r.basketSize}`,
                    ),
                  )
                  .catch((e) =>
                    setLocalMsg(e instanceof Error ? e.message : String(e)),
                  )
              }
            >
              Resume Remaining
            </button>
          ) : null}
          {incomplete.sell ? (
            <button
              type="button"
              className="degen-btn-ghost text-[11px]"
              disabled={busy}
              onClick={() =>
                void finishIncomplete("sell")
                  .then((r) =>
                    setLocalMsg(
                      r.complete
                        ? "Sell All complete"
                        : "Sell still partial — Resume Remaining again",
                    ),
                  )
                  .catch((e) =>
                    setLocalMsg(e instanceof Error ? e.message : String(e)),
                  )
              }
            >
              Resume Remaining
            </button>
          ) : null}
        </div>
      ) : null}

      {(localMsg || error || wallet.error) && !busy ? (
        <p className="text-sm text-[var(--degen-ink)]">
          {localMsg || error || wallet.error}
        </p>
      ) : null}

      {busy ? (
        <p className="text-sm font-semibold text-[var(--degen-ink)]">
          <span
            className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--degen-muted)] border-t-[var(--degen-ink)] align-[-2px]"
            aria-hidden
          />
          {loadingLabel ?? "Working…"}
        </p>
      ) : null}

      {progress && !busy && progress.confirmCount > 0 ? (
        <p className="text-xs text-[var(--degen-muted)]">
          {progress.phase}
          {` · ${progress.confirmCount} wallet prompt(s)`}
        </p>
      ) : null}
    </div>
  );
}
