"use client";

import { useId, useState } from "react";
import {
  DEGEN_ASSETS,
  degenAsset,
  getDegenAssetBrandColor,
} from "@/lib/fixtures/degen-asset-registry";
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
    getDegenAssetBrandColor(assetKey) ?? getAssetDonutColor(assetKey, index)
  );
}

/** Local demo logos + common CoinGecko CDN paths so donuts never wait on API. */
const LOCAL_LOGOS: Record<string, string> = {
  pengu: "/images/assets/demo/crypto/coingecko/pengu.png",
  wif: "/images/assets/demo/crypto/coingecko/wif.jpg",
  bonk: "/images/assets/demo/crypto/coingecko/bonk.jpg",
  fartcoin: "/images/assets/demo/crypto/coingecko/fartcoin.jpg",
  pepe: "/images/assets/demo/crypto/coingecko/pepe.jpg",
  shib: "/images/assets/demo/crypto/coingecko/shib.png",
  floki: "/images/assets/demo/crypto/coingecko/floki.png",
};

const COINGECKO_STATIC: Record<string, string> = {
  "pudgy-penguins":
    "https://coin-images.coingecko.com/coins/images/52622/small/PUDGY_PENGUINS_PENGU_PFP.png",
  dogwifcoin:
    "https://coin-images.coingecko.com/coins/images/33566/small/dogwifhat.jpg",
  bonk: "https://coin-images.coingecko.com/coins/images/28600/small/bonk.jpg",
  fartcoin:
    "https://coin-images.coingecko.com/coins/images/50891/small/fart.jpg",
  popcat:
    "https://coin-images.coingecko.com/coins/images/33760/small/image.jpg",
  "shiba-inu":
    "https://coin-images.coingecko.com/coins/images/11939/small/shiba.png",
  pepe: "https://coin-images.coingecko.com/coins/images/29850/small/pepe-token.jpeg",
  floki:
    "https://coin-images.coingecko.com/coins/images/16746/small/PNG_image.png",
  "mog-coin":
    "https://coin-images.coingecko.com/coins/images/31059/small/MOG_LOGO_200x200.png",
  turbo: "https://coin-images.coingecko.com/coins/images/30117/small/turbo.png",
  toshi:
    "https://coin-images.coingecko.com/coins/images/31177/small/toshi.png",
  "based-brett":
    "https://coin-images.coingecko.com/coins/images/35529/small/1000050750.png",
  "degen-base":
    "https://coin-images.coingecko.com/coins/images/34515/small/android-chrome-512x512.png",
};

export function resolveDegenDonutLogo(
  assetKey: string,
  imageUrl?: string | null,
): string | null {
  if (imageUrl && imageUrl.trim() !== "") return imageUrl.trim();
  const local = LOCAL_LOGOS[assetKey.toLowerCase()];
  if (local) return local;
  try {
    const asset = degenAsset(assetKey);
    const cg = COINGECKO_STATIC[asset.coingeckoId];
    if (cg) return cg;
  } catch {
    /* unknown */
  }
  const def = DEGEN_ASSETS[assetKey.toLowerCase()];
  if (def && COINGECKO_STATIC[def.coingeckoId]) {
    return COINGECKO_STATIC[def.coingeckoId];
  }
  return null;
}

function logoSizeForSegment(
  sweep: number,
  logoR: number,
  ringThickness: number,
  count: number,
  size: number,
) {
  const chord = 2 * logoR * Math.sin(Math.max(sweep, 0.05) / 2);
  const byChord = chord * 0.78;
  const byRing = ringThickness * 0.82;
  const byCount =
    count <= 5
      ? size * 0.18
      : count <= 8
        ? size * 0.14
        : count <= 10
          ? size * 0.12
          : size * 0.1;
  return Math.max(16, Math.min(byCount, byChord, byRing));
}

