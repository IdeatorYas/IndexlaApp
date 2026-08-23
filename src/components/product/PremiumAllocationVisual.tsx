"use client";

import { AssetIcon } from "@/components/ui/AssetIcons";
import {
  getAssetDisplayName,
  getAssetNetworkLabel,
  resolveAssetTicker,
} from "@/lib/fixtures/asset-registry";
import type { AllocationPreview } from "@/lib/domain/dashboard";
import { allocationSegmentColor } from "@/lib/product/product-type";

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleRad: number,
) {
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function describeDonutSegment(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
) {
  const startOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, endAngle);
  const startInner = polarToCartesian(cx, cy, innerR, endAngle);
  const endInner = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

export function PremiumAllocationVisual({
  allocations,
  size = 300,
}: {
  allocations: AllocationPreview[];
  size?: number;
}) {
  const total = allocations.reduce((sum, a) => sum + a.percent, 0) || 100;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 8;
  const innerR = Math.max(outerR * 0.52, 56);
  const logoR = (innerR + outerR) / 2;

  let cursor = -Math.PI / 2;
  const segments = allocations.map((alloc, index) => {
    const sweep = (alloc.percent / total) * Math.PI * 2;
    const startAngle = cursor;
    const endAngle = cursor + sweep;
    cursor = endAngle;
    const midAngle = startAngle + sweep / 2;
    const logoPos = polarToCartesian(cx, cy, logoR, midAngle);
    const iconSize = Math.min(
      30,
      Math.max(16, Math.floor(sweep * logoR * 0.85)),
    );
    const color = allocationSegmentColor(index);
    return {
      alloc,
      index,
      startAngle,
      endAngle,
      midAngle,
      logoPos,
      iconSize,
      color,
      path: describeDonutSegment(cx, cy, innerR, outerR, startAngle, endAngle),
    };
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:items-start">
      <div className="relative mx-auto w-full max-w-[min(100%,320px)]">
        <div
          className="absolute inset-0 rounded-full bg-gradient-to-br from-app-brand/12 via-transparent to-[color:var(--color-accent-violet)]/10 blur-2xl"
          aria-hidden
        />
        <div className="relative rounded-full border border-app-line/50 bg-app-panel/40 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_-20px_rgba(59,130,246,0.35)]">
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${size} ${size}`}
            className="block aspect-square"
            role="img"
            aria-label="Asset allocation chart"
          >
            {segments.map((segment) => (
              <path
                key={`${segment.alloc.assetId}-${segment.index}`}
                d={segment.path}
                fill={segment.color}
                stroke="var(--color-bg-elevated)"
                strokeWidth="1.5"
                className="drop-shadow-[0_0_4px_rgba(0,0,0,0.15)]"
              />
            ))}
            <circle
              cx={cx}
              cy={cy}
              r={innerR - 6}
              fill="var(--color-bg-elevated)"
              stroke="var(--color-line)"
              strokeWidth="1"
            />
            <text
              x={cx}
              y={cy - 5}
              textAnchor="middle"
              fill="var(--color-ink)"
              style={{ fontSize: 12, fontWeight: 700 }}
            >
              {allocations.length}
            </text>
            <text
              x={cx}
              y={cy + 11}
              textAnchor="middle"
              fill="var(--color-muted)"
              style={{ fontSize: 9, fontWeight: 600 }}
            >
              assets
            </text>
            {segments.map((segment) => (
              <foreignObject
                key={`logo-${segment.alloc.assetId}-${segment.index}`}
                x={segment.logoPos.x - segment.iconSize / 2}
                y={segment.logoPos.y - segment.iconSize / 2}
                width={segment.iconSize}
                height={segment.iconSize}
                className="overflow-visible"
              >
                <div
                  className="flex h-full w-full items-center justify-center rounded-full border border-white/20 bg-app-elevated/95 shadow-sm"
                  title={segment.alloc.label}
                >
                  <AssetIcon
                    assetId={segment.alloc.assetId}
                    size={Math.max(12, segment.iconSize - 4)}
                  />
                </div>
              </foreignObject>
            ))}
          </svg>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {allocations.map((alloc, index) => {
          const color = allocationSegmentColor(index);
          const ticker = resolveAssetTicker(alloc.assetId);
          return (
            <li
              key={`${alloc.assetId}-${index}`}
              className="flex items-center gap-2 rounded-[12px] border border-app-line/50 bg-app-panel/70 px-2.5 py-2"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: color }}
              />
              <AssetIcon assetId={alloc.assetId} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-app-ink">
                  {getAssetDisplayName(alloc.assetId)}
                </p>
                <p className="text-[10px] text-app-muted">
                  {ticker} · {getAssetNetworkLabel(alloc.assetId)}
                </p>
              </div>
              <p
                className="shrink-0 text-[13px] font-bold"
                style={{ color }}
              >
                {alloc.percent}%
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
