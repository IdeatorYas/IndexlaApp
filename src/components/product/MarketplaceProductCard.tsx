import Link from "next/link";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";
import { ExactProductTypeBadge } from "@/components/product/ProductIdentity";
import { ProductCreatorLine } from "@/components/product/ProductCreatorLine";
import { InvestChoiceLink } from "@/components/product/InvestmentChoiceModal";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { getProductTypeStyle } from "@/lib/product/product-type";
import { APP_ROUTES } from "@/lib/routes";

export function MarketplaceProductCard({
  product,
  featured = false,
  compact = false,
}: {
  product: MarketplaceProduct;
  featured?: boolean;
  compact?: boolean;
}) {
  const positive = product.performance30d >= 0;
  const showFeatured = featured || product.featured;
  const detailsHref = APP_ROUTES.product(product.id);
  const typeStyle = getProductTypeStyle(product);

  const shellClass = [
    "group relative flex h-full flex-col overflow-hidden rounded-[14px] border bg-gradient-to-br from-app-elevated via-app-panel to-app-soft/25",
    compact
      ? "shadow-[0_4px_16px_-8px_rgba(0,0,0,0.4)]"
      : "shadow-[0_10px_28px_-14px_rgba(0,0,0,0.45)]",
    "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-14px_rgba(0,0,0,0.5)]",
  ].join(" ");

  const pad = compact ? "p-2" : "p-3 sm:p-3.5";

  return (
    <article
      className={shellClass}
      style={{
        borderColor: typeStyle.border,
        boxShadow: compact
          ? undefined
          : `0 10px 28px -14px rgba(0,0,0,0.45), 0 0 0 1px ${typeStyle.border}, 0 0 24px -10px ${typeStyle.glow}`,
      }}
    >
      <Link href={detailsHref} className={`block min-h-0 flex-1 ${pad}`}>
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${typeStyle.color}, transparent)`,
          }}
        />

        <div className="flex items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-0.5">
            {showFeatured ? (
              <span className="rounded-md bg-app-brand/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-app-brand">
                Featured
              </span>
            ) : null}
            {product.isNew ? (
              <span className="rounded-md bg-app-success/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-app-success">
                New
              </span>
            ) : null}
          </div>
          <div className="shrink-0 rounded-[8px] border border-app-line/60 bg-app-panel/80 px-1.5 py-0.5 text-right">
            <p className="text-[8px] font-bold uppercase tracking-wide text-app-dim">
              30D
            </p>
            <p
              className={[
                "app-metric leading-none",
                compact ? "text-base" : "text-lg",
                positive ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {formatPercent(product.performance30d, true)}
            </p>
          </div>
        </div>

        <div className="mt-1.5 flex justify-center">
          <ExactProductTypeBadge
            kind={product.kind}
            indexType={product.indexType}
            compact={compact}
          />
        </div>

        <div
          className={[
            "mx-auto mt-2 w-full rounded-[12px] border px-2.5 py-2 text-center",
            compact ? "mt-1.5 py-1.5" : "",
          ].join(" ")}
          style={{
            borderColor: typeStyle.border,
            background: `linear-gradient(180deg, ${typeStyle.surface} 0%, rgba(0,0,0,0) 100%)`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 20px -8px ${typeStyle.glow}`,
          }}
        >
          <h3
            className={[
              "app-display line-clamp-2 font-bold text-app-ink group-hover:text-app-brand",
              compact
                ? "text-[12px] leading-snug"
                : "text-[15px] leading-tight sm:text-base",
            ].join(" ")}
          >
            {product.name}
          </h3>
        </div>

        <div className={compact ? "mt-1 flex justify-center" : "mt-2 flex justify-center"}>
          <ProductCreatorLine
            creatorName={product.creatorName}
            creatorHandle={product.creatorHandle}
            compact={compact}
          />
        </div>

        <p
          className={[
            "text-center text-app-muted",
            compact
              ? "mt-1 line-clamp-1 text-[10px] leading-snug"
              : "mt-2 line-clamp-2 text-[11px] leading-relaxed",
          ].join(" ")}
        >
          {product.description}
        </p>

        <div
          className={
            compact
              ? "mt-1.5 flex items-center justify-center gap-1.5"
              : "mt-2.5 flex items-center justify-center gap-2"
          }
        >
          <AssetIconStack
            assetIds={product.assetIds}
            size={compact ? 18 : 22}
            max={compact ? 5 : 6}
          />
          <p className="text-[9px] font-semibold text-app-dim">
            {product.assetIds.length} assets
          </p>
        </div>

        {!compact ? (
          <p className="mt-2 truncate text-center text-[10px] font-medium text-app-muted">
            {product.selectedStrategy.name}
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

        {!compact ? (
          <div className="mt-2 flex justify-center">
            <IllustrativeBadge compact />
          </div>
        ) : null}
      </Link>

      <div
        className={[
          "flex gap-1 border-t border-app-line/60 bg-app-panel/40 p-1.5",
          compact ? "" : "sm:p-2",
        ].join(" ")}
      >
        <Link
          href={detailsHref}
          className={[
            "inline-flex flex-1 items-center justify-center rounded-[8px] border border-app-line bg-app-elevated font-bold text-app-ink hover:border-app-brand/35",
            compact ? "h-7 text-[10px]" : "h-9 text-[11px]",
          ].join(" ")}
        >
          View Details
        </Link>
        <InvestChoiceLink
          productId={product.id}
          className={[
            "inline-flex flex-1 items-center justify-center rounded-[8px] bg-gradient-to-r from-app-brand to-[color:var(--color-accent-cyan)] font-bold text-white",
            compact ? "h-7 text-[10px]" : "h-9 text-[11px]",
          ].join(" ")}
        >
          Invest
        </InvestChoiceLink>
      </div>
    </article>
  );
}

const METRIC_STYLES = {
  aum: [
    "border-[color:var(--color-accent-blue)]/50",
    "bg-gradient-to-b from-[color:var(--color-accent-blue)]/35 to-[color:var(--color-accent-blue)]/10",
    "shadow-[0_0_14px_-3px_rgba(59,130,246,0.55)]",
  ].join(" "),
  volume: [
    "border-[color:var(--color-accent-violet)]/50",
    "bg-gradient-to-b from-[color:var(--color-accent-violet)]/35 to-[color:var(--color-accent-violet)]/10",
    "shadow-[0_0_14px_-3px_rgba(124,58,237,0.5)]",
  ].join(" "),
  investors: [
    "border-[color:var(--color-accent-cyan)]/50",
    "bg-gradient-to-b from-[color:var(--color-accent-cyan)]/35 to-[color:var(--color-accent-cyan)]/10",
    "shadow-[0_0_14px_-3px_rgba(34,211,238,0.45)]",
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
          "font-bold uppercase tracking-wide text-[color:var(--color-accent-blue)] opacity-90",
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
