"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { DiscoverCatalog, MarketplaceProduct } from "@/lib/domain/marketplace";
import type { ProductRisk } from "@/lib/domain/dashboard";
import type { NetworkId } from "@/lib/domain/types";
import {
  DEFAULT_FILTER_STATE,
  INDEX_TYPE_TABS,
  NARRATIVES_BY_INDEX_TYPE,
  PRODUCT_TABS,
  RISK_FILTERS,
  SORT_OPTIONS,
  STRATEGY_FILTERS,
  filterMarketplaceProducts,
  type MarketplaceFilterState,
} from "@/lib/domain/marketplace-filters";
import type {
  DiscoverSort,
  IndexType,
  MarketplaceStrategyTag,
  NarrativeId,
  ProductTab,
} from "@/lib/domain/marketplace";
import { DashboardSectionHeading } from "@/components/dashboard/DashboardSectionHeading";
import { MarketplaceProductCard } from "@/components/product/MarketplaceProductCard";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { APP_ROUTES } from "@/lib/routes";

function buildDiscoverHref(state: MarketplaceFilterState): string {
  const params = new URLSearchParams();
  params.set("tab", state.productTab);
  if (state.indexType !== "Crypto") params.set("type", state.indexType);
  if (state.narrative !== "all") params.set("narrative", state.narrative);
  if (state.query) params.set("q", state.query);
  if (state.risk !== "All") params.set("risk", state.risk);
  if (state.network !== "All") params.set("network", state.network);
  if (state.strategy !== "All") params.set("strategy", state.strategy);
  if (state.sort !== "trending") params.set("sort", state.sort);
  const qs = params.toString();
  return `${APP_ROUTES.discover}${qs ? `?${qs}` : ""}`;
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
        if (patch.indexType && patch.indexType !== prev.indexType) {
          next.narrative = "all";
        }
        if (patch.productTab && patch.productTab !== prev.productTab) {
          next.narrative = "all";
        }
        if (syncUrl) {
          syncUrl({
            tab: next.productTab,
            type: next.indexType === "Crypto" ? null : next.indexType,
            narrative: next.narrative === "all" ? null : next.narrative,
            q: next.query || null,
            risk: next.risk === "All" ? null : next.risk,
            network: next.network === "All" ? null : next.network,
            strategy: next.strategy === "All" ? null : next.strategy,
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

  const displayed =
    maxProducts != null ? filtered.slice(0, maxProducts) : filtered;

  const narratives = NARRATIVES_BY_INDEX_TYPE[state.indexType];
  const discoverHref = buildDiscoverHref(state);
  const isDashboard = variant === "dashboard";

  const renderCard = (product: MarketplaceProduct) => (
    <MarketplaceProductCard
      key={product.id}
      product={product}
      compact={isDashboard}
    />
  );

  if (isDashboard) {
    return (
      <section className="space-y-0.5" aria-label="Explore marketplace">
        <header className="mx-auto max-w-2xl text-center">
          <div className="flex justify-center">
            <DashboardSectionHeading
              label="Explore Marketplace"
              tone="explore"
              size="lg"
              as="h2"
            />
          </div>
        </header>

        <div
          className="rounded-[10px] border border-app-line/70 bg-gradient-to-b from-app-elevated/95 to-app-panel/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_16px_-8px_rgba(0,0,0,0.35)]"
          role="group"
          aria-label="Marketplace filters"
        >
          <div className="flex flex-wrap items-center justify-center gap-0.5 border-b border-app-line/35 pb-0.5">
            <SegmentedControl
              ariaLabel="Marketplace product type"
              items={PRODUCT_TABS}
              selected={state.productTab}
              onSelect={(id) => patchState({ productTab: id as ProductTab })}
              size="md"
            />
            <Link
              href={APP_ROUTES.degenClub}
              className="inline-flex h-7 shrink-0 items-center rounded-full border border-app-danger/50 bg-gradient-to-r from-app-danger/20 to-app-warning/12 px-2.5 text-[10px] font-bold text-app-danger shadow-[0_0_8px_-2px_rgba(244,63,94,0.35)]"
            >
              🔥 Degen Club
            </Link>
          </div>

          <div className="border-b border-app-line/35 py-0.5">
            <SegmentedControl
              ariaLabel="Index type"
              items={INDEX_TYPE_TABS}
              selected={state.indexType}
              onSelect={(id) => patchState({ indexType: id as IndexType })}
              size="sm"
            />
          </div>

          <div className="border-b border-app-line/35 py-0.5">
            <ChipRow
              items={narratives}
              selected={state.narrative}
              onSelect={(id) => patchState({ narrative: id as NarrativeId })}
              compact
            />
          </div>

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
            <FilterSelect
              label="Risk"
              value={state.risk}
              options={RISK_FILTERS}
              onChange={(value) =>
                patchState({ risk: value as ProductRisk | "All" })
              }
              compact
            />
            <FilterSelect
              label="Network"
              value={state.network}
              options={["All", ...catalog.networks.map((n) => n.id)]}
              optionLabels={{
                All: "All networks",
                ...Object.fromEntries(
                  catalog.networks.map((n) => [n.id, n.label]),
                ),
              }}
              onChange={(value) =>
                patchState({ network: value as NetworkId | "All" })
              }
              compact
            />
            <FilterSelect
              label="Strategy"
              value={state.strategy}
              options={STRATEGY_FILTERS.map((s) => s.id)}
              optionLabels={Object.fromEntries(
                STRATEGY_FILTERS.map((s) => [s.id, s.label]),
              )}
              onChange={(value) =>
                patchState({
                  strategy: value as MarketplaceStrategyTag | "All",
                })
              }
              compact
            />
            <span className="inline-flex h-6 items-center px-1 text-[9px] font-semibold text-app-dim">
              {filtered.length} results
            </span>
            <IllustrativeBadge compact />
          </div>
        </div>

        {displayed.length === 0 ? (
          <p className="app-panel px-3 py-3 text-center text-[12px] text-app-muted">
            No products match these filters. Try another narrative or risk level.
          </p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
            {displayed.map((product) => renderCard(product))}
          </div>
        )}

        <div className="flex justify-center">
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
      <div className="app-panel mx-auto max-w-5xl space-y-3 border border-app-line/80 bg-gradient-to-b from-app-elevated/90 to-app-panel/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-4">
        <div className="border-b border-app-line/70 pb-3 text-center">
          <h2 className="app-display text-xl font-bold text-app-ink sm:text-2xl">
            Explore Marketplace
          </h2>
          <p className="mx-auto mt-1 max-w-xl text-xs text-app-muted sm:text-sm">
            Discover INDEXLA indexes and portfolios across crypto, tokenized
            assets and hybrid strategies.
          </p>
        </div>

        <FilterRow label="Product">
          <SegmentedControl
            ariaLabel="Marketplace product type"
            items={PRODUCT_TABS}
            selected={state.productTab}
            onSelect={(id) => patchState({ productTab: id as ProductTab })}
            size="lg"
          />
        </FilterRow>

        <FilterRow label="Type">
          <SegmentedControl
            ariaLabel="Index type"
            items={INDEX_TYPE_TABS}
            selected={state.indexType}
            onSelect={(id) => patchState({ indexType: id as IndexType })}
          />
        </FilterRow>

        <FilterRow label="Narrative">
          <ChipRow
            items={narratives}
            selected={state.narrative}
            onSelect={(id) => patchState({ narrative: id as NarrativeId })}
          />
        </FilterRow>

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
                className="h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm text-app-ink outline-none ring-app-brand/30 placeholder:text-app-dim focus:ring-2"
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

          <div className="mt-2 flex flex-wrap gap-2">
            <FilterSelect
              label="Risk"
              value={state.risk}
              options={RISK_FILTERS}
              onChange={(value) =>
                patchState({ risk: value as ProductRisk | "All" })
              }
            />
            <FilterSelect
              label="Network"
              value={state.network}
              options={["All", ...catalog.networks.map((n) => n.id)]}
              optionLabels={{
                All: "All networks",
                ...Object.fromEntries(
                  catalog.networks.map((n) => [n.id, n.label]),
                ),
              }}
              onChange={(value) =>
                patchState({ network: value as NetworkId | "All" })
              }
            />
            <FilterSelect
              label="Strategy"
              value={state.strategy}
              options={STRATEGY_FILTERS.map((s) => s.id)}
              optionLabels={Object.fromEntries(
                STRATEGY_FILTERS.map((s) => [s.id, s.label]),
              )}
              onChange={(value) =>
                patchState({
                  strategy: value as MarketplaceStrategyTag | "All",
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] font-semibold text-app-muted sm:text-xs">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
          {maxProducts != null && filtered.length > maxProducts
            ? ` · showing ${maxProducts}`
            : ""}
        </p>
        <IllustrativeBadge compact />
      </div>

      {displayed.length === 0 ? (
        <p className="app-panel px-4 py-8 text-center text-sm text-app-muted">
          No products match these filters. Try another narrative, risk level or
          search term.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {displayed.map((product) => renderCard(product))}
        </div>
      )}
    </section>
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
              compact ? "h-6 px-2 text-[9px] sm:text-[10px]" : "h-7 px-2.5 text-[10px] sm:text-[11px]",
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
        compact ? "h-7 px-1.5 text-[10px]" : "h-9 gap-1.5 px-2 text-[11px] sm:text-[12px]",
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
