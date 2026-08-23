"use client";

import { useId } from "react";

/** Exact approved risk disclosure copy — do not rewrite. */
export const RISK_DISCLOSURE_TITLE = "Risk Disclosure";

export const RISK_DISCLOSURE_PARAGRAPHS = [
  "INDEXLA is non-custodial. Your assets remain in your wallet at all times, and automation operates only within the limited, revocable permissions you approve.",
  "Investing involves significant risk. You may lose some or all of your capital. Strategies may underperform and can incur fees, slippage and execution losses.",
  "INDEXLA does not provide financial, investment, tax or legal advice and does not guarantee returns or capital protection. Past performance is not indicative of future results.",
  "You are solely responsible for your investment decisions, due diligence and compliance with applicable laws.",
] as const;

export const RISK_DISCLOSURE_ACKNOWLEDGMENT =
  "By confirming this investment, you acknowledge and accept these risks.";

export function RiskDisclosure({
  variant = "page",
  acknowledged = false,
  onAcknowledgedChange,
  className,
}: {
  /** page = static product-detail block; confirm = includes required acknowledgment checkbox */
  variant?: "page" | "confirm";
  acknowledged?: boolean;
  onAcknowledgedChange?: (next: boolean) => void;
  className?: string;
}) {
  const reactId = useId();
  const titleId = `indexla-risk-disclosure-title-${reactId}`;
  const checkboxId = `indexla-risk-disclosure-ack-${reactId}`;

  return (
    <aside
      className={[
        "rounded-[16px] border border-app-warning/50 bg-gradient-to-b from-app-warning/[0.16] via-app-elevated to-app-panel/90 px-3.5 py-3.5 shadow-[0_12px_36px_-24px_rgba(0,0,0,0.4)] dark:from-app-warning/[0.2] dark:via-app-elevated dark:to-app-panel sm:px-4 sm:py-4",
        className ?? "",
      ].join(" ")}
      role="note"
      aria-labelledby={titleId}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-app-warning/55 bg-app-warning/20 text-[12px] font-bold text-app-warning"
          aria-hidden
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className="app-display text-[15px] font-bold tracking-tight text-app-ink sm:text-base"
          >
            {RISK_DISCLOSURE_TITLE}
          </h2>
          <div className="mt-2.5 space-y-2.5 text-[12px] leading-relaxed text-app-ink/90 sm:text-[13px]">
            {RISK_DISCLOSURE_PARAGRAPHS.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          {variant === "confirm" && onAcknowledgedChange ? (
            <label
              htmlFor={checkboxId}
              className="mt-3.5 flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-app-line/55 bg-app-elevated/85 px-3 py-2.5"
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => onAcknowledgedChange(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-warning)]"
              />
              <span className="text-[12px] font-bold leading-snug text-app-ink sm:text-[13px]">
                {RISK_DISCLOSURE_ACKNOWLEDGMENT}
              </span>
            </label>
          ) : (
            <p className="mt-3 text-[12px] font-bold leading-snug text-app-ink sm:text-[13px]">
              {RISK_DISCLOSURE_ACKNOWLEDGMENT}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
