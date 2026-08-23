"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  MarketplaceStrategyCard,
  MyStrategyRecord,
  PublishStrategyDraft,
  StrategiesTab,
  StrategiesWorkspace,
  StrategyCategory,
  StrategySort,
  StrategyTypeLabel,
} from "@/lib/domain/strategies";
import type { NetworkId } from "@/lib/domain/types";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { ProductAttribution } from "@/components/product/ProductIdentity";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  UtilityGateState,
} from "@/components/states/AppStates";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import {
  formatDexla,
  formatPercent,
  formatUsd,
} from "@/lib/dashboard/data";
import { getClientFeatureFlags, getFeatureFlags } from "@/lib/feature-flags";
import { APP_ROUTES } from "@/lib/routes";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import {
  PreviewOnlyMessage,
  formatPreviewOnly,
} from "@/components/ui/PreviewOnlyMessage";

const TABS: { id: StrategiesTab; label: string }[] = [
  { id: "marketplace", label: "Marketplace" },
  { id: "mine", label: "My Strategies" },
  { id: "publish", label: "Publish Strategy" },
];

const SORTS: { id: StrategySort; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "most-used", label: "Most Used" },
  { id: "newest", label: "Newest" },
  { id: "performance", label: "Performance" },
];

type ViewState = "loading" | "ready" | "error";

