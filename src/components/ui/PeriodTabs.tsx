"use client";

import type { ChartPeriod } from "@/lib/domain/dashboard";

const PERIODS: { id: ChartPeriod; label: string }[] = [
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "1y", label: "1Y" },
];

export function PeriodTabs({
  value,
  onChange,
}: {
  value: ChartPeriod;
  onChange: (period: ChartPeriod) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-app-line bg-app-panel p-0.5"
      role="tablist"
      aria-label="Chart period"
    >
      {PERIODS.map((period) => {
        const active = value === period.id;
        return (
          <button
            key={period.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(period.id)}
            className={[
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-app-brand text-white shadow-sm"
                : "text-app-muted hover:text-app-ink",
            ].join(" ")}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
}
