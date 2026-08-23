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
      className="inline-flex rounded-xl border border-app-line bg-app-panel p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
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
              "rounded-lg px-3.5 py-1.5 text-xs font-bold app-interactive",
              active
                ? "bg-gradient-to-r from-app-brand to-[color:var(--color-accent-cyan)] text-white shadow-[0_2px_10px_-2px_rgba(37,99,235,0.45)]"
                : "text-app-muted hover:bg-app-soft hover:text-app-ink",
            ].join(" ")}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
}
