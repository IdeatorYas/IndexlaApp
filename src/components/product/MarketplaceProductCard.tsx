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
}: {
  product: MarketplaceProduct;
  featured?: boolean;
  interactive?: boolean;
}) {
  const positive = product.performance30d >= 0;
  const showFeatured = featured || product.featured;
  const shellClass = [
    "group relative block overflow-hidden rounded-[14px] border border-app-line/80",
    "bg-gradient-to-br from-app-elevated via-app-panel to-app-soft/30",
    "shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] transition-all duration-200",
    interactive
      ? "hover:-translate-y-0.5 hover:border-app-brand/35 hover:shadow-[0_16px_40px_-14px_rgba(59,130,246,0.35)]"
      : "",
  ].join(" ");

  const body = (
    <>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-app-brand/40 to-transparent" />
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              {showFeatured ? (
                <span className="rounded-md bg-app-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-brand">
                  Featured
                </span>
              ) : null}
              <ProductTypeBadge kind={product.kind} />
              {product.isNew ? (
                <span className="rounded-md bg-app-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-success">
                  New
                </span>
              ) : null}
            </div>
            <h3 className="app-display mt-1.5 truncate text-[15px] font-bold text-app-ink group-hover:text-app-brand sm:text-base">
              {product.name}
            </h3>
            <ProductAttribution
              creatorName={product.creatorName}
              creatorHandle={product.creatorHandle}
              verified={product.verified}
            />
          </div>
          <div className="shrink-0 rounded-[10px] border border-app-line/60 bg-app-panel/80 px-2 py-1 text-right">
            <p className="text-[9px] font-bold uppercase tracking-wide text-app-dim">
              30D
            </p>
            <p
              className={[
                "app-metric text-lg leading-none sm:text-xl",
                positive ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {formatPercent(product.performance30d, true)}
            </p>
          </div>
        </div>

        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-app-muted sm:text-xs">
          {product.description}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-1">
          <MetaChip label={product.indexType} />
          <MetaChip label={product.narrativeLabel} accent />
          <MetaChip label={product.risk} />
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <AssetIconStack assetIds={product.assetIds} size={22} max={5} />
          <p className="text-[10px] font-semibold text-app-dim">
            {product.assetIds.length} assets
          </p>
        </div>

        <p className="mt-2 truncate text-[10px] font-medium text-app-muted">
          {product.strategy}
        </p>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5 border-t border-app-line/70 pt-2.5">
          <Stat label="AUM" value={formatUsd(product.aumUsd, true)} />
          <Stat label="Volume" value={formatUsd(product.volumeUsd, true)} />
          <Stat label="Investors" value={String(product.investors)} />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <IllustrativeBadge compact />
          <span
            className={[
              "inline-flex h-9 items-center justify-center rounded-[10px] px-3 text-[11px] font-bold",
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
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <span
      className={[
        "rounded-full px-2 py-0.5 text-[9px] font-bold",
        accent
          ? "border border-app-brand/30 bg-app-brand/10 text-app-brand"
          : "border border-app-line bg-app-elevated text-app-muted",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-app-line/50 bg-app-panel/60 px-1.5 py-1">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-app-dim">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-bold text-app-ink">
        {value}
      </p>
    </div>
  );
}
