"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MarketplaceCategory } from "@/lib/domain/dashboard";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";
import { MarketplaceProductCard } from "@/components/product/MarketplaceProductCard";
import { getDiscoverCatalog } from "@/lib/data";
import { APP_ROUTES } from "@/lib/routes";

type ExploreTab = "All" | "Indexes" | "Portfolios";

const TABS: ExploreTab[] = ["All", "Indexes", "Portfolios"];

const CATEGORY_FILTERS: MarketplaceCategory[] = [
  "Crypto",
  "AI",
  "DeFi",
  "RWAs",
  "Tokenized Stocks",
  "Commodities",
  "Hybrid",
];

function matchesTab(product: MarketplaceProduct, tab: ExploreTab) {
  if (tab === "All") return true;
  if (tab === "Indexes") return product.kind === "Index";
  return product.kind === "Portfolio";
}

function matchesCategory(
  product: MarketplaceProduct,
  category: MarketplaceCategory | "All",
) {
  if (category === "All") return true;
  return product.category === category;
}

export function ExploreMarketplaceSection() {
  const catalog = getDiscoverCatalog().data;
  const [tab, setTab] = useState<ExploreTab>("All");
  const [category, setCategory] = useState<MarketplaceCategory | "All">("All");

  const filtered = useMemo(() => {
    return catalog.products.filter(
      (p) => matchesTab(p, tab) && matchesCategory(p, category),
    );
  }, [catalog.products, tab, category]);

  const discoverHref = useMemo(() => {
    const params = new URLSearchParams();
    if (tab !== "All") params.set("tab", tab.toLowerCase());
    if (category !== "All") params.set("category", category);
    const qs = params.toString();
    return `${APP_ROUTES.discover}${qs ? `?${qs}` : ""}`;
  }, [tab, category]);

  return (
    <section className="space-y-5">
      <header className="mx-auto max-w-2xl text-center">
        <h2 className="app-display text-2xl font-bold text-app-ink sm:text-[1.75rem]">
          Explore Marketplace
        </h2>
        <p className="mt-2 text-sm text-app-muted">
          Browse indexes and portfolios by type and narrative category. Every
          product opens full details — preview only, no wallet required to browse.
        </p>
      </header>

      <div
        className="flex flex-wrap items-center justify-center gap-2"
        role="tablist"
        aria-label="Explore marketplace product type"
      >
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
                "h-10 rounded-full px-5 text-[13px] font-bold transition-colors sm:text-sm",
                selected
                  ? "bg-app-brand text-white shadow-sm"
                  : "border border-app-line bg-app-elevated text-app-muted hover:border-app-brand/35 hover:text-app-ink",
              ].join(" ")}
            >
              {item}
            </button>
          );
        })}
        <Link
          href={APP_ROUTES.degenClub}
          className="inline-flex h-10 items-center rounded-full border border-app-danger/45 bg-gradient-to-r from-app-danger/15 to-app-warning/10 px-5 text-[13px] font-bold text-app-danger shadow-sm transition-colors hover:from-app-danger/25 hover:to-app-warning/15 sm:text-sm"
        >
          🔥 Degen Club
        </Link>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5">
        <CategoryChip
          label="All"
          active={category === "All"}
          onClick={() => setCategory("All")}
        />
        {CATEGORY_FILTERS.map((item) => (
          <CategoryChip
            key={item}
            label={item}
            active={category === item}
            onClick={() => setCategory(item)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="app-panel px-4 py-8 text-center text-sm text-app-muted">
          No products match this filter. Try another category or tab.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <MarketplaceProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <div className="flex justify-center pt-1">
        <Link
          href={discoverHref}
          className="app-gradient-btn inline-flex h-11 items-center justify-center rounded-[10px] px-6 text-sm font-bold"
        >
          View All
        </Link>
      </div>
    </section>
  );
}

function CategoryChip({
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
        "h-8 shrink-0 rounded-full px-3 text-[11px] font-semibold transition-colors sm:text-[12px]",
        active
          ? "border border-app-brand/40 bg-app-soft text-app-brand"
          : "border border-app-line bg-app-elevated text-app-muted hover:text-app-ink",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
