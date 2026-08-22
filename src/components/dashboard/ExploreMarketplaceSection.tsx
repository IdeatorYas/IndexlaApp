"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  MarketplaceCategory,
  MarketplacePreview,
  MarketplaceProductPreview,
  MarketplaceTab,
} from "@/lib/domain/dashboard";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

const TABS: MarketplaceTab[] = ["All", "Indexes", "Portfolios"];

function matchesTab(product: MarketplaceProductPreview, tab: MarketplaceTab) {
  if (tab === "All") return true;
  if (tab === "Indexes") return product.kind === "Index";
  return product.kind === "Portfolio";
}

function matchesCategory(
  product: MarketplaceProductPreview,
  category: MarketplaceCategory | "All",
) {
  if (category === "All") return true;
  return product.category === category;
}

function Row({
  title,
  products,
  tab,
  category,
}: {
  title: string;
  products: MarketplaceProductPreview[];
  tab: MarketplaceTab;
  category: MarketplaceCategory | "All";
}) {
  const filtered = products.filter(
    (p) => matchesTab(p, tab) && matchesCategory(p, category),
  );

  return (
    <div className="app-panel p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="app-display text-base font-bold text-app-ink">{title}</h3>
        <Link
          href={`${APP_ROUTES.discover}?tab=${tab === "All" ? "" : tab.toLowerCase()}${category !== "All" ? `&category=${encodeURIComponent(category)}` : ""}`}
          className="text-xs font-bold text-app-brand hover:underline"
        >
          View All →
        </Link>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-app-dim">No products in this filter.</p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((product) => {
            const positive = product.performance30d >= 0;
            return (
              <Link
                key={`${title}-${product.id}`}
                href={product.href}
                className="app-panel-soft flex items-center gap-3 p-3 transition-colors hover:border-app-brand/30"
              >
                <AssetIconStack assetIds={product.assetIds} size={24} max={3} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-app-ink">
                      {product.name}
                    </p>
                    <span className="rounded-md bg-app-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-app-brand">
                      {product.kind}
                    </span>
                    {product.isNew ? (
                      <span className="rounded-md bg-app-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-app-success">
                        New
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-app-dim">
                    {product.creatorName} · {product.category} ·{" "}
                    {formatUsd(product.aumUsd, true)} AUM
                  </p>
                </div>
                <p
                  className={[
                    "app-metric shrink-0 text-base",
                    positive ? "text-app-success" : "text-app-danger",
                  ].join(" ")}
                >
                  {formatPercent(product.performance30d, true)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ExploreMarketplaceSection({
  marketplace,
  categories,
}: {
  marketplace: MarketplacePreview;
  categories: MarketplaceCategory[];
}) {
  const [tab, setTab] = useState<MarketplaceTab>("All");
  const [category, setCategory] = useState<MarketplaceCategory | "All">("All");

  const discoverHref = useMemo(() => {
    const params = new URLSearchParams();
    if (tab !== "All") params.set("tab", tab.toLowerCase());
    if (category !== "All") params.set("category", category);
    const qs = params.toString();
    return `${APP_ROUTES.discover}${qs ? `?${qs}` : ""}`;
  }, [tab, category]);

  return (
    <section>
      <SectionHeader
        title="Explore Marketplace"
        description="Trending, most invested and new products — browse without connecting a wallet."
        action={
          <Link
            href={discoverHref}
            className="text-sm font-bold text-app-brand hover:underline"
          >
            View All →
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Marketplace tabs">
        {TABS.map((item) => {
          const selected = item === tab;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(item)}
              className={[
                "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                selected
                  ? "bg-app-brand text-white"
                  : "border border-app-line bg-app-elevated text-app-muted hover:text-app-ink",
              ].join(" ")}
            >
              {item}
            </button>
          );
        })}
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        <Chip
          label="All"
          active={category === "All"}
          onClick={() => setCategory("All")}
        />
        {categories.map((item) => (
          <Chip
            key={item}
            label={item}
            active={category === item}
            onClick={() => setCategory(item)}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Row
          title="Trending Now"
          products={marketplace.trending}
          tab={tab}
          category={category}
        />
        <Row
          title="Most Invested"
          products={marketplace.mostInvested}
          tab={tab}
          category={category}
        />
        <Row
          title="New This Week"
          products={marketplace.newThisWeek}
          tab={tab}
          category={category}
        />
      </div>
    </section>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border border-app-brand/40 bg-app-soft text-app-brand"
          : "border border-app-line bg-app-elevated text-app-muted hover:text-app-ink",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
