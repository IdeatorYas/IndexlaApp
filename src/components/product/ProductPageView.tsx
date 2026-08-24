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
  const dense = product.allocations.length >= 8;
  const showIllustrative = product.isIllustrative !== false;

  return (
    <div
      className={[
        "relative mx-auto space-y-2.5 pb-24 transition-all duration-500 lg:space-y-3 lg:pb-5",
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      ].join(" ")}
      style={{ maxWidth: "var(--content-max)" }}
    >
      {/* Hero: name · metrics — compact, allocation lifts up */}
      <section
        className="relative shrink-0 overflow-hidden rounded-[16px] border"
        style={{
          borderColor: typeStyle.border,
          background: `
            radial-gradient(ellipse 70% 55% at 100% 0%, ${typeStyle.surface}, transparent 58%),
            linear-gradient(165deg, var(--color-bg-elevated) 0%, var(--color-panel) 100%)
          `,
          boxShadow: `0 16px 40px -28px ${typeStyle.glow}`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${typeStyle.color}, transparent)`,
          }}
          aria-hidden
        />

        <div className="relative px-3 py-2.5 sm:px-4 sm:py-3">
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
            {showIllustrative ? <IllustrativeBadge compact /> : null}
          </div>

          <div className="mt-1.5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
            <div className="min-w-0 flex-1">
              <div
                className={[
                  "w-full rounded-[10px] px-3 py-1.5 sm:px-3.5 sm:py-2",
                  PRODUCT_NAME_BOX_CLASS,
                ].join(" ")}
                style={productNameBoxStyle(typeStyle)}
              >
                <h1 className="app-display text-[1.2rem] font-bold leading-tight sm:text-[1.45rem]">
                  {product.name}
                </h1>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
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
              <p className="mt-1 line-clamp-1 max-w-3xl text-[12px] leading-snug text-app-muted sm:text-[13px]">
                {product.description}
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto lg:min-w-[480px] lg:shrink-0">
              <MetricTile
                label="30D"
                value={formatPercent(product.performance30d, true)}
                accent={
                  positive ? "var(--color-success)" : "var(--color-danger)"
                }
                valueClass={positive ? "text-app-success" : "text-app-danger"}
              />
              <MetricTile
                label="AUM"
                value={formatUsd(product.aumUsd, true)}
                accent="var(--color-accent-blue)"
              />
              <MetricTile
                label="Volume"
                value={formatUsd(product.volumeUsd, true)}
                accent="var(--color-accent-violet)"
              />
              <MetricTile
                label="Investors"
                value={String(product.investors)}
                accent="var(--color-accent-cyan)"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Allocation — lifted under compact hero for first-screen focus */}
      <section className="relative overflow-hidden rounded-[18px] border border-app-line/50 bg-gradient-to-b from-app-elevated via-app-elevated to-app-panel/85 p-2 shadow-[0_20px_48px_-32px_rgba(0,0,0,0.4)] sm:p-3 lg:min-h-[min(58vh,600px)] lg:p-3.5">
        <header className="mb-1 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
              Composition
            </p>
            <h2 className="app-display mt-0.5 text-lg font-bold text-app-ink sm:text-xl">
              Portfolio Allocation
            </h2>
          </div>
        </header>
        <PremiumAllocationVisual
          allocations={product.allocations}
          size={dense ? 260 : 300}
          compact={dense}
        />
      </section>

      {/* Strategy below allocation */}
      <section className="overflow-hidden rounded-[16px] border border-app-line/50 bg-gradient-to-br from-app-elevated/95 to-app-panel/70 p-3 sm:p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
              Automation
            </p>
            <h2 className="app-display mt-0.5 text-base font-bold text-app-ink sm:text-lg">
              Selected Strategy
            </h2>
          </div>
          <span className="rounded-full border border-app-success/35 bg-app-success/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-app-success">
            Automation · {strategy.automationStatus}
          </span>
        </div>
        <p
          className="mt-1.5 text-[14px] font-bold"
          style={{ color: typeStyle.color }}
        >
          {strategy.name}
        </p>
        <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-app-muted sm:text-[13px]">
          {strategy.explanation}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {strategy.thresholds.map((item) => (
            <span
              key={item.label}
              className="rounded-full border border-app-line/50 bg-app-soft/40 px-2.5 py-1 text-[11px] text-app-muted"
            >
              <span className="font-bold text-app-ink">{item.value}</span>{" "}
              {item.label}
            </span>
          ))}
        </div>
      </section>

      {/* Risk Disclosure near bottom, above Invest / Customize */}
      <RiskDisclosure variant="page" density="compact" />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-app-line/70 bg-app-elevated/92 px-3 py-2 backdrop-blur-md lg:static lg:rounded-[12px] lg:border lg:border-app-line/50 lg:bg-gradient-to-r lg:from-app-elevated lg:to-app-panel/80 lg:px-3 lg:py-2 lg:shadow-[0_12px_36px_-24px_rgba(0,0,0,0.35)]">
        <div
          className="mx-auto flex gap-2.5"
          style={{ maxWidth: "var(--content-max)" }}
        >
          <button
            type="button"
            className="app-btn-invest h-11 flex-1 rounded-[12px] text-[14px]"
            onClick={() => {
              if (wallet.state !== "connected") connectDemo();
              openInvest();
            }}
          >
            Invest
          </button>
          <Link
            href={`${APP_ROUTES.create}?from=${product.id}&mode=customize`}
            className="app-btn-customize flex h-11 flex-1 items-center justify-center rounded-[12px] text-[14px]"
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
}: {
  label: string;
  value: string;
  accent: string;
  valueClass?: string;
}) {
  return (
    <div
      className="flex min-h-[52px] flex-col items-center justify-center rounded-[12px] border bg-gradient-to-b from-app-elevated to-app-panel/80 px-2 py-1.5 text-center sm:min-h-[58px]"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 42%, transparent)`,
        boxShadow: `0 8px 18px -14px ${accent}`,
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-wide sm:text-[11px]"
        style={{ color: accent }}
      >
        {label}
      </p>
      <p
        className={[
          "mt-1 text-[16px] font-bold leading-none sm:text-[18px]",
          valueClass ?? "text-app-ink",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
