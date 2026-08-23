import Link from "next/link";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";
import {
  ProductAttribution,
  ProductTypeBadge,
} from "@/components/product/ProductIdentity";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";

export function MarketplaceProductCard({
  product,
  featured = false,
  interactive = true,
  compact = false,
}: {
  product: MarketplaceProduct;
  featured?: boolean;
  interactive?: boolean;
  compact?: boolean;
}) {
  const positive = product.performance30d >= 0;
  const showFeatured = featured || product.featured;
  const shellClass = [
    "group relative block overflow-hidden rounded-[12px] border border-app-line/80",
    "bg-gradient-to-br from-app-elevated via-app-panel to-app-soft/30",
    compact
      ? "shadow-[0_4px_16px_-8px_rgba(0,0,0,0.4)]"
      : "shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)]",
    "transition-all duration-200",
    interactive
      ? "hover:-translate-y-0.5 hover:border-app-brand/35 hover:shadow-[0_12px_32px_-12px_rgba(59,130,246,0.35)]"
      : "",
  ].join(" ");

  const pad = compact ? "p-2" : "p-3.5 sm:p-4";

  const body = (
    <>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-app-brand/40 to-transparent" />
      <div className={pad}>
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-0.5">
              {showFeatured ? (
                <span className="rounded-md bg-app-brand/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-app-brand">
                  Featured
                </span>
              ) : null}
              <ProductTypeBadge kind={product.kind} />
              {product.isNew ? (
                <span className="rounded-md bg-app-success/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-app-success">
                  New
                </span>
              ) : null}
            </div>
            <h3
              className={[
                "app-display truncate font-bold text-app-ink group-hover:text-app-brand",
                compact
                  ? "mt-0.5 text-[13px] leading-tight"
                  : "mt-1.5 text-[15px] sm:text-base",
              ].join(" ")}
            >
              {product.name}
            </h3>
            <ProductAttribution
              creatorName={product.creatorName}
              creatorHandle={product.creatorHandle}
              verified={product.verified}
              className={
                compact
                  ? "sr-only"
                  : undefined
              }
            />
          </div>
          <div className="shrink-0 rounded-[8px] border border-app-line/60 bg-app-panel/80 px-1.5 py-0.5 text-right">
            <p className="text-[8px] font-bold uppercase tracking-wide text-app-dim">
              30D
            </p>
            <p
              className={[
                "app-metric leading-none",
                compact ? "text-base" : "text-lg sm:text-xl",
                positive ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {formatPercent(product.performance30d, true)}
            </p>
          </div>
        </div>

        <p
          className={[
            "text-app-muted",
            compact
              ? "mt-1 line-clamp-1 text-[10px] leading-snug"
              : "mt-2 line-clamp-2 text-[11px] leading-relaxed sm:text-xs",
          ].join(" ")}
        >
          {product.description}
        </p>

        <div className={compact ? "mt-1 flex flex-wrap gap-0.5" : "mt-2.5 flex flex-wrap gap-1"}>
          <MetaChip label={product.indexType} compact={compact} />
          <MetaChip label={product.narrativeLabel} accent compact={compact} />
          <MetaChip label={product.risk} compact={compact} />
        </div>

        <div
          className={
            compact
              ? "mt-1 flex items-center justify-between gap-1.5"
              : "mt-2.5 flex items-center justify-between gap-2"
          }
        >
          <AssetIconStack
            assetIds={product.assetIds}
            size={compact ? 18 : 22}
            max={compact ? 4 : 5}
          />
          <p className="text-[9px] font-semibold text-app-dim">
            {product.assetIds.length} assets
          </p>
        </div>

        {!compact ? (
          <p className="mt-2 truncate text-[10px] font-medium text-app-muted">
            {product.strategy}
          </p>
        ) : null}

        <div
          className={[
            "grid grid-cols-3 gap-1",
            compact ? "mt-1.5" : "mt-2.5 border-t border-app-line/70 pt-2.5",
          ].join(" ")}
        >
          <MetricStat
            label="AUM"
            value={formatUsd(product.aumUsd, true)}
            tone="aum"
            compact={compact}
          />
          <MetricStat
            label="Volume"
            value={formatUsd(product.volumeUsd, true)}
            tone="volume"
            compact={compact}
          />
          <MetricStat
            label="Investors"
            value={String(product.investors)}
            tone="investors"
            compact={compact}
          />
        </div>

        <div
          className={
            compact
              ? "mt-1 flex items-center justify-end"
              : "mt-2 flex items-center justify-between gap-2"
          }
        >
          {!compact ? <IllustrativeBadge compact /> : null}
          <span
            className={[
              "inline-flex items-center justify-center rounded-[8px] font-bold",
              compact ? "h-7 px-2.5 text-[10px]" : "h-9 px-3 text-[11px]",
              interactive
                ? "bg-gradient-to-r from-app-brand to-[color:var(--color-accent-cyan)] text-white group-hover:shadow-md group-hover:shadow-app-brand/25"
                : "border border-app-line bg-app-elevated text-app-ink",
            ].join(" ")}
          >
            View Index →
          </span>
        </div>
      </div>
    </>
  );

  if (interactive) {
    return (
      <Link href={product.href} className={shellClass}>
        {body}
      </Link>
    );
  }

  return <div className={shellClass}>{body}</div>;
}

function MetaChip({
  label,
  accent = false,
  compact = false,
}: {
  label: string;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={[
        "rounded-full font-bold",
        compact ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-0.5 text-[9px]",
        accent
          ? "border border-app-brand/30 bg-app-brand/10 text-app-brand"
          : "border border-app-line bg-app-elevated text-app-muted",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

const METRIC_STYLES = {
  aum: [
    "border-[color:var(--color-accent-blue)]/50",
    "bg-gradient-to-b from-[color:var(--color-accent-blue)]/35 to-[color:var(--color-accent-blue)]/10",
    "shadow-[0_0_14px_-3px_rgba(59,130,246,0.55)]",
    "text-[color:var(--color-accent-blue)]",
  ].join(" "),
  volume: [
    "border-[color:var(--color-accent-violet)]/50",
    "bg-gradient-to-b from-[color:var(--color-accent-violet)]/35 to-[color:var(--color-accent-violet)]/10",
    "shadow-[0_0_14px_-3px_rgba(124,58,237,0.5)]",
    "text-[color:var(--color-accent-violet)]",
  ].join(" "),
  investors: [
    "border-[color:var(--color-accent-cyan)]/50",
    "bg-gradient-to-b from-[color:var(--color-accent-cyan)]/35 to-[color:var(--color-accent-cyan)]/10",
    "shadow-[0_0_14px_-3px_rgba(34,211,238,0.45)]",
    "text-[color:var(--color-accent-cyan)]",
  ].join(" "),
};

function MetricStat({
  label,
  value,
  tone,
  compact,
}: {
  label: string;
  value: string;
  tone: "aum" | "volume" | "investors";
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center rounded-[9px] border text-center",
        compact ? "min-h-[40px] px-0.5 py-0.5" : "min-h-[52px] px-1 py-1.5",
        METRIC_STYLES[tone],
      ].join(" ")}
    >
      <p
        className={[
          "font-bold uppercase tracking-wide opacity-90",
          compact ? "text-[7px]" : "text-[8px]",
        ].join(" ")}
      >
        {label}
      </p>
      <p
        className={[
          "mt-0.5 truncate font-bold text-app-ink",
          compact ? "max-w-full text-[10px]" : "text-[11px]",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
