"use client";

import { useEffect, useMemo, useState } from "react";
import { AssetIcon } from "@/components/ui/AssetIcons";
import { formatPercent } from "@/lib/dashboard/data";

function formatAssetPriceUsd(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (value >= 1) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}
import type { AllocationPreview } from "@/lib/domain/dashboard";
import type {
  AssetPerformancePoint,
  CoinGeckoAvailability,
} from "@/lib/market/asset-performance";
import {
  getAssetBrandColor,
  getAssetDisplayName,
  getAssetDonutColor,
  resolveAssetTicker,
} from "@/lib/fixtures/asset-registry";
import { normalizeTickerKey } from "@/lib/market/coingecko-ids";

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

function PerfCell({
  value,
  loading,
  failed,
}: {
  value: number | null | undefined;
  loading?: boolean;
  /** True only after a genuine API failure / unmapped asset. */
  failed?: boolean;
}) {
  if (loading) {
    return (
      <span
        className="inline-block h-3 w-9 animate-pulse rounded bg-app-soft/70"
        aria-hidden
      />
    );
  }
  if (failed) {
    return (
      <span className="text-[9px] font-semibold uppercase tracking-wide text-app-dim">
        Unavailable
      </span>
    );
  }
  if (value == null || Number.isNaN(value)) {
    return <span className="tabular-nums text-app-dim">—</span>;
  }
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

type LoadState = "idle" | "loading" | "ready" | "error";

export function PremiumAllocationVisual({
  allocations,
  size = 380,
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
  const innerR = outerR * 0.48;
  const ringThickness = outerR - innerR;
  const logoR = (innerR + outerR) / 2 - ringThickness * 0.08;

  const tickersKey = useMemo(
    () =>
      allocations
        .map((a) => normalizeTickerKey(a.assetId))
        .filter(Boolean)
        .join(","),
    [allocations],
  );

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [availability, setAvailability] =
    useState<CoinGeckoAvailability>("live");
  const [byTicker, setByTicker] = useState<
    Record<string, AssetPerformancePoint>
  >({});
  const [reason, setReason] = useState<string | undefined>();

  useEffect(() => {
    if (!tickersKey) return;
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoadState("loading");
      try {
        const res = await fetch(
          `/api/market/performance?tickers=${encodeURIComponent(tickersKey)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const json = (await res.json()) as {
          byTicker?: Record<string, AssetPerformancePoint>;
          availability?: CoinGeckoAvailability;
          reason?: string;
        };
        if (cancelled) return;
        setByTicker(json.byTicker ?? {});
        setAvailability(json.availability ?? "error");
        setReason(json.reason);
        setLoadState(res.ok ? "ready" : "error");
        if (
          process.env.NODE_ENV === "development" &&
          (!res.ok ||
            json.availability === "error" ||
            json.availability === "rate-limited" ||
            json.availability === "unconfigured")
        ) {
          console.error("[Holdings][performance]", {
            status: res.status,
            availability: json.availability,
            reason: json.reason,
            tickers: tickersKey,
          });
        }
      } catch (err) {
        if (cancelled) return;
        setLoadState("error");
        setAvailability("error");
        setReason("Failed to load market performance");
        if (process.env.NODE_ENV === "development") {
          console.error("[Holdings][performance] fetch failed", err);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tickersKey]);

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

  const rowPad = "px-1.5 py-[2px]";
  const nameSize = compact ? "text-[11px]" : "text-[12px]";
  const loading = loadState === "loading" || loadState === "idle";
  const feedFailed =
    loadState === "error" ||
    availability === "rate-limited" ||
    availability === "unconfigured" ||
    availability === "error";
  const showFeedNote = feedFailed;

  return (
    <div
      className={[
        "grid grid-cols-1 items-start gap-2",
        "md:grid-cols-[minmax(360px,0.92fr)_minmax(0,1.15fr)] md:items-start md:gap-2.5",
        "lg:gap-3",
      ].join(" ")}
    >
      {/* LEFT: allocation donut — sits beside holdings on md+ */}
      <div className="relative mx-auto flex w-full max-w-[min(100%,400px)] shrink-0 items-start justify-center md:mx-0 md:max-w-[380px] lg:max-w-[400px]">
        <div className="pointer-events-none absolute inset-[10%] rounded-full bg-[radial-gradient(circle_at_50%_42%,color-mix(in_srgb,var(--color-ink)_6%,transparent),transparent_70%)]" />
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="relative mx-auto block h-auto w-full max-w-full aspect-square drop-shadow-[0_10px_28px_-18px_rgba(0,0,0,0.45)]"
          role="img"
          aria-label="Asset allocation chart with logos and percentages"
        >
          {segments.map((segment) => (
            <path
              key={`${segment.alloc.assetId}-${segment.index}`}
              d={segment.path}
              fill={segment.color}
              stroke="var(--color-bg-elevated)"
              strokeWidth="1.5"
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
              fontSize: compact ? 16 : 18,
              fontWeight: 700,
              fontFamily: "var(--font-display)",
            }}
          >
            {allocations.length} Assets
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fill="var(--color-muted)"
            style={{ fontSize: 10, fontWeight: 600 }}
          >
            100% Allocated
          </text>
          {segments.map((segment) => {
            const icon = Math.floor(segment.iconSize);
            const blockH = icon + segment.pctFont + 8;
            const blockW = Math.max(icon + 6, 40);
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
                  className="flex h-full w-full flex-col items-center justify-center gap-[2px]"
                  title={`${segment.alloc.label} ${segment.alloc.percent}%`}
                >
                  <AssetIcon
                    assetId={segment.alloc.assetId}
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
                    {segment.alloc.percent}%
                  </span>
                </div>
              </foreignObject>
            );
          })}
        </svg>
      </div>

      {/* RIGHT: holdings list — same vertical band as donut */}
      <div className="min-w-0 w-full">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5 px-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-app-dim">
            Holdings
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-semibold text-app-muted">
              Price · 7D · 30D
            </span>
            {loading ? (
              <span className="text-[9px] font-bold uppercase tracking-wide text-app-brand">
                Loading
              </span>
            ) : null}
            {availability === "live" && loadState === "ready" ? (
              <span className="text-[9px] font-bold uppercase tracking-wide text-app-success">
                Live
              </span>
            ) : null}
          </div>
        </div>
        {showFeedNote ? (
          <p className="mb-1 text-[10px] text-app-warning">
            {availability === "unconfigured"
              ? "CoinGecko not configured — asset performance unavailable."
              : availability === "rate-limited"
                ? "Market feed rate-limited — showing Unavailable until refresh."
                : reason || "Market performance unavailable."}
          </p>
        ) : null}
        <div className="overflow-hidden rounded-[12px] border border-app-line/50 bg-gradient-to-b from-app-elevated/95 to-app-panel/70">
          <div
            className={[
              "hidden grid-cols-[minmax(0,1.35fr)_2.5rem_4.5rem_3.25rem_3.25rem] gap-1 border-b border-app-line/40 text-[9px] font-bold uppercase tracking-wider text-app-dim sm:grid",
              rowPad,
            ].join(" ")}
          >
            <span>Asset</span>
            <span className="text-right">Alloc</span>
            <span className="text-right">Price</span>
            <span className="text-right">7D</span>
            <span className="text-right">30D</span>
          </div>
          <ul className="divide-y divide-app-line/30">
            {allocations.map((alloc, index) => {
              const color = getAssetBrandColor(alloc.assetId, index);
              const ticker = resolveAssetTicker(alloc.assetId);
              const key = normalizeTickerKey(alloc.assetId);
              const tickerKey = normalizeTickerKey(ticker);
              const point = byTicker[key] ?? byTicker[tickerKey];
              const rowFailed =
                !loading &&
                (feedFailed ||
                  point?.status === "unavailable" ||
                  point?.status === "error" ||
                  (loadState === "ready" && point == null));
              const priceLabel = formatAssetPriceUsd(point?.priceUsd);
              return (
                <li
                  key={`${alloc.assetId}-${index}`}
                  className={[
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 sm:grid-cols-[minmax(0,1.35fr)_2.5rem_4.5rem_3.25rem_3.25rem] sm:gap-1",
                    rowPad,
                    "transition-colors hover:bg-app-soft/30",
                  ].join(" ")}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/15"
                      style={{ backgroundColor: color }}
                    >
                      <AssetIcon
                        assetId={alloc.assetId}
                        size={14}
                        variant="donut"
                      />
                    </span>
                    <div className="min-w-0 leading-tight">
                      <p
                        className={[
                          "truncate font-bold text-app-ink",
                          nameSize,
                        ].join(" ")}
                      >
                        {getAssetDisplayName(alloc.assetId)}
                      </p>
                      <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-app-dim">
                        {ticker}
                      </p>
                    </div>
                  </div>
                  <p className="text-right text-[11px] font-bold tabular-nums text-app-ink">
                    {alloc.percent}%
                  </p>
                  <p className="hidden text-right text-[10px] font-semibold tabular-nums text-app-ink sm:block">
                    {loading ? (
                      <span
                        className="inline-block h-3 w-12 animate-pulse rounded bg-app-soft/70"
                        aria-hidden
                      />
                    ) : rowFailed && priceLabel == null ? (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-app-dim">
                        Unavailable
                      </span>
                    ) : (
                      (priceLabel ?? "—")
                    )}
                  </p>
                  <p className="hidden text-right text-[10px] sm:block">
                    <PerfCell
                      value={point?.change7dPercent}
                      loading={loading}
                      failed={rowFailed && point?.change7dPercent == null}
                    />
                  </p>
                  <p className="hidden text-right text-[10px] sm:block">
                    <PerfCell
                      value={point?.change30dPercent}
                      loading={loading}
                      failed={rowFailed && point?.change30dPercent == null}
                    />
                  </p>
                  <div className="col-span-2 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[10px] sm:hidden">
                    <span className="font-semibold tabular-nums text-app-ink">
                      {loading ? "…" : priceLabel ?? (rowFailed ? "Unavailable" : "—")}
                    </span>
                    <span className="text-app-dim">7D</span>
                    <PerfCell
                      value={point?.change7dPercent}
                      loading={loading}
                      failed={rowFailed && point?.change7dPercent == null}
                    />
                    <span className="text-app-dim">30D</span>
                    <PerfCell
                      value={point?.change30dPercent}
                      loading={loading}
                      failed={rowFailed && point?.change30dPercent == null}
                    />
                  </div>
                </li>
              );
            })}
            <li
              className={[
                "flex items-center justify-between bg-app-soft/25 sm:grid sm:grid-cols-[minmax(0,1.35fr)_2.5rem_4.5rem_3.25rem_3.25rem] sm:gap-1",
                rowPad,
              ].join(" ")}
            >
              <p className="text-[11px] font-bold text-app-ink">Total</p>
              <p className="text-right text-[11px] font-bold tabular-nums text-app-brand sm:col-start-2">
                100%
              </p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
