import Link from "next/link";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";
import {
  ProductAttribution,
  ProductTypeBadge,
} from "@/components/product/ProductIdentity";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";

export function MarketplaceProductCard({
  product,
  featured = false,
}: {
  product: MarketplaceProduct;
  featured?: boolean;
}) {
  const positive = product.performance30d >= 0;
  const showFeatured = featured || product.featured;

  return (
    <Link
      href={product.href}
      className="app-panel app-panel-hover group block overflow-hidden"
    >
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <AllocationDonut
            segments={product.allocations.map((a) => ({
              label: a.label,
              percent: a.percent,
            }))}
            size={48}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {showFeatured ? (
                <span className="rounded-md bg-app-brand/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-brand">
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
            <h3 className="app-display mt-1.5 truncate text-[15px] font-bold text-app-ink group-hover:text-app-brand">
              {product.name}
            </h3>
            <ProductAttribution
              creatorName={product.creatorName}
              creatorHandle={product.creatorHandle}
              verified={product.verified}
            />
          </div>
          <div className="shrink-0 text-right">
            <p className="app-label">30D</p>
            <p
              className={[
                "app-metric text-[1.25rem] leading-none",
                positive ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {formatPercent(product.performance30d, true)}
            </p>
          </div>
        </div>

        <p className="mt-2 line-clamp-2 text-[12px] text-app-muted">
          {product.thesis}
        </p>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <AssetIconStack assetIds={product.assetIds} size={22} max={4} />
          <p className="truncate text-[11px] text-app-dim">{product.strategy}</p>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-app-line pt-2.5 text-[11px]">
          <Meta label="AUM" value={formatUsd(product.aumUsd, true)} />
          <Meta label="Investors" value={String(product.investors)} />
          <Meta
            label="Rank"
            value={product.rankMonthly != null ? `#${product.rankMonthly}` : "—"}
          />
        </div>

        <span className="mt-3 flex h-9 w-full items-center justify-center rounded-[10px] bg-app-brand/90 text-[12px] font-bold text-white group-hover:bg-app-brand">
          View Details →
        </span>
      </div>
    </Link>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-app-dim">{label}</p>
      <p className="mt-0.5 font-bold text-app-ink">{value}</p>
    </div>
  );
}
