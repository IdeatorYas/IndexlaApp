"use client";

import { AssetIcon } from "@/components/ui/AssetIcons";
import { getAssetDisplayName, getAssetNetworkLabel } from "@/lib/fixtures/asset-registry";
import type { AllocationPreview } from "@/lib/domain/dashboard";

const SEGMENT_COLORS = [
  "#6366f1",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

export function PremiumAllocationVisual({
  allocations,
  size = 280,
}: {
  allocations: AllocationPreview[];
  size?: number;
}) {
  const total = allocations.reduce((sum, a) => sum + a.percent, 0) || 100;
  const radius = size / 2 - 28;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;
  let offset = 0;

  const iconRadius = radius + stroke / 2 + 18;
  const icons = allocations.map((alloc, index) => {
    const midAngle =
      ((offset + (alloc.percent / total) * circumference * 0.5) / circumference) *
        2 *
        Math.PI -
      Math.PI / 2;
    offset += (alloc.percent / total) * circumference;
    return {
      alloc,
      index,
      x: cx + iconRadius * Math.cos(midAngle),
      y: cy + iconRadius * Math.sin(midAngle),
      color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
    };
  });

  offset = 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
      <div className="relative mx-auto flex items-center justify-center">
        <div
          className="absolute inset-0 rounded-full bg-gradient-to-br from-app-brand/15 via-transparent to-[color:var(--color-accent-violet)]/10 blur-2xl"
          aria-hidden
        />
        <div
          className="relative rounded-full border border-app-line/50 bg-app-panel/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_-20px_rgba(59,130,246,0.35)]"
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="block"
            role="img"
            aria-label="Asset allocation chart"
          >
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="var(--color-panel)"
              strokeWidth={stroke}
            />
            {allocations.map((segment, index) => {
              const length = (segment.percent / total) * circumference;
              const dasharray = `${length} ${circumference - length}`;
              const dashoffset = -offset;
              offset += length;
              return (
                <circle
                  key={`${segment.assetId}-${index}`}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={SEGMENT_COLORS[index % SEGMENT_COLORS.length]}
                  strokeWidth={stroke}
                  strokeDasharray={dasharray}
                  strokeDashoffset={dashoffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${cx} ${cy})`}
                  className="drop-shadow-[0_0_6px_rgba(99,102,241,0.35)]"
                />
              );
            })}
            <circle
              cx={cx}
              cy={cy}
              r={Math.max(12, radius - stroke - 4)}
              fill="var(--color-bg-elevated)"
              stroke="var(--color-line)"
              strokeWidth="1"
            />
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              className="fill-app-ink text-[11px] font-bold"
              style={{ fontSize: 11 }}
            >
              {allocations.length}
            </text>
            <text
              x={cx}
              y={cy + 10}
              textAnchor="middle"
              className="fill-app-muted"
              style={{ fontSize: 9 }}
            >
              assets
            </text>
          </svg>
          {icons.map(({ alloc, index, x, y }) => (
            <div
              key={`icon-${alloc.assetId}-${index}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-app-line/70 bg-app-elevated p-0.5 shadow-md"
              style={{ left: x, top: y }}
              title={alloc.label}
            >
              <AssetIcon assetId={alloc.assetId} size={26} />
            </div>
          ))}
        </div>
      </div>

      <ul className="max-h-[320px] space-y-1 overflow-y-auto rounded-[14px] border border-app-line/60 bg-app-elevated/60 p-2 shadow-inner">
        {allocations.map((alloc, index) => (
          <li
            key={`${alloc.assetId}-${index}`}
            className="flex items-center gap-2 rounded-[10px] border border-app-line/40 bg-app-panel/70 px-2 py-1.5"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }}
            />
            <AssetIcon assetId={alloc.assetId} size={24} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold text-app-ink">
                {getAssetDisplayName(alloc.assetId)}
              </p>
              <p className="text-[10px] text-app-muted">
                {alloc.label} · {getAssetNetworkLabel(alloc.assetId)}
              </p>
            </div>
            <p className="shrink-0 text-[13px] font-bold text-app-brand">
              {alloc.percent}%
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
