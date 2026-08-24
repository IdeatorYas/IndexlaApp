"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CreateAllocationDonut } from "@/components/create/CreateAllocationDonut";
import {
  createCardClass,
  createInputClass,
  createSectionSubClass,
  createSectionTitleClass,
} from "@/components/create/createUi";
import { TransactionConfirmModal } from "@/components/create/TransactionConfirmModal";
import { AssetIcon } from "@/components/ui/AssetIcons";
import { RiskDisclosure } from "@/components/product/RiskDisclosure";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import type { CreateDraft, MarketAsset } from "@/lib/domain/create";
import {
  CREATE_STRATEGY_OPTIONS,
  INDEX_CATEGORIES,
  allocationTotal,
} from "@/lib/domain/create";
import { DEGEN_RISK_WARNING } from "@/lib/domain/degen-club";
import { calculateFees } from "@/lib/fees/fee-calculator";
import { getDexlaBalance } from "@/lib/data";
import { APP_ROUTES } from "@/lib/routes";

function logoKey(asset: MarketAsset | undefined, fallback: string) {
  return (asset?.symbol || asset?.id || fallback).trim() || fallback;
}

function strategySummary(draft: CreateDraft): string[] {
  const s = draft.strategy;
  const opt = CREATE_STRATEGY_OPTIONS.find((o) => o.id === s.strategyId);
  const lines: string[] = [opt?.label ?? s.strategyId];
  if (s.strategyId === "none") return ["None — manual management"];
  if (s.strategyId === "rsi") lines.push(`RSI timeframe: ${s.rsiTimeframe}`);
  if (s.strategyId === "momentum") {
    lines.push(`Trend timeframe: ${s.momentumTimeframe}`);
  }
  if (s.strategyId === "take-profit-stop-loss") {
    lines.push(
      `TP ${s.takeProfitTargetPercent}% → sell ${s.takeProfitSellPercent}%`,
    );
    lines.push(
      `SL ${s.stopLossTargetPercent}% → sell ${s.stopLossSellPercent}%`,
    );
  }
  if (s.strategyId === "dca") {
    if (s.dcaMode === "calendar") {
      lines.push(
        `Calendar dates: ${s.dcaDates.length ? s.dcaDates.join(", ") : "—"}`,
      );
    } else {
      lines.push(`Schedule: ${s.dcaSchedule}`);
    }
  }
  if (s.strategyId !== "take-profit-stop-loss" && s.executionPercent > 0) {
    lines.push(`Execution: ${s.executionPercent}% of deposited balance`);
  }
  if (s.strategyId === "fear-greed") {
    lines.push("Fixed INDEXLA Fear & Greed thresholds");
  }
  return lines;
}

