"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  DiscoverCatalog,
  DiscoverSort,
  DiscoverTab,
  MarketplaceProduct,
} from "@/lib/domain/marketplace";
import type { MarketplaceCategory, ProductRisk } from "@/lib/domain/dashboard";
import type { NetworkId } from "@/lib/domain/types";
import { MarketplaceProductCard } from "@/components/product/MarketplaceProductCard";
import { ProductDetailPanel } from "@/components/product/ProductDetailPanel";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { APP_ROUTES } from "@/lib/routes";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";

const TABS: { id: DiscoverTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "indexes", label: "Indexes" },
  { id: "portfolios", label: "Portfolios" },
];

const SORTS: { id: DiscoverSort; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "most-invested", label: "Most Invested" },
  { id: "best-performance", label: "Best Performance" },
  { id: "newest", label: "Newest" },
];

type LoadState = "loading" | "ready" | "empty" | "error";

function parseTab(raw: string | null): DiscoverTab {
  if (raw === "indexes" || raw === "portfolios") return raw;
  return "all";
}

function parseSort(raw: string | null): DiscoverSort {
  if (
    raw === "most-invested" ||
    raw === "best-performance" ||
    raw === "newest"
  ) {
    return raw;
  }
  return "trending";
}

function matchesTab(product: MarketplaceProduct, tab: DiscoverTab) {
  if (tab === "all") return true;
  if (tab === "indexes") return product.kind === "Index";
  return product.kind === "Portfolio";
}

function sortProducts(products: MarketplaceProduct[], sort: DiscoverSort) {
  const next = [...products];
  switch (sort) {
    case "most-invested":
      return next.sort((a, b) => b.aumUsd - a.aumUsd);
    case "best-performance":
      return next.sort((a, b) => b.performance30d - a.performance30d);
    case "newest":
      return next.sort((a, b) => Number(b.isNew) - Number(a.isNew));
    case "trending":
    default:
      return next.sort((a, b) => b.likes - a.likes);
  }
}

