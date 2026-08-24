"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type DegenClubWorkspace,
  type DegenDiscoverFilter,
  type DegenMarketTab,
  type DegenProduct,
} from "@/lib/domain/degen-club";
import { DegenCardDonut } from "@/components/degen-club/DegenCardDonut";
import {
  DegenChainCategories,
  DegenMultiChainBanner,
} from "@/components/degen-club/DegenChainCategories";
import { DegenShotsVisual } from "@/components/degen-club/DegenShotsVisual";
import {
  DegenBuildModal,
  DegenTradeModal,
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
  const { prices } = useDegenPrices();

  const [viewState, setViewState] = useState<ViewState>(
    initialError ? "error" : "loading",
  );
  const [marketTab, setMarketTab] = useState<DegenMarketTab>("indexes");
  const [chainFilter, setChainFilter] = useState<DegenDiscoverFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [tradeProduct, setTradeProduct] = useState<DegenProduct | null>(null);
  const [tradeAck, setTradeAck] = useState(false);

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

  function preview(action: string) {
    setMessage(
      `${action} — preview only. No real wallet signing, invest or execution was submitted.`,
    );
  }

  if (viewState === "loading") {
    return (
      <div className="space-y-4">
        <LoadingSkeleton title="Loading Degen Club" lines={6} />
      </div>
    );
  }

  if (viewState === "error") {
    return (
      <div className="space-y-4">
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
        <DegenRiskBanner />
      </div>
    );
  }

  if (viewState === "empty") {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No memecoin indexes yet"
          description="When illustrative Degen products publish, they will appear here."
        />
        <DegenRiskBanner />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message ? <PreviewOnlyMessage>{message}</PreviewOnlyMessage> : null}

      {/* Compact hero */}
      <section className="degen-hero-compact degen-panel p-2 sm:p-2.5">
        <div className="grid gap-2.5 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-3">
          <div className="space-y-1 sm:space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="degen-hero-brand">DEGEN CLUB</p>
              {illustrative ? (
                <span className="degen-illustrative-tag">Illustrative</span>
              ) : null}
            </div>
            <h1 className="degen-headline degen-headline-compact">
              {workspace.hero.headline}
            </h1>
            <p className="degen-hero-shout">{workspace.hero.subheadline}</p>
            <p className="degen-hero-tagline">{workspace.hero.tagline}</p>
            <p className="degen-hero-trust-line">
              {workspace.hero.trustBadges.join(" · ")}
            </p>
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setBuildOpen(true)}
                className="degen-btn-primary degen-hero-cta h-9 px-4 text-[11px]"
              >
                BUILD YOUR BASKET
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

        <div className="mx-auto max-w-lg">
          <div className="degen-marketplace-tabs" role="tablist" aria-label="Marketplace category">
            {DEGEN_MARKET_TABS.map((item) => {
              const active = item.id === marketTab;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMarketTab(item.id)}
                  className={[
                    "degen-marketplace-tab",
                    active ? "degen-marketplace-tab-active" : "",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
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
                onTrade={() => {
                  if (wallet.state !== "connected") connectDemo();
                  setTradeAck(false);
                  setTradeProduct(product);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Single Extreme Risk Warning — bottom of hub only */}
      <div className="pt-2">
        <DegenRiskBanner />
      </div>

      {buildOpen ? (
        <DegenBuildModal
          onCancel={() => setBuildOpen(false)}
          onContinue={() => {
            setBuildOpen(false);
            router.push(`${APP_ROUTES.create}?template=degen`);
          }}
        />
      ) : null}

      {tradeProduct ? (
        <DegenTradeModal
          product={tradeProduct}
          acknowledged={tradeAck}
          walletConnected={wallet.state === "connected"}
          onAckChange={setTradeAck}
          onCancel={() => setTradeProduct(null)}
          onConnect={connectDemo}
          onConfirm={() => {
            setTradeProduct(null);
            preview(`Trade preview · ${tradeProduct.name}`);
          }}
        />
      ) : null}
    </div>
  );
}

function ProductCard({
  product,
  onTrade,
}: {
  product: DegenProduct;
  onTrade: () => void;
}) {
  const positive = product.performance30d >= 0;

  return (
    <article className="degen-card">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="degen-badge-kind">{product.kind}</span>
        <span className="degen-badge-extreme">Extreme</span>
        <span className="degen-illustrative-tag">Illustrative</span>
      </div>

      <h3 className="degen-card-title">{product.name}</h3>
      <ProductAttribution
        creatorName={product.creatorName}
        creatorHandle={product.creatorHandle}
        verified={product.verified}
        className="truncate text-[11px] font-semibold text-[var(--degen-muted)]"
      />

      <div className="degen-card-donut-wrap">
        <DegenCardDonut
          segments={product.allocations.map((a) => ({
            assetKey: a.assetId,
            label: a.label,
            percent: a.percent,
            imageUrl: a.imageUrl,
          }))}
          size={180}
        />
      </div>

      <p className="degen-card-chain">
        {product.chainLabel} · Risk: Extreme
      </p>

      <dl className="degen-card-metrics">
        <CardMetric
          label="30D · Illus."
          value={formatPercent(product.performance30d, true)}
          positive={positive}
        />
        <CardMetric label="AUM · Illus." value={formatUsd(product.aumUsd, true)} />
        <CardMetric
          label="Investors · Illus."
          value={product.investors.toLocaleString()}
        />
      </dl>

      <div className="degen-card-actions">
        <button
          type="button"
          onClick={onTrade}
          className="degen-btn-primary h-9 text-[11px] uppercase tracking-wide"
        >
          Trade
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
