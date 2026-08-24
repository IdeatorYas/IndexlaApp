"use client";

import { DegenAssetIcon } from "@/components/degen-club/DegenAssetIcon";
import { getDegenAssetBrandColor } from "@/lib/fixtures/degen-asset-registry";
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

function segmentColor(assetKey: string, index: number): string {
  return (
    getDegenAssetBrandColor(assetKey) ??
    getAssetDonutColor(assetKey, index)
  );
}

function logoSizeForSegment(
  sweep: number,
  logoR: number,
  ringThickness: number,
  count: number,
) {
  const chord = 2 * logoR * Math.sin(Math.max(sweep, 0.05) / 2);
  const byChord = chord * 0.52;
  const byRing = ringThickness * 0.46;
  const byCount =
    count <= 5 ? 26 : count <= 8 ? 22 : count <= 10 ? 18 : 16;
  return Math.max(14, Math.min(byCount, byChord, byRing));
}

export type DegenCardDonutSegment = {
  assetKey: string;
  label: string;
  percent: number;
  imageUrl?: string | null;
};

/** Marketplace card donut — brand-colored segments, HQ logos, no segment % labels. */
export function DegenCardDonut({
  segments,
  size = 180,
}: {
  segments: DegenCardDonutSegment[];
  size?: number;
}) {
  const positive = segments.filter((s) => s.percent > 0);
  const chartTotal =
    positive.reduce((sum, s) => sum + s.percent, 0) || 100;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.56;
  const ringThickness = outerR - innerR;
  const logoR = (innerR + outerR) / 2;
  const count = Math.max(positive.length, 1);

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
        count,
      );
      return {
        seg,
        index,
        logoPos,
        iconSize: Math.floor(iconSize),
        color: segmentColor(seg.assetKey, index),
        path: describeDonutSegment(cx, cy, innerR, outerR, startAngle, endAngle),
      };
    },
  );

  return (
    <div
      className="degen-card-donut"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Allocation chart with ${segments.length} assets`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block h-full w-full"
      >
        {drawn.map((segment) => (
          <path
            key={`${segment.seg.assetKey}-${segment.index}`}
            d={segment.path}
            fill={segment.color}
            stroke="rgba(6,4,12,0.75)"
            strokeWidth="1.25"
          />
        ))}
        <circle cx={cx} cy={cy} r={innerR - 1} fill="#0e0818" />
        <text
          x={cx}
          y={cy + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#f4f0ff"
          style={{ fontSize: 13, fontWeight: 800 }}
        >
          {segments.length}
        </text>
        {positive.length > 0
          ? drawn.map((segment) => (
              <foreignObject
                key={`logo-${segment.seg.assetKey}-${segment.index}`}
                x={segment.logoPos.x - segment.iconSize / 2}
                y={segment.logoPos.y - segment.iconSize / 2}
                width={segment.iconSize}
                height={segment.iconSize}
                className="pointer-events-none overflow-visible"
              >
                <div
                  className="flex h-full w-full items-center justify-center"
                  title={segment.seg.label}
                >
                  <DegenAssetIcon
                    assetKey={segment.seg.assetKey}
                    size={segment.iconSize}
                    imageUrl={segment.seg.imageUrl}
                  />
                </div>
              </foreignObject>
            ))
          : null}
      </svg>
    </div>
  );
}
