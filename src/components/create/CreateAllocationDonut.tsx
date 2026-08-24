"use client";

import { AssetIcon } from "@/components/ui/AssetIcons";
import { getAssetDonutColor } from "@/lib/fixtures/asset-registry";

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
  const byChord = chord * 0.62;
  const byRing = ringThickness * 0.58;
  const byCount = count <= 5 ? 42 : count <= 7 ? 34 : count <= 8 ? 30 : 26;
  return Math.max(16, Math.min(byCount, byChord, byRing, ringThickness - 10));
}

export type CreateDonutSegment = {
  /** Registry / logo key (prefer ticker symbol). */
  assetKey: string;
  label: string;
  percent: number;
};

/**
 * Premium allocation donut matching Product Detail styling:
 * colored segments with HQ AssetIcon logos and % labels in-ring.
 */
export function CreateAllocationDonut({
  segments,
  size = 320,
  totalPercent,
  compact = false,
}: {
  segments: CreateDonutSegment[];
  size?: number;
  /** Live allocation total (0–100+). Center copy reflects exactness. */
  totalPercent: number;
  compact?: boolean;
}) {
  const positive = segments.filter((s) => s.percent > 0);
  const chartTotal =
    positive.reduce((sum, s) => sum + s.percent, 0) || 100;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 3;
  const innerR = outerR * 0.48;
  const ringThickness = outerR - innerR;
  const logoR = (innerR + outerR) / 2 - ringThickness * 0.08;
  const glowId = `createAllocGlow-${size}-${positive.length}`;

  let cursor = -Math.PI / 2;
  const drawn = (positive.length > 0 ? positive : segments).map(
    (seg, index) => {
      const sweep =
        positive.length > 0
          ? (seg.percent / chartTotal) * Math.PI * 2
          : (1 / Math.max(segments.length, 1)) * Math.PI * 2;
      const startAngle = cursor;
      const endAngle = cursor + sweep;
      cursor = endAngle;
      const midAngle = startAngle + sweep / 2;
      const logoPos = polarToCartesian(cx, cy, logoR, midAngle);
      const iconSize = logoSizeForSegment(
        sweep,
        logoR,
        ringThickness,
        Math.max(positive.length, 1),
      );
      const color = getAssetDonutColor(seg.assetKey, index);
      const ink = segmentInk(color);
      const pctFont = Math.max(9, Math.min(13, iconSize * 0.42, sweep * 28));
      return {
        seg,
        index,
        logoPos,
        iconSize,
        color,
        ink,
        pctFont,
        path: describeDonutSegment(cx, cy, innerR, outerR, startAngle, endAngle),
      };
    },
  );

  const exact = Math.abs(totalPercent - 100) < 0.005;
  const centerLabel = exact
    ? "100% Allocated"
    : `${totalPercent.toFixed(1)}% Total`;

  if (segments.length === 0) {
    return (
      <div
        className="relative mx-auto flex aspect-square w-full max-w-[min(100%,360px)] items-center justify-center rounded-full border border-dashed border-app-line/70 bg-app-elevated/60"
        style={{ width: size, height: size, maxWidth: "100%" }}
      >
        <div className="px-6 text-center">
          <p className="app-display text-sm font-bold text-app-ink">
            Allocation
          </p>
          <p className="mt-1 text-[11px] text-app-dim">
            Select assets to build the chart
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[min(100%,400px)]">
      <div className="pointer-events-none absolute inset-[10%] rounded-full bg-[radial-gradient(circle_at_50%_42%,color-mix(in_srgb,var(--color-ink)_6%,transparent),transparent_70%)]" />
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="relative mx-auto block h-auto w-full max-w-full aspect-square drop-shadow-[0_10px_28px_-18px_rgba(0,0,0,0.45)]"
        role="img"
        aria-label="Asset allocation chart with logos and percentages"
      >
        {drawn.map((segment) => (
          <path
            key={`${segment.seg.assetKey}-${segment.index}`}
            d={segment.path}
            fill={segment.color}
            stroke="var(--color-bg-elevated)"
            strokeWidth="1.5"
            opacity={positive.length === 0 ? 0.35 : 1}
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
          fill={`url(#${glowId})`}
          opacity="0.55"
        />
        <defs>
          <radialGradient id={glowId} cx="50%" cy="40%" r="70%">
            <stop
              offset="0%"
              stopColor="var(--color-ink)"
              stopOpacity="0.06"
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
            fontSize: compact ? 15 : 17,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
          }}
        >
          {segments.length} Asset{segments.length === 1 ? "" : "s"}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fill={exact ? "var(--color-success)" : "var(--color-muted)"}
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          {centerLabel}
        </text>
        {positive.length > 0
          ? drawn.map((segment) => {
              const icon = Math.floor(segment.iconSize);
              const blockH = icon + segment.pctFont + 8;
              const blockW = Math.max(icon + 6, 40);
              return (
                <foreignObject
                  key={`logo-${segment.seg.assetKey}-${segment.index}`}
                  x={segment.logoPos.x - blockW / 2}
                  y={segment.logoPos.y - blockH / 2}
                  width={blockW}
                  height={blockH}
                  className="pointer-events-none overflow-visible"
                >
                  <div
                    className="flex h-full w-full flex-col items-center justify-center gap-[2px]"
                    title={`${segment.seg.label} ${segment.seg.percent}%`}
                  >
                    <AssetIcon
                      assetId={segment.seg.assetKey}
                      size={icon}
                      variant="donut"
                    />
                    <span
                      className="font-bold tabular-nums leading-none"
                      style={{
                        fontSize: Math.max(10, segment.pctFont),
                        color: segment.ink,
                        textShadow:
                          segment.ink === "#FFFFFF"
                            ? "0 1px 2px rgba(0,0,0,0.5)"
                            : "0 1px 1px rgba(255,255,255,0.4)",
                      }}
                    >
                      {Number.isInteger(segment.seg.percent)
                        ? `${segment.seg.percent}%`
                        : `${segment.seg.percent.toFixed(1)}%`}
                    </span>
                  </div>
                </foreignObject>
              );
            })
          : null}
      </svg>
    </div>
  );
}