export function StrategiesView({
  workspace,
  illustrative,
  initialError = false,
}: {
  workspace: StrategiesWorkspace;
  illustrative: boolean;
  initialError?: boolean;
}) {
  const { wallet, connectDemo } = useDemoWallet();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const flags = getFeatureFlags();
  const clientFlags = getClientFeatureFlags();

  const [viewState, setViewState] = useState<ViewState>(
    initialError ? "error" : "loading",
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StrategyCategory | "All">("All");
  const [strategyType, setStrategyType] = useState<StrategyTypeLabel | "All">(
    "All",
  );
  const [risk, setRisk] = useState<"All" | "low" | "medium" | "high" | "extreme">(
    "All",
  );
  const [network, setNetwork] = useState<NetworkId | "All">("All");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sort, setSort] = useState<StrategySort>("popular");
  const [message, setMessage] = useState<string | null>(null);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(
    () =>
      new Set(
        workspace.marketplace
          .filter((s) => s.alreadyOwnedByCreator)
          .map((s) => s.id),
      ),
  );
  const [roleCreator, setRoleCreator] = useState(true);
  const [publish, setPublish] = useState<PublishStrategyDraft>(
    workspace.publishDefaults,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    workspace.marketplace[0]?.id ?? null,
  );
  const [focusHighlight, setFocusHighlight] = useState(false);

  const tab = (searchParams.get("tab") as StrategiesTab | null) ?? "marketplace";
  const focusId = searchParams.get("focus");

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => setViewState("ready"), 280);
    return () => window.clearTimeout(timer);
  }, [initialError]);

  useEffect(() => {
    if (!focusId || viewState !== "ready") return;
    const exists = workspace.marketplace.some((s) => s.id === focusId);
    if (!exists) return;
    setSelectedId(focusId);
    setFocusHighlight(true);
    if (tab !== "marketplace") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      params.set("focus", focusId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    const timer = window.setTimeout(() => {
      document
        .getElementById(`strategy-card-${focusId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      document
        .getElementById("strategy-detail-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    focusId,
    viewState,
    workspace.marketplace,
    tab,
    pathname,
    router,
    searchParams,
  ]);

  function syncTab(next: StrategiesTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "marketplace") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function preview(action: string) {
    setMessage(formatPreviewOnly(action));
  }

  const filtered = useMemo(() => {
    let list = [...workspace.marketplace];
    if (featuredOnly) list = list.filter((s) => s.featured);
    if (category !== "All") list = list.filter((s) => s.category === category);
    if (strategyType !== "All") {
      list = list.filter((s) => s.strategyType === strategyType);
    }
    if (risk !== "All") list = list.filter((s) => s.riskLevel === risk);
    if (network !== "All") {
      list = list.filter((s) => s.networkIds.includes(network));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.creatorName.toLowerCase().includes(q) ||
          s.creatorHandle.toLowerCase().includes(q) ||
          s.logicSummary.toLowerCase().includes(q),
      );
    }
    switch (sort) {
      case "most-used":
        return list.sort((a, b) => b.activePortfolios - a.activePortfolios);
      case "newest":
        return list.sort((a, b) => Number(b.isNew) - Number(a.isNew));
      case "performance":
        return list.sort((a, b) => b.performance30d - a.performance30d);
      case "popular":
      default:
        return list.sort((a, b) => b.executions30d - a.executions30d);
    }
  }, [
    workspace.marketplace,
    featuredOnly,
    category,
    strategyType,
    risk,
    network,
    query,
    sort,
  ]);

  const selected =
    workspace.marketplace.find((s) => s.id === selectedId) ?? filtered[0] ?? null;

  if (viewState === "loading") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <LoadingSkeleton title="Loading Strategies" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <Header illustrative={illustrative} />
        <ErrorState
          title="Strategies unavailable"
          description="Unable to load strategy marketplace data."
          action={
            <button
              type="button"
              className="app-gradient-btn rounded-[10px] px-4 py-2 text-sm font-bold"
              onClick={() => setViewState("ready")}
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-5" style={{ maxWidth: "var(--content-max)" }}>
      <Header illustrative={illustrative} />

      {wallet.state !== "connected" ? (
        <div className="app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-app-ink">Wallet disconnected</p>
            <p className="mt-0.5 text-xs text-app-muted">
              Browse strategies freely. Connect for purchase, publish and claim
              previews.
            </p>
          </div>
          <button
            type="button"
            onClick={connectDemo}
            className="h-9 rounded-[10px] bg-app-brand px-4 text-[12px] font-bold text-white"
          >
            Connect Wallet
          </button>
        </div>
      ) : null}

      <div
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Strategies tabs"
      >
        {TABS.map((item) => {
          const selectedTab = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selectedTab}
              onClick={() => syncTab(item.id)}
              className={[
                "h-8 rounded-full px-3 text-[12px] font-bold",
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

      {message ? <PreviewOnlyMessage>{message}</PreviewOnlyMessage> : null}

      <UtilityGateState
        featureName="Private Strategy Payments"
        demoMode={flags.DEXLA_DEMO_MODE || clientFlags.DEXLA_DEMO_MODE}
      />

      {tab === "marketplace" ? (
        <MarketplaceTab
          workspace={workspace}
          filtered={filtered}
          selected={selected}
          focusHighlight={focusHighlight}
          focusId={focusId}
          query={query}
          setQuery={setQuery}
          category={category}
          setCategory={setCategory}
          strategyType={strategyType}
          setStrategyType={setStrategyType}
          risk={risk}
          setRisk={setRisk}
          network={network}
          setNetwork={setNetwork}
          featuredOnly={featuredOnly}
          setFeaturedOnly={setFeaturedOnly}
          sort={sort}
          setSort={setSort}
          roleCreator={roleCreator}
          setRoleCreator={setRoleCreator}
          ownedIds={ownedIds}
          paymentsEnabled={flags.PRIVATE_STRATEGY_PAYMENTS_ENABLED}
          demoBalance={workspace.demoDexlaBalance}
          onSelect={setSelectedId}
          onPurchase={(strategy) => {
            if (!flags.PRIVATE_STRATEGY_PAYMENTS_ENABLED) {
              preview("Purchase gated by feature flag");
              return;
            }
            if (ownedIds.has(strategy.id)) {
              preview("Already owned");
              return;
            }
            const price = strategy.accessPriceDexla ?? 0;
            if (price > workspace.demoDexlaBalance) {
              preview(
                `Insufficient $DEXLA — need ${formatDexla(price)}, have ${formatDexla(workspace.demoDexlaBalance)}`,
              );
              return;
            }
            setOwnedIds((prev) => new Set(prev).add(strategy.id));
            preview(`Purchase Creator Access · ${formatDexla(price)}`);
          }}
          onCopy={(strategy) => preview(`Copy Strategy · ${strategy.name}`)}
          onUse={(strategy) => preview(`Use in Portfolio · ${strategy.name}`)}
          onView={(strategy) => {
            setSelectedId(strategy.id);
            preview(`View Strategy · ${strategy.name}`);
          }}
        />
      ) : null}

      {tab === "mine" ? (
        <MyStrategiesTab
          items={workspace.myStrategies}
          onAction={(action, item) => preview(`${action} · ${item.name}`)}
        />
      ) : null}

      {tab === "publish" ? (
        <PublishTab
          workspace={workspace}
          draft={publish}
          setDraft={setPublish}
          paymentsEnabled={flags.PRIVATE_STRATEGY_PAYMENTS_ENABLED}
          onSave={() => preview("Save Draft")}
          onPublish={() => {
            if (!flags.PRIVATE_STRATEGY_PAYMENTS_ENABLED) {
              preview("Publish gated by feature flag");
              return;
            }
            if (workspace.listingFeeDexla > workspace.demoDexlaBalance) {
              preview(
                `Insufficient $DEXLA for listing fee — need ${formatDexla(workspace.listingFeeDexla)}`,
              );
              return;
            }
            if (!publish.name.trim() || !publish.logic.trim()) {
              preview("Complete required fields before publish");
              return;
            }
            preview(
              `Publish Strategy · listing fee ${formatDexla(workspace.listingFeeDexla)} burned`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

function Header({ illustrative }: { illustrative: boolean }) {
  return (
    <header>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="app-display text-2xl font-bold text-app-ink sm:text-[1.75rem]">
          Strategies
        </h1>
        {illustrative ? <IllustrativeBadge compact /> : null}
      </div>
      <p className="mt-1 text-sm text-app-muted">
        Marketplace, owned strategies and publishing — $DEXLA amounts stay
        separate from USD.
      </p>
    </header>
  );
}

function MarketplaceTab({
  workspace,
  filtered,
  selected,
  focusHighlight,
  focusId,
  query,
  setQuery,
  category,
  setCategory,
  strategyType,
  setStrategyType,
  risk,
  setRisk,
  network,
  setNetwork,
  featuredOnly,
  setFeaturedOnly,
  sort,
  setSort,
  roleCreator,
  setRoleCreator,
  ownedIds,
  paymentsEnabled,
  demoBalance,
  onSelect,
  onPurchase,
  onCopy,
  onUse,
  onView,
}: {
  workspace: StrategiesWorkspace;
  filtered: MarketplaceStrategyCard[];
  selected: MarketplaceStrategyCard | null;
  focusHighlight: boolean;
  focusId: string | null;
  query: string;
  setQuery: (v: string) => void;
  category: StrategyCategory | "All";
  setCategory: (v: StrategyCategory | "All") => void;
  strategyType: StrategyTypeLabel | "All";
  setStrategyType: (v: StrategyTypeLabel | "All") => void;
  risk: "All" | "low" | "medium" | "high" | "extreme";
  setRisk: (v: "All" | "low" | "medium" | "high" | "extreme") => void;
  network: NetworkId | "All";
  setNetwork: (v: NetworkId | "All") => void;
  featuredOnly: boolean;
  setFeaturedOnly: (v: boolean) => void;
  sort: StrategySort;
  setSort: (v: StrategySort) => void;
  roleCreator: boolean;
  setRoleCreator: (v: boolean) => void;
  ownedIds: Set<string>;
  paymentsEnabled: boolean;
  demoBalance: number;
  onSelect: (id: string) => void;
  onPurchase: (s: MarketplaceStrategyCard) => void;
  onCopy: (s: MarketplaceStrategyCard) => void;
  onUse: (s: MarketplaceStrategyCard) => void;
  onView: (s: MarketplaceStrategyCard) => void;
}) {
  const featured = workspace.marketplace.filter((s) => s.featured);

  return (
    <section className="space-y-4">
      <div className="app-panel space-y-3 p-4">
        <div className="flex flex-col gap-2 lg:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search strategies or creators"
            className="h-10 flex-1 rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as StrategySort)}
            className="h-10 rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm font-semibold"
          >
            {SORTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Category"
            value={category}
            options={["All", ...workspace.categories]}
            onChange={(v) => setCategory(v as StrategyCategory | "All")}
          />
          <FilterSelect
            label="Type"
            value={strategyType}
            options={["All", ...workspace.strategyTypes]}
            onChange={(v) => setStrategyType(v as StrategyTypeLabel | "All")}
          />
          <FilterSelect
            label="Risk"
            value={risk}
            options={["All", ...workspace.risks]}
            onChange={(v) =>
              setRisk(v as "All" | "low" | "medium" | "high" | "extreme")
            }
          />
          <FilterSelect
            label="Network"
            value={network}
            options={["All", ...workspace.networks]}
            onChange={(v) => setNetwork(v as NetworkId | "All")}
          />
          <button
            type="button"
            onClick={() => setFeaturedOnly(!featuredOnly)}
            className={[
              "h-9 rounded-[10px] border px-3 text-[12px] font-bold",
              featuredOnly
                ? "border-app-brand/40 bg-app-soft text-app-brand"
                : "border-app-line text-app-ink/75",
            ].join(" ")}
          >
            Featured
          </button>
          <label className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-app-line px-3 text-[12px] font-semibold">
            <input
              type="checkbox"
              checked={roleCreator}
              onChange={(e) => setRoleCreator(e.target.checked)}
            />
            Act as creator
          </label>
        </div>
        <p className="text-[11px] text-app-dim">
          INDEXLA strategies are free. Investors use creator strategies through
          portfolios without purchase. Paid reuse is creator-to-creator only.
          Demo $DEXLA balance: {formatDexla(demoBalance)}.
        </p>
      </div>

      <div>
        <h2 className="app-display text-lg font-bold text-app-ink">Featured</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {featured.map((strategy) => (
            <StrategyCard
              key={`feat-${strategy.id}`}
              strategy={strategy}
              highlighted={focusHighlight && focusId === strategy.id}
              roleCreator={roleCreator}
              owned={ownedIds.has(strategy.id)}
              paymentsEnabled={paymentsEnabled}
              onSelect={() => onSelect(strategy.id)}
              onPurchase={() => onPurchase(strategy)}
              onCopy={() => onCopy(strategy)}
              onUse={() => onUse(strategy)}
              onView={() => onView(strategy)}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div>
          <h2 className="app-display text-lg font-bold text-app-ink">
            All strategies
          </h2>
          {filtered.length === 0 ? (
            <div className="mt-2">
              <EmptyState
                title="No strategies match"
                description="Clear filters or search a different strategy name."
              />
            </div>
          ) : (
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {filtered.map((strategy) => (
                <StrategyCard
                  key={strategy.id}
                  strategy={strategy}
                  domId={`strategy-card-${strategy.id}`}
                  highlighted={focusHighlight && focusId === strategy.id}
                  roleCreator={roleCreator}
                  owned={ownedIds.has(strategy.id)}
                  paymentsEnabled={paymentsEnabled}
                  onSelect={() => onSelect(strategy.id)}
                  onPurchase={() => onPurchase(strategy)}
                  onCopy={() => onCopy(strategy)}
                  onUse={() => onUse(strategy)}
                  onView={() => onView(strategy)}
                />
              ))}
            </div>
          )}
        </div>

        {selected ? (
          <aside
            id="strategy-detail-panel"
            className={[
              "app-panel h-fit space-y-3 p-4",
              focusHighlight && focusId === selected.id
                ? "ring-2 ring-app-brand/50"
                : "",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-app-ink">{selected.name}</h3>
              {selected.isIllustrative ? <IllustrativeBadge compact /> : null}
            </div>
            <ProductAttribution
              creatorName={selected.creatorName}
              creatorHandle={selected.creatorHandle}
              verified={selected.verified}
            />
            <p className="text-sm text-app-muted">{selected.description}</p>
            <p className="text-sm text-app-ink">
              <span className="font-semibold">Logic:</span> {selected.logicSummary}
            </p>
            <MiniLineChart points={selected.chartSeries} height={120} />
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <Stat label="30D perf" value={formatPercent(selected.performance30d, true)} />
              <Stat label="Executions" value={String(selected.executions30d)} />
              <Stat label="Active portfolios" value={String(selected.activePortfolios)} />
              <Stat label="Automation" value={selected.automationHealth} />
              <Stat
                label="Networks"
                value={selected.networkIds.join(", ")}
              />
              <Stat
                label="Assets"
                value={selected.compatibleAssets.join(", ")}
              />
              <Stat
                label="Access"
                value={
                  selected.accessPriceDexla == null
                    ? "Free"
                    : formatDexla(selected.accessPriceDexla)
                }
              />
              <Stat
                label="Fee share"
                value={`${selected.executionFeeSharePercent}%`}
              />
            </dl>
            {!selected.isIndexlaCore ? (
              <p className="rounded-[10px] border border-app-line bg-app-soft px-3 py-2 text-[11px] text-app-muted">
                Access payments: {selected.accessSplitCreatorPercent}% creator /{" "}
                {selected.accessSplitBurnPercent}% burned. Strategy creator
                receives {selected.executionFeeSharePercent}% of applicable
                execution fees when another creator uses the strategy.
              </p>
            ) : (
              <p className="rounded-[10px] border border-app-line bg-app-soft px-3 py-2 text-[11px] text-app-muted">
                INDEXLA core strategy — free for investors and creators.
              </p>
            )}
            <Link
              href={APP_ROUTES.create}
              className="inline-flex h-9 items-center rounded-[10px] border border-app-line px-3 text-xs font-bold text-app-brand"
            >
              Open Create flow
            </Link>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function StrategyCard({
  strategy,
  domId,
  highlighted = false,
  roleCreator,
  owned,
  paymentsEnabled,
  onSelect,
  onPurchase,
  onCopy,
  onUse,
  onView,
}: {
  strategy: MarketplaceStrategyCard;
  domId?: string;
  highlighted?: boolean;
  roleCreator: boolean;
  owned: boolean;
  paymentsEnabled: boolean;
  onSelect: () => void;
  onPurchase: () => void;
  onCopy: () => void;
  onUse: () => void;
  onView: () => void;
}) {
  return (
    <article
      id={domId}
      className={[
        "app-panel app-panel-hover cursor-pointer p-4",
        highlighted ? "ring-2 ring-app-brand/50" : "",
      ].join(" ")}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      role="button"
      tabIndex={0}
      aria-current={highlighted ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {strategy.featured ? (
          <span className="rounded bg-app-brand/12 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-brand">
            Featured
          </span>
        ) : null}
        <span className="rounded bg-app-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-muted">
          {strategy.strategyType}
        </span>
        <span className="rounded bg-app-panel px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-dim">
          {strategy.riskLevel}
        </span>
        {strategy.isNew ? (
          <span className="rounded bg-app-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-success">
            New
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 text-sm font-bold text-app-ink">{strategy.name}</h3>
      <ProductAttribution
        creatorName={strategy.creatorName}
        creatorHandle={strategy.creatorHandle}
        verified={strategy.verified}
      />
      <p className="mt-1 line-clamp-2 text-xs text-app-muted">
        {strategy.logicSummary}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span
          className={
            strategy.performance30d >= 0 ? "text-app-success" : "text-app-danger"
          }
        >
          {formatPercent(strategy.performance30d, true)}
        </span>
        <span className="font-semibold text-app-ink">
          {strategy.accessPriceDexla == null
            ? "Free"
            : formatDexla(strategy.accessPriceDexla)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="rounded-md border border-app-line px-2 py-1 text-[11px] font-bold"
          onClick={onView}
        >
          View Strategy
        </button>
        {strategy.isIndexlaCore || !roleCreator ? (
          <button
            type="button"
            className="rounded-md border border-app-line px-2 py-1 text-[11px] font-bold"
            onClick={onUse}
          >
            Use in Portfolio
          </button>
        ) : owned ? (
          <>
            <button
              type="button"
              className="rounded-md bg-app-brand px-2 py-1 text-[11px] font-bold text-white"
              onClick={onCopy}
            >
              Copy Strategy
            </button>
            <button
              type="button"
              className="rounded-md border border-app-line px-2 py-1 text-[11px] font-bold"
              onClick={onUse}
            >
              Use in Portfolio
            </button>
            <span className="rounded-md bg-app-success/15 px-2 py-1 text-[10px] font-bold uppercase text-app-success">
              Already owned
            </span>
          </>
        ) : (
          <button
            type="button"
            className="rounded-md bg-app-brand px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
            disabled={!paymentsEnabled}
            onClick={onPurchase}
          >
            Purchase Creator Access
          </button>
        )}
      </div>
    </article>
  );
}

function MyStrategiesTab({
  items,
  onAction,
}: {
  items: MyStrategyRecord[];
  onAction: (action: string, item: MyStrategyRecord) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No strategies yet"
        description="Publish a strategy or purchase creator access from the marketplace."
        action={
          <Link
            href={`${APP_ROUTES.strategies}?tab=marketplace`}
            className="app-gradient-btn inline-flex h-10 items-center rounded-[10px] px-4 text-sm font-bold"
          >
            Browse Marketplace
          </Link>
        }
      />
    );
  }

  return (
    <section className="space-y-3">
      {items.map((item) => (
        <article key={item.id} className="app-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-bold text-app-ink">{item.name}</h3>
                <span className="rounded bg-app-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-muted">
                  {item.status}
                </span>
                <span className="rounded bg-app-panel px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-dim">
                  {item.origin}
                </span>
                {item.isIllustrative ? <IllustrativeBadge compact /> : null}
              </div>
              <p className="mt-1 text-xs text-app-muted">{item.description}</p>
              <p className="mt-1 text-xs text-app-ink">
                <span className="font-semibold">Rules:</span> {item.rulesSummary}
              </p>
              <p className="mt-1 text-xs text-app-dim">
                Compatible:{" "}
                {item.compatiblePortfolios.length
                  ? item.compatiblePortfolios.join(" · ")
                  : "None yet"}
              </p>
            </div>
            <div className="text-right text-xs">
              <p
                className={
                  item.performance30d >= 0
                    ? "font-bold text-app-success"
                    : "font-bold text-app-danger"
                }
              >
                {formatPercent(item.performance30d, true)}
              </p>
              <p className="text-app-dim">{item.executions30d} executions</p>
            </div>
          </div>
          <MiniLineChart points={item.chartSeries} height={88} />
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Active creators" value={String(item.activeCreatorUsers)} />
            <Stat label="Access sales" value={String(item.accessSales)} />
            <Stat
              label="Creator revenue"
              value={formatDexla(item.creatorRevenueDexla)}
            />
            <Stat label="Burned $DEXLA" value={formatDexla(item.burnedDexla)} />
            <Stat label="AUM influenced" value={formatUsd(item.influencedAumUsd, true)} />
            <Stat
              label="Volume influenced"
              value={formatUsd(item.influencedVolumeUsd, true)}
            />
            <Stat label="Automation" value={item.automationHealth} />
            <Stat
              label="Access price"
              value={
                item.accessPriceDexla == null
                  ? "Free"
                  : formatDexla(item.accessPriceDexla)
              }
            />
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(
              [
                "Claim Revenue",
                "Edit",
                "Pause",
                "Duplicate",
                "Use in Portfolio",
              ] as const
            ).map((action) => (
              <button
                key={action}
                type="button"
                className="rounded-md border border-app-line px-2.5 py-1.5 text-[11px] font-bold"
                onClick={() => onAction(action, item)}
              >
                {action}
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function PublishTab({
  workspace,
  draft,
  setDraft,
  paymentsEnabled,
  onSave,
  onPublish,
}: {
  workspace: StrategiesWorkspace;
  draft: PublishStrategyDraft;
  setDraft: (draft: PublishStrategyDraft) => void;
  paymentsEnabled: boolean;
  onSave: () => void;
  onPublish: () => void;
}) {
  const steps = [
    "Strategy name and description",
    "Strategy logic and conditions",
    "Allowed configurable parameters",
    "Compatible asset categories and networks",
    "Risk classification and disclosures",
    "Creator access price in $DEXLA",
    "Review and Publish",
  ];

  return (
    <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="app-panel space-y-3 p-4">
        <ol className="mb-2 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wide text-app-dim">
          {steps.map((step, index) => (
            <li
              key={step}
              className="rounded-full border border-app-line px-2 py-1"
            >
              {index + 1}. {step}
            </li>
          ))}
        </ol>

        <Field
          label="1. Strategy name"
          value={draft.name}
          onChange={(name) => setDraft({ ...draft, name })}
          placeholder="e.g. Momentum Alpha"
        />
        <Field
          label="Description"
          value={draft.description}
          onChange={(description) => setDraft({ ...draft, description })}
          placeholder="Short marketplace description"
          textarea
        />
        <Field
          label="2. Strategy logic"
          value={draft.logic}
          onChange={(logic) => setDraft({ ...draft, logic })}
          placeholder="Describe entry/exit logic"
          textarea
        />
        <Field
          label="Conditions"
          value={draft.conditions}
          onChange={(conditions) => setDraft({ ...draft, conditions })}
          placeholder="Trigger conditions"
          textarea
        />
        <Field
          label="3. Allowed configurable parameters"
          value={draft.configurableParameters}
          onChange={(configurableParameters) =>
            setDraft({ ...draft, configurableParameters })
          }
          placeholder="Parameters investors/creators may configure"
          textarea
        />
        <label className="block text-sm">
          <span className="font-semibold text-app-ink">
            4. Asset categories (comma-separated)
          </span>
          <input
            className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3"
            value={draft.assetCategories.join(", ")}
            onChange={(e) =>
              setDraft({
                ...draft,
                assetCategories: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-app-ink">Networks</span>
          <select
            multiple
            className="mt-1 min-h-24 w-full rounded-[10px] border border-app-line bg-app-elevated px-3 py-2"
            value={draft.networkIds}
            onChange={(e) =>
              setDraft({
                ...draft,
                networkIds: Array.from(e.target.selectedOptions).map(
                  (o) => o.value as NetworkId,
                ),
              })
            }
          >
            {workspace.networks.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-app-ink">5. Risk classification</span>
          <select
            className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3"
            value={draft.riskLevel}
            onChange={(e) =>
              setDraft({
                ...draft,
                riskLevel: e.target.value as PublishStrategyDraft["riskLevel"],
              })
            }
          >
            {workspace.risks.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Disclosures"
          value={draft.disclosures}
          onChange={(disclosures) => setDraft({ ...draft, disclosures })}
          textarea
        />
        <label className="block text-sm">
          <span className="font-semibold text-app-ink">
            6. Creator access price ($DEXLA)
          </span>
          <input
            type="number"
            min={0}
            className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3"
            value={draft.accessPriceDexla}
            onChange={(e) =>
              setDraft({
                ...draft,
                accessPriceDexla: Number(e.target.value) || 0,
              })
            }
          />
        </label>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={onSave}
            className="h-10 rounded-[10px] border border-app-line px-4 text-sm font-bold"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={!paymentsEnabled}
            className="app-gradient-btn h-10 rounded-[10px] px-4 text-sm font-bold disabled:opacity-50"
          >
            Publish Strategy
          </button>
        </div>
      </div>

      <aside className="app-panel h-fit space-y-3 p-4 text-sm">
        <h3 className="font-bold text-app-ink">7. Review economics</h3>
        <ul className="space-y-2 text-app-muted">
          <li>
            Listing fee: {formatDexla(workspace.listingFeeDexla)} ·{" "}
            {workspace.listingFeeBurnPercent}% burned
          </li>
          <li>
            Access payments: {workspace.accessSplitCreatorPercent}% creator /{" "}
            {workspace.accessSplitBurnPercent}% burned
          </li>
          <li>
            Strategy creator receives{" "}
            {workspace.defaultExecutionFeeSharePercent}% of applicable execution
            fees when another creator uses the strategy
          </li>
          <li>Demo $DEXLA balance: {formatDexla(workspace.demoDexlaBalance)}</li>
        </ul>
        <div className="rounded-[10px] border border-app-line bg-app-soft p-3 text-xs text-app-muted">
          <p className="font-semibold text-app-ink">Preview checklist</p>
          <p className="mt-1">Name: {draft.name || "—"}</p>
          <p>Risk: {draft.riskLevel}</p>
          <p>Access: {formatDexla(draft.accessPriceDexla)}</p>
          <p>Networks: {draft.networkIds.join(", ") || "—"}</p>
        </div>
      </aside>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-app-ink">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-1 w-full rounded-[10px] border border-app-line bg-app-elevated px-3 py-2"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 h-10 w-full rounded-[10px] border border-app-line bg-app-elevated px-3"
        />
      )}
    </label>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
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
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-app-dim">{label}</p>
      <p className="mt-0.5 font-semibold capitalize text-app-ink">{value}</p>
    </div>
  );
}