export function StepReviewConfirm({
  draft,
  assets,
  onChange,
  feeModalOpen,
  onFeeModalOpenChange,
  onCanConfirmChange,
}: {
  draft: CreateDraft;
  assets: MarketAsset[];
  onChange: (patch: Partial<CreateDraft>) => void;
  feeModalOpen: boolean;
  onFeeModalOpenChange: (open: boolean) => void;
  onCanConfirmChange?: (can: boolean) => void;
}) {
  const { wallet, connectDemo } = useDemoWallet();
  const dexla = getDexlaBalance().data;
  const [message, setMessage] = useState<string | null>(null);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  const category = INDEX_CATEGORIES.find((c) => c.id === draft.categoryId);
  const isDegen =
    Boolean(category?.isDegen) || draft.otherCategoryId === "meme-token";
  const byId = new Map(assets.map((a) => [a.id, a]));
  const networks = [
    ...new Set(
      draft.allocations.flatMap(
        (row) => byId.get(row.assetId)?.networkIds ?? [],
      ),
    ),
  ];
  const total = allocationTotal(draft.allocations);

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

  const donutSegments = draft.allocations.map((row) => {
    const asset = byId.get(row.assetId);
    return {
      assetKey: logoKey(asset, row.assetId),
      label: asset?.symbol ?? row.assetId,
      percent: row.percent,
      imageUrl: asset?.imageUrl,
    };
  });

  const canOpenModal =
    riskAcknowledged &&
    draft.investmentUsd > 0 &&
    draft.name.trim().length > 0 &&
    (!isDegen || draft.degenAcknowledged);

  useEffect(() => {
    onCanConfirmChange?.(canOpenModal);
  }, [canOpenModal, onCanConfirmChange]);

  function handleApprove() {
    if (wallet.state !== "connected") connectDemo();
    onFeeModalOpenChange(false);
    onChange({ previewConfirmed: true });
    setMessage(
      "Wallet approval recorded in preview — investment and automation authorized. No real transaction was submitted.",
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className={createSectionTitleClass}>Review & Confirm</h2>
        <p className={createSectionSubClass}>
          Confirm name, allocations, automation, and investment amount. Fees
          appear in the wallet confirmation modal after you continue.
        </p>
      </div>

      {isDegen ? (
        <div
          className="rounded-[12px] border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-sm font-semibold text-app-danger"
          role="alert"
        >
          {DEGEN_RISK_WARNING}
          <label className="mt-3 flex items-start gap-2 font-semibold text-app-ink">
            <input
              type="checkbox"
              checked={draft.degenAcknowledged}
              onChange={(e) =>
                onChange({ degenAcknowledged: e.target.checked })
              }
              className="mt-1 accent-[var(--color-brand)]"
            />
            I understand and acknowledge this extreme risk.
          </label>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
        <div className="space-y-4">
          <div className={`${createCardClass} space-y-3 p-4 sm:p-5`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
              Product
            </p>
            <h3 className="app-display text-xl font-bold text-app-ink">
              {draft.name || "Untitled"}
            </h3>
            <p className="text-sm leading-relaxed text-app-muted">
              {draft.thesis || "No description yet."}
            </p>
            <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-bold uppercase tracking-wide">
              <span className="rounded-full border border-app-line/70 bg-app-elevated px-2.5 py-1 text-app-ink">
                {draft.productType === "index" ? "Index" : "Portfolio"}
              </span>
              <span className="rounded-full border border-app-line/70 bg-app-elevated px-2.5 py-1 text-app-ink">
                {draft.visibility}
              </span>
              {category ? (
                <span className="rounded-full border border-app-brand/30 bg-app-brand/10 px-2.5 py-1 text-app-brand">
                  {category.label}
                </span>
              ) : null}
            </div>
          </div>

          <div className={`${createCardClass} space-y-3 p-4 sm:p-5`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
              Automation strategy
            </p>
            <ul className="space-y-1.5 text-sm text-app-ink">
              {strategySummary(draft).map((line) => (
                <li key={line} className="font-semibold">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className={`${createCardClass} space-y-2 p-4 sm:p-5`}>
            <label className="block text-sm">
              <span className="font-semibold text-app-ink">
                Investment amount (USD)
              </span>
              <input
                type="number"
                min={0}
                value={draft.investmentUsd}
                onChange={(e) =>
                  onChange({ investmentUsd: Number(e.target.value) || 0 })
                }
                className={`${createInputClass} mt-1.5`}
              />
            </label>
            <p className="text-[11px] text-app-dim">
              Set the amount to invest. Fee breakdown opens after you continue.
            </p>
          </div>
        </div>

        <div className={`${createCardClass} space-y-3 p-4 sm:p-5`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
              Allocations
            </p>
            <p
              className={[
                "text-sm font-bold tabular-nums",
                Math.abs(total - 100) < 0.005
                  ? "text-app-success"
                  : "text-app-danger",
              ].join(" ")}
            >
              {total.toFixed(2)}%
            </p>
          </div>
          <CreateAllocationDonut
            segments={donutSegments}
            size={280}
            totalPercent={total}
            compact
          />
          <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
            {draft.allocations.map((row) => {
              const asset = byId.get(row.assetId);
              return (
                <li
                  key={row.assetId}
                  className="flex items-center justify-between gap-2 rounded-[10px] border border-app-line/50 bg-app-elevated/70 px-2.5 py-1.5"
                >
                  <span className="flex min-w-0 items-center gap-2 font-semibold text-app-ink">
                    <AssetIcon
                      assetId={logoKey(asset, row.assetId)}
                      size={22}
                      variant="donut"
                      imageUrl={asset?.imageUrl}
                    />
                    <span className="truncate">
                      {(asset?.symbol || row.assetId).toUpperCase()}
                    </span>
                  </span>
                  <span className="tabular-nums text-app-ink">
                    {row.percent}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className={`${createCardClass} p-4 sm:p-5`}>
        <h3 className="font-bold text-app-ink">Permission scope</h3>
        <p className="mt-1 text-sm text-app-muted">
          Least-privilege session permissions for selected networks and rules
          only. INDEXLA cannot withdraw funds or expand authority.
        </p>
      </div>

      <RiskDisclosure
        variant="confirm"
        acknowledged={riskAcknowledged}
        onAcknowledgedChange={setRiskAcknowledged}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="app-gradient-btn h-11 rounded-[12px] px-5 text-sm font-bold text-white disabled:opacity-40"
          disabled={!canOpenModal}
          onClick={() => onFeeModalOpenChange(true)}
        >
          Continue to confirmation
        </button>
        <Link
          href={APP_ROUTES.portfolio}
          className="inline-flex h-11 items-center rounded-[12px] border border-app-line px-4 text-sm font-bold text-app-brand"
        >
          View Portfolio / Index
        </Link>
      </div>

      {message ? (
        <div className="rounded-[12px] border border-app-success/35 bg-app-success/10 px-4 py-3 text-sm text-app-ink">
          {message}
        </div>
      ) : null}

      <TransactionConfirmModal
        open={feeModalOpen}
        fees={fees}
        investmentUsd={draft.investmentUsd}
        onClose={() => onFeeModalOpenChange(false)}
        onApprove={handleApprove}
      />
    </section>
  );
}
