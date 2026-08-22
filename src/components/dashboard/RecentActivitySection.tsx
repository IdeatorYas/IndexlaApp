import Link from "next/link";
import type { DashboardActivityItem } from "@/lib/domain/dashboard";
import { EmptyState } from "@/components/states/AppStates";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  formatDexla,
  formatRelativeTime,
  formatUsd,
} from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

const TYPE_LABELS: Record<DashboardActivityItem["type"], string> = {
  "portfolio-buy": "Buy",
  "automated-execution": "Auto",
  rebalance: "Rebalance",
  tip: "Tip",
  "strategy-access": "Strategy",
};

export function RecentActivitySection({
  items,
}: {
  items: DashboardActivityItem[];
}) {
  return (
    <section className="app-panel h-full p-5 md:p-6">
      <SectionHeader
        title="Recent Activity"
        illustrative={items.some((i) => i.isIllustrative)}
        action={
          <Link
            href={`${APP_ROUTES.portfolio}?tab=activity`}
            className="text-sm font-semibold text-app-brand hover:underline"
          >
            View all →
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No recent activity"
          description="Executions, rebalances, tips and strategy access will appear here."
        />
      ) : (
        <ul className="divide-y divide-app-line">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-app-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-brand">
                    {TYPE_LABELS[item.type]}
                  </span>
                  <p className="font-semibold text-app-ink">{item.title}</p>
                </div>
                <p className="mt-1 text-sm text-app-muted">{item.subtitle}</p>
                <p className="mt-1 text-xs text-app-dim">
                  {formatRelativeTime(item.timestamp)} · {item.status}
                </p>
              </div>
              <div className="text-right text-sm">
                {item.amountUsd !== null ? (
                  <p className="font-bold text-app-success">
                    {formatUsd(item.amountUsd)}
                  </p>
                ) : null}
                {item.amountDexla !== null ? (
                  <p className="font-bold text-[color:var(--color-accent-violet)]">
                    {formatDexla(item.amountDexla)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
