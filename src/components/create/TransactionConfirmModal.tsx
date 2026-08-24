"use client";

import { createCardClass } from "@/components/create/createUi";
import { formatUsd } from "@/lib/dashboard/data";
import type { FeeCalculationResult } from "@/lib/fees/fee-calculator";

export function TransactionConfirmModal({
  open,
  fees,
  investmentUsd,
  onClose,
  onApprove,
}: {
  open: boolean;
  fees: FeeCalculationResult;
  investmentUsd: number;
  onClose: () => void;
  onApprove: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-confirm-title"
    >
      <div
        className={`${createCardClass} w-full max-w-lg overflow-hidden p-0 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.55)]`}
      >
        <div className="border-b border-app-line/60 bg-gradient-to-r from-app-brand/10 via-transparent to-[color:var(--color-accent-violet)]/10 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
            Transaction confirmation
          </p>
          <h2
            id="tx-confirm-title"
            className="app-display mt-1 text-xl font-bold text-app-ink"
          >
            Review fees &amp; approve
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            Investment {formatUsd(investmentUsd)} · preview only until wallet
            approval.
          </p>
        </div>

        <div className="space-y-2 px-5 py-4 text-sm">
          <FeeRow
            label="Execution fee"
            value={`${formatUsd(fees.baseExecutionFeeUsd)} → ${formatUsd(fees.finalIndexlaFeeUsd)} after Save`}
          />
          <FeeRow
            label="$DEXLA discount"
            value={`${fees.saveDiscountPercent}% (tier ${fees.saveTier})`}
          />
          <FeeRow label="Gas (user-paid)" value={formatUsd(fees.userPaidGasUsd)} />
          <FeeRow
            label="Bridge / routing"
            value={formatUsd(fees.userPaidBridgeUsd)}
          />
          <FeeRow
            label="Expected slippage"
            value={`${fees.expectedSlippageBps} bps`}
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-app-line/60 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-[12px] border border-app-line px-4 text-sm font-bold text-app-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="app-gradient-btn h-11 flex-[1.4] rounded-[12px] px-4 text-sm font-bold text-white"
          >
            Approve in wallet
          </button>
        </div>
        <p className="px-5 pb-4 text-[11px] text-app-dim">
          Approves investment and automation through your wallet. No real
          transaction is submitted in preview.
        </p>
      </div>
    </div>
  );
}

function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[10px] border border-app-line/50 bg-app-elevated/80 px-3 py-2.5">
      <span className="text-app-dim">{label}</span>
      <span className="text-right font-semibold text-app-ink">{value}</span>
    </div>
  );
}
