"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { CreateAllocationDonut } from "@/components/create/CreateAllocationDonut";
import {
  createInputClass,
  createSectionSubClass,
  createSectionTitleClass,
} from "@/components/create/createUi";
import { TransactionConfirmModal } from "@/components/create/TransactionConfirmModal";
import { RiskDisclosure } from "@/components/product/RiskDisclosure";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import type { CreateDraft, MarketAsset } from "@/lib/domain/create";
import {
  AUTOMATE_SELL_OPTIONS,
  CREATE_STRATEGY_OPTIONS,
  INDEX_CATEGORIES,
  allocationTotal,
} from "@/lib/domain/create";
import { DEGEN_RISK_WARNING } from "@/lib/domain/degen-club";
import { calculateFees } from "@/lib/fees/fee-calculator";
import { getDexlaBalance } from "@/lib/data";
import { formatUsd } from "@/lib/dashboard/data";
import { resolveAssetTicker } from "@/lib/fixtures/asset-registry";
import { APP_ROUTES } from "@/lib/routes";

type SummaryRow = { label: string; value: string };

function strategySummaryRows(draft: CreateDraft): SummaryRow[] {
  const s = draft.strategy;
  const opt = CREATE_STRATEGY_OPTIONS.find((o) => o.id === s.strategyId);
  const rows: SummaryRow[] = [
    { label: "Strategy", value: opt?.label ?? s.strategyId },
  ];

  if (s.strategyId === "buy-now") {
    rows.push({ label: "Execution", value: "Immediate buy — no automated sells" });
    return rows;
  }

  if (s.strategyId === "buy-now-automate-sells") {
    rows.push({ label: "Buy", value: "Immediate purchase on confirmation" });
    const sellOpt = AUTOMATE_SELL_OPTIONS.find((o) => o.id === s.automateSellId);
    if (sellOpt) rows.push({ label: "Automated sells", value: sellOpt.label });
    if (s.automateSellId === "rsi") {
      rows.push({ label: "RSI timeframe", value: s.rsiTimeframe });
    }
    if (s.automateSellId === "momentum") {
      rows.push({ label: "Momentum timeframe", value: s.momentumTimeframe });
    }
    if (s.automateSellId === "fear-greed") {
      rows.push({
        label: "Sell triggers",
        value: "Greed (>60) · Extreme Greed (>80)",
      });
    }
    if (s.executionPercent > 0) {
      rows.push({
        label: "Sell per trigger",
        value: `${s.executionPercent}% of position`,
      });
    }
    return rows;
  }

  if (s.strategyId === "rsi") {
    rows.push({ label: "RSI timeframe", value: s.rsiTimeframe });
  }
  if (s.strategyId === "momentum") {
    rows.push({ label: "Trend timeframe", value: s.momentumTimeframe });
  }
  if (s.strategyId === "take-profit-stop-loss") {
    rows.push({
      label: "Take profit",
      value: `${s.takeProfitTargetPercent}% target → sell ${s.takeProfitSellPercent}%`,
    });
    rows.push({
      label: "Stop loss",
      value: `${s.stopLossTargetPercent}% target → sell ${s.stopLossSellPercent}%`,
    });
  }
  if (s.strategyId === "dca") {
    if (s.dcaMode === "calendar") {
      rows.push({
        label: "Purchase dates",
        value:
          s.dcaDates.length > 0
            ? `${s.dcaDates.length} date${s.dcaDates.length === 1 ? "" : "s"} selected`
            : "—",
      });
      if (s.dcaDates.length > 0 && s.dcaDates.length <= 6) {
        rows.push({ label: "Dates", value: s.dcaDates.join(", ") });
      }
    } else {
      rows.push({ label: "Schedule", value: s.dcaSchedule });
    }
  }
  if (s.strategyId !== "take-profit-stop-loss" && s.executionPercent > 0) {
    rows.push({
      label: "Execution",
      value: `${s.executionPercent}% of deposited balance`,
    });
  }
  if (s.strategyId === "fear-greed") {
    rows.push({
      label: "Rules",
      value: "INDEXLA Fear & Greed thresholds",
    });
  }
  return rows;
}

function ReviewSection({
  eyebrow,
  title,
  children,
  accent = "brand",
  clipContent = true,
}: {
  eyebrow: string;
  title?: string;
  children: ReactNode;
  accent?: "brand" | "violet" | "success";
  /** Set false for allocation donut so in-segment logos are not clipped. */
  clipContent?: boolean;
}) {
  const accentBar =
    accent === "violet"
      ? "from-[color:var(--color-accent-violet)]/70 to-transparent"
      : accent === "success"
        ? "from-app-success/70 to-transparent"
        : "from-[var(--color-brand-grad-from)]/70 to-transparent";

  return (
    <article
      className={[
        "rounded-[18px] border border-app-line/55 bg-gradient-to-br from-app-elevated via-app-elevated to-app-panel/90 shadow-[0_18px_48px_-32px_rgba(0,0,0,0.45)]",
        clipContent ? "overflow-hidden" : "overflow-visible",
      ].join(" ")}
    >
      <div className={`h-1 bg-gradient-to-r ${accentBar}`} />
      <div className="space-y-3 p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-app-dim">
            {eyebrow}
          </p>
          {title ? (
            <h3 className="app-display mt-1 text-lg font-bold text-app-ink">
              {title}
            </h3>
          ) : null}
        </div>
        {children}
      </div>
    </article>
  );
}

