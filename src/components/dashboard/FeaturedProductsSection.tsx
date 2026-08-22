import Link from "next/link";
import type { FeaturedProductPreview } from "@/lib/domain/dashboard";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";

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
      />
      <div className="grid gap-4 md:grid-cols-3">
        {products.map((product) => {
          const positive = product.performance30d >= 0;
          return (
            <Link
              key={product.id}
              href={product.href}
              className="app-panel group relative overflow-hidden p-5 transition-transform hover:-translate-y-0.5"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)]" />
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-app-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-brand">
                  Featured · {product.kind}
                </span>
                <IllustrativeBadge compact />
              </div>
              <h3 className="app-display mt-3 text-lg font-bold text-app-ink group-hover:text-app-brand">
                {product.name}
              </h3>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-app-dim">AUM</p>
                  <p className="font-semibold text-app-ink">
                    {formatUsd(product.aumUsd, true)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-app-dim">30D</p>
                  <p
                    className={[
                      "font-bold",
                      positive ? "text-app-success" : "text-app-danger",
                    ].join(" ")}
                  >
                    {formatPercent(product.performance30d, true)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
