"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { DiscoverCatalog, MarketplaceProduct } from "@/lib/domain/marketplace";
import {
  ASSET_CATEGORY_TABS,
  DEFAULT_FILTER_STATE,
  PRODUCT_TABS,
  SORT_OPTIONS,
  filterMarketplaceProducts,
  narrativeOptionsForCategory,
  type AssetCategory,
  type MarketplaceFilterState,
} from "@/lib/domain/marketplace-filters";
import type { DiscoverSort, NarrativeId, ProductTab } from "@/lib/domain/marketplace";
import { MarketplaceProductCard } from "@/components/product/MarketplaceProductCard";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { splitMarketplaceByOrigin } from "@/lib/product/product-type";
import { APP_ROUTES } from "@/lib/routes";

function buildDiscoverHref(state: MarketplaceFilterState): string {
  const params = new URLSearchParams();
  params.set("tab", state.productTab);
  if (state.assetCategory !== "All") params.set("type", state.assetCategory);
  if (state.productTab === "indexes" && state.narrative !== "all") {
    params.set("narrative", state.narrative);
  }
  if (state.query) params.set("q", state.query);
  if (state.sort !== "trending") params.set("sort", state.sort);
  const qs = params.toString();
  return `${APP_ROUTES.discover}${qs ? `?${qs}` : ""}`;
}

function MarketplaceTitle({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={[
        "mx-auto text-center",
        compact ? "max-w-xl" : "max-w-2xl",
      ].join(" ")}
    >
      <div
        className={[
          "rounded-[14px] border border-app-line/60 bg-gradient-to-b from-app-elevated via-app-panel to-app-soft/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_36px_-16px_rgba(0,0,0,0.45)]",
          compact ? "px-3 py-2" : "px-4 py-3 sm:px-5 sm:py-3.5",
        ].join(" ")}
      >
        <h2
          className={[
            "app-display font-bold tracking-tight text-app-ink",
            compact ? "text-lg sm:text-xl" : "text-2xl sm:text-[1.75rem]",
          ].join(" ")}
        >
          Marketplace
        </h2>
      </div>
    </div>
  );
}

