import Link from "next/link";
import type {
  MarketplacePreview,
  MarketplaceProductPreview,
} from "@/lib/domain/dashboard";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

export function DiscoveryListsSection({
  marketplace,
}: {
  marketplace: MarketplacePreview;
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <DiscoveryColumn title="Trending Now" products={marketplace.trending} />
      <DiscoveryColumn title="Most Invested" products={marketplace.mostInvested} />
      <DiscoveryColumn
        title="Newly Published"
        products={marketplace.newThisWeek}
        className="md:col-span-2 xl:col-span-1"
      />
    </section>
  );
}

function DiscoveryColumn({
  title,
  products,
  className = "",
}: {
  title: string;
  products: MarketplaceProductPreview[];
  className?: string;
}) {
  return (
    <div className={`app-panel overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-app-line px-3 py-2">
        <h2 className="app-display text-[13px] font-bold text-app-ink">{title}</h2>
        <Link
          href={APP_ROUTES.discover}
          className="text-[10px] font-bold text-app-brand hover:underline"
        >
          View All →
        </Link>
      </div>
      {products.length === 0 ? (
        <p className="px-3 py-2.5 text-[11px] text-app-dim">No products yet.</p>
      ) : (
        <ul className="divide-y divide-app-line">
          {products.map((product) => (
            <li key={`${title}-${product.id}`}>
              <DiscoveryRow product={product} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DiscoveryRow({ product }: { product: MarketplaceProductPreview }) {
  const positive = product.performance30d >= 0;

  return (
    <Link
      href={product.href}
      className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-app-panel"
    >
      <AssetIconStack assetIds={product.assetIds} size={20} max={3} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-bold text-app-ink">
          {product.name}
        </p>
        <p className="truncate text-[10px] text-app-dim">
          {product.creatorName} · {formatUsd(product.aumUsd, true)}
        </p>
      </div>
      <p
        className={[
          "app-metric shrink-0 text-[12px] font-bold",
          positive ? "text-app-success" : "text-app-danger",
        ].join(" ")}
      >
        {formatPercent(product.performance30d, true)}
      </p>
    </Link>
  );
}
