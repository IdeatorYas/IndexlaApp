"use client";

import { useMemo, useState } from "react";
import { useSolanaMemeBasket } from "@/components/degen-club/useSolanaMemeBasket";
import {
  DEFAULT_SLIPPAGE_BPS,
  DEGEN_SOLANA_BASKET,
} from "@/lib/degen-solana/constants";
import { dustThresholdRaw } from "@/lib/degen-solana/balances";

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
    () =>
      (balances?.tokens ?? []).filter((t) => {
        const meta = DEGEN_SOLANA_BASKET.find((m) => m.key === t.key);
        return BigInt(t.amount) > dustThresholdRaw(meta?.decimals ?? 6);
      }),
    [balances],
  );

  const heldCount = holdingsNonZero.length;
  const basketSize = basket.length;

  const loadingLabel = useMemo(() => {
    if (!busy) return null;
    const phase = progress?.phase ?? "";
    if (/wallet|Confirm/i.test(phase)) return "Confirm in wallet…";
    if (/Sending|Confirming|on-chain/i.test(phase)) return "Sending transaction…";
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
      if (result.complete) {
        setLocalMsg(
          `Buy complete — ${result.heldCount}/${result.basketSize} confirmed · ${result.confirmCount} wallet prompt(s).`,
        );
      } else {
        setLocalMsg(
          `Partial buy — ${result.heldCount} of ${result.basketSize} confirmed. Use Finish remaining or Sell All to unwind.`,
        );
      }
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
      if (result.complete) {
        setLocalMsg(
          `Sell All complete — ${result.heldCount}/${result.basketSize} confirmed · ${result.confirmCount} wallet prompt(s). SOL should be in your wallet.`,
        );
      } else {
        setLocalMsg(
          `Partial sell — ${result.heldCount} of ${result.basketSize} confirmed. Use Finish incomplete sell.`,
        );
      }
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
            You own these coins directly in your wallet (ATAs). Max {3}{" "}
            wallet prompts per flow (one swap per asset). Demo execution fee:{" "}
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
            void finishIncomplete("buy").catch((e) =>
              setLocalMsg(e instanceof Error ? e.message : String(e)),
            )
          }
        >
          Finish remaining buy
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

      {wallet.connected ? (
        <p className="text-sm text-[var(--degen-ink)]">
          On-chain holdings: {heldCount} of {basketSize}
          {heldCount > 0 && heldCount < basketSize
            ? " — partial. Finish remaining or Sell All."
            : null}
          {heldCount === basketSize ? " — full basket." : null}
        </p>
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

      {/* Compact per-asset result after run — not a bordered dump box */}
      {progress && !busy ? (
        <ul className="space-y-0.5 text-xs font-mono text-[var(--degen-muted)]">
          {progress.legs.map((l) => (
            <li key={l.key}>
              {l.ticker}: {l.status}
              {l.signature ? (
                <>
                  {" "}
                  <a
                    className="underline"
                    href={`https://solscan.io/tx/${l.signature}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {l.signature.slice(0, 8)}…
                  </a>
                </>
              ) : null}
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
              className="flex justify-between px-1 py-0.5 text-xs font-mono"
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
