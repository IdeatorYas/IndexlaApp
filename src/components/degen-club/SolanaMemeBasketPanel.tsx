"use client";

import { useMemo, useState } from "react";
import { useSolanaMemeBasket } from "@/components/degen-club/useSolanaMemeBasket";
import { DEFAULT_SLIPPAGE_BPS } from "@/lib/degen-solana/constants";

function solToLamports(sol: string): string {
  const n = Number(sol);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Enter a positive SOL amount");
  return BigInt(Math.round(n * 1e9)).toString();
}

export function SolanaMemeBasketPanel({
  weightsPct,
  weightsValid,
}: {
  /** Percent weights aligned to DEGEN_SOLANA_BASKET order. */
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
    sellAll,
    finishIncomplete,
    basket,
  } = useSolanaMemeBasket();

  const [solIn, setSolIn] = useState("0.05");
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [riskAck, setRiskAck] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const holdingsNonZero = useMemo(
    () => (balances?.tokens ?? []).filter((t) => Number(t.amount) > 0),
    [balances],
  );

  const loadingLabel = useMemo(() => {
    if (!busy) return null;
    const phase = progress?.phase ?? "";
    if (/wallet|Confirm/i.test(phase)) return "Confirm in wallet…";
    if (/Sending|Confirming|on-chain/i.test(phase)) return "Sending transaction…";
    if (/complete/i.test(phase)) return phase;
    return "Preparing transaction…";
  }, [busy, progress?.phase]);

  async function onBuy() {
    setLocalMsg(null);
    if (!riskAck) {
      setLocalMsg("Acknowledge extreme risk before buying.");
      return;
    }
    if (!weightsValid) {
      setLocalMsg("Allocations must total exactly 100% before buying.");
      return;
    }
    try {
      const lamports = solToLamports(solIn);
      const result = await buy(lamports, slippageBps, weightsPct);
      const ok = result.legs.filter((l) => l.status === "confirmed").length;
      setLocalMsg(
        `Buy finished — ${ok}/${result.legs.length} legs · ${result.confirmCount} wallet confirm(s).`,
      );
    } catch (err) {
      setLocalMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function onSellAll() {
    setLocalMsg(null);
    if (!riskAck) {
      setLocalMsg("Acknowledge extreme risk before selling.");
      return;
    }
    try {
      const result = await sellAll(slippageBps);
      const ok = result.legs.filter((l) => l.status === "confirmed").length;
      setLocalMsg(
        `Sell All finished — ${ok}/${result.legs.length} legs · ${result.confirmCount} wallet confirm(s). SOL should be in your wallet.`,
      );
    } catch (err) {
      setLocalMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="mt-6 space-y-4 rounded-xl border border-[var(--degen-border)] bg-[var(--degen-panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--degen-muted)]">
            Live Solana basket
          </p>
          <h2 className="text-lg font-bold text-[var(--degen-ink)]">
            Buy · Sell All → SOL
          </h2>
          <p className="mt-1 text-sm text-[var(--degen-muted)]">
            You own these coins directly in your wallet (ATAs). Max {4}{" "}
            wallet confirms per flow (including first use). Demo execution fee:{" "}
            <strong>0%</strong> (INDEXLA platform fee off for this test).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!wallet.connected ? (
            <button
              type="button"
              className="degen-btn-primary"
              disabled={wallet.connecting || busy}
              onClick={() => void wallet.connect().catch(() => undefined)}
            >
              {wallet.connecting ? "Connecting…" : "Connect Solana"}
            </button>
          ) : (
            <>
              <span className="self-center text-xs font-mono text-[var(--degen-muted)]">
                {wallet.publicKey?.slice(0, 4)}…{wallet.publicKey?.slice(-4)}
              </span>
              <button
                type="button"
                className="degen-btn-ghost"
                onClick={() => void wallet.disconnect()}
              >
                Disconnect
              </button>
              <button
                type="button"
                className="degen-btn-ghost"
                onClick={() => void refreshBalances()}
              >
                Refresh
              </button>
            </>
          )}
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-[var(--degen-ink)]">
        <input
          type="checkbox"
          checked={riskAck}
          onChange={(e) => setRiskAck(e.target.checked)}
          className="mt-1"
        />
        I understand this is extreme-risk memecoin exposure and I can lose my
        entire deposit.
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-[var(--degen-muted)]">SOL to invest</span>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--degen-border)] bg-transparent px-3 py-2 font-mono"
            value={solIn}
            onChange={(e) => setSolIn(e.target.value)}
            inputMode="decimal"
          />
          <span className="mt-1 block text-xs text-[var(--degen-muted)]">
            Wallet SOL: {balances?.solUi?.toFixed(4) ?? "—"} · Split by your
            allocation % across {basket.length} coins · rent reserved on first
            use
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--degen-muted)]">Slippage (bps)</span>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--degen-border)] bg-transparent px-3 py-2 font-mono"
            type="number"
            min={50}
            max={1000}
            value={slippageBps}
            onChange={(e) =>
              setSlippageBps(Number(e.target.value) || DEFAULT_SLIPPAGE_BPS)
            }
          />
          <span className="mt-1 block text-xs text-[var(--degen-muted)]">
            Default {DEFAULT_SLIPPAGE_BPS}. Execution fee:{" "}
            {balances?.feeConfigured ? "configured" : "0% (demo)"}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="degen-btn-primary"
          disabled={busy || !riskAck || !weightsValid}
          onClick={() => void onBuy()}
        >
          {busy ? "Working…" : "Buy"}
        </button>
        <button
          type="button"
          className="degen-btn-primary"
          disabled={busy || !riskAck || holdingsNonZero.length === 0}
          onClick={() => void onSellAll()}
        >
          {busy ? "Working…" : "Sell All → SOL"}
        </button>
        <button
          type="button"
          className="degen-btn-ghost"
          disabled={busy}
          onClick={() =>
            void finishIncomplete("sell").catch((e) =>
              setLocalMsg(e instanceof Error ? e.message : String(e)),
            )
          }
        >
          Finish incomplete sell
        </button>
      </div>

      {!weightsValid ? (
        <p className="text-sm text-[var(--degen-danger,#f87171)]">
          Allocations must total 100% to enable Buy.
        </p>
      ) : null}

      {(localMsg || error || wallet.error) && !busy ? (
        <p className="text-sm text-[var(--degen-ink)]">
          {localMsg || error || wallet.error}
        </p>
      ) : null}

      {/* User-facing progress: loading only — no per-leg error dump */}
      {busy || (progress && /complete|Partial/i.test(progress.phase)) ? (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-[var(--degen-border)] px-4 py-6">
          {busy ? (
            <span
              className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--degen-muted)] border-t-[var(--degen-ink)]"
              aria-hidden
            />
          ) : null}
          <p className="text-sm font-semibold text-[var(--degen-ink)]">
            {loadingLabel ?? progress?.phase ?? "Working…"}
          </p>
        </div>
      ) : null}

      {/* Signatures only after completion — no live failed/pending dump */}
      {progress &&
      !busy &&
      progress.legs.some((l) => l.signature) ? (
        <ul className="space-y-1 text-xs font-mono text-[var(--degen-muted)]">
          {progress.legs
            .filter((l) => l.signature)
            .map((l) => (
              <li key={l.key}>
                {l.ticker}:{" "}
                <a
                  className="underline"
                  href={`https://solscan.io/tx/${l.signature}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {l.signature!.slice(0, 12)}…
                </a>
              </li>
            ))}
        </ul>
      ) : null}

      <div>
        <p className="text-xs font-bold uppercase text-[var(--degen-muted)]">
          Holdings (on-chain)
        </p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {(
            balances?.tokens ??
            basket.map((m) => ({
              key: m.key,
              ticker: m.ticker,
              mint: m.mint,
              amount: "0",
              uiAmount: 0,
            }))
          ).map((t) => (
            <li
              key={t.key}
              className="flex justify-between rounded border border-[var(--degen-border)] px-2 py-1 text-xs font-mono"
            >
              <span>{t.ticker}</span>
              <span>{t.uiAmount?.toPrecision?.(6) ?? t.amount}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
