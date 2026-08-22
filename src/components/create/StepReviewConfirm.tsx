"use client";

import { useMemo, useState } from "react";
import type { CreateDraft, MarketAsset } from "@/lib/domain/create";
import { INDEX_CATEGORIES } from "@/lib/domain/create";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { calculateFees } from "@/lib/fees/fee-calculator";
import { getDexlaBalance } from "@/lib/data";
import { formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import Link from "next/link";

export function StepReviewConfirm({
  draft,
  assets,
  onChange,
}: {
  draft: CreateDraft;
  assets: MarketAsset[];
  onChange: (patch: Partial<CreateDraft>) => void;
}) {
  const { wallet, connectDemo } = useDemoWallet();
  const dexla = getDexlaBalance().data;
  const [message, setMessage] = useState<string | null>(null);
  const [authorizedAutomation, setAuthorizedAutomation] = useState(false);
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(false);

  const category = INDEX_CATEGORIES.find((c) => c.id === draft.categoryId);
  const isDegen = Boolean(category?.isDegen);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const networks = [
    ...new Set(
      draft.allocations.flatMap(
        (row) => byId.get(row.assetId)?.networkIds ?? [],
      ),
    ),
  ];

  const fees = useMemo(
    () =>
      calculateFees({
        portfolioType:
          draft.productType === "index"
            ? "indexla-portfolio"
            : "creator-portfolio",
        tradeAmountUsd: draft.investmentUsd,
        dexlaBalance: dexla.balance,
        estimatedGasUsd: Math.max(2.5, draft.investmentUsd * 0.0015),
        estimatedBridgeUsd: networks.length > 1 ? 4.2 : 0,
        expectedSlippageBps: draft.strategy.slippageBps,
      }),
    [draft, dexla.balance, networks.length],
  );

  function previewAction(label: string) {
    setMessage(
      `${label} — preview only. No real transaction, permission or execution was submitted.`,
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="app-display text-xl font-bold text-app-ink">
          Review & Confirm
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          Final preview before create. All actions remain non-executing.
        </p>
      </div>

      {isDegen ? (
        <div
          className="rounded-[10px] border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-sm text-app-danger"
          role="alert"
        >
          EXTREME RISK — Memecoins are highly speculative and may lose most or
          all of their value. Diversification does not remove risk.
          <label className="mt-3 flex items-start gap-2 font-semibold text-app-ink">
            <input
              type="checkbox"
              checked={draft.degenAcknowledged}
              onChange={(e) =>
                onChange({ degenAcknowledged: e.target.checked })
              }
              className="mt-1"
            />
            I understand and acknowledge this extreme risk.
          </label>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="app-panel space-y-2 p-4 text-sm">
          <Row
            label="Product type"
            value={draft.productType === "index" ? "Index" : "Portfolio"}
          />
          {draft.productType === "index" ? (
            <Row label="Category" value={category?.label ?? "—"} />
          ) : null}
          <Row label="Name" value={draft.name || "Untitled"} />
          <Row label="Visibility" value={draft.visibility} />
          <Row label="Investment" value={formatUsd(draft.investmentUsd)} />
          <Row
            label="Strategy"
            value={
              draft.strategy.strategyId === "none"
                ? "None"
                : draft.strategy.strategyId
            }
          />
          <Row label="Networks" value={networks.join(", ") || "—"} />
          <p className="pt-2 text-app-muted">{draft.thesis || "No thesis yet."}</p>
        </div>

        <div className="app-panel space-y-3 p-4">
          <AllocationDonut
            segments={draft.allocations.map((row) => ({
              label: byId.get(row.assetId)?.symbol ?? row.assetId,
              percent: row.percent,
            }))}
            size={88}
          />
          <ul className="space-y-1.5 text-sm">
            {draft.allocations.map((row) => (
              <li
                key={row.assetId}
                className="flex justify-between gap-2 text-app-ink"
              >
                <span className="font-semibold">
                  {(byId.get(row.assetId)?.symbol || row.assetId).toUpperCase()}
                </span>
                <span>{row.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="app-panel grid gap-3 p-4 text-sm sm:grid-cols-2">
        <div>
          <h3 className="font-bold text-app-ink">Execution routes (preview)</h3>
          <ul className="mt-2 space-y-1 text-app-muted">
            <li>CoW Protocol — disabled · preview disclosure</li>
            <li>LI.FI — disabled · preview disclosure</li>
            <li>Across — disabled · preview disclosure</li>
            <li>MEV-aware status — protected intent (illustrative)</li>
          </ul>
        </div>
        <div>
          <h3 className="font-bold text-app-ink">Fees & costs</h3>
          <ul className="mt-2 space-y-1 text-app-muted">
            <li>
              Execution fee: {formatUsd(fees.baseExecutionFeeUsd)} →{" "}
              {formatUsd(fees.finalIndexlaFeeUsd)} after Save
            </li>
            <li>
              $DEXLA Save: {fees.saveDiscountPercent}% (tier {fees.saveTier})
            </li>
            <li>Gas (user-paid): {formatUsd(fees.userPaidGasUsd)}</li>
            <li>Bridge / routing: {formatUsd(fees.userPaidBridgeUsd)}</li>
            <li>
              Expected slippage: {fees.expectedSlippageBps} bps
            </li>
          </ul>
        </div>
        <div className="sm:col-span-2">
          <h3 className="font-bold text-app-ink">Permission scope</h3>
          <p className="mt-1 text-app-muted">
            Least-privilege session permissions for selected networks and rules
            only. INDEXLA cannot withdraw funds or expand authority. Revocation
            remains available — not granted in preview.
          </p>
          {draft.visibility === "public" ? (
            <p className="mt-2 text-app-warning">
              Publishing requirement: public products must be explicitly
              published after creation.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {wallet.state !== "connected" ? (
          <button
            type="button"
            className="app-gradient-btn h-10 rounded-[10px] px-4 text-sm font-bold"
            onClick={() => {
              connectDemo();
              previewAction("Connect Wallet");
            }}
          >
            Connect Wallet
          </button>
        ) : (
          <span className="inline-flex h-10 items-center rounded-[10px] border border-app-success/40 bg-app-success/10 px-3 text-sm font-bold text-app-success">
            Wallet connected (demo)
          </span>
        )}
        <button
          type="button"
          className="h-10 rounded-[10px] bg-app-brand px-4 text-sm font-bold text-white disabled:opacity-40"
          disabled={isDegen && !draft.degenAcknowledged}
          onClick={() => {
            setPurchaseConfirmed(true);
            previewAction("Confirm Initial Purchase");
          }}
        >
          Confirm Initial Purchase
        </button>
        <button
          type="button"
          className="h-10 rounded-[10px] border border-app-line px-4 text-sm font-bold text-app-ink disabled:opacity-40"
          disabled={draft.strategy.strategyId === "none"}
          onClick={() => {
            setAuthorizedAutomation(true);
            previewAction("Authorize Automation");
          }}
        >
          Authorize Automation
        </button>
        <Link
          href={APP_ROUTES.portfolio}
          className="inline-flex h-10 items-center rounded-[10px] border border-app-line px-4 text-sm font-bold text-app-brand"
          onClick={() => onChange({ previewConfirmed: true })}
        >
          View Portfolio / Index
        </Link>
      </div>

      {(message || purchaseConfirmed || authorizedAutomation) && (
        <div className="rounded-[10px] border border-app-line bg-app-soft px-4 py-3 text-sm text-app-muted">
          {message}
          {purchaseConfirmed ? (
            <p className="mt-1">Initial purchase marked confirmed in preview.</p>
          ) : null}
          {authorizedAutomation ? (
            <p className="mt-1">
              Automation authorization recorded in preview only.
            </p>
          ) : null}
          <p className="mt-2 font-semibold text-app-ink">
            No real transaction, permission or execution was submitted.
          </p>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-app-dim">{label}</span>
      <span className="text-right font-semibold capitalize text-app-ink">
        {value}
      </span>
    </div>
  );
}
