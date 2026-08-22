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
  accent,
}: {
  title: string;
  products: MarketplaceProductPreview[];
  tab: MarketplaceTab;
  category: MarketplaceCategory | "All";
  accent: string;
}) {
  const filtered = products.filter(
    (p) => matchesTab(p, tab) && matchesCategory(p, category),
  );

  return (
    <div className={`app-panel overflow-hidden ${accent}`}>
      <div className="flex items-center justify-between gap-2 border-b border-app-line px-3 py-2.5">
        <h3 className="app-display text-[14px] font-bold text-app-ink">{title}</h3>
        <Link
          href={`${APP_ROUTES.discover}?tab=${tab === "All" ? "" : tab.toLowerCase()}${category !== "All" ? `&category=${encodeURIComponent(category)}` : ""}`}
          className="text-[11px] font-bold text-app-brand hover:underline"
        >
          View All →
        </Link>
      </div>
      {filtered.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-app-dim">No products in this filter.</p>
      ) : (
        <div className="divide-y divide-app-line">
          {filtered.map((product) => {
            const positive = product.performance30d >= 0;
            return (
              <Link
                key={`${title}-${product.id}`}
                href={product.href}
                className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-app-panel"
              >
                <AssetIconStack assetIds={product.assetIds} size={22} max={3} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-bold text-app-ink">
                      {product.name}
                    </p>
                    <span
                      className={[
                        "shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase",
                        product.kind === "Index"
                          ? "bg-[color:var(--color-accent-blue)]/15 text-[color:var(--color-accent-blue)]"
                          : "bg-[color:var(--color-accent-violet)]/15 text-[color:var(--color-accent-violet)]",
                      ].join(" ")}
                    >
                      {product.kind}
                    </span>
                    {product.isNew ? (
                      <span className="shrink-0 rounded bg-app-success/15 px-1 py-px text-[9px] font-bold uppercase text-app-success">
                        New
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] text-app-dim">
                    {product.creatorName.toUpperCase() === "INDEXLA"
                      ? "INDEXLA · Verified"
                      : `${product.creatorName} · Verified · @${product.creatorHandle}`}{" "}
                    · {formatUsd(product.aumUsd, true)}
                  </p>
                </div>
                <p
                  className={[
                    "app-metric shrink-0 text-[13px]",
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
        description="Trending, most invested and new — browse without a wallet."
        action={
          <Link
            href={discoverHref}
            className="text-[13px] font-bold text-app-brand hover:underline"
          >
            View All →
          </Link>
        }
      />

      <div
        className="mb-2.5 flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Marketplace tabs"
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
                "h-8 rounded-full px-3 text-[12px] font-bold transition-colors",
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

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
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

      <div className="grid gap-3 xl:grid-cols-3">
        <Row
          title="Trending Now"
          products={marketplace.trending}
          tab={tab}
          category={category}
          accent="app-accent-bar-cyan"
        />
        <Row
          title="Most Invested"
          products={marketplace.mostInvested}
          tab={tab}
          category={category}
          accent="app-accent-bar-violet"
        />
        <Row
          title="New This Week"
          products={marketplace.newThisWeek}
          tab={tab}
          category={category}
          accent="app-accent-bar-emerald"
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
        "h-7 shrink-0 rounded-full px-2.5 text-[11px] font-semibold transition-colors",
        active
          ? "border border-app-brand/40 bg-app-soft text-app-brand"
          : "border border-app-line bg-app-elevated text-app-muted hover:text-app-ink",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
