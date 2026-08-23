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
  density = "default",
  acknowledged = false,
  onAcknowledgedChange,
  className,
}: {
  /** page = static product-detail block; confirm = includes required acknowledgment checkbox */
  variant?: "page" | "confirm";
  /** compact = denser typography for single-screen product layouts */
  density?: "default" | "compact";
  acknowledged?: boolean;
  onAcknowledgedChange?: (next: boolean) => void;
  className?: string;
}) {
  const reactId = useId();
  const titleId = `indexla-risk-disclosure-title-${reactId}`;
  const checkboxId = `indexla-risk-disclosure-ack-${reactId}`;
  const compact = density === "compact";

  return (
    <aside
      className={[
        "rounded-[16px] border border-app-warning/50 bg-gradient-to-b from-app-warning/[0.16] via-app-elevated to-app-panel/90 shadow-[0_12px_36px_-24px_rgba(0,0,0,0.4)] dark:from-app-warning/[0.2] dark:via-app-elevated dark:to-app-panel",
        compact ? "px-2.5 py-2 sm:px-3" : "px-3.5 py-3.5 sm:px-4 sm:py-4",
        className ?? "",
      ].join(" ")}
      role="note"
      aria-labelledby={titleId}
    >
      <div className="flex items-start gap-2">
        <span
          className={[
            "shrink-0 items-center justify-center rounded-full border border-app-warning/55 bg-app-warning/20 font-bold text-app-warning",
            compact
              ? "mt-0.5 flex h-5 w-5 text-[10px]"
              : "mt-0.5 flex h-6 w-6 text-[12px]",
          ].join(" ")}
          aria-hidden
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className={[
              "app-display font-bold tracking-tight text-app-ink",
              compact ? "text-[13px]" : "text-[15px] sm:text-base",
            ].join(" ")}
          >
            {RISK_DISCLOSURE_TITLE}
          </h2>
          <div
            className={[
              "text-app-ink/90",
              compact
                ? "mt-1.5 space-y-1 text-[10px] leading-snug sm:text-[11px]"
                : "mt-2.5 space-y-2.5 text-[12px] leading-relaxed sm:text-[13px]",
            ].join(" ")}
          >
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
            <p
              className={[
                "font-bold leading-snug text-app-ink",
                compact
                  ? "mt-1.5 text-[10px] sm:text-[11px]"
                  : "mt-3 text-[12px] sm:text-[13px]",
              ].join(" ")}
            >
              {RISK_DISCLOSURE_ACKNOWLEDGMENT}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
