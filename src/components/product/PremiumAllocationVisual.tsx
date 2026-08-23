"use client";

import { AssetIcon } from "@/components/ui/AssetIcons";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { formatPercent } from "@/lib/dashboard/data";
import type { AllocationPreview } from "@/lib/domain/dashboard";
import {
  getAssetBrandColor,
  getAssetDisplayName,
  getAssetDonutColor,
  resolveAssetTicker,
} from "@/lib/fixtures/asset-registry";
import { getIllustrativeAssetPerformance } from "@/lib/product/illustrative-asset-performance";

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

function segmentInk(hex: string): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return "#FFFFFF";
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.62 ? "#0B1220" : "#FFFFFF";
}

function logoSizeForSegment(
  sweep: number,
  logoR: number,
  ringThickness: number,
  count: number,
) {
  const chord = 2 * logoR * Math.sin(Math.max(sweep, 0.06) / 2);
  const byChord = chord * 0.55;
  const byRing = ringThickness * 0.48;
  const byCount = count <= 5 ? 34 : count <= 7 ? 28 : count <= 8 ? 24 : 20;
  return Math.max(14, Math.min(byCount, byChord, byRing, ringThickness - 18));
}

function PerfCell({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={[
        "tabular-nums font-bold",
        positive ? "text-app-success" : "text-app-danger",
      ].join(" ")}
    >
      {formatPercent(value, true)}
    </span>
  );
}

