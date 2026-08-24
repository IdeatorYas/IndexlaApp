"use client";

import { useId, useState } from "react";
import { getDegenAssetBrandColor } from "@/lib/fixtures/degen-asset-registry";
import { getAssetDonutColor } from "@/lib/fixtures/asset-registry";
import { degenAsset } from "@/lib/fixtures/degen-asset-registry";

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
    getDegenAssetBrandColor(assetKey) ?? getAssetDonutColor(assetKey, index)
  );
}

function logoSizeForSegment(
  sweep: number,
  logoR: number,
  ringThickness: number,
  count: number,
) {
  const chord = 2 * logoR * Math.sin(Math.max(sweep, 0.05) / 2);
  const byChord = chord * 0.68;
  const byRing = ringThickness * 0.72;
  const byCount =
    count <= 5 ? 28 : count <= 8 ? 24 : count <= 10 ? 20 : 18;
  return Math.max(14, Math.min(byCount, byChord, byRing));
}

function segmentInitial(assetKey: string): string {
  try {
    return degenAsset(assetKey).ticker.replace(/[^A-Za-z0-9]/g, "").slice(0, 2);
  } catch {
    return assetKey.slice(0, 2).toUpperCase();
  }
}

export type DegenDonutSegment = {
  assetKey: string;
  label: string;
  percent: number;
  imageUrl?: string | null;
};

function SegmentLogo({
  assetKey,
  imageUrl,
  x,
  y,
  size,
}: {
  assetKey: string;
  imageUrl?: string | null;
  x: number;
  y: number;
  size: number;
}) {
  const [broken, setBroken] = useState(false);
  const src =
    imageUrl && !broken && imageUrl.trim() !== "" ? imageUrl.trim() : null;
  const imgSize = size * 1.35;

  if (src) {
    return (
      <image
        href={src}
        x={x - imgSize / 2}
        y={y - imgSize / 2}
        width={imgSize}
        height={imgSize}
        preserveAspectRatio="xMidYMid slice"
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <text
      x={x}
      y={y + 1}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="#ffffff"
      style={{
        fontSize: Math.max(8, size * 0.38),
        fontWeight: 800,
        letterSpacing: "0.02em",
      }}
    >
      {segmentInitial(assetKey)}
    </text>
  );
}

/** Brand-colored allocation ring with logos embedded directly in each segment. */
export function DegenAllocationDonut({
  segments,
  size = 180,
  showCenterCount = false,
}: {
  segments: DegenDonutSegment[];
  size?: number;
  showCenterCount?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const positive = segments.filter((s) => s.percent > 0);
  const chartTotal =
    positive.reduce((sum, s) => sum + s.percent, 0) || 100;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 3;
  const innerR = outerR * 0.52;
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
        clipId: `degen-seg-${uid}-${index}`,
      };
    },
  );

  return (
    <div
      className="degen-allocation-donut"
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
        <defs>
          {drawn.map((segment) => (
            <clipPath key={segment.clipId} id={segment.clipId}>
              <path d={segment.path} />
            </clipPath>
          ))}
        </defs>

        {drawn.map((segment) => (
          <path
            key={`fill-${segment.seg.assetKey}-${segment.index}`}
            d={segment.path}
            fill={segment.color}
            stroke="rgba(6,4,12,0.65)"
            strokeWidth="1"
          />
        ))}

        {drawn.map((segment) => (
          <g key={`logo-${segment.seg.assetKey}-${segment.index}`} clipPath={`url(#${segment.clipId})`}>
            <SegmentLogo
              assetKey={segment.seg.assetKey}
              imageUrl={segment.seg.imageUrl}
              x={segment.logoPos.x}
              y={segment.logoPos.y}
              size={segment.iconSize}
            />
          </g>
        ))}

        <circle cx={cx} cy={cy} r={innerR - 1.5} fill="#0e0818" />
        {showCenterCount ? (
          <text
            x={cx}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#f4f0ff"
            style={{ fontSize: Math.max(11, size * 0.07), fontWeight: 800 }}
          >
            {segments.length}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
