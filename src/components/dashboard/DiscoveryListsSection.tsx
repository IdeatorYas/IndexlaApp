import Link from "next/link";
import type {
  MarketplacePreview,
  MarketplaceProductPreview,
} from "@/lib/domain/dashboard";
import { DashboardSectionHeading } from "@/components/dashboard/DashboardSectionHeading";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

const COLUMN_TONES = {
  "Trending Now": "cyan",
  "Most Invested": "violet",
  "Newly Published": "emerald",
} as const;

export function DiscoveryListsSection({
  marketplace,
}: {
  marketplace: MarketplacePreview;
}) {
  return (
    <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
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
  title: keyof typeof COLUMN_TONES;
  products: MarketplaceProductPreview[];
  className?: string;
}) {
  const tone = COLUMN_TONES[title];

  return (
    <div className={`app-panel overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-app-line px-2.5 py-1.5">
        <DashboardSectionHeading label={title} tone={tone} size="sm" as="h3" />
        <Link
          href={APP_ROUTES.discover}
          className="text-[9px] font-bold text-app-brand hover:underline"
        >
          View All →
        </Link>
      </div>
      {products.length === 0 ? (
        <p className="px-2.5 py-2 text-[10px] text-app-dim">No products yet.</p>
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
      className="flex items-center gap-1.5 px-2.5 py-1.5 transition-colors hover:bg-app-panel"
    >
      <AssetIconStack assetIds={product.assetIds} size={18} max={3} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold leading-tight text-app-ink">
          {product.name}
        </p>
        <p className="truncate text-[9px] leading-tight text-app-dim">
          {product.creatorName} · {formatUsd(product.aumUsd, true)}
        </p>
      </div>
      <p
        className={[
          "app-metric shrink-0 text-[11px] font-bold",
          positive ? "text-app-success" : "text-app-danger",
        ].join(" ")}
      >
        {formatPercent(product.performance30d, true)}
      </p>
    </Link>
  );
}
