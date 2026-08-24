"use client";

import { useId, useState } from "react";
import {
  getAssetDonutColor,
  getAssetLogoUrl,
  resolveAssetTicker,
} from "@/lib/fixtures/asset-registry";

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
  const chord = 2 * logoR * Math.sin(Math.max(sweep, 0.05) / 2);
  const byChord = chord * 0.68;
  const byRing = ringThickness * 0.72;
  const byCount =
    count <= 5 ? 28 : count <= 8 ? 24 : count <= 10 ? 20 : 18;
  return Math.max(12, Math.min(byCount, byChord, byRing));
}

function segmentInitial(assetKey: string): string {
  return resolveAssetTicker(assetKey).replace(/[^A-Za-z0-9]/g, "").slice(0, 2);
}

export type EmbeddedDonutSegment = {
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
  const registryUrl = getAssetLogoUrl(assetKey);
  const src =
    imageUrl && !broken && imageUrl.trim() !== ""
      ? imageUrl.trim()
      : registryUrl && !broken
        ? registryUrl
        : null;
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
        fontSize: Math.max(7, size * 0.38),
        fontWeight: 800,
        letterSpacing: "0.02em",
      }}
    >
      {segmentInitial(assetKey)}
    </text>
  );
}

/** Brand-colored ring with logos embedded directly in each segment — no white logo discs. */
export function EmbeddedAllocationDonut({
  segments,
  size = 180,
  centerSubLabel = "100%",
  showCenterLabels = true,
  className = "",
}: {
  segments: EmbeddedDonutSegment[];
  size?: number;
  /** Second line in hollow center (e.g. "100%" or "100% Allocated"). */
  centerSubLabel?: string;
  /** When false, center stays empty (tiny card thumbnails). */
  showCenterLabels?: boolean;
  className?: string;
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
  const glowId = `embeddedDonutGlow-${uid}`;

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
        color: getAssetDonutColor(seg.assetKey, index),
        path: describeDonutSegment(cx, cy, innerR, outerR, startAngle, endAngle),
        clipId: `embed-seg-${uid}-${index}`,
      };
    },
  );

  const showFullCenter = showCenterLabels && size >= 100;
  const showCountOnly = showCenterLabels && !showFullCenter && size >= 56;

  return (
    <div
      className={["embedded-allocation-donut shrink-0", className].join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Allocation chart with ${segments.length} assets`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block h-full w-full drop-shadow-[0_10px_28px_-18px_rgba(0,0,0,0.45)]"
      >
        <defs>
          {drawn.map((segment) => (
            <clipPath key={segment.clipId} id={segment.clipId}>
              <path d={segment.path} />
            </clipPath>
          ))}
          <radialGradient id={glowId} cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="var(--color-ink)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>

        {drawn.map((segment) => (
          <path
            key={`fill-${segment.seg.assetKey}-${segment.index}`}
            d={segment.path}
            fill={segment.color}
            stroke="var(--color-bg-elevated)"
            strokeWidth="1.5"
            opacity={positive.length === 0 ? 0.35 : 1}
          />
        ))}

        {drawn.map((segment) => (
          <g
            key={`logo-${segment.seg.assetKey}-${segment.index}`}
            clipPath={`url(#${segment.clipId})`}
          >
            <SegmentLogo
              assetKey={segment.seg.assetKey}
              imageUrl={segment.seg.imageUrl}
              x={segment.logoPos.x}
              y={segment.logoPos.y}
              size={segment.iconSize}
            />
          </g>
        ))}

        <circle cx={cx} cy={cy} r={innerR - 1.5} fill="var(--color-bg-elevated)" />
        <circle
          cx={cx}
          cy={cy}
          r={innerR - 1.5}
          fill={`url(#${glowId})`}
          opacity="0.55"
        />

        {showFullCenter ? (
          <>
            <text
              x={cx}
              y={cy - (size >= 200 ? 6 : 4)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-ink)"
              style={{
                fontSize: Math.max(11, size * 0.045),
                fontWeight: 700,
                fontFamily: "var(--font-display)",
              }}
            >
              {segments.length} Asset{segments.length === 1 ? "" : "s"}
            </text>
            <text
              x={cx}
              y={cy + (size >= 200 ? 12 : 10)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-muted)"
              style={{
                fontSize: Math.max(9, size * 0.028),
                fontWeight: 600,
              }}
            >
              {centerSubLabel}
            </text>
          </>
        ) : showCountOnly ? (
          <text
            x={cx}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--color-ink)"
            style={{
              fontSize: Math.max(9, size * 0.11),
              fontWeight: 800,
            }}
          >
            {segments.length}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

export function toEmbeddedDonutSegments(
  segments: {
    label: string;
    percent: number;
    assetId?: string;
    assetKey?: string;
    imageUrl?: string | null;
  }[],
): EmbeddedDonutSegment[] {
  return segments.map((seg) => ({
    assetKey: (seg.assetId ?? seg.assetKey ?? seg.label).toLowerCase(),
    label: seg.label,
    percent: seg.percent,
    imageUrl: seg.imageUrl,
  }));
}
