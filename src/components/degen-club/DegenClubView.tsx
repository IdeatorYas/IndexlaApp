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
import {
  MarketplaceTitle,
  PrimaryProductTabs,
} from "@/components/marketplace/MarketplaceNav";
import { ProductAttribution } from "@/components/product/ProductIdentity";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/states/AppStates";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { DEGEN_ASSETS } from "@/lib/fixtures/degen-asset-registry";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { PreviewOnlyMessage } from "@/components/ui/PreviewOnlyMessage";

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
  const { wallet, connect } = useDemoWallet();
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
        <MarketplaceTitle compact />
        <PrimaryProductTabs
          selected={marketTab}
          onSelect={setMarketTab}
          compact
        />

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
                  if (wallet.state !== "connected") connect();
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
          onConnect={connect}
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
    <article className="app-marketplace-card app-marketplace-card-index group relative flex h-full flex-col overflow-hidden p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="app-product-kind-badge app-product-kind-badge-index px-1.5 py-0.5 text-[8px]">
          {product.kind}
        </span>
        <span className="rounded-md border border-app-danger/30 bg-app-danger/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-app-danger">
          Extreme
        </span>
        <span className="rounded-md border border-app-line bg-app-panel px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-app-muted">
          Illustrative
        </span>
      </div>

      <h3 className="app-display mt-3 text-[16px] font-bold leading-tight text-app-ink sm:text-[17px]">
        {product.name}
      </h3>
      <ProductAttribution
        creatorName={product.creatorName}
        creatorHandle={product.creatorHandle}
        verified={product.verified}
        className="mt-1 truncate text-[11px] font-semibold text-app-muted"
      />

      <div className="mx-auto my-3 flex justify-center">
        <DegenCardDonut
          segments={product.allocations.map((a) => ({
            assetKey: a.assetId,
            label: a.label,
            percent: a.percent,
            imageUrl: a.imageUrl,
          }))}
          size={160}
        />
      </div>

      <p className="text-[11px] font-semibold text-app-dim">
        {product.chainLabel} · Risk: Extreme
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-2">
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

      <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
        <button
          type="button"
          onClick={onTrade}
          className="app-btn-invest flex h-9 items-center justify-center rounded-[10px] text-[11px] uppercase tracking-wide"
        >
          Trade
        </button>
        <Link
          href={APP_ROUTES.degenProduct(product.id)}
          className="flex h-9 items-center justify-center rounded-[10px] border border-[var(--ctl-idle-border)] bg-[var(--ctl-idle-bg)] text-[11px] font-bold uppercase tracking-wide text-[var(--ctl-idle-ink)]"
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
    <div className="app-marketplace-metric px-2 py-1.5">
      <dt className="text-[8px] font-bold uppercase tracking-wider text-app-dim">{label}</dt>
      <dd
        className={[
          "app-metric mt-0.5 text-[13px] font-bold tabular-nums",
          positive === undefined
            ? "text-app-ink"
            : positive
              ? "text-app-success"
              : "text-app-danger",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
