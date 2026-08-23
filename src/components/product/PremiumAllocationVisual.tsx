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

/** Max logo size that fits inside the ring thickness and arc chord. */
function logoSizeForSegment(
  sweep: number,
  logoR: number,
  ringThickness: number,
  count: number,
) {
  const chord = 2 * logoR * Math.sin(Math.max(sweep, 0.08) / 2);
  const byChord = chord * 0.72;
  const byRing = ringThickness * 0.78;
  const byCount = count <= 5 ? 42 : count <= 8 ? 34 : 28;
  return Math.min(byCount, byChord, byRing, ringThickness - 4);
}

export function PremiumAllocationVisual({
  allocations,
  size = 340,
}: {
  allocations: AllocationPreview[];
  size?: number;
}) {
  const total = allocations.reduce((sum, a) => sum + a.percent, 0) || 100;
  const cx = size / 2;
  const cy = size / 2;
  /* Thick ring so logos use full segment depth */
  const outerR = size / 2 - 6;
  const innerR = outerR * 0.42;
  const ringThickness = outerR - innerR;
  const logoR = (innerR + outerR) / 2;

  let cursor = -Math.PI / 2;
  const segments = allocations.map((alloc, index) => {
    const sweep = (alloc.percent / total) * Math.PI * 2;
    const startAngle = cursor;
    const endAngle = cursor + sweep;
    cursor = endAngle;
    const midAngle = startAngle + sweep / 2;
    const logoPos = polarToCartesian(cx, cy, logoR, midAngle);
    const iconSize = logoSizeForSegment(
      sweep,
      logoR,
      ringThickness,
      allocations.length,
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
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] xl:items-center">
      <div className="relative mx-auto w-full max-w-[min(100%,380px)]">
        <div
          className="pointer-events-none absolute inset-[8%] rounded-full bg-gradient-to-br from-app-soft/80 to-transparent blur-xl"
          aria-hidden
        />
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size} ${size}`}
          className="relative block aspect-square drop-shadow-[0_16px_40px_-18px_rgba(0,0,0,0.4)]"
          role="img"
          aria-label="Asset allocation chart"
        >
          {segments.map((segment) => (
            <path
              key={`${segment.alloc.assetId}-${segment.index}`}
              d={segment.path}
              fill={segment.color}
              stroke="var(--color-bg-elevated)"
              strokeWidth="2"
            />
          ))}
          <circle
            cx={cx}
            cy={cy}
            r={innerR - 2}
            fill="var(--color-bg-elevated)"
          />
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fill="var(--color-ink)"
            style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display)" }}
          >
            {allocations.length}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fill="var(--color-ink-dim)"
            style={{ fontSize: 10, fontWeight: 600 }}
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
              className="overflow-visible pointer-events-none"
            >
              <div
                className="flex h-full w-full items-center justify-center"
                title={segment.alloc.label}
              >
                <AssetIcon
                  assetId={segment.alloc.assetId}
                  size={Math.floor(segment.iconSize)}
                  framed={false}
                />
              </div>
            </foreignObject>
          ))}
        </svg>
      </div>

      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {allocations.map((alloc, index) => {
          const color = allocationSegmentColor(index);
          const ticker = resolveAssetTicker(alloc.assetId);
          return (
            <li
              key={`${alloc.assetId}-${index}`}
              className="group flex items-center gap-2.5 rounded-[14px] border border-app-line/45 bg-gradient-to-r from-app-elevated/90 to-app-panel/60 px-2.5 py-2 transition-transform hover:-translate-y-px"
            >
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
              <AssetIcon assetId={alloc.assetId} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-app-ink">
                  {getAssetDisplayName(alloc.assetId)}
                </p>
                <p className="text-[10px] text-app-muted">
                  {ticker} · {getAssetNetworkLabel(alloc.assetId)}
                </p>
              </div>
              <p
                className="shrink-0 text-[14px] font-bold tabular-nums"
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
