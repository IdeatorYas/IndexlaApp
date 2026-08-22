import Link from "next/link";
import type { FeaturedProductPreview } from "@/lib/domain/dashboard";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

const TINTS = ["app-tint-blue", "app-tint-violet", "app-tint-rose"] as const;
const BORDERS = [
  "app-border-accent-blue",
  "app-border-accent-violet",
  "app-border-accent-rose",
] as const;

export function FeaturedProductsSection({
  products,
}: {
  products: FeaturedProductPreview[];
}) {
  return (
    <section>
      <SectionHeader
        title="Featured Products"
        description="Promotional placements — never an endorsement or performance guarantee."
        illustrative
        action={
          <Link
            href={`${APP_ROUTES.discover}?filter=featured`}
            className="text-sm font-bold text-app-brand hover:underline"
          >
            View All Featured →
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product, index) => {
          const positive = product.performance30d >= 0;
          const tint = TINTS[index % TINTS.length];
          const border = BORDERS[index % BORDERS.length];
          return (
            <Link
              key={product.id}
              href={product.href}
              className={`app-panel app-panel-hover relative overflow-hidden border p-5 ${tint} ${border}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-app-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-brand">
                    Featured
                  </span>
                  <span className="rounded-full bg-app-panel px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-muted">
                    {product.kind}
                  </span>
                  <IllustrativeBadge compact />
                </div>
                <AllocationDonut
                  segments={product.assetIds.map((id, i) => ({
                    label: id,
                    percent: Math.round(100 / product.assetIds.length) + (i === 0 ? 100 % product.assetIds.length : 0),
                  }))}
                  size={56}
                />
              </div>

              <h3 className="app-display mt-4 text-xl font-bold text-app-ink">
                {product.name}
              </h3>
              <p className="mt-1 text-xs font-semibold text-app-muted">
                {product.creatorName}
                {product.verified ? " · Verified" : ""}
                {product.creatorHandle === "indexla" ? " · INDEXLA" : ` · @${product.creatorHandle}`}
              </p>
              <p className="mt-2 line-clamp-2 text-sm text-app-muted">
                {product.thesis}
              </p>

              <div className="mt-4 flex items-center justify-between gap-3">
                <AssetIconStack assetIds={product.assetIds} />
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-app-dim">
                    30D
                  </p>
                  <p
                    className={[
                      "app-metric text-2xl",
                      positive ? "text-app-success" : "text-app-danger",
                    ].join(" ")}
                  >
                    {formatPercent(product.performance30d, true)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-app-line pt-3 text-xs">
                <Meta label="AUM" value={formatUsd(product.aumUsd, true)} />
                <Meta label="Investors" value={String(product.investors)} />
                <Meta label="Risk" value={product.risk} />
              </div>
              <p className="mt-2 text-[11px] text-app-dim">
                Strategy · {product.strategy}
              </p>
              <p className="mt-4 text-sm font-bold text-app-brand">
                View {product.kind} →
              </p>
            </Link>
          );
        })}
      </div>
    </section>
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
