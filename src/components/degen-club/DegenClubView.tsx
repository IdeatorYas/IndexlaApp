"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEGEN_RISK_WARNING,
  type DegenClubWorkspace,
  type DegenDiscoverFilter,
  type DegenMarketTab,
  type DegenProduct,
} from "@/lib/domain/degen-club";
import type { DegenCoinMarketPoint } from "@/lib/adapters/coingecko";
import { CreateAllocationDonut } from "@/components/create/CreateAllocationDonut";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { DegenAssetIcon } from "@/components/degen-club/DegenAssetIcon";
import { DegenCardDonut } from "@/components/degen-club/DegenCardDonut";
import { ProductAttribution } from "@/components/product/ProductIdentity";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import {
  formatPercent,
  formatRelativeTime,
  formatUsd,
} from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { PreviewOnlyMessage } from "@/components/ui/PreviewOnlyMessage";
import {
  DEGEN_CHAIN_FILTERS,
  DEGEN_MARKET_TABS,
} from "@/lib/fixtures/degen-club";

type ViewState = "loading" | "ready" | "error" | "empty";
type PriceMap = Record<string, DegenCoinMarketPoint>;

const CHAIN_FILTERS: { id: DegenDiscoverFilter; label: string }[] = [
  { id: "all", label: "All Chains" },
  ...DEGEN_CHAIN_FILTERS.map((f) => ({ id: f.id, label: f.label })),
  { id: "multi-chain", label: "Multi-Chain" },
];

function formatLivePrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1) return formatUsd(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function enrichProduct(product: DegenProduct, prices: PriceMap): DegenProduct {
  return {
    ...product,
    allocations: product.allocations.map((a) => {
      const live = a.coingeckoId ? prices[a.coingeckoId] : undefined;
      return {
        ...a,
        imageUrl: live?.imageUrl ?? a.imageUrl ?? null,
        priceUsd: live?.priceUsd ?? a.priceUsd ?? null,
      };
    }),
  };
}

export function DegenClubView({
  workspace,
  illustrative,
  initialError = false,
}: {
  workspace: DegenClubWorkspace;
  illustrative: boolean;
  initialError?: boolean;
}) {
  const { wallet, connectDemo } = useDemoWallet();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [viewState, setViewState] = useState<ViewState>(
    initialError ? "error" : "loading",
  );
  const [marketTab, setMarketTab] = useState<DegenMarketTab>("all");
  const [chainFilter, setChainFilter] = useState<DegenDiscoverFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [staleOverride, setStaleOverride] = useState(workspace.marketDataStale);
  const [buildOpen, setBuildOpen] = useState(false);
  const [investOpen, setInvestOpen] = useState(false);
  const [investAck, setInvestAck] = useState(false);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [prices, setPrices] = useState<PriceMap>({});
  const [pricesStale, setPricesStale] = useState(true);

  const selectedId = searchParams.get("id");

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => {
      setViewState(workspace.products.length === 0 ? "empty" : "ready");
    }, 280);
    return () => window.clearTimeout(timer);
  }, [initialError, workspace.products.length]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market/degen-prices")
      .then((r) => r.json())
      .then((data: { byId?: PriceMap; stale?: boolean }) => {
        if (cancelled) return;
        setPrices(data.byId ?? {});
        setPricesStale(Boolean(data.stale));
      })
      .catch(() => {
        if (!cancelled) setPricesStale(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enrichedProducts = useMemo(
    () => workspace.products.map((p) => enrichProduct(p, prices)),
    [workspace.products, prices],
  );

  function preview(action: string) {
    setMessage(
      `${action} — preview only. No real wallet signing, invest or execution was submitted.`,
    );
  }

  function selectProduct(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!id) params.delete("id");
    else params.set("id", id);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const scrollToMarketplace = useCallback(() => {
    setMarketTab("all");
    setChainFilter("all");
    document.getElementById("degen-marketplace")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const filtered = useMemo(() => {
    let list = [...enrichedProducts];
    if (marketTab === "indexes") {
      list = list.filter((p) => p.kind === "Index");
    } else if (marketTab === "portfolios") {
      list = list.filter((p) => p.kind === "Portfolio");
    }
    switch (chainFilter) {
      case "solana":
        list = list.filter(
          (p) => p.networkIds.length === 1 && p.networkIds[0] === "solana",
        );
        break;
      case "ethereum":
        list = list.filter(
          (p) => p.networkIds.length === 1 && p.networkIds[0] === "ethereum",
        );
        break;
      case "base":
        list = list.filter(
          (p) => p.networkIds.length === 1 && p.networkIds[0] === "base",
        );
        break;
      case "bnb":
        list = list.filter(
          (p) => p.networkIds.length === 1 && p.networkIds[0] === "bnb",
        );
        break;
      case "multi-chain":
        list = list.filter(
          (p) => p.chainLabel === "Multi-Chain" || p.networkIds.length > 1,
        );
        break;
      default:
        break;
    }
    return list;
  }, [enrichedProducts, marketTab, chainFilter]);

  const selected =
    enrichedProducts.find((p) => p.id === selectedId) ?? null;

  if (viewState === "loading") {
    return (
      <div className="space-y-4">
        <RiskBanner />
        <LoadingSkeleton title="Loading Degen Club" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="space-y-4">
        <RiskBanner />
        <ErrorState
          title="Degen Club unavailable"
          description="Unable to load memecoin index discovery data."
          action={
            <button
              type="button"
              className="degen-btn-primary px-4 py-2 text-sm"
              onClick={() =>
                setViewState(
                  workspace.products.length === 0 ? "empty" : "ready",
                )
              }
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  if (viewState === "empty") {
    return (
      <div className="space-y-4">
        <RiskBanner />
        <EmptyState
          title="No memecoin indexes yet"
          description="When illustrative Degen products publish, they will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RiskBanner />

      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="degen-brand-pill">{workspace.hero.title}</span>
          {illustrative ? <span className="degen-illustrative-tag">Illustrative</span> : null}
        </div>
      </header>

      {wallet.state !== "connected" ? (
        <div className="degen-wallet-strip flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[var(--degen-ink)]">
              Wallet disconnected
            </p>
            <p className="mt-0.5 text-xs text-[var(--degen-muted)]">
              Browse freely. Connect for Follow, Like and Invest previews.
            </p>
          </div>
          <button
            type="button"
            onClick={connectDemo}
            className="degen-btn-primary h-9 px-4 text-[12px]"
          >
            Connect Wallet
          </button>
        </div>
      ) : null}

      {(staleOverride || workspace.marketDataStale || pricesStale) ? (
        <div
          className="rounded-[10px] border border-[rgba(255,215,0,0.35)] bg-[rgba(255,215,0,0.08)] px-3 py-2 text-xs text-[var(--degen-neon-gold)]"
          role="status"
        >
          AUM, 30D performance, investors and activity are Illustrative. Live
          CoinGecko prices and logos may be delayed.
          <button
            type="button"
            className="ml-2 font-bold underline"
            onClick={() => {
              setStaleOverride(false);
              setPricesStale(false);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {message ? <PreviewOnlyMessage>{message}</PreviewOnlyMessage> : null}

      <HeroSection
        headline={workspace.hero.headline}
        subheadline={workspace.hero.subheadline}
        trustBadges={workspace.hero.trustBadges}
        onDiscover={scrollToMarketplace}
        onBuild={() => setBuildOpen(true)}
      />

      <section id="degen-marketplace" className="space-y-4">
        <div>
          <h2 className="degen-section-title">Marketplace</h2>
          <p className="degen-section-sub mt-0.5">
            Memecoin indexes and portfolios · Risk: Extreme · Product metrics
            Illustrative
          </p>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Marketplace category"
        >
          {DEGEN_MARKET_TABS.map((item) => {
            const active = item.id === marketTab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMarketTab(item.id)}
                className={["degen-tab", active ? "degen-tab-active" : ""].join(
                  " ",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Chain filters"
        >
          {CHAIN_FILTERS.map((item) => {
            const active = item.id === chainFilter;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setChainFilter(item.id)}
                className={[
                  "degen-filter",
                  active ? "degen-filter-active" : "",
                ].join(" ")}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No products in this filter"
            description="Try another chain or category tab."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onView={() => selectProduct(product.id)}
              />
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <ProductDetail
          product={selected}
          liked={liked}
          following={following}
          onClose={() => selectProduct(null)}
          onLike={() => {
            if (wallet.state !== "connected") {
              connectDemo();
              preview("Like");
              return;
            }
            setLiked((v) => !v);
            preview(
              liked
                ? "Unlike — engagement only, never affects leaderboard ranking"
                : "Like — engagement only, never affects leaderboard ranking",
            );
          }}
          onFollow={() => {
            if (wallet.state !== "connected") {
              connectDemo();
              preview("Follow");
              return;
            }
            setFollowing((v) => !v);
            preview(
              following
                ? "Unfollow — engagement only, never affects leaderboard ranking"
                : "Follow — engagement only, never affects leaderboard ranking",
            );
          }}
          onInvest={() => {
            setInvestAck(false);
            setInvestOpen(true);
          }}
        />
      ) : null}

      {buildOpen ? (
        <BuildConfirmModal
          onCancel={() => setBuildOpen(false)}
          onContinue={() => {
            setBuildOpen(false);
            router.push(`${APP_ROUTES.create}?template=degen`);
          }}
        />
      ) : null}

      {investOpen && selected ? (
        <InvestConfirmModal
          product={selected}
          acknowledged={investAck}
          walletConnected={wallet.state === "connected"}
          onAckChange={setInvestAck}
          onCancel={() => setInvestOpen(false)}
          onConnect={connectDemo}
          onConfirm={() => {
            setInvestOpen(false);
            preview(`Invest preview · ${selected.name}`);
          }}
        />
      ) : null}
    </div>
  );
}

function RiskBanner() {
  return (
    <div className="degen-risk-banner" role="alert" aria-live="polite">
      {DEGEN_RISK_WARNING}
    </div>
  );
}

function HeroSection({
  headline,
  subheadline,
  trustBadges,
  onDiscover,
  onBuild,
}: {
  headline: string;
  subheadline: string;
  trustBadges: string[];
  onDiscover: () => void;
  onBuild: () => void;
}) {
  return (
    <section className="degen-panel overflow-hidden p-4 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="degen-headline">{headline}</h1>
            <p className="degen-subheadline">{subheadline}</p>
          </div>

          <div className="degen-trust-row">
            {trustBadges.map((badge) => (
              <span key={badge} className="degen-trust-badge">
                {badge}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onDiscover}
              className="degen-btn-primary"
            >
              Discover Indexes
            </button>
            <button
              type="button"
              onClick={onBuild}
              className="degen-btn-secondary"
            >
              Build Your Basket
            </button>
          </div>
        </div>

        <ShotsVisual />
      </div>
    </section>
  );
}

function ShotsVisual() {
  const barHeights = [40, 55, 35, 70, 50, 85, 45, 60, 75, 90];
  return (
    <div className="degen-shots-visual" aria-hidden>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--degen-muted)]">
          1 Shot vs 10 Shots
        </p>
        <span className="degen-rocket" aria-hidden>
          🚀
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="degen-shot-col degen-shot-one">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#ff8fab]">
            1 Shot
          </p>
          <div className="degen-shot-orb mx-auto mt-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[rgba(255,51,102,0.55)] bg-[rgba(255,51,102,0.12)]">
            <span className="text-xl font-black text-[#ff3366]">1</span>
          </div>
          <p className="mt-2 text-[11px] text-[var(--degen-muted)]">
            One concentrated bet
          </p>
        </div>
        <div className="degen-shot-col degen-shot-ten">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--degen-neon-green)]">
            10 Shots
          </p>
          <div className="mt-3 grid grid-cols-5 gap-1.5 px-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className="degen-shot-dot aspect-square rounded-full border border-[rgba(57,255,20,0.45)] bg-[rgba(57,255,20,0.2)]"
              />
            ))}
          </div>
          <div className="degen-chart-spark px-2">
            {barHeights.map((h, i) => (
              <span
                key={i}
                className="degen-chart-bar"
                style={{ height: `${h}%`, animationDelay: `${i * 0.06}s` }}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--degen-muted)]">
            Diversified memecoin exposure
          </p>
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] font-semibold text-[var(--degen-muted)]">
        Concept visual only — not a performance claim
      </p>
    </div>
  );
}

function ProductCard({
  product,
  onView,
}: {
  product: DegenProduct;
  onView: () => void;
}) {
  const positive = product.performance30d >= 0;
  const previewAllocations = product.allocations.slice(0, 5);

  return (
    <article className="degen-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="degen-badge-kind">{product.kind}</span>
            <span className="degen-badge-extreme">Extreme</span>
            <span className="degen-illustrative-tag">Illustrative</span>
          </div>
          <h3 className="degen-card-title mt-1.5">{product.name}</h3>
          <ProductAttribution
            creatorName={product.creatorName}
            creatorHandle={product.creatorHandle}
            verified={product.verified}
            className="mt-0.5 truncate text-[11px] font-semibold text-[var(--degen-muted)]"
          />
        </div>
        <DegenCardDonut
          segments={product.allocations.map((a) => ({ percent: a.percent }))}
          size={72}
        />
      </div>

      <p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--degen-muted)]">
        {product.thesis}
      </p>

      <div className="flex items-center justify-between gap-2">
        <div className="degen-logo-stack">
          {previewAllocations.map((a) => (
            <DegenAssetIcon
              key={a.assetId}
              assetKey={a.assetId}
              size={22}
              imageUrl={a.imageUrl}
            />
          ))}
          {product.allocations.length > 5 ? (
            <span className="ml-1 text-[10px] font-bold text-[var(--degen-muted)]">
              +{product.allocations.length - 5}
            </span>
          ) : null}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--degen-neon-orange)]">
          {product.chainLabel}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Metric
          label="30D"
          value={formatPercent(product.performance30d, true)}
          positive={positive}
          illustrative
        />
        <Metric label="AUM" value={formatUsd(product.aumUsd, true)} illustrative />
        <Metric
          label="Investors"
          value={product.investors.toLocaleString()}
          illustrative
        />
        <Metric label="Risk" value="Extreme" />
      </dl>

      <button type="button" onClick={onView} className="degen-btn-primary mt-auto w-full">
        View Product
      </button>
    </article>
  );
}

function Metric({
  label,
  value,
  positive,
  illustrative = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  illustrative?: boolean;
}) {
  return (
    <div>
      <dt className="degen-metric-label">
        {label}
        {illustrative ? " · Illus." : ""}
      </dt>
      <dd
        className={[
          "degen-metric-value",
          positive === true ? "degen-metric-value-positive" : "",
          positive === false ? "degen-metric-value-negative" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function ProductDetail({
  product,
  liked,
  following,
  onClose,
  onLike,
  onFollow,
  onInvest,
}: {
  product: DegenProduct;
  liked: boolean;
  following: boolean;
  onClose: () => void;
  onLike: () => void;
  onFollow: () => void;
  onInvest: () => void;
}) {
  const positive = product.performance30d >= 0;

  return (
    <section className="degen-detail-panel" aria-labelledby="degen-product-detail">
      <div className="border-b border-[rgba(168,85,247,0.25)] px-4 py-3 sm:px-5">
        <RiskBanner />
      </div>

      <div className="flex items-start justify-between gap-3 border-b border-[rgba(168,85,247,0.25)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="degen-badge-kind">{product.kind}</span>
            <span className="degen-badge-extreme">Risk: Extreme</span>
            <span className="degen-illustrative-tag">Illustrative</span>
          </div>
          <h2
            id="degen-product-detail"
            className="mt-1 truncate text-xl font-black tracking-tight text-[var(--degen-ink)]"
          >
            {product.name}
          </h2>
          <ProductAttribution
            creatorName={product.creatorName}
            creatorHandle={product.creatorHandle}
            verified={product.verified}
            className="mt-0.5 text-sm font-semibold text-[var(--degen-muted)]"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[10px] border border-[rgba(168,85,247,0.35)] px-3 py-1.5 text-xs font-bold text-[var(--degen-muted)] hover:text-[var(--degen-ink)]"
        >
          Close
        </button>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-[var(--degen-muted)]">
            {product.thesis}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onFollow}
              className="degen-btn-secondary h-8 px-3 text-[11px]"
            >
              {following ? "Following" : "Follow creator"}
            </button>
            <button
              type="button"
              onClick={onLike}
              className="degen-btn-secondary h-8 px-3 text-[11px]"
            >
              {liked ? "Liked" : "Like"} · {product.likes + (liked ? 1 : 0)}
            </button>
            <Link
              href={APP_ROUTES.create + "?template=degen"}
              className="degen-btn-secondary inline-flex h-8 items-center px-3 text-[11px]"
            >
              Customize in Create
            </Link>
          </div>

          <PreviewOnlyMessage>
            Likes and follows are engagement metrics only and never affect
            Portfolio Leaderboard ranking. All figures are Illustrative.
          </PreviewOnlyMessage>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--degen-muted)]">
              Assets & target allocations
            </h3>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <CreateAllocationDonut
                segments={product.allocations.map((a) => ({
                  assetKey: a.assetId,
                  label: a.label,
                  percent: a.percent,
                  imageUrl: a.imageUrl,
                }))}
                size={280}
                totalPercent={100}
                compact
              />
              <ul className="min-w-0 flex-1 space-y-2">
                {product.allocations.map((a) => (
                  <li
                    key={a.assetId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <DegenAssetIcon
                        assetKey={a.assetId}
                        size={24}
                        imageUrl={a.imageUrl}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--degen-ink)]">
                          {a.name ?? a.label}
                        </span>
                        <span className="text-[10px] text-[var(--degen-muted)]">
                          {a.networkLabel ?? product.chainLabel} · Live{" "}
                          {formatLivePrice(a.priceUsd)}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 font-bold text-[var(--degen-neon-gold)]">
                      {a.percent}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Chain", product.chainLabel],
              ["Strategy", product.strategy],
              ["Volatility", product.volatilityLabel],
              [
                "Est. fees / costs",
                `${formatUsd(product.feeEstimateUsd)} / ${formatUsd(product.estimatedCostUsd)}`,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[10px] border border-[rgba(168,85,247,0.22)] bg-[rgba(14,8,24,0.6)] px-3 py-2.5"
              >
                <p className="degen-metric-label">{label}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--degen-ink)]">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-[10px] border border-[rgba(168,85,247,0.22)] bg-[rgba(14,8,24,0.5)] p-3">
            <h3 className="text-sm font-bold text-[var(--degen-ink)]">
              Rebalance rules
            </h3>
            <p className="mt-1 text-xs text-[var(--degen-muted)]">
              {product.rebalanceRules}
            </p>
          </div>

          <div className="rounded-[10px] border border-[rgba(168,85,247,0.22)] bg-[rgba(14,8,24,0.5)] p-3">
            <h3 className="text-sm font-bold text-[var(--degen-ink)]">Activity</h3>
            <ul className="mt-2 space-y-2">
              {product.activity.map((item) => (
                <li key={item.id} className="text-xs">
                  <p className="font-semibold text-[var(--degen-ink)]">
                    {item.title}
                  </p>
                  <p className="text-[var(--degen-muted)]">
                    {item.subtitle} · {formatRelativeTime(item.atIso)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[10px] border border-[rgba(255,51,102,0.3)] bg-[rgba(255,51,102,0.06)] p-3 text-xs text-[var(--degen-muted)]">
            <p className="font-bold text-[var(--degen-ink)]">
              Non-custodial disclosure
            </p>
            <p className="mt-1">
              You hold the real underlying assets in your wallet. INDEXLA cannot
              withdraw funds or expand its own permissions.
            </p>
            <p className="mt-2 font-semibold text-[#ff8fab]">
              {DEGEN_RISK_WARNING}
            </p>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-[10px] border border-[rgba(168,85,247,0.28)] bg-[rgba(14,8,24,0.7)] p-4">
            <p className="degen-metric-label">30D performance · Illustrative</p>
            <p
              className={[
                "mt-1 text-3xl font-black",
                positive
                  ? "degen-metric-value-positive"
                  : "degen-metric-value-negative",
              ].join(" ")}
            >
              {formatPercent(product.performance30d, true)}
            </p>
            <div className="mt-3">
              <MiniLineChart points={product.chartSeries} height={96} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["AUM", formatUsd(product.aumUsd, true)],
                ["Volume", formatUsd(product.volumeUsd, true)],
                ["Investors", product.investors.toLocaleString()],
                ["Likes", String(product.likes + (liked ? 1 : 0))],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-2"
                >
                  <dt className="text-[var(--degen-muted)]">{label}</dt>
                  <dd className="font-semibold text-[var(--degen-ink)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <button
            type="button"
            onClick={onInvest}
            className="degen-btn-primary h-11 w-full text-sm"
          >
            Invest
          </button>
          <Link
            href={APP_ROUTES.create + "?template=degen"}
            className="degen-btn-secondary flex h-11 w-full items-center justify-center text-sm"
          >
            Customize & Invest
          </Link>
        </aside>
      </div>
    </section>
  );
}

function BuildConfirmModal({
  onCancel,
  onContinue,
}: {
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <div
      className="degen-modal-backdrop fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="build-degen-title"
    >
      <div className="degen-modal w-full max-w-md space-y-4 p-5">
        <h3
          id="build-degen-title"
          className="text-lg font-black text-[var(--degen-ink)]"
        >
          Build Your Basket
        </h3>
        <div className="degen-risk-banner text-sm">{DEGEN_RISK_WARNING}</div>
        <p className="text-sm text-[var(--degen-muted)]">
          Continue to Create with the Degen Index template. Preview only — no
          real execution.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="degen-btn-secondary h-9 px-3 text-[12px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="degen-btn-primary h-9 px-3 text-[12px]"
          >
            Continue to Create
          </button>
        </div>
      </div>
    </div>
  );
}

function InvestConfirmModal({
  product,
  acknowledged,
  walletConnected,
  onAckChange,
  onCancel,
  onConfirm,
  onConnect,
}: {
  product: DegenProduct;
  acknowledged: boolean;
  walletConnected: boolean;
  onAckChange: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onConnect: () => void;
}) {
  return (
    <div
      className="degen-modal-backdrop fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invest-degen-title"
    >
      <div className="degen-modal w-full max-w-md space-y-4 p-5">
        <h3
          id="invest-degen-title"
          className="text-lg font-black text-[var(--degen-ink)]"
        >
          Investment confirmation
        </h3>
        <p className="text-sm text-[var(--degen-muted)]">
          {product.name} · Est. fees {formatUsd(product.feeEstimateUsd)} · Est.
          costs {formatUsd(product.estimatedCostUsd)} · Illustrative
        </p>
        <div className="degen-risk-banner text-sm">{DEGEN_RISK_WARNING}</div>
        <label className="flex items-start gap-2 text-sm font-semibold text-[var(--degen-ink)]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAckChange(e.target.checked)}
            className="mt-1"
          />
          I understand and acknowledge this extreme risk.
        </label>
        {!walletConnected ? (
          <button
            type="button"
            onClick={onConnect}
            className="degen-btn-secondary h-9 w-full text-[12px]"
          >
            Connect Wallet
          </button>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="degen-btn-secondary h-9 px-3 text-[12px]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!acknowledged || !walletConnected}
            onClick={onConfirm}
            className="degen-btn-primary h-9 px-3 text-[12px] disabled:opacity-40"
          >
            Confirm Invest Preview
          </button>
        </div>
      </div>
    </div>
  );
}
