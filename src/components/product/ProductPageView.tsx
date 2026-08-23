"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";
import { InvestmentChoiceModal } from "@/components/product/InvestmentChoiceModal";
import { PremiumAllocationVisual } from "@/components/product/PremiumAllocationVisual";
import { ExactProductTypeBadge } from "@/components/product/ProductIdentity";
import { ProductCreatorLine } from "@/components/product/ProductCreatorLine";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { getProductTypeStyle, isIndexlaProduct, PRODUCT_NAME_BOX_CLASS, productNameBoxStyle } from "@/lib/product/product-type";

export function ProductPageView({ product }: { product: MarketplaceProduct }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { wallet, connectDemo } = useDemoWallet();
  const [investOpen, setInvestOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("action") === "invest") {
      setInvestOpen(true);
    }
  }, [searchParams]);

  function openInvest() {
    setInvestOpen(true);
  }

  function closeInvest() {
    setInvestOpen(false);
    if (searchParams.get("action")) {
      router.replace(APP_ROUTES.product(product.id), { scroll: false });
    }
  }

  const positive = product.performance30d >= 0;
  const strategy = product.selectedStrategy;
  const typeStyle = getProductTypeStyle(product);
  const official = isIndexlaProduct(product);

  return (
    <div className="relative pb-24">
      <section
        className="relative overflow-hidden rounded-[18px] border bg-gradient-to-br via-app-elevated to-app-panel shadow-[0_20px_60px_-24px_rgba(0,0,0,0.35)]"
        style={{
          borderColor: typeStyle.border,
          background: `linear-gradient(135deg, ${typeStyle.surface} 0%, var(--color-bg-elevated) 38%, color-mix(in srgb, ${typeStyle.fill} 8%, var(--color-bg-elevated)) 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
          style={{ backgroundColor: `${typeStyle.color}33` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full blur-3xl"
          style={{ backgroundColor: `${typeStyle.fill}22` }}
          aria-hidden
        />
        <div className="relative grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ExactProductTypeBadge
                kind={product.kind}
                indexType={product.indexType}
              />
              {product.featured ? (
                <span className="rounded-full bg-app-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase text-app-brand">
                  Featured
                </span>
              ) : null}
            </div>
            <div
              className={[
                "mt-3 w-full max-w-2xl rounded-[14px] px-4 py-3.5 text-center sm:text-left",
                PRODUCT_NAME_BOX_CLASS,
              ].join(" ")}
              style={productNameBoxStyle(typeStyle)}
            >
              <h1 className="app-display text-2xl font-bold sm:text-3xl">
                {product.name}
              </h1>
            </div>
            <div className="mt-3">
              <ProductCreatorLine
                creatorName={product.creatorName}
                creatorHandle={product.creatorHandle}
              />
              {!official ? (
                <Link
                  href={APP_ROUTES.creatorProfile(product.creatorHandle)}
                  className="mt-1 inline-block text-[11px] font-semibold text-app-brand hover:underline"
                >
                  View creator profile →
                </Link>
              ) : null}
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-app-muted">
              {product.description}
            </p>
            <div className="mt-3">
              <AssetIconStack assetIds={product.assetIds} size={28} max={product.assetIds.length} />
            </div>
          </div>
          <div className="rounded-[14px] border border-app-line/50 bg-app-panel/50 p-3 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-app-dim">
                30D performance
              </p>
              <IllustrativeBadge compact />
            </div>
            <p
              className={[
                "app-metric mt-1 text-4xl",
                positive ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {formatPercent(product.performance30d, true)}
            </p>
            <p className="mt-2 text-[11px] text-app-muted">
              Selected strategy:{" "}
              <span className="font-bold text-app-ink">{strategy.name}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2">
        <MetricTile label="AUM" value={formatUsd(product.aumUsd, true)} tone="aum" />
        <MetricTile
          label="Volume"
          value={formatUsd(product.volumeUsd, true)}
          tone="volume"
        />
        <MetricTile
          label="Investors"
          value={String(product.investors)}
          tone="investors"
        />
      </section>

      <section className="mt-3 rounded-[16px] border border-app-line/60 bg-gradient-to-b from-app-elevated/90 to-app-panel/80 p-3 sm:p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="app-display text-lg font-bold text-app-ink">
              Allocation
            </h2>
            <p className="text-[11px] text-app-muted">
              Published target weights with live asset logos
            </p>
          </div>
          <IllustrativeBadge compact />
        </header>
        <PremiumAllocationVisual allocations={product.allocations} />
      </section>

      <section className="mt-3 rounded-[16px] border border-app-line/60 bg-app-elevated/70 p-3 sm:p-4">
        <h2 className="app-display text-lg font-bold text-app-ink">
          Selected Strategy
        </h2>
        <p className="mt-1 text-sm font-bold text-app-brand">{strategy.name}</p>
        <p className="mt-2 text-sm text-app-muted">{strategy.explanation}</p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <GlassBlock title="Rules">
            <ul className="space-y-1 text-[12px] text-app-muted">
              {strategy.rules.map((rule) => (
                <li key={rule}>• {rule}</li>
              ))}
            </ul>
          </GlassBlock>
          <GlassBlock title="Triggers">
            <ul className="space-y-1 text-[12px] text-app-muted">
              {strategy.triggers.map((trigger) => (
                <li key={trigger}>• {trigger}</li>
              ))}
            </ul>
          </GlassBlock>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {strategy.thresholds.map((item) => (
            <div
              key={item.label}
              className="rounded-[10px] border border-app-line/50 bg-app-panel/60 px-2 py-1.5 text-center"
            >
              <p className="text-[9px] font-bold uppercase text-app-dim">
                {item.label}
              </p>
              <p className="text-[12px] font-bold text-app-ink">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-app-success/40 bg-app-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-app-success">
            Automation · {strategy.automationStatus}
          </span>
        </div>

        <p className="mt-3 rounded-[10px] border border-app-line/50 bg-app-soft/50 p-2.5 text-[11px] text-app-muted">
          {strategy.permissionsDisclosure}
        </p>
      </section>

      <section className="mt-3 rounded-[16px] border border-app-line/60 bg-app-elevated/70 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="app-display text-lg font-bold text-app-ink">
            Performance
          </h2>
          <IllustrativeBadge compact />
        </div>
        <div className="h-40 rounded-[12px] border border-app-line/50 bg-app-panel/60 p-2">
          <MiniLineChart points={product.performanceChart} height={140} />
        </div>
      </section>

      <section className="mt-3 space-y-2 rounded-[16px] border border-app-line/60 bg-app-panel/50 p-3 sm:p-4">
        <h2 className="app-display text-base font-bold text-app-ink">
          Disclosures
        </h2>
        <p className="text-[12px] text-app-muted">
          You hold the real underlying assets in your wallet. INDEXLA cannot
          withdraw funds or expand its own permissions. Fees, Save discount, gas
          / bridge estimates and CoW or LI.FI / Across routing appear at
          investment confirmation — not executable in preview.
        </p>
        <p className="text-[12px] text-app-muted">
          AUM, volume, investor counts and performance charts are illustrative
          until connected to live INDEXLA data feeds.
        </p>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-app-line/70 bg-app-panel/95 px-3 py-2 backdrop-blur-md">
        <div
          className="mx-auto flex max-w-3xl gap-2"
          style={{ maxWidth: "var(--content-max)" }}
        >
          <button
            type="button"
            className="app-btn-invest h-11 flex-1 rounded-[12px] text-sm"
            onClick={() => {
              if (wallet.state !== "connected") connectDemo();
              openInvest();
            }}
          >
            Invest
          </button>
          <Link
            href={`${APP_ROUTES.create}?from=${product.id}&mode=customize`}
            className="app-btn-customize flex h-11 flex-1 items-center justify-center rounded-[12px] text-sm"
            onClick={(e) => {
              if (wallet.state !== "connected") {
                e.preventDefault();
                connectDemo();
              }
            }}
          >
            Customize
          </Link>
        </div>
      </div>

      {investOpen ? (
        <InvestmentChoiceModal
          productId={product.id}
          productName={product.name}
          onClose={closeInvest}
        />
      ) : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "aum" | "volume" | "investors";
}) {
  const styles = {
    aum: "border-[color:var(--color-accent-blue)]/50 from-[color:var(--color-accent-blue)]/30 to-[color:var(--color-accent-blue)]/8 shadow-[0_0_16px_-4px_rgba(59,130,246,0.5)]",
    volume:
      "border-[color:var(--color-accent-violet)]/50 from-[color:var(--color-accent-violet)]/30 to-[color:var(--color-accent-violet)]/8 shadow-[0_0_16px_-4px_rgba(124,58,237,0.45)]",
    investors:
      "border-[color:var(--color-accent-cyan)]/50 from-[color:var(--color-accent-cyan)]/30 to-[color:var(--color-accent-cyan)]/8 shadow-[0_0_16px_-4px_rgba(34,211,238,0.4)]",
  };
  return (
    <div
      className={[
        "flex min-h-[72px] flex-col items-center justify-center rounded-[12px] border bg-gradient-to-b px-2 py-2 text-center",
        styles[tone],
      ].join(" ")}
    >
      <p className="text-[9px] font-bold uppercase tracking-wide text-app-dim">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold text-app-ink">{value}</p>
      <IllustrativeBadge compact />
    </div>
  );
}

function GlassBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-app-line/50 bg-app-panel/50 p-2.5 backdrop-blur-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-app-dim">
        {title}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
