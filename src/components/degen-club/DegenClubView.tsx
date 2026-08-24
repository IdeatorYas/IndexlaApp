"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type DegenClubWorkspace,
  type DegenDiscoverFilter,
  type DegenMarketTab,
  type DegenProduct,
} from "@/lib/domain/degen-club";
import { CreateAllocationDonut } from "@/components/create/CreateAllocationDonut";
import {
  DegenChainCategories,
  DegenMultiChainBanner,
} from "@/components/degen-club/DegenChainCategories";
import { DegenShotsVisual } from "@/components/degen-club/DegenShotsVisual";
import {
  DegenBuildModal,
  DegenInvestModal,
  DegenRiskBanner,
} from "@/components/degen-club/DegenModals";
import {
  enrichDegenProduct,
  useDegenPrices,
} from "@/components/degen-club/useDegenPrices";
import { ProductAttribution } from "@/components/product/ProductIdentity";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { PreviewOnlyMessage } from "@/components/ui/PreviewOnlyMessage";
import { DEGEN_ASSETS } from "@/lib/fixtures/degen-asset-registry";
import { DEGEN_MARKET_TABS } from "@/lib/fixtures/degen-club";

type ViewState = "loading" | "ready" | "error" | "empty";

export function DegenClubView({
  workspace,
  illustrative,
  initialError = false,
}: {
  workspace: DegenClubWorkspace;
  illustrative: boolean;
  initialError?: boolean;
}) {
  const router = useRouter();
  const { wallet, connectDemo } = useDemoWallet();
  const { prices, stale: pricesStale } = useDegenPrices();

  const [viewState, setViewState] = useState<ViewState>(
    initialError ? "error" : "loading",
  );
  const [marketTab, setMarketTab] = useState<DegenMarketTab>("indexes");
  const [chainFilter, setChainFilter] = useState<DegenDiscoverFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [staleOverride, setStaleOverride] = useState(workspace.marketDataStale);
  const [buildOpen, setBuildOpen] = useState(false);
  const [investProduct, setInvestProduct] = useState<DegenProduct | null>(null);
  const [investAck, setInvestAck] = useState(false);

  useEffect(() => {
    if (initialError) return;
    const timer = window.setTimeout(() => {
      setViewState(workspace.products.length === 0 ? "empty" : "ready");
    }, 280);
    return () => window.clearTimeout(timer);
  }, [initialError, workspace.products.length]);

  const enrichedProducts = useMemo(
    () => workspace.products.map((p) => enrichDegenProduct(p, prices)),
    [workspace.products, prices],
  );

  const logoByAsset = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const asset of Object.values(DEGEN_ASSETS)) {
      const live = prices[asset.coingeckoId];
      if (live?.imageUrl) out[asset.key] = live.imageUrl;
    }
    return out;
  }, [prices]);

  const filtered = useMemo(() => {
    let list =
      marketTab === "indexes"
        ? enrichedProducts.filter((p) => p.kind === "Index")
        : enrichedProducts.filter((p) => p.kind === "Portfolio");

    if (marketTab === "indexes" && chainFilter !== "all") {
      list = list.filter(
        (p) =>
          p.networkIds.length === 1 && p.networkIds[0] === chainFilter,
      );
    }
    return list;
  }, [enrichedProducts, marketTab, chainFilter]);

  const scrollToMarketplace = useCallback(() => {
    setMarketTab("indexes");
    setChainFilter("all");
    document.getElementById("degen-marketplace")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  function preview(action: string) {
    setMessage(
      `${action} — preview only. No real wallet signing, invest or execution was submitted.`,
    );
  }

  if (viewState === "loading") {
    return (
      <div className="space-y-4">
        <DegenRiskBanner />
        <LoadingSkeleton title="Loading Degen Club" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="space-y-4">
        <DegenRiskBanner />
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
        <DegenRiskBanner />
        <EmptyState
          title="No memecoin indexes yet"
          description="When illustrative Degen products publish, they will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DegenRiskBanner />

      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="degen-brand-pill">{workspace.hero.title}</span>
        {illustrative ? <span className="degen-illustrative-tag">Illustrative</span> : null}
      </header>

      {(staleOverride || workspace.marketDataStale || pricesStale) ? (
        <div className="degen-stale-banner" role="status">
          AUM, 30D performance, investors and activity are Illustrative. Live
          CoinGecko prices and logos may be delayed.
          <button
            type="button"
            className="ml-2 font-bold underline"
            onClick={() => {
              setStaleOverride(false);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {message ? <PreviewOnlyMessage>{message}</PreviewOnlyMessage> : null}

      {/* Compact hero */}
      <section className="degen-hero-compact degen-panel p-3 sm:p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-5">
          <div className="space-y-2.5">
            <h1 className="degen-headline degen-headline-compact">
              {workspace.hero.headline}
            </h1>
            <p className="degen-subheadline degen-subheadline-compact">
              {workspace.hero.subheadline}
            </p>
            <div className="degen-trust-row">
              {workspace.hero.trustBadges.map((badge) => (
                <span key={badge} className="degen-trust-badge">
                  {badge}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <button type="button" onClick={scrollToMarketplace} className="degen-btn-primary h-9 px-3 text-[11px]">
                Discover Indexes
              </button>
              <button type="button" onClick={() => setBuildOpen(true)} className="degen-btn-secondary h-9 px-3 text-[11px]">
                Build Your Basket
              </button>
            </div>
          </div>
          <DegenShotsVisual logoByAsset={logoByAsset} />
        </div>
      </section>

      {/* Marketplace */}
      <section id="degen-marketplace" className="space-y-3">
        <div>
          <h2 className="degen-section-title">Marketplace</h2>
          <p className="degen-section-sub mt-0.5">
            Memecoin indexes and portfolios · Risk: Extreme · Product metrics
            Illustrative
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Marketplace category">
          {DEGEN_MARKET_TABS.map((item) => {
            const active = item.id === marketTab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMarketTab(item.id)}
                className={["degen-tab degen-tab-lg", active ? "degen-tab-active" : ""].join(" ")}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {marketTab === "indexes" ? (
          <DegenChainCategories active={chainFilter} onSelect={setChainFilter} />
        ) : (
          <DegenMultiChainBanner />
        )}

        {filtered.length === 0 ? (
          <EmptyState
            title="No products in this filter"
            description="Try another chain category."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onInvest={() => {
                  if (wallet.state !== "connected") connectDemo();
                  setInvestAck(false);
                  setInvestProduct(product);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {buildOpen ? (
        <DegenBuildModal
          onCancel={() => setBuildOpen(false)}
          onContinue={() => {
            setBuildOpen(false);
            router.push(`${APP_ROUTES.create}?template=degen`);
          }}
        />
      ) : null}

      {investProduct ? (
        <DegenInvestModal
          product={investProduct}
          acknowledged={investAck}
          walletConnected={wallet.state === "connected"}
          onAckChange={setInvestAck}
          onCancel={() => setInvestProduct(null)}
          onConnect={connectDemo}
          onConfirm={() => {
            setInvestProduct(null);
            preview(`Invest preview · ${investProduct.name}`);
          }}
        />
      ) : null}
    </div>
  );
}

function ProductCard({
  product,
  onInvest,
}: {
  product: DegenProduct;
  onInvest: () => void;
}) {
  const positive = product.performance30d >= 0;
  const dense = product.allocations.length >= 8;

  return (
    <article className="degen-card">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="degen-badge-kind">{product.kind}</span>
        <span className="degen-badge-extreme">Extreme</span>
        <span className="degen-illustrative-tag">Illustrative</span>
      </div>

      <h3 className="degen-card-title mt-1">{product.name}</h3>
      <ProductAttribution
        creatorName={product.creatorName}
        creatorHandle={product.creatorHandle}
        verified={product.verified}
        className="mt-0.5 truncate text-[11px] font-semibold text-[var(--degen-muted)]"
      />

      <div className="flex justify-center py-1">
        <CreateAllocationDonut
          segments={product.allocations.map((a) => ({
            assetKey: a.assetId,
            label: a.label,
            percent: a.percent,
            imageUrl: a.imageUrl,
          }))}
          size={dense ? 128 : 140}
          totalPercent={100}
          compact
        />
      </div>

      <p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--degen-muted)]">
        {product.thesis}
      </p>

      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--degen-neon-orange)]">
        {product.chainLabel} · Risk: Extreme
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <CardMetric
          label="30D · Illus."
          value={formatPercent(product.performance30d, true)}
          positive={positive}
        />
        <CardMetric label="AUM · Illus." value={formatUsd(product.aumUsd, true)} />
        <CardMetric label="Investors · Illus." value={product.investors.toLocaleString()} />
        <CardMetric label="Chain" value={product.chainLabel} />
      </dl>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <button type="button" onClick={onInvest} className="degen-btn-primary h-9 text-[11px] uppercase tracking-wide">
          Invest
        </button>
        <Link
          href={APP_ROUTES.degenProduct(product.id)}
          className="degen-btn-secondary flex h-9 items-center justify-center text-[11px] uppercase tracking-wide"
        >
          View Details
        </Link>
      </div>
    </article>
  );
}

function CardMetric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <dt className="degen-metric-label">{label}</dt>
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
