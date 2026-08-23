import Link from "next/link";
import type { FeaturedProductPreview } from "@/lib/domain/dashboard";
import {
  ProductAttribution,
  ProductTypeBadge,
} from "@/components/product/ProductIdentity";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

const ACCENTS = [
  {
    top: "app-top-accent-blue",
    bar: "from-[var(--color-accent-blue)] to-[var(--color-accent-cyan)]",
    btn: "bg-[color:var(--color-accent-blue)] hover:brightness-110",
  },
  {
    top: "app-top-accent-violet",
    bar: "from-[var(--color-accent-violet)] to-[var(--color-accent-indigo)]",
    btn: "bg-[color:var(--color-accent-violet)] hover:brightness-110",
  },
  {
    top: "app-top-accent-rose",
    bar: "from-[var(--color-accent-rose)] to-[var(--color-accent-magenta)]",
    btn: "bg-[color:var(--color-accent-rose)] hover:brightness-110",
  },
] as const;

export function FeaturedProductsSection({
  products,
  illustrative = true,
}: {
  products: FeaturedProductPreview[];
  illustrative?: boolean;
}) {
  return (
    <section>
      <SectionHeader
        title="Featured Products"
        description="Promotional placements — never an endorsement or performance guarantee."
        illustrative={illustrative}
        action={
          <Link
            href={`${APP_ROUTES.discover}?filter=featured`}
            className="text-[13px] font-bold text-app-brand hover:underline"
          >
            View All Featured →
          </Link>
        }
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product, index) => {
          const positive = product.performance30d >= 0;
          const accent = ACCENTS[index % ACCENTS.length];
          const segments = product.allocations.map((a) => ({
            label: a.label,
            percent: a.percent,
          }));

          return (
            <Link
              key={product.id}
              href={product.href}
              className={`app-panel app-panel-hover relative overflow-hidden ${accent.top}`}
            >
              <div
                className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accent.bar}`}
              />
              <div className="p-3.5 pt-4">
                <div className="flex items-start gap-3">
                  <AllocationDonut segments={segments} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-app-brand/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-brand">
                        Featured
                      </span>
                      <ProductTypeBadge kind={product.kind} />
                    </div>
                    <h3 className="app-display mt-1.5 truncate text-[15px] font-bold text-app-ink">
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
                        "app-metric text-[1.35rem] leading-none",
                        positive ? "text-app-success" : "text-app-danger",
                      ].join(" ")}
                    >
                      {formatPercent(product.performance30d, true)}
                    </p>
                  </div>
                </div>

                <p className="mt-2 line-clamp-1 text-[12px] text-app-muted">
                  {product.thesis}
                </p>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <AssetIconStack assetIds={product.assetIds} size={22} />
                  <p className="truncate text-[11px] text-app-dim">
                    {product.strategy}
                  </p>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-app-line pt-2.5 text-[11px]">
                  <Meta label="AUM" value={formatUsd(product.aumUsd, true)} />
                  <Meta label="Volume" value={formatUsd(product.volumeUsd, true)} />
                  <Meta label="Investors" value={String(product.investors)} />
                </div>

                <span
                  className={`mt-3 flex h-9 w-full items-center justify-center rounded-[10px] text-[12px] font-bold text-white ${accent.btn}`}
                >
                  View {product.kind} →
                </span>
              </div>
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
