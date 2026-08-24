"use client";

import { useMemo, useState } from "react";
import { createCardClass } from "@/components/create/createUi";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function DcaFutureCalendar({
  selectedDates,
  onChange,
}: {
  selectedDates: string[];
  onChange: (dates: string[]) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewMonth, setViewMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const selected = useMemo(() => new Set(selectedDates), [selectedDates]);

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid: (Date | null)[] = [];
    for (let i = 0; i < firstDow; i++) grid.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      grid.push(new Date(year, month, day));
    }
    return grid;
  }, [viewMonth]);

  const canGoPrev =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() &&
      viewMonth.getMonth() > today.getMonth());

  function toggleDate(d: Date) {
    const iso = isoDate(d);
    if (d <= today) return;
    const next = new Set(selected);
    if (next.has(iso)) next.delete(iso);
    else next.add(iso);
    onChange([...next].sort());
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className={`${createCardClass} space-y-3 p-3.5 sm:p-4`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-app-ink">Purchase dates</p>
          <p className="text-[11px] text-app-dim">
            Select any number of future dates. Past dates are disabled.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => setViewMonth(addMonths(viewMonth, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-app-line/70 text-app-ink transition hover:border-app-brand/35 disabled:opacity-35"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="min-w-[9rem] text-center text-sm font-bold text-app-ink">
            {monthLabel(viewMonth)}
          </span>
          <button
            type="button"
            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-app-line/70 text-app-ink transition hover:border-app-brand/35"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="py-1 text-[10px] font-bold uppercase tracking-wide text-app-dim"
          >
            {wd}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) {
            return <div key={`empty-${i}`} className="aspect-square" />;
          }
          const iso = isoDate(d);
          const isPast = d <= today;
          const isSelected = selected.has(iso);
          const isToday = iso === isoDate(today);
          return (
            <button
              key={iso}
              type="button"
              disabled={isPast}
              onClick={() => toggleDate(d)}
              className={[
                "aspect-square rounded-[10px] text-xs font-bold tabular-nums transition",
                isPast
                  ? "cursor-not-allowed text-app-dim/40"
                  : isSelected
                    ? "bg-gradient-to-br from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)] text-white shadow-[0_4px_14px_-8px_rgba(37,99,235,0.8)]"
                    : "border border-app-line/50 bg-app-elevated/80 text-app-ink hover:border-app-brand/40 hover:bg-app-brand/5",
                isToday && !isSelected ? "ring-1 ring-app-brand/30" : "",
              ].join(" ")}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app-line/50 pt-3">
        <p className="text-xs font-semibold text-app-muted">
          {selected.size === 0
            ? "No dates selected"
            : `${selected.size} date${selected.size === 1 ? "" : "s"} selected`}
        </p>
        {selected.size > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] font-bold text-app-brand hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <ul className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {selectedDates.map((d) => (
            <li key={d}>
              <button
                type="button"
                onClick={() => toggleDate(new Date(d + "T12:00:00"))}
                className="rounded-full border border-app-brand/35 bg-app-brand/10 px-2.5 py-1 text-[11px] font-semibold text-app-brand"
              >
                {d} ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