function segmentInitial(assetKey: string): string {
  try {
    return degenAsset(assetKey)
      .ticker.replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 2);
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

/**
 * Reference-style allocation donut:
 * - each segment filled with that asset's brand color
 * - logo soft-embedded in the segment (no white circular badge)
 * - hollow center with "N Assets" / "100%" only
 */
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
  const chartTotal = positive.reduce((sum, s) => sum + s.percent, 0) || 100;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR * 0.5;
  const ringThickness = outerR - innerR;
  const logoR = (innerR + outerR) / 2;
  const count = Math.max(positive.length, 1);
  const showFullCenter = size >= 140;
  const showCompactCount = showCenterCount && !showFullCenter;

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
        size,
      );
      const color = segmentColor(seg.assetKey, index);
      return {
        seg,
        index,
        logoPos,
        iconSize: Math.floor(iconSize),
        color,
        path: describeDonutSegment(
          cx,
          cy,
          innerR,
          outerR,
          startAngle,
          endAngle,
        ),
        clipId: `degen-seg-${uid}-${index}`,
        fadeId: `degen-fade-${uid}-${index}`,
        logoSrc: resolveDegenDonutLogo(seg.assetKey, seg.imageUrl),
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
        className="block h-full w-full drop-shadow-[0_8px_24px_-10px_rgba(56,189,248,0.45)]"
      >
        <defs>
          {drawn.map((segment) => (
            <clipPath key={segment.clipId} id={segment.clipId}>
              <path d={segment.path} />
            </clipPath>
          ))}
          {drawn.map((segment) => (
            <radialGradient
              key={segment.fadeId}
              id={segment.fadeId}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="62%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          ))}
          {drawn.map((segment) => (
            <mask
              key={`mask-${segment.fadeId}`}
              id={`mask-${segment.fadeId}`}
              maskUnits="userSpaceOnUse"
            >
              <circle
                cx={segment.logoPos.x}
                cy={segment.logoPos.y}
                r={segment.iconSize * 0.72}
                fill={`url(#${segment.fadeId})`}
              />
            </mask>
          ))}
        </defs>

        {/* Brand-colored segments */}
        {drawn.map((segment) => (
          <path
            key={`fill-${segment.seg.assetKey}-${segment.index}`}
            d={segment.path}
            fill={segment.color}
            stroke="rgba(7,11,24,0.55)"
            strokeWidth="1.25"
          />
        ))}

        {/* Logos clipped to segment + soft-faded edges — no white circle badge */}
        {drawn.map((segment) => (
          <g
            key={`logo-${segment.seg.assetKey}-${segment.index}`}
            clipPath={`url(#${segment.clipId})`}
          >
            <SegmentEmbeddedLogo
              assetKey={segment.seg.assetKey}
              src={segment.logoSrc}
              x={segment.logoPos.x}
              y={segment.logoPos.y}
              size={segment.iconSize}
              maskId={`mask-${segment.fadeId}`}
            />
          </g>
        ))}

        {/* Hollow center — text only, no logo */}
        <defs>
          <radialGradient id={`degenCenterGlow-${uid}`} cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={innerR - 1} fill="#10172a" />
        <circle
          cx={cx}
          cy={cy}
          r={innerR - 1}
          fill={`url(#degenCenterGlow-${uid})`}
          opacity="0.7"
        />

        {showFullCenter ? (
          <>
            <text
              x={cx}
              y={cy - size * 0.035}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#f8fafc"
              style={{
                fontSize: Math.max(12, size * 0.075),
                fontWeight: 800,
                letterSpacing: "0.01em",
              }}
            >
              {segments.length} Assets
            </text>
            <text
              x={cx}
              y={cy + size * 0.055}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#22d3ee"
              style={{
                fontSize: Math.max(10, size * 0.045),
                fontWeight: 700,
              }}
            >
              100%
            </text>
          </>
        ) : showCompactCount ? (
          <text
            x={cx}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#f8fafc"
            style={{ fontSize: Math.max(11, size * 0.12), fontWeight: 800 }}
          >
            {segments.length}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

function SegmentEmbeddedLogo({
  assetKey,
  src,
  x,
  y,
  size,
  maskId,
}: {
  assetKey: string;
  src: string | null;
  x: number;
  y: number;
  size: number;
  maskId: string;
}) {
  const [broken, setBroken] = useState(false);
  const imgSize = size * 1.55;
  const usable = src && !broken ? src : null;

  if (usable) {
    return (
      <g mask={`url(#${maskId})`}>
        <image
          href={usable}
          x={x - imgSize / 2}
          y={y - imgSize / 2}
          width={imgSize}
          height={imgSize}
          preserveAspectRatio="xMidYMid slice"
          onError={() => setBroken(true)}
        />
      </g>
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
        fontSize: Math.max(9, size * 0.42),
        fontWeight: 900,
        letterSpacing: "0.02em",
        textShadow: "0 1px 2px rgba(0,0,0,0.45)",
      }}
    >
      {segmentInitial(assetKey)}
    </text>
  );
}