function MetaBadge({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: "neutral" | "brand" | "public";
}) {
  const cls =
    variant === "brand"
      ? "border-app-brand/35 bg-app-brand/10 text-app-brand"
      : variant === "public"
        ? "border-app-success/30 bg-app-success/10 text-app-success"
        : "border-app-line/70 bg-app-panel/60 text-app-ink";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
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
  const strategyRows = strategySummaryRows(draft);

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

  const donutSegments = useMemo(() => {
    const map = new Map(assets.map((a) => [a.id, a]));
    return draft.allocations.map((row) => {
      const asset = map.get(row.assetId);
      const assetKey = asset?.symbol?.trim()
        ? asset.symbol.trim()
        : resolveAssetTicker(row.assetId);
      return {
        assetKey,
        label: asset?.symbol ?? asset?.name ?? row.assetId,
        percent: row.percent,
        imageUrl: asset?.imageUrl ?? null,
      };
    });
  }, [draft.allocations, assets]);

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

  const productTypeLabel =
    draft.productType === "index" ? "Index" : "Portfolio";
  const visibilityLabel =
    draft.visibility === "public" ? "Public" : "Personal";

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-[18px] border border-app-line/50 bg-gradient-to-br from-app-brand/[0.08] via-app-elevated to-[color:var(--color-accent-violet)]/[0.06] p-5 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-app-dim">
          Final review
        </p>
        <h2 className={`${createSectionTitleClass} mt-1 text-[1.5rem] sm:text-[1.65rem]`}>
          Review & Confirm
        </h2>
        <p className={`${createSectionSubClass} mt-2 max-w-xl`}>
          Verify every detail before wallet confirmation. Fees appear only in
          the transaction modal after you continue.
        </p>
      </div>

      {isDegen ? (
        <div
          className="rounded-[14px] border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-sm font-semibold text-app-danger"
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="space-y-4">
          <ReviewSection eyebrow="Product" title={draft.name || "Untitled"}>
            <p className="text-sm leading-relaxed text-app-muted">
              {draft.thesis || "No description yet."}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <MetaBadge label={productTypeLabel} variant="brand" />
              <MetaBadge
                label={visibilityLabel}
                variant={draft.visibility === "public" ? "public" : "neutral"}
              />
              {category ? (
                <MetaBadge label={category.label} variant="neutral" />
              ) : draft.productType === "portfolio" ? (
                <MetaBadge label="Multi-narrative" variant="neutral" />
              ) : null}
            </div>
          </ReviewSection>

          <ReviewSection eyebrow="Automation" accent="violet">
            <dl className="divide-y divide-app-line/40">
              {strategyRows.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-app-dim">
                    {row.label}
                  </dt>
                  <dd className="text-sm font-semibold text-app-ink sm:text-right">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </ReviewSection>

          <ReviewSection eyebrow="Investment" accent="success">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-app-dim">
                Amount (USD)
              </span>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <input
                  type="number"
                  min={0}
                  value={draft.investmentUsd}
                  onChange={(e) =>
                    onChange({ investmentUsd: Number(e.target.value) || 0 })
                  }
                  className={`${createInputClass} max-w-[12rem] text-base font-bold`}
                />
                {draft.investmentUsd > 0 ? (
                  <p className="app-display text-2xl font-bold tabular-nums text-app-ink">
                    {formatUsd(draft.investmentUsd)}
                  </p>
                ) : null}
              </div>
              <p className="mt-2 text-[11px] text-app-dim">
                Fee breakdown opens in the wallet confirmation modal.
              </p>
            </label>
          </ReviewSection>
        </div>

        <ReviewSection
          eyebrow="Allocations"
          title={`${total.toFixed(2)}% allocated`}
          accent={Math.abs(total - 100) < 0.005 ? "success" : "brand"}
          clipContent={false}
        >
          <CreateAllocationDonut
            segments={donutSegments}
            size={380}
            totalPercent={total}
            compact={draft.allocations.length >= 8}
          />
        </ReviewSection>
      </div>

      <ReviewSection eyebrow="Permissions">
        <p className="text-sm leading-relaxed text-app-muted">
          Least-privilege session permissions for selected networks and rules
          only. INDEXLA cannot withdraw funds or expand authority beyond your
          configured automation.
        </p>
      </ReviewSection>

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