function ProductOriginSections({
  products,
  compact,
  maxProducts,
}: {
  products: MarketplaceProduct[];
  compact?: boolean;
  maxProducts?: number;
}) {
  const { indexla, creator } = splitMarketplaceByOrigin(products);
  let indexlaShown = indexla;
  let creatorShown = creator;

  if (maxProducts != null) {
    indexlaShown = indexla.slice(0, maxProducts);
    const remaining = Math.max(0, maxProducts - indexlaShown.length);
    creatorShown = creator.slice(0, remaining);
  }

  if (indexlaShown.length === 0 && creatorShown.length === 0) {
    return (
      <p className="app-panel px-3 py-3 text-center text-[12px] text-app-muted">
        No products match these filters. Try another category or narrative.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {indexlaShown.length > 0 ? (
        <ProductSection
          title="INDEXLA"
          products={indexlaShown}
          compact={compact}
        />
      ) : null}
      {creatorShown.length > 0 ? (
        <ProductSection
          title="Creator Products"
          products={creatorShown}
          compact={compact}
        />
      ) : null}
    </div>
  );
}

function ProductSection({
  title,
  products,
  compact,
}: {
  title: string;
  products: MarketplaceProduct[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-0.5">
        <h3
          className={[
            "app-display font-bold uppercase tracking-wider text-app-ink",
            compact ? "text-[10px]" : "text-xs sm:text-sm",
          ].join(" ")}
        >
          {title}
        </h3>
        <span className="h-px flex-1 bg-gradient-to-r from-app-line/80 to-transparent" />
        <span className="text-[10px] font-semibold text-app-dim">
          {products.length}
        </span>
      </div>
      <div
        className={[
          "grid gap-1",
          compact ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3 gap-2",
        ].join(" ")}
      >
        {products.map((product) => (
          <MarketplaceProductCard
            key={product.id}
            product={product}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

export function MarketplaceExplorer({
  catalog,
  variant = "dashboard",
  maxProducts,
  initialState,
  syncUrl,
}: {
  catalog: DiscoverCatalog;
  variant?: "dashboard" | "discover";
  maxProducts?: number;
  initialState?: Partial<MarketplaceFilterState>;
  syncUrl?: (patch: Record<string, string | null>) => void;
}) {
  const [state, setState] = useState<MarketplaceFilterState>({
    ...DEFAULT_FILTER_STATE,
    ...initialState,
  });

  const patchState = useCallback(
    (patch: Partial<MarketplaceFilterState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        if (
          patch.assetCategory != null &&
          patch.assetCategory !== prev.assetCategory
        ) {
          next.narrative = "all";
        }
        if (patch.productTab && patch.productTab !== prev.productTab) {
          next.narrative = "all";
        }
        if (syncUrl) {
          syncUrl({
            tab: next.productTab,
            type: next.assetCategory === "All" ? null : next.assetCategory,
            narrative:
              next.productTab === "indexes" && next.narrative !== "all"
                ? next.narrative
                : null,
            q: next.query || null,
            sort: next.sort === "trending" ? null : next.sort,
          });
        }
        return next;
      });
    },
    [syncUrl],
  );

  const filtered = useMemo(
    () => filterMarketplaceProducts(catalog.products, state),
    [catalog.products, state],
  );

  const narratives = narrativeOptionsForCategory(state.assetCategory);
  const showNarratives =
    state.productTab === "indexes" && state.assetCategory !== "All";
  const discoverHref = buildDiscoverHref(state);
  const isDashboard = variant === "dashboard";

  if (isDashboard) {
    return (
      <section className="space-y-1" aria-label="Marketplace">
        <header>
          <MarketplaceTitle compact />
        </header>

        <div
          className="rounded-[10px] border border-app-line/70 bg-gradient-to-b from-app-elevated/95 to-app-panel/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_16px_-8px_rgba(0,0,0,0.35)]"
          role="group"
          aria-label="Marketplace filters"
        >
          <div className="border-b border-app-line/35 p-1">
            <PrimaryProductTabs
              selected={state.productTab}
              onSelect={(id) => patchState({ productTab: id as ProductTab })}
              compact
            />
          </div>

          <div className="border-b border-app-line/35 py-0.5">
            <SegmentedControl
              ariaLabel="Asset category"
              items={ASSET_CATEGORY_TABS}
              selected={state.assetCategory}
              onSelect={(id) =>
                patchState({ assetCategory: id as AssetCategory })
              }
              size="sm"
            />
          </div>

          {showNarratives ? (
            <div className="border-b border-app-line/35 py-0.5">
              <ChipRow
                items={narratives}
                selected={state.narrative}
                onSelect={(id) => patchState({ narrative: id as NarrativeId })}
                compact
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-0.5 pt-0.5">
            <FilterSelect
              label="Sort"
              value={state.sort}
              options={SORT_OPTIONS.map((s) => s.id)}
              optionLabels={Object.fromEntries(
                SORT_OPTIONS.map((s) => [s.id, s.label]),
              )}
              onChange={(value) => patchState({ sort: value as DiscoverSort })}
              compact
            />
            <span className="inline-flex h-6 items-center px-1 text-[9px] font-semibold text-app-dim">
              {filtered.length} results
            </span>
            <IllustrativeBadge compact />
          </div>
        </div>

        <ProductOriginSections
          products={filtered}
          compact
          maxProducts={maxProducts}
        />

        <div className="flex justify-center pt-0.5">
          <Link
            href={discoverHref}
            className="app-gradient-btn inline-flex h-8 items-center justify-center rounded-[8px] px-3.5 text-[10px] font-bold"
          >
            View All
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <MarketplaceTitle />

      <div className="app-panel mx-auto max-w-5xl space-y-3 border border-app-line/80 bg-gradient-to-b from-app-elevated/90 to-app-panel/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-4">
        <PrimaryProductTabs
          selected={state.productTab}
          onSelect={(id) => patchState({ productTab: id as ProductTab })}
        />

        <FilterRow label="Asset category">
          <SegmentedControl
            ariaLabel="Asset category"
            items={ASSET_CATEGORY_TABS}
            selected={state.assetCategory}
            onSelect={(id) =>
              patchState({ assetCategory: id as AssetCategory })
            }
          />
        </FilterRow>

        {showNarratives ? (
          <FilterRow label="Index narrative">
            <ChipRow
              items={narratives}
              selected={state.narrative}
              onSelect={(id) => patchState({ narrative: id as NarrativeId })}
            />
          </FilterRow>
        ) : null}

        <div className="rounded-[12px] border border-app-line/60 bg-app-soft/40 p-2.5 sm:p-3">
          <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
            <label className="relative min-w-0">
              <span className="sr-only">Search by index name or asset</span>
              <input
                value={state.query}
                onChange={(e) => {
                  const query = e.target.value;
                  setState((prev) => ({ ...prev, query }));
                  syncUrl?.({ q: query || null });
                }}
                placeholder="Search by index name or asset"
                className="app-input h-10 w-full px-3 text-sm"
              />
            </label>
            <FilterSelect
              label="Sort"
              value={state.sort}
              options={SORT_OPTIONS.map((s) => s.id)}
              optionLabels={Object.fromEntries(
                SORT_OPTIONS.map((s) => [s.id, s.label]),
              )}
              onChange={(value) => patchState({ sort: value as DiscoverSort })}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] font-semibold text-app-muted sm:text-xs">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
        </p>
        <IllustrativeBadge compact />
      </div>

      <ProductOriginSections products={filtered} />
    </section>
  );
}

function PrimaryProductTabs({
  selected,
  onSelect,
  compact = false,
}: {
  selected: ProductTab;
  onSelect: (id: ProductTab) => void;
  compact?: boolean;
}) {
  const styles: Record<
    ProductTab,
    { fill: string; fillMuted: string; glow: string; border: string }
  > = {
    indexes: {
      fill: "#2563EB",
      fillMuted: "rgba(37,99,235,0.38)",
      glow: "rgba(37,99,235,0.55)",
      border: "rgba(96,165,250,0.65)",
    },
    portfolios: {
      fill: "#7C3AED",
      fillMuted: "rgba(124,58,237,0.38)",
      glow: "rgba(124,58,237,0.55)",
      border: "rgba(167,139,250,0.65)",
    },
  };

  return (
    <div
      className={[
        "grid grid-cols-2",
        compact ? "gap-2" : "gap-2.5 sm:gap-3",
      ].join(" ")}
      role="tablist"
      aria-label="Marketplace product type"
    >
      {PRODUCT_TABS.map((tab) => {
        const active = tab.id === selected;
        const tone = styles[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.id)}
            className={[
              "rounded-[14px] font-bold uppercase tracking-[0.14em] text-white transition-all",
              compact
                ? "min-h-[48px] px-3 py-3 text-[12px] sm:text-[13px]"
                : "min-h-[64px] px-4 py-4 text-base sm:min-h-[72px] sm:text-lg",
            ].join(" ")}
            style={{
              background: active
                ? `linear-gradient(145deg, ${tone.fill} 0%, color-mix(in srgb, ${tone.fill} 72%, #000) 100%)`
                : `linear-gradient(145deg, ${tone.fillMuted} 0%, color-mix(in srgb, ${tone.fill} 22%, #111) 100%)`,
              border: `2px solid ${active ? tone.border : "rgba(255,255,255,0.12)"}`,
              boxShadow: active
                ? `inset 0 1px 0 rgba(255,255,255,0.28), 0 12px 28px -8px ${tone.glow}`
                : "inset 0 1px 0 rgba(255,255,255,0.08)",
              opacity: active ? 1 : 0.82,
              transform: active ? "scale(1.02)" : "scale(1)",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-app-line/50 bg-app-elevated/50 px-2.5 py-2 sm:px-3">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-app-dim">
        {label}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {children}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  ariaLabel,
  items,
  selected,
  onSelect,
  size = "md",
}: {
  ariaLabel: string;
  items: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
  size?: "sm" | "md" | "lg";
}) {
  const h =
    size === "lg" ? "h-10 sm:h-11" : size === "sm" ? "h-7" : "h-8 sm:h-9";
  const text =
    size === "lg"
      ? "text-[13px] sm:text-sm"
      : size === "sm"
        ? "text-[10px] sm:text-[11px]"
        : "text-[11px] sm:text-xs";
  const pad = size === "sm" ? "px-2 sm:px-2.5" : "px-3 sm:px-4";

  return (
    <div
      className="inline-flex flex-wrap justify-center gap-0.5 rounded-full border border-app-line/60 bg-app-panel/90 p-0.5"
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active = item.id === selected;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(item.id)}
            className={[
              "rounded-full font-bold transition-all",
              h,
              text,
              pad,
              active
                ? "bg-gradient-to-r from-app-brand to-[color:var(--color-accent-cyan)] text-white shadow-[0_0_12px_-2px_rgba(59,130,246,0.45)]"
                : "text-app-muted hover:bg-app-soft hover:text-app-ink",
            ].join(" ")}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function ChipRow<T extends string>({
  items,
  selected,
  onSelect,
  compact = false,
}: {
  items: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-0.5">
      {items.map((item) => {
        const active = item.id === selected;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={[
              "shrink-0 rounded-full font-semibold transition-colors",
              compact
                ? "h-6 px-2 text-[9px] sm:text-[10px]"
                : "h-7 px-2.5 text-[10px] sm:text-[11px]",
              active
                ? "border border-app-brand/55 bg-gradient-to-r from-app-brand/20 to-[color:var(--color-accent-cyan)]/15 text-app-brand shadow-[0_0_8px_-2px_rgba(59,130,246,0.4)]"
                : "border border-app-line/70 bg-app-elevated text-app-muted hover:border-app-brand/30 hover:text-app-ink",
            ].join(" ")}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  optionLabels,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={[
        "inline-flex min-w-0 items-center gap-1 rounded-[8px] border border-app-line/70 bg-app-elevated font-semibold",
        compact
          ? "h-7 px-1.5 text-[10px]"
          : "h-9 gap-1.5 px-2 text-[11px] sm:text-[12px]",
      ].join(" ")}
    >
      <span className="shrink-0 text-app-dim">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[7rem] truncate bg-transparent font-bold text-app-ink outline-none sm:max-w-none"
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