export function DiscoverView({
  catalog,
  illustrative,
  initialError = false,
}: {
  catalog: DiscoverCatalog;
  illustrative: boolean;
  initialError?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { wallet, connectDemo } = useDemoWallet();

  const [loadState, setLoadState] = useState<LoadState>(
    initialError ? "error" : "loading",
  );
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [tab, setTab] = useState<DiscoverTab>(
    parseTab(searchParams.get("tab")),
  );
  const [sort, setSort] = useState<DiscoverSort>(
    parseSort(searchParams.get("sort")),
  );
  const [category, setCategory] = useState<MarketplaceCategory | "All">(
    (searchParams.get("category") as MarketplaceCategory | null) ?? "All",
  );
  const [network, setNetwork] = useState<NetworkId | "All">(
    (searchParams.get("network") as NetworkId | null) ?? "All",
  );
  const [strategy, setStrategy] = useState(searchParams.get("strategy") ?? "All");
  const [risk, setRisk] = useState<ProductRisk | "All">(
    (searchParams.get("risk") as ProductRisk | null) ?? "All",
  );
  const [featuredOnly, setFeaturedOnly] = useState(
    searchParams.get("filter") === "featured",
  );
  const selectedId = searchParams.get("id");

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => {
      setLoadState(catalog.products.length === 0 ? "empty" : "ready");
    }, 280);
    return () => window.clearTimeout(timer);
  }, [catalog.products.length, initialError]);

  const syncParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value || value === "All" || value === "all") params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = catalog.products.filter((product) => {
      if (!matchesTab(product, tab)) return false;
      if (featuredOnly && !product.featured) return false;
      if (category !== "All" && product.category !== category) return false;
      if (network !== "All" && !product.networkIds.includes(network)) {
        return false;
      }
      if (strategy !== "All" && product.strategy !== strategy) return false;
      if (risk !== "All" && product.risk !== risk) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        product.creatorName.toLowerCase().includes(q) ||
        product.creatorHandle.toLowerCase().includes(q) ||
        product.assetIds.some((id) => id.toLowerCase().includes(q)) ||
        product.thesis.toLowerCase().includes(q)
      );
    });
    return sortProducts(list, sort);
  }, [
    catalog.products,
    tab,
    featuredOnly,
    category,
    network,
    strategy,
    risk,
    query,
    sort,
  ]);

  const selected = useMemo(
    () => catalog.products.find((p) => p.id === selectedId) ?? null,
    [catalog.products, selectedId],
  );

  if (loadState === "loading") {
    return (
      <div className="space-y-4">
        <LoadingSkeleton title="Loading Discover" lines={4} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <LoadingSkeleton lines={5} />
          <LoadingSkeleton lines={5} />
          <LoadingSkeleton lines={5} />
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <ErrorState
        title="Discover unavailable"
        description="Marketplace catalog could not be loaded. Retry or continue browsing illustrative fixtures."
        action={
          <button
            type="button"
            className="app-gradient-btn rounded-[10px] px-4 py-2 text-sm font-bold"
            onClick={() => setLoadState("ready")}
          >
            Retry
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="app-display text-2xl font-bold text-app-ink sm:text-[1.75rem]">
              Discover
            </h1>
            {illustrative ? <IllustrativeBadge compact /> : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-app-muted">
            Explore indexes and portfolios across assets, strategies and chains.
          </p>
        </div>
        <Link
          href={APP_ROUTES.create}
          className="app-gradient-btn inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-[13px] font-bold"
        >
          Create Portfolio / Index
        </Link>
      </header>

      {wallet.state !== "connected" ? (
        <div className="app-panel flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-app-ink">
              Wallet disconnected
            </p>
            <p className="mt-0.5 text-xs text-app-muted">
              Browse indexes and portfolios freely. Connect only for invest,
              follow, tip or customization.
            </p>
          </div>
          <button
            type="button"
            onClick={connectDemo}
            className="h-9 shrink-0 rounded-[10px] bg-app-brand px-4 text-[12px] font-bold text-white"
          >
            Connect Wallet
          </button>
        </div>
      ) : null}

      {selected ? (
        <ProductDetailPanel
          product={selected}
          onClose={() => syncParams({ id: null })}
          walletConnected={wallet.state === "connected"}
          onConnect={connectDemo}
        />
      ) : null}

      <div className="app-panel space-y-3 p-3.5 sm:p-4">
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Discover tabs"
        >
          {TABS.map((item) => {
            const selectedTab = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selectedTab}
                onClick={() => {
                  setTab(item.id);
                  syncParams({ tab: item.id === "all" ? null : item.id });
                }}
                className={[
                  "h-8 rounded-full px-3 text-[12px] font-bold transition-colors",
                  selectedTab
                    ? "bg-app-brand text-white"
                    : "border border-app-line bg-app-elevated text-app-ink/75 hover:text-app-ink",
                ].join(" ")}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 lg:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search portfolios, indexes or assets</span>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                syncParams({ q: e.target.value || null });
              }}
              placeholder="Search portfolios, indexes or assets"
              className="h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm text-app-ink outline-none ring-app-brand/30 placeholder:text-app-dim focus:ring-2"
            />
          </label>
          <label className="shrink-0">
            <span className="sr-only">Sort</span>
            <select
              value={sort}
              onChange={(e) => {
                const next = e.target.value as DiscoverSort;
                setSort(next);
                syncParams({ sort: next === "trending" ? null : next });
              }}
              className="h-10 rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm font-semibold text-app-ink"
            >
              {SORTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Category"
            value={category}
            options={["All", ...catalog.categories]}
            onChange={(value) => {
              setCategory(value as MarketplaceCategory | "All");
              syncParams({ category: value === "All" ? null : value });
            }}
          />
          <FilterSelect
            label="Network"
            value={network}
            options={["All", ...catalog.networks.map((n) => n.id)]}
            optionLabels={{
              All: "All networks",
              ...Object.fromEntries(
                catalog.networks.map((n) => [n.id, n.label]),
              ),
            }}
            onChange={(value) => {
              setNetwork(value as NetworkId | "All");
              syncParams({ network: value === "All" ? null : value });
            }}
          />
          <FilterSelect
            label="Strategy"
            value={strategy}
            options={["All", ...catalog.strategies]}
            onChange={(value) => {
              setStrategy(value);
              syncParams({ strategy: value === "All" ? null : value });
            }}
          />
          <FilterSelect
            label="Risk"
            value={risk}
            options={["All", ...catalog.risks]}
            onChange={(value) => {
              setRisk(value as ProductRisk | "All");
              syncParams({ risk: value === "All" ? null : value });
            }}
          />
          <button
            type="button"
            onClick={() => {
              const next = !featuredOnly;
              setFeaturedOnly(next);
              syncParams({ filter: next ? "featured" : null });
            }}
            className={[
              "h-9 rounded-[10px] border px-3 text-[12px] font-bold",
              featuredOnly
                ? "border-app-brand/40 bg-app-soft text-app-brand"
                : "border-app-line bg-app-elevated text-app-ink/75 hover:text-app-ink",
            ].join(" ")}
          >
            Featured
          </button>
        </div>
      </div>

      <section>
        <SectionHeader
          title="Featured"
          description="Promotional placements across the catalog."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {catalog.featured.map((product) => (
            <MarketplaceProductCard
              key={`featured-${product.id}`}
              product={product}
              featured
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Trending"
          description="High-engagement products in the current period."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {catalog.trending.map((product) => (
            <MarketplaceProductCard
              key={`trending-${product.id}`}
              product={product}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="All products"
          description={`${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
        />
        {filtered.length === 0 ? (
          <EmptyState
            title="No products match"
            description="Try clearing filters or search a different asset, creator or strategy."
            action={
              <button
                type="button"
                className="rounded-[10px] border border-app-line px-3 py-2 text-sm font-bold text-app-brand"
                onClick={() => {
                  setQuery("");
                  setCategory("All");
                  setNetwork("All");
                  setStrategy("All");
                  setRisk("All");
                  setFeaturedOnly(false);
                  setTab("all");
                  syncParams({
                    q: null,
                    category: null,
                    network: null,
                    strategy: null,
                    risk: null,
                    filter: null,
                    tab: null,
                  });
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((product) => (
              <MarketplaceProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  optionLabels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-app-line bg-app-elevated px-2 text-[12px]">
      <span className="font-semibold text-app-dim">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent font-bold text-app-ink outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
