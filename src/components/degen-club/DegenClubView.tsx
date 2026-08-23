"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEGEN_RISK_WARNING,
  type DegenClubWorkspace,
  type DegenDiscoverFilter,
  type DegenProduct,
} from "@/lib/domain/degen-club";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import {
  ProductAttribution,
  ProductTypeBadge,
} from "@/components/product/ProductIdentity";
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
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { PreviewOnlyMessage } from "@/components/ui/PreviewOnlyMessage";

type ViewState = "loading" | "ready" | "error" | "empty";

const FILTERS: { id: DegenDiscoverFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "solana", label: "Solana" },
  { id: "ethereum", label: "Ethereum" },
  { id: "base", label: "Base" },
  { id: "bnb", label: "BNB Chain" },
  { id: "multi-chain", label: "Multi-Chain" },
  { id: "featured", label: "Featured" },
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
];

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
  const [filter, setFilter] = useState<DegenDiscoverFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [staleOverride, setStaleOverride] = useState(workspace.marketDataStale);
  const [buildOpen, setBuildOpen] = useState(false);
  const [investOpen, setInvestOpen] = useState(false);
  const [investAck, setInvestAck] = useState(false);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);

  const selectedId = searchParams.get("id");

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => {
      setViewState(workspace.products.length === 0 ? "empty" : "ready");
    }, 280);
    return () => window.clearTimeout(timer);
  }, [initialError, workspace.products.length]);

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

  function scrollToDiscover() {
    setFilter("all");
    document.getElementById("degen-discover")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const filtered = useMemo(() => {
    let list = [...workspace.products];
    switch (filter) {
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
      case "featured":
        list = list.filter((p) => p.featured);
        break;
      case "trending":
        list = list.filter((p) => p.trending);
        break;
      case "new":
        list = list.filter((p) => p.isNew);
        break;
      default:
        break;
    }
    return list;
  }, [workspace.products, filter]);

  const selected =
    workspace.products.find((p) => p.id === selectedId) ?? null;

  if (viewState === "loading") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <RiskBanner />
        <LoadingSkeleton title="Loading Degen Club" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <RiskBanner />
        <ErrorState
          title="Degen Club unavailable"
          description="Unable to load memecoin index discovery data."
          action={
            <button
              type="button"
              className="app-gradient-btn rounded-[10px] px-4 py-2 text-sm font-bold"
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
      <div className="mx-auto space-y-4" style={{ maxWidth: "var(--content-max)" }}>
        <RiskBanner />
        <EmptyState
          title="No memecoin indexes yet"
          description="When illustrative Degen products publish, they will appear here."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-5" style={{ maxWidth: "var(--content-max)" }}>
      <RiskBanner />

      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-app-brand">
            Degen Club
          </p>
          <h1 className="app-display text-2xl font-bold tracking-tight text-app-ink sm:text-[1.75rem]">
            {workspace.hero.tagline}
          </h1>
        </div>
        {illustrative ? <IllustrativeBadge /> : null}
      </header>

      {wallet.state !== "connected" ? (
        <div className="app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-app-ink">Wallet disconnected</p>
            <p className="mt-0.5 text-xs text-app-muted">
              Browse freely. Connect for Follow, Like and Invest previews.
            </p>
          </div>
          <button
            type="button"
            onClick={connectDemo}
            className="h-9 app-gradient-btn rounded-[10px] px-4 text-[12px] font-bold text-white"
          >
            Connect Wallet
          </button>
        </div>
      ) : null}

      {staleOverride || workspace.marketDataStale ? (
        <div
          className="rounded-[10px] border border-app-warning/40 bg-app-warning/10 px-3 py-2 text-xs text-app-ink"
          role="status"
        >
          Market data may be stale — AUM, performance, balances and activity
          remain Illustrative.
          <button
            type="button"
            className="ml-2 font-bold underline"
            onClick={() => setStaleOverride(false)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {message ? <PreviewOnlyMessage>{message}</PreviewOnlyMessage> : null}

      <HeroSection
        points={workspace.hero.points}
        onDiscover={scrollToDiscover}
        onBuild={() => setBuildOpen(true)}
      />

      <section id="degen-discover" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="app-display text-base font-semibold text-app-ink">
              Discover
            </h2>
            <p className="text-[11px] text-app-muted">
              Memecoin indexes and portfolios · Risk: Extreme · All figures
              Illustrative
            </p>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Degen Club filters"
        >
          {FILTERS.map((item) => {
            const selectedFilter = item.id === filter;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selectedFilter}
                onClick={() => setFilter(item.id)}
                className={[
                  "app-page-tab app-interactive",
                  selectedFilter ? "app-page-tab-active" : "",
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
            description="Try another chain or collection filter."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
    <div
      className="rounded-[12px] border border-app-danger/50 bg-app-danger/12 px-4 py-3 text-sm font-semibold text-app-danger"
      role="alert"
      aria-live="polite"
    >
      {DEGEN_RISK_WARNING}
    </div>
  );
}

function HeroSection({
  points,
  onDiscover,
  onBuild,
}: {
  points: string[];
  onDiscover: () => void;
  onBuild: () => void;
}) {
  return (
    <section className="app-panel overflow-hidden p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-3">
          <h2 className="app-display text-lg font-bold text-app-ink">
            1 Shot vs 10 Shots
          </h2>
          <ul className="space-y-2 text-sm text-app-muted">
            {points.map((point) => (
              <li key={point} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-app-brand" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onDiscover}
              className="h-10 app-gradient-btn rounded-[10px] px-4 text-[12px] font-bold text-white"
            >
              Discover Memecoin Indexes
            </button>
            <button
              type="button"
              onClick={onBuild}
              className="h-10 rounded-[10px] border border-app-line bg-app-elevated px-4 text-[12px] font-bold text-app-ink"
            >
              Build Your Own
            </button>
          </div>
        </div>

        <ShotsVisual />
      </div>
    </section>
  );
}

/** Lightweight CSS visual — no game engine / heavy animation. */
function ShotsVisual() {
  return (
    <div
      className="rounded-[14px] border border-app-line bg-app-soft p-4"
      aria-hidden
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[12px] border border-app-line bg-app-elevated p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-app-muted">
            1 Shot
          </p>
          <div className="mx-auto mt-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-app-danger/50 bg-app-danger/10">
            <span className="text-lg font-bold text-app-danger">1</span>
          </div>
          <p className="mt-2 text-[11px] text-app-muted">
            One concentrated attempt
          </p>
        </div>
        <div className="rounded-[12px] border border-app-brand/35 bg-app-brand/8 p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-app-brand">
            10 Shots
          </p>
          <div className="mt-3 grid grid-cols-5 gap-1.5 px-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className="aspect-square rounded-full border border-app-brand/40 bg-app-brand/20"
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-app-muted">
            Multiple opportunities
          </p>
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] font-semibold text-app-muted">
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
  return (
    <article className="app-panel flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <ProductTypeBadge kind={product.kind} />
            <span className="rounded-md bg-app-danger/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-danger">
              Extreme
            </span>
            {product.isIllustrative ? <IllustrativeBadge compact /> : null}
          </div>
          <h3 className="mt-1 truncate text-sm font-bold text-app-ink">
            {product.name}
          </h3>
          <ProductAttribution
            creatorName={product.creatorName}
            creatorHandle={product.creatorHandle}
            verified={product.verified}
            className="mt-0.5 truncate text-[11px] font-semibold text-app-muted"
          />
        </div>
        <AllocationDonut
          segments={product.allocations.map((a) => ({
            label: a.label,
            percent: a.percent,
          }))}
          size={48}
        />
      </div>

      <p className="text-[11px] text-app-muted">
        {product.chainLabel} · {product.strategy}
      </p>
      <p className="line-clamp-2 text-[11px] text-app-muted">
        {product.allocations.map((a) => `${a.label} ${a.percent}%`).join(" · ")}
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <Metric
          label="Performance"
          value={formatPercent(product.performance30d, true)}
        />
        <Metric label="AUM" value={formatUsd(product.aumUsd, true)} />
        <Metric label="Investors" value={product.investors.toLocaleString()} />
        <Metric label="Volume" value={formatUsd(product.volumeUsd, true)} />
      </dl>

      <button
        type="button"
        onClick={onView}
        className="mt-auto inline-flex h-9 items-center justify-center app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white"
      >
        View Product
      </button>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-app-muted">{label}</dt>
      <dd className="font-bold text-app-ink">{value}</dd>
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
    <section
      className="app-panel overflow-hidden"
      aria-labelledby="degen-product-detail"
    >
      <div className="border-b border-app-line px-4 py-3 sm:px-5">
        <RiskBanner />
      </div>

      <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <ProductTypeBadge kind={product.kind} />
            <span className="rounded-md bg-app-danger/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-danger">
              Risk: Extreme
            </span>
            {product.isIllustrative ? <IllustrativeBadge compact /> : null}
          </div>
          <h2
            id="degen-product-detail"
            className="app-display mt-1 truncate text-xl font-bold text-app-ink"
          >
            {product.name}
          </h2>
          <ProductAttribution
            creatorName={product.creatorName}
            creatorHandle={product.creatorHandle}
            verified={product.verified}
            className="mt-0.5 text-sm font-semibold text-app-muted"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[10px] border border-app-line px-3 py-1.5 text-xs font-bold text-app-muted hover:text-app-ink"
        >
          Close
        </button>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-sm text-app-muted">{product.thesis}</p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onFollow}
              className="h-8 rounded-[10px] border border-app-line bg-app-elevated px-3 text-[11px] font-bold text-app-ink/80 hover:text-app-ink"
            >
              {following ? "Following" : "Follow creator"}
            </button>
            <button
              type="button"
              onClick={onLike}
              className="h-8 rounded-[10px] border border-app-line bg-app-elevated px-3 text-[11px] font-bold text-app-ink/80 hover:text-app-ink"
            >
              {liked ? "Liked" : "Like"} · {product.likes + (liked ? 1 : 0)}
            </button>
            <Link
              href={APP_ROUTES.create + "?template=degen"}
              className="inline-flex h-8 items-center rounded-[10px] border border-app-line bg-app-elevated px-3 text-[11px] font-bold text-app-ink/80 hover:text-app-ink"
            >
              Customize in Create
            </Link>
          </div>

          <PreviewOnlyMessage>
            Likes and follows are engagement metrics only and never affect
            Portfolio Leaderboard ranking. All figures are Illustrative.
          </PreviewOnlyMessage>

          <div>
            <h3 className="app-label mb-2">Assets & target allocations</h3>
            <div className="flex items-start gap-4">
              <AllocationDonut
                segments={product.allocations.map((a) => ({
                  label: a.label,
                  percent: a.percent,
                }))}
                size={72}
              />
              <ul className="min-w-0 flex-1 space-y-1.5">
                {product.allocations.map((a) => (
                  <li
                    key={a.label}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-semibold text-app-ink">{a.label}</span>
                    <span className="text-app-muted">{a.percent}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] border border-app-line bg-app-elevated px-3 py-2.5">
              <p className="app-label">Chain</p>
              <p className="mt-1 text-sm font-semibold text-app-ink">
                {product.chainLabel}
              </p>
            </div>
            <div className="rounded-[10px] border border-app-line bg-app-elevated px-3 py-2.5">
              <p className="app-label">Strategy</p>
              <p className="mt-1 text-sm font-semibold text-app-ink">
                {product.strategy}
              </p>
            </div>
            <div className="rounded-[10px] border border-app-line bg-app-elevated px-3 py-2.5">
              <p className="app-label">Volatility</p>
              <p className="mt-1 text-sm font-semibold text-app-ink">
                {product.volatilityLabel}
              </p>
            </div>
            <div className="rounded-[10px] border border-app-line bg-app-elevated px-3 py-2.5">
              <p className="app-label">Est. fees / costs</p>
              <p className="mt-1 text-sm font-semibold text-app-ink">
                {formatUsd(product.feeEstimateUsd)} /{" "}
                {formatUsd(product.estimatedCostUsd)}
              </p>
            </div>
          </div>

          <div className="rounded-[10px] border border-app-line bg-app-soft p-3">
            <h3 className="text-sm font-bold text-app-ink">Rebalance rules</h3>
            <p className="mt-1 text-xs text-app-muted">{product.rebalanceRules}</p>
          </div>

          <div className="rounded-[10px] border border-app-line bg-app-soft p-3">
            <h3 className="text-sm font-bold text-app-ink">Activity</h3>
            <ul className="mt-2 space-y-2">
              {product.activity.map((item) => (
                <li key={item.id} className="text-xs">
                  <p className="font-semibold text-app-ink">{item.title}</p>
                  <p className="text-app-muted">
                    {item.subtitle} · {formatRelativeTime(item.atIso)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[10px] border border-app-line bg-app-soft p-3 text-xs text-app-muted">
            <p className="font-bold text-app-ink">Non-custodial disclosure</p>
            <p className="mt-1">
              You hold the real underlying assets in your wallet. INDEXLA cannot
              withdraw funds or expand its own permissions.
            </p>
            <p className="mt-2 font-semibold text-app-danger">{DEGEN_RISK_WARNING}</p>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-[10px] border border-app-line bg-app-elevated p-4">
            <p className="app-label">30D performance</p>
            <p
              className={[
                "app-metric mt-1 text-3xl",
                positive ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {formatPercent(product.performance30d, true)}
            </p>
            <div className="mt-3">
              <MiniLineChart points={product.chartSeries} height={96} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-app-dim">AUM</dt>
                <dd className="font-semibold text-app-ink">
                  {formatUsd(product.aumUsd, true)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-app-dim">Volume</dt>
                <dd className="font-semibold text-app-ink">
                  {formatUsd(product.volumeUsd, true)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-app-dim">Investors</dt>
                <dd className="font-semibold text-app-ink">
                  {product.investors.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-app-dim">Likes</dt>
                <dd className="font-semibold text-app-ink">
                  {product.likes + (liked ? 1 : 0)}
                </dd>
              </div>
            </dl>
          </div>

          <button
            type="button"
            onClick={onInvest}
            className="app-btn-invest flex h-11 w-full items-center justify-center rounded-[10px] text-sm"
          >
            Invest
          </button>
          <Link
            href={APP_ROUTES.create + "?template=degen"}
            className="app-btn-customize flex h-11 w-full items-center justify-center rounded-[10px] text-sm"
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="build-degen-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-[14px] border border-app-line bg-app-elevated p-5 shadow-xl">
        <h3 id="build-degen-title" className="app-display text-lg font-bold text-app-ink">
          Build Your Own
        </h3>
        <div
          className="rounded-[10px] border border-app-danger/40 bg-app-danger/10 px-3 py-2 text-sm font-semibold text-app-danger"
          role="alert"
        >
          {DEGEN_RISK_WARNING}
        </div>
        <p className="text-sm text-app-muted">
          Continue to Create with the Degen Index template. Preview only — no
          real execution.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white"
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invest-degen-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-[14px] border border-app-line bg-app-elevated p-5 shadow-xl">
        <h3
          id="invest-degen-title"
          className="app-display text-lg font-bold text-app-ink"
        >
          Investment confirmation
        </h3>
        <p className="text-sm text-app-muted">
          {product.name} · Est. fees {formatUsd(product.feeEstimateUsd)} · Est.
          costs {formatUsd(product.estimatedCostUsd)} · Illustrative
        </p>
        <div
          className="rounded-[10px] border border-app-danger/40 bg-app-danger/10 px-3 py-2 text-sm font-semibold text-app-danger"
          role="alert"
        >
          {DEGEN_RISK_WARNING}
        </div>
        <label className="flex items-start gap-2 text-sm font-semibold text-app-ink">
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
            className="h-9 w-full rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
          >
            Connect Wallet
          </button>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-[10px] border border-app-line px-3 text-[12px] font-bold text-app-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!acknowledged || !walletConnected}
            onClick={onConfirm}
            className="h-9 app-gradient-btn rounded-[10px] px-3 text-[12px] font-bold text-white disabled:opacity-40"
          >
            Confirm Invest Preview
          </button>
        </div>
      </div>
    </div>
  );
}
