"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";
import { InvestmentChoiceModal } from "@/components/product/InvestmentChoiceModal";
import { PremiumAllocationVisual } from "@/components/product/PremiumAllocationVisual";
import { ExactProductTypeBadge } from "@/components/product/ProductIdentity";
import { ProductCreatorLine } from "@/components/product/ProductCreatorLine";
import { RiskDisclosure } from "@/components/product/RiskDisclosure";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import {
  getProductTypeStyle,
  isIndexlaProduct,
  PRODUCT_NAME_BOX_CLASS,
  productNameBoxStyle,
} from "@/lib/product/product-type";

export function ProductPageView({ product }: { product: MarketplaceProduct }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { wallet, connectDemo } = useDemoWallet();
  const [investOpen, setInvestOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (searchParams.get("action") === "invest") {
      setInvestOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 30);
    return () => window.clearTimeout(t);
  }, []);

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
  const assetCount = product.allocations.length;
  const dense = assetCount >= 8;

  return (
    <div
      className={[
        "relative mx-auto pb-20 transition-all duration-500 lg:pb-16",
        "lg:flex lg:h-[calc(100dvh-4.75rem)] lg:min-h-0 lg:flex-col lg:overflow-hidden",
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      ].join(" ")}
      style={{ maxWidth: "var(--content-max)" }}
    >
      <section
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border shadow-[0_24px_60px_-36px_rgba(0,0,0,0.45)]"
        style={{
          borderColor: typeStyle.border,
          background: `
            radial-gradient(ellipse 70% 55% at 100% 0%, ${typeStyle.surface}, transparent 58%),
            radial-gradient(ellipse 45% 40% at 0% 100%, color-mix(in srgb, ${typeStyle.color} 12%, transparent), transparent 55%),
            linear-gradient(165deg, var(--color-bg-elevated) 0%, var(--color-panel) 100%)
          `,
          boxShadow: `0 20px 56px -28px ${typeStyle.glow}`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${typeStyle.color}, transparent)`,
          }}
          aria-hidden
        />

        {/* Top: identity */}
        <header
          className={[
            "relative shrink-0 border-b border-app-line/35",
            dense ? "px-3 py-2.5 sm:px-4" : "px-3.5 py-3 sm:px-5",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <ExactProductTypeBadge
              kind={product.kind}
              indexType={product.indexType}
            />
            {product.featured ? (
              <span className="rounded-full border border-app-line/60 bg-app-elevated/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-muted">
                Featured
              </span>
            ) : null}
            {product.isNew ? (
              <span className="rounded-full bg-app-success/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-success">
                New
              </span>
            ) : null}
            <IllustrativeBadge compact />
          </div>

          <div
            className={[
              "mt-2 w-full rounded-[12px] px-3 py-2 sm:px-4 sm:py-2.5",
              PRODUCT_NAME_BOX_CLASS,
            ].join(" ")}
            style={productNameBoxStyle(typeStyle)}
          >
            <h1
              className={[
                "app-display font-bold leading-tight",
                dense
                  ? "text-[1.25rem] sm:text-[1.55rem]"
                  : "text-[1.35rem] sm:text-[1.7rem]",
              ].join(" ")}
            >
              {product.name}
            </h1>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-app-dim">
                Creator
              </span>
              <ProductCreatorLine
                creatorName={product.creatorName}
                creatorHandle={product.creatorHandle}
              />
            </div>
            {!official ? (
              <Link
                href={APP_ROUTES.creatorProfile(product.creatorHandle)}
                className="text-[11px] font-semibold text-app-brand hover:underline"
              >
                Profile →
              </Link>
            ) : null}
          </div>

          <p
            className={[
              "mt-1.5 max-w-4xl leading-snug text-app-muted",
              dense ? "text-[12px] line-clamp-2" : "text-[13px] line-clamp-2 lg:line-clamp-1",
            ].join(" ")}
          >
            {product.description}
          </p>
        </header>

        {/* Allocation — immediately below identity */}
        <div
          className={[
            "relative min-h-0 flex-1",
            dense ? "px-3 py-2 sm:px-4" : "px-3.5 py-2.5 sm:px-5",
          ].join(" ")}
        >
          <PremiumAllocationVisual
            allocations={product.allocations}
            size={dense ? 280 : 300}
            compact={dense}
          />
        </div>

        {/* Strategy + metrics + compact disclosure — same screen */}
        <footer
          className={[
            "relative shrink-0 border-t border-app-line/35",
            dense ? "px-3 py-2 sm:px-4" : "px-3.5 py-2.5 sm:px-5",
          ].join(" ")}
        >
          <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,1.15fr)] lg:items-stretch">
            <div className="rounded-[14px] border border-app-line/45 bg-gradient-to-br from-app-elevated/90 to-app-panel/60 p-2.5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-app-dim">
                  Strategy
                </p>
                <span className="rounded-full border border-app-success/35 bg-app-success/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-success">
                  {strategy.automationStatus}
                </span>
              </div>
              <p
                className="mt-1 truncate text-[13px] font-bold"
                style={{ color: typeStyle.color }}
              >
                {strategy.name}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-app-muted">
                {strategy.explanation}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {strategy.thresholds.slice(0, 3).map((item) => (
                  <span
                    key={item.label}
                    className="rounded-full border border-app-line/50 bg-app-soft/40 px-2 py-0.5 text-[10px] text-app-muted"
                  >
                    <span className="font-bold text-app-ink">{item.value}</span>{" "}
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
              <MetricTile
                label="30D"
                value={formatPercent(product.performance30d, true)}
                accent={
                  positive ? "var(--color-success)" : "var(--color-danger)"
                }
                valueClass={positive ? "text-app-success" : "text-app-danger"}
                dense
              />
              <MetricTile
                label="AUM"
                value={formatUsd(product.aumUsd, true)}
                accent="var(--color-accent-blue)"
                dense
              />
              <MetricTile
                label="Volume"
                value={formatUsd(product.volumeUsd, true)}
                accent="var(--color-accent-violet)"
                dense
              />
              <MetricTile
                label="Investors"
                value={String(product.investors)}
                accent="var(--color-accent-cyan)"
                dense
              />
            </div>

            <RiskDisclosure
              variant="page"
              density="compact"
              className="h-full"
            />
          </div>
        </footer>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-app-line/70 bg-app-elevated/92 px-3 py-2 backdrop-blur-md lg:static lg:mt-2.5 lg:rounded-[14px] lg:border lg:border-app-line/50 lg:bg-gradient-to-r lg:from-app-elevated lg:to-app-panel/80 lg:px-3 lg:py-2 lg:shadow-[0_12px_36px_-24px_rgba(0,0,0,0.35)]">
        <div
          className="mx-auto flex gap-2.5"
          style={{ maxWidth: "var(--content-max)" }}
        >
          <button
            type="button"
            className="app-btn-invest h-11 flex-1 rounded-[12px] text-[14px] lg:h-12"
            onClick={() => {
              if (wallet.state !== "connected") connectDemo();
              openInvest();
            }}
          >
            Invest
          </button>
          <Link
            href={`${APP_ROUTES.create}?from=${product.id}&mode=customize`}
            className="app-btn-customize flex h-11 flex-1 items-center justify-center rounded-[12px] text-[14px] lg:h-12"
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
  accent,
  valueClass,
  dense,
}: {
  label: string;
  value: string;
  accent: string;
  valueClass?: string;
  dense?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center rounded-[12px] border bg-gradient-to-b from-app-elevated to-app-panel/80 text-center",
        dense ? "min-h-[48px] px-1 py-1.5" : "min-h-[56px] px-1.5 py-2",
      ].join(" ")}
      style={{
        borderColor: `color-mix(in srgb, ${accent} 42%, transparent)`,
        boxShadow: `0 8px 20px -16px ${accent}`,
      }}
    >
      <p
        className="text-[8px] font-bold uppercase tracking-wide"
        style={{ color: accent }}
      >
        {label}
      </p>
      <p
        className={[
          "mt-0.5 font-bold",
          dense ? "text-[12px]" : "text-[13px]",
          valueClass ?? "text-app-ink",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
