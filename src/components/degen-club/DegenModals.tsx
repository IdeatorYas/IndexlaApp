import { DEGEN_RISK_WARNING } from "@/lib/domain/degen-club";
import type { DegenProduct } from "@/lib/domain/degen-club";
import { formatUsd } from "@/lib/dashboard/data";

export function DegenRiskBanner() {
  return (
    <div className="degen-risk-banner" role="alert" aria-live="polite">
      {DEGEN_RISK_WARNING}
    </div>
  );
}

export function DegenBuildModal({
  onCancel,
  onContinue,
}: {
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <div
      className="degen-modal-backdrop fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="build-degen-title"
    >
      <div className="degen-modal w-full max-w-md space-y-4 p-5">
        <h3 id="build-degen-title" className="text-lg font-black text-[var(--degen-ink)]">
          Build Your Basket
        </h3>
        <div className="degen-risk-banner text-sm">{DEGEN_RISK_WARNING}</div>
        <p className="text-sm text-[var(--degen-muted)]">
          Continue to Create with the Degen Index template. Preview only — no real
          execution.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="degen-btn-secondary h-9 px-3 text-[12px]">
            Cancel
          </button>
          <button type="button" onClick={onContinue} className="degen-btn-primary h-9 px-3 text-[12px]">
            Continue to Create
          </button>
        </div>
      </div>
    </div>
  );
}

export function DegenTradeModal({
  product,
  acknowledged,
  walletConnected,
  onAckChange,
  onCancel,
  onConfirm,
  onConnect,
}: {
  product: DegenProduct;
  acknowledged: boolean;
  walletConnected: boolean;
  onAckChange: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onConnect: () => void;
}) {
  return (
    <div
      className="degen-modal-backdrop fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-degen-title"
    >
      <div className="degen-modal w-full max-w-md space-y-4 p-5">
        <h3 id="trade-degen-title" className="text-lg font-black text-[var(--degen-ink)]">
          Trade confirmation
        </h3>
        <p className="text-sm text-[var(--degen-muted)]">
          {product.name} · Est. fees {formatUsd(product.feeEstimateUsd)} · Est. costs{" "}
          {formatUsd(product.estimatedCostUsd)} · Illustrative
        </p>
        <div className="degen-risk-banner text-sm">{DEGEN_RISK_WARNING}</div>
        <label className="flex items-start gap-2 text-sm font-semibold text-[var(--degen-ink)]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAckChange(e.target.checked)}
            className="mt-1"
          />
          I understand and acknowledge this extreme risk.
        </label>
        {!walletConnected ? (
          <button type="button" onClick={onConnect} className="degen-btn-secondary h-9 w-full text-[12px]">
            Connect Wallet
          </button>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="degen-btn-secondary h-9 px-3 text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            disabled={!acknowledged || !walletConnected}
            onClick={onConfirm}
            className="degen-btn-primary h-9 px-3 text-[12px] disabled:opacity-40"
          >
            Confirm Trade Preview
          </button>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use DegenTradeModal */
export const DegenInvestModal = DegenTradeModal;

export function DegenFullExitModal({
  productName,
  onCancel,
  onConfirm,
}: {
  productName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="degen-modal-backdrop fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-degen-title"
    >
      <div className="degen-modal w-full max-w-md space-y-4 p-5">
        <h3 id="exit-degen-title" className="text-lg font-black text-[var(--degen-ink)]">
          Full Exit Preview
        </h3>
        <p className="text-sm text-[var(--degen-muted)]">
          Exit entire {productName} portfolio in one action · Illustrative preview only
        </p>
        <div className="degen-risk-banner text-sm">{DEGEN_RISK_WARNING}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="degen-btn-secondary h-9 px-3 text-[12px]">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="degen-btn-primary h-9 px-3 text-[12px]">
            Confirm Full Exit Preview
          </button>
        </div>
      </div>
    </div>
  );
}
