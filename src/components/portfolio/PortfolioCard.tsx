import Link from "next/link";
import type { Portfolio } from "@/lib/domain/types";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

export function PortfolioCard({
  portfolio,
  href,
}: {
  portfolio: Portfolio;
  href?: string;
}) {
  const positive = portfolio.performance30d >= 0;
  const linkHref =
    href ?? `${APP_ROUTES.portfolio}?selected=${portfolio.id}`;

  return (
    <Link
      href={linkHref}
      className="app-panel group block p-5 transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <AllocationDonut segments={portfolio.assets} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-app-ink group-hover:text-app-brand">
              {portfolio.name}
            </h3>
            <span className="rounded-md bg-app-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-brand">
              {portfolio.discoveryLabel}
            </span>
            {portfolio.isIllustrative ? <IllustrativeBadge compact /> : null}
          </div>
          <p className="mt-1 text-xs text-app-muted">{portfolio.strategyName}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-app-dim">Current value</p>
          <p className="font-bold text-app-ink">{formatUsd(portfolio.valueUsd)}</p>
        </div>
        <div>
          <p className="text-xs text-app-dim">30D performance</p>
          <p
            className={[
              "font-bold",
              positive ? "text-app-success" : "text-app-danger",
            ].join(" ")}
          >
            {formatPercent(portfolio.performance30d, true)}
          </p>
        </div>
      </div>
      <p
        className={[
          "mt-3 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
          portfolio.automationActive
            ? "bg-app-success/15 text-app-success"
            : "bg-app-panel text-app-dim",
        ].join(" ")}
      >
        {portfolio.automationActive ? "Automation Active" : "Automation paused"}
      </p>
      <p className="mt-3 text-xs font-bold text-app-brand">View portfolio →</p>
    </Link>
  );
}
