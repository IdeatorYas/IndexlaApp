import {
  DEGEN_RISK_PARAGRAPHS,
  DEGEN_RISK_TITLE,
} from "@/lib/domain/degen-club";

/** Structured extreme-risk disclaimer — Hub / Create / Modal variants. */
export function DegenRiskCopy({
  variant = "hub",
  className = "",
}: {
  variant?: "hub" | "app" | "modal";
  className?: string;
}) {
  const titleClass =
    variant === "app"
      ? "text-[11px] font-black uppercase tracking-[0.14em] text-app-danger"
      : "degen-risk-title";

  const bodyClass =
    variant === "app"
      ? "mt-2 space-y-2 text-[12px] font-medium leading-relaxed text-app-danger/90"
      : "degen-risk-body";

  return (
    <div className={["degen-risk-copy", className].filter(Boolean).join(" ")}>
      <p className={titleClass}>{DEGEN_RISK_TITLE}</p>
      <div className={bodyClass}>
        {DEGEN_RISK_PARAGRAPHS.map((paragraph) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}
