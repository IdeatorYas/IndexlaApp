"use client";

import { AssetIcon } from "@/components/ui/AssetIcons";
import {
  getAssetBrandColor,
  getAssetDisplayName,
  getAssetDonutColor,
  getAssetNetworkLabel,
  resolveAssetTicker,
} from "@/lib/fixtures/asset-registry";
import type { AllocationPreview } from "@/lib/domain/dashboard";

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

function logoSizeForSegment(
  sweep: number,
  logoR: number,
  ringThickness: number,
  count: number,
) {
  const chord = 2 * logoR * Math.sin(Math.max(sweep, 0.08) / 2);
  const byChord = chord * 0.7;
  const byRing = ringThickness * 0.72;
  const byCount = count <= 5 ? 44 : count <= 7 ? 36 : count <= 8 ? 32 : 26;
  return Math.max(16, Math.min(byCount, byChord, byRing, ringThickness - 6));
}

export function PremiumAllocationVisual({
  allocations,
  size = 360,
}: {
  allocations: AllocationPreview[];
  size?: number;
}) {
  const total = allocations.reduce((sum, a) => sum + a.percent, 0) || 100;
  const cx = size / 2;
  const cy = size / 2;
  /* Thick ring ≈ 40% of radius — full thickness for embedded logos */
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.55;
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
    const color = getAssetDonutColor(alloc.assetId, index);
    return {
      alloc,
      index,
      logoPos,
      iconSize,
      color,
      path: describeDonutSegment(cx, cy, innerR, outerR, startAngle, endAngle),
    };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(240px,0.95fr)_minmax(0,1.15fr)] lg:items-center">
      <div className="relative mx-auto w-full max-w-[min(100%,400px)]">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size} ${size}`}
          className="relative block aspect-square"
          role="img"
          aria-label="Asset allocation chart"
        >
          {segments.map((segment) => (
            <path
              key={`${segment.alloc.assetId}-${segment.index}`}
              d={segment.path}
              fill={segment.color}
              stroke="var(--color-bg-elevated)"
              strokeWidth="2.5"
            />
          ))}
          <circle
            cx={cx}
            cy={cy}
            r={innerR - 1}
            fill="var(--color-bg-elevated)"
          />
          <text
            x={cx}
            y={cy - 8}
            textAnchor="middle"
            fill="var(--color-ink)"
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: "var(--font-display)",
            }}
          >
            {allocations.length} Assets
          </text>
          <text
            x={cx}
            y={cy + 16}
            textAnchor="middle"
            fill="var(--color-brand)"
            style={{ fontSize: 13, fontWeight: 700 }}
          >
            100% Allocated
          </text>
          {segments.map((segment) => (
            <foreignObject
              key={`logo-${segment.alloc.assetId}-${segment.index}`}
              x={segment.logoPos.x - segment.iconSize / 2}
              y={segment.logoPos.y - segment.iconSize / 2}
              width={segment.iconSize}
              height={segment.iconSize}
              className="pointer-events-none overflow-visible"
            >
              <div
                className="flex h-full w-full items-center justify-center [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.35))]"
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

      <div className="min-w-0">
        <div className="mb-2 hidden grid-cols-[1fr_auto] gap-3 px-1 text-[10px] font-bold uppercase tracking-wider text-app-dim sm:grid">
          <span>Asset</span>
          <span className="w-16 text-right">Allocation</span>
        </div>
        <ul className="divide-y divide-app-line/40 rounded-[16px] border border-app-line/50 bg-app-elevated/80">
          {allocations.map((alloc, index) => {
            const color = getAssetBrandColor(alloc.assetId, index);
            const ticker = resolveAssetTicker(alloc.assetId);
            return (
              <li
                key={`${alloc.assetId}-${index}`}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-app-soft/40 sm:px-3.5"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: color }}
                >
                  <AssetIcon assetId={alloc.assetId} size={22} framed={false} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-app-ink">
                    {getAssetDisplayName(alloc.assetId)}{" "}
                    <span className="font-semibold text-app-dim">{ticker}</span>
                  </p>
                  <p className="truncate text-[11px] text-app-muted">
                    {getAssetNetworkLabel(alloc.assetId)}
                  </p>
                </div>
                <p className="w-14 shrink-0 text-right text-[14px] font-bold tabular-nums text-app-ink sm:w-16">
                  {alloc.percent}%
                </p>
              </li>
            );
          })}
          <li className="flex items-center gap-3 bg-app-soft/30 px-3 py-2.5 sm:px-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-app-ink">Total</p>
            </div>
            <p className="w-14 shrink-0 text-right text-[14px] font-bold tabular-nums text-app-brand sm:w-16">
              100%
            </p>
          </li>
        </ul>
      </div>
    </div>
  );
}
