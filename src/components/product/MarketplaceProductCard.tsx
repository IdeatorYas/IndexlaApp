import Link from "next/link";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";
import {
  ExactProductTypeBadge,
  ProductKindBadge,
} from "@/components/product/ProductIdentity";
import { ProductCreatorLine } from "@/components/product/ProductCreatorLine";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
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
  const detailsHref = product.href || APP_ROUTES.product(product.id);
  const isIndex = product.kind === "Index";
  const investHref = product.isIllustrative
    ? `${APP_ROUTES.product(product.id)}?action=invest`
    : detailsHref;

  const shellClass = [
    "group relative flex h-full flex-col overflow-hidden",
    "app-marketplace-card",
    isIndex ? "app-marketplace-card-index" : "app-marketplace-card-portfolio",
  ].join(" ");

  const pad = compact ? "p-2.5" : "p-3.5 sm:p-4";

  return (
    <article className={shellClass}>
      <Link href={detailsHref} className={`block min-h-0 flex-1 ${pad}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <ProductKindBadge kind={product.kind} compact={compact} />
            {showFeatured ? (
              <span className="rounded-md border border-app-brand/25 bg-app-brand/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-app-brand">
                Featured
              </span>
            ) : null}
            {product.isNew ? (
              <span className="rounded-md border border-app-success/25 bg-app-success/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-app-success">
                New
              </span>
            ) : null}
          </div>
          <div className="app-marketplace-metric shrink-0 px-2 py-1 text-right">
            <p className="text-[8px] font-bold uppercase tracking-wider text-app-dim">
              30D
            </p>
            <p
              className={[
                "app-metric leading-none font-bold",
                compact ? "text-base" : "text-lg sm:text-xl",
                positive ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {formatPercent(product.performance30d, true)}
            </p>
          </div>
        </div>

        <div className="mt-2 flex justify-center">
          <ExactProductTypeBadge
            kind={product.kind}
            indexType={product.indexType}
            compact={compact}
          />
        </div>

        <div
          className={[
            "mx-auto mt-2.5 w-full rounded-[12px] px-2.5 py-2.5 text-center",
            compact ? "mt-2 py-2" : "mt-3 min-h-[3.5rem] py-3",
          ].join(" ")}
        >
          <h3
            className={[
              "app-display line-clamp-2 font-bold text-app-ink",
              compact
                ? "text-[13px] leading-snug"
                : "text-[16px] leading-tight sm:text-[17px]",
            ].join(" ")}
          >
            {product.name}
          </h3>
        </div>

        <div
          className={
            compact ? "mt-1.5 flex justify-center" : "mt-2.5 flex justify-center"
          }
        >
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
              ? "mt-1.5 line-clamp-1 text-[10px] leading-snug"
              : "mt-2 line-clamp-2 text-[11px] leading-relaxed sm:text-xs",
          ].join(" ")}
        >
          {product.description}
        </p>

        <div
          className={
            compact
              ? "mt-2 flex items-center justify-center gap-2"
              : "mt-3 flex items-center justify-center gap-2.5"
          }
        >
          <AssetIconStack
            assetIds={product.assetIds}
            size={compact ? 18 : 24}
            max={compact ? 5 : 6}
          />
          <p
            className={[
              "font-semibold text-app-dim",
              compact ? "text-[9px]" : "text-[10px] sm:text-[11px]",
            ].join(" ")}
          >
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
            "grid grid-cols-3 gap-1.5 sm:gap-2",
            compact
              ? "mt-2"
              : "mt-3 border-t border-app-line/80 pt-3",
          ].join(" ")}
        >
          <MetricStat
            label="AUM"
            value={formatUsd(product.aumUsd, true)}
            compact={compact}
          />
          <MetricStat
            label="Volume"
            value={formatUsd(product.volumeUsd, true)}
            compact={compact}
          />
          <MetricStat
            label="Investors"
            value={String(product.investors)}
            compact={compact}
          />
        </div>

        {!compact && product.isIllustrative ? (
          <div className="mt-2.5 flex justify-center">
            <IllustrativeBadge compact />
          </div>
        ) : null}
      </Link>

      <div
        className={[
          "flex gap-1.5 border-t border-app-line/70 bg-app-panel/50 p-2",
          compact ? "" : "sm:gap-2 sm:p-2.5",
        ].join(" ")}
      >
        <Link
          href={detailsHref}
          className={[
            "app-btn-secondary inline-flex flex-1 items-center justify-center font-bold hover:-translate-y-px",
            compact ? "h-7 text-[10px]" : "h-9 text-[11px]",
          ].join(" ")}
        >
          View Details
        </Link>
        <Link
          href={investHref}
          className={[
            "app-btn-invest app-interactive inline-flex flex-1 items-center justify-center rounded-[8px]",
            compact ? "h-7 text-[10px]" : "h-9 text-[11px]",
          ].join(" ")}
          onClick={(e) => e.stopPropagation()}
        >
          Invest
        </Link>
      </div>
    </article>
  );
}

function MetricStat({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "app-marketplace-metric flex flex-col items-center justify-center text-center",
        compact ? "min-h-[42px] px-0.5 py-1" : "min-h-[54px] px-1 py-1.5",
      ].join(" ")}
    >
      <p
        className={[
          "font-bold uppercase tracking-wider text-app-dim",
          compact ? "text-[7px]" : "text-[8px]",
        ].join(" ")}
      >
        {label}
      </p>
      <p
        className={[
          "mt-0.5 truncate font-bold text-app-ink",
          compact ? "max-w-full text-[10px]" : "text-[11px] sm:text-xs",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