export function PremiumAllocationVisual({
  allocations,
  size = 320,
  compact = false,
}: {
  allocations: AllocationPreview[];
  size?: number;
  compact?: boolean;
}) {
  const total = allocations.reduce((sum, a) => sum + a.percent, 0) || 100;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 3;
  const innerR = outerR * 0.52;
  const ringThickness = outerR - innerR;
  const logoR = (innerR + outerR) / 2 - ringThickness * 0.08;

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
    const ink = segmentInk(color);
    const pctFont = Math.max(
      9,
      Math.min(13, iconSize * 0.42, sweep * 28),
    );
    return {
      alloc,
      index,
      logoPos,
      iconSize,
      color,
      ink,
      pctFont,
      path: describeDonutSegment(cx, cy, innerR, outerR, startAngle, endAngle),
    };
  });

  const rowPad = compact ? "px-2 py-1" : "px-2.5 py-1.5";
  const nameSize = compact ? "text-[12px]" : "text-[13px]";

  return (
    <div
      className={[
        "grid gap-3 lg:items-stretch",
        "lg:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.25fr)]",
      ].join(" ")}
    >
      <div className="relative mx-auto flex w-full max-w-[min(100%,340px)] items-center justify-center lg:max-w-none">
        <div className="pointer-events-none absolute inset-[12%] rounded-full bg-[radial-gradient(circle_at_50%_45%,color-mix(in_srgb,var(--color-brand)_18%,transparent),transparent_68%)]" />
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size} ${size}`}
          className="relative block aspect-square drop-shadow-[0_18px_40px_-28px_rgba(0,0,0,0.55)]"
          role="img"
          aria-label="Asset allocation chart with logos and percentages"
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
            r={innerR - 1}
            fill="var(--color-bg-elevated)"
          />
          <circle
            cx={cx}
            cy={cy}
            r={innerR - 1}
            fill="url(#allocCenterGlow)"
            opacity="0.55"
          />
          <defs>
            <radialGradient id="allocCenterGlow" cx="50%" cy="40%" r="70%">
              <stop
                offset="0%"
                stopColor="var(--color-brand)"
                stopOpacity="0.22"
              />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fill="var(--color-ink)"
            style={{
              fontSize: compact ? 18 : 20,
              fontWeight: 700,
              fontFamily: "var(--font-display)",
            }}
          >
            {allocations.length} Assets
          </text>
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            fill="var(--color-brand)"
            style={{ fontSize: 11, fontWeight: 700 }}
          >
            100% Allocated
          </text>
          {segments.map((segment) => {
            const blockH = segment.iconSize + segment.pctFont + 6;
            const blockW = Math.max(segment.iconSize + 4, 36);
            return (
              <foreignObject
                key={`logo-${segment.alloc.assetId}-${segment.index}`}
                x={segment.logoPos.x - blockW / 2}
                y={segment.logoPos.y - blockH / 2}
                width={blockW}
                height={blockH}
                className="pointer-events-none overflow-visible"
              >
                <div
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5"
                  title={`${segment.alloc.label} ${segment.alloc.percent}%`}
                >
                  <AssetIcon
                    assetId={segment.alloc.assetId}
                    size={Math.floor(segment.iconSize)}
                    framed={false}
                  />
                  <span
                    className="font-bold tabular-nums leading-none"
                    style={{
                      fontSize: segment.pctFont,
                      color: segment.ink,
                      textShadow:
                        segment.ink === "#FFFFFF"
                          ? "0 1px 2px rgba(0,0,0,0.45)"
                          : "0 1px 1px rgba(255,255,255,0.35)",
                    }}
                  >
                    {segment.alloc.percent}%
                  </span>
                </div>
              </foreignObject>
            );
          })}
        </svg>
      </div>

      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-app-dim">
            Holdings
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold text-app-muted">
              24H · 7D · 30D
            </span>
            <IllustrativeBadge compact />
          </div>
        </div>
        <div className="overflow-hidden rounded-[14px] border border-app-line/50 bg-gradient-to-b from-app-elevated/95 to-app-panel/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div
            className={[
              "hidden grid-cols-[minmax(0,1.4fr)_3.25rem_3.4rem_3.4rem_3.4rem] gap-1 border-b border-app-line/40 text-[9px] font-bold uppercase tracking-wider text-app-dim sm:grid",
              rowPad,
            ].join(" ")}
          >
            <span>Asset</span>
            <span className="text-right">Alloc</span>
            <span className="text-right">24H</span>
            <span className="text-right">7D</span>
            <span className="text-right">30D</span>
          </div>
          <ul className="divide-y divide-app-line/35">
            {allocations.map((alloc, index) => {
              const color = getAssetBrandColor(alloc.assetId, index);
              const ticker = resolveAssetTicker(alloc.assetId);
              const perf = getIllustrativeAssetPerformance(alloc.assetId);
              return (
                <li
                  key={`${alloc.assetId}-${index}`}
                  className={[
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1.4fr)_3.25rem_3.4rem_3.4rem_3.4rem] sm:gap-1",
                    rowPad,
                    "transition-colors hover:bg-app-soft/35",
                  ].join(" ")}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 dark:ring-white/10"
                      style={{ backgroundColor: color }}
                    >
                      <AssetIcon
                        assetId={alloc.assetId}
                        size={16}
                        framed={false}
                      />
                    </span>
                    <div className="min-w-0">
                      <p
                        className={[
                          "truncate font-bold text-app-ink",
                          nameSize,
                        ].join(" ")}
                      >
                        {getAssetDisplayName(alloc.assetId)}
                      </p>
                      <p className="truncate text-[10px] font-semibold text-app-dim">
                        {ticker}
                      </p>
                    </div>
                  </div>
                  <p className="text-right text-[12px] font-bold tabular-nums text-app-ink sm:text-[13px]">
                    {alloc.percent}%
                  </p>
                  <p className="hidden text-right text-[11px] sm:block">
                    <PerfCell value={perf.h24} />
                  </p>
                  <p className="hidden text-right text-[11px] sm:block">
                    <PerfCell value={perf.d7} />
                  </p>
                  <p className="hidden text-right text-[11px] sm:block">
                    <PerfCell value={perf.d30} />
                  </p>
                  <div className="col-span-2 flex justify-end gap-2 text-[10px] sm:hidden">
                    <span className="text-app-dim">24H</span>
                    <PerfCell value={perf.h24} />
                    <span className="text-app-dim">7D</span>
                    <PerfCell value={perf.d7} />
                    <span className="text-app-dim">30D</span>
                    <PerfCell value={perf.d30} />
                  </div>
                </li>
              );
            })}
            <li
              className={[
                "flex items-center justify-between bg-app-soft/25 sm:grid sm:grid-cols-[minmax(0,1.4fr)_3.25rem_3.4rem_3.4rem_3.4rem] sm:gap-1",
                rowPad,
              ].join(" ")}
            >
              <p className="text-[12px] font-bold text-app-ink">Total</p>
              <p className="text-right text-[13px] font-bold tabular-nums text-app-brand sm:col-start-2">
                100%
              </p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
