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

  return (
    <div
      className={[
        "relative mx-auto pb-28 transition-all duration-500",
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      ].join(" ")}
      style={{ maxWidth: "var(--content-max)" }}
    >
      {/* ─── Cinematic hero ─── */}
      <section
        className="relative overflow-hidden rounded-[22px] border"
        style={{
          borderColor: typeStyle.border,
          background: `
            radial-gradient(ellipse 80% 70% at 100% 0%, ${typeStyle.surface}, transparent 55%),
            radial-gradient(ellipse 60% 50% at 0% 100%, color-mix(in srgb, ${typeStyle.fill} 12%, transparent), transparent 50%),
            linear-gradient(165deg, var(--color-bg-elevated) 0%, var(--color-panel) 100%)
          `,
          boxShadow: `0 24px 64px -28px ${typeStyle.glow}`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${typeStyle.color}, transparent)`,
          }}
          aria-hidden
        />
        <div className="relative grid gap-6 p-4 sm:p-6 lg:grid-cols-[1.25fr_0.85fr] lg:items-stretch lg:gap-8 lg:p-7">
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <ExactProductTypeBadge
                kind={product.kind}
                indexType={product.indexType}
              />
              {product.featured ? (
                <span className="rounded-full border border-app-line/60 bg-app-elevated/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-muted">
                  Featured
                </span>
              ) : null}
              {product.isNew ? (
                <span className="rounded-full bg-app-success/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-success">
                  New
                </span>
              ) : null}
              <IllustrativeBadge compact />
            </div>

            <div
              className={[
                "mt-4 w-full max-w-2xl rounded-[16px] px-4 py-4 sm:px-5 sm:py-5",
                PRODUCT_NAME_BOX_CLASS,
              ].join(" ")}
              style={productNameBoxStyle(typeStyle)}
            >
              <h1 className="app-display text-[1.65rem] font-bold leading-tight sm:text-[2.15rem]">
                {product.name}
              </h1>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="rounded-[14px] border border-app-line/50 bg-app-elevated/70 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-app-dim">
                  Creator
                </p>
                <div className="mt-1">
                  <ProductCreatorLine
                    creatorName={product.creatorName}
                    creatorHandle={product.creatorHandle}
                  />
                </div>
              </div>
              {!official ? (
                <Link
                  href={APP_ROUTES.creatorProfile(product.creatorHandle)}
                  className="text-[12px] font-semibold text-app-brand hover:underline"
                >
                  View creator profile →
                </Link>
              ) : null}
            </div>

            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-app-muted">
              {product.description}
            </p>

            <div className="mt-5 rounded-[16px] border border-app-line/40 bg-app-elevated/50 px-3 py-3">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-app-dim">
                Asset composition · {product.assetIds.length}
              </p>
              <AssetIconStack
                assetIds={product.assetIds}
                size={32}
                max={product.assetIds.length}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div
              className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-[20px] border p-4 sm:p-5"
              style={{
                borderColor: typeStyle.border,
                background: `linear-gradient(160deg, color-mix(in srgb, ${typeStyle.fill} 14%, var(--color-bg-elevated)) 0%, var(--color-bg-elevated) 55%)`,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-app-dim">
                  30D performance
                </p>
                <IllustrativeBadge compact />
              </div>
              <p
                className={[
                  "app-metric mt-2 text-[3rem] leading-none sm:text-[3.4rem]",
                  positive ? "text-app-success" : "text-app-danger",
                ].join(" ")}
              >
                {formatPercent(product.performance30d, true)}
              </p>
              <p className="mt-4 text-[12px] text-app-muted">
                Selected strategy
              </p>
              <p className="app-display mt-0.5 text-[15px] font-bold text-app-ink">
                {strategy.name}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
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

      {/* ─── Allocation centerpiece ─── */}
      <section className="mt-4 overflow-hidden rounded-[22px] border border-app-line/55 bg-gradient-to-b from-app-elevated via-app-elevated to-app-panel/80 p-4 shadow-[0_16px_48px_-28px_rgba(0,0,0,0.35)] sm:p-5 lg:p-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
              Composition
            </p>
            <h2 className="app-display mt-0.5 text-xl font-bold text-app-ink sm:text-2xl">
              Allocation
            </h2>
            <p className="mt-1 text-[12px] text-app-muted">
              Published target weights with live asset logos
            </p>
          </div>
          <IllustrativeBadge compact />
        </header>
        <PremiumAllocationVisual allocations={product.allocations} />
      </section>

      {/* ─── Strategy + Performance ─── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-[22px] border border-app-line/55 bg-app-elevated/90 p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
            Automation
          </p>
          <h2 className="app-display mt-0.5 text-xl font-bold text-app-ink">
            Selected Strategy
          </h2>
          <p
            className="mt-2 text-[15px] font-bold"
            style={{ color: typeStyle.color }}
          >
            {strategy.name}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-app-muted">
            {strategy.explanation}
          </p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <GlassBlock title="Rules">
              <ul className="space-y-1.5 text-[12px] leading-snug text-app-muted">
                {strategy.rules.map((rule) => (
                  <li key={rule} className="flex gap-2">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: typeStyle.color }}
                    />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </GlassBlock>
            <GlassBlock title="Triggers">
              <ul className="space-y-1.5 text-[12px] leading-snug text-app-muted">
                {strategy.triggers.map((trigger) => (
                  <li key={trigger} className="flex gap-2">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: typeStyle.color }}
                    />
                    <span>{trigger}</span>
                  </li>
                ))}
              </ul>
            </GlassBlock>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {strategy.thresholds.map((item) => (
              <div
                key={item.label}
                className="rounded-[14px] border border-app-line/45 bg-app-panel/70 px-2.5 py-2.5 text-center"
              >
                <p className="text-[9px] font-bold uppercase tracking-wide text-app-dim">
                  {item.label}
                </p>
                <p className="mt-0.5 text-[13px] font-bold text-app-ink">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-app-success/40 bg-app-success/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-app-success">
              Automation · {strategy.automationStatus}
            </span>
          </div>

          <p className="mt-3 rounded-[14px] border border-app-line/45 bg-app-soft/40 p-3 text-[12px] leading-relaxed text-app-muted">
            {strategy.permissionsDisclosure}
          </p>
        </section>

        <section className="flex flex-col overflow-hidden rounded-[22px] border border-app-line/55 bg-app-elevated/90 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
                Track record
              </p>
              <h2 className="app-display mt-0.5 text-xl font-bold text-app-ink">
                Performance
              </h2>
            </div>
            <IllustrativeBadge compact />
          </div>
          <div className="min-h-[200px] flex-1 rounded-[16px] border border-app-line/45 bg-gradient-to-b from-app-panel/80 to-app-soft/30 p-3">
            <MiniLineChart points={product.performanceChart} height={180} />
          </div>
        </section>
      </div>

      {/* ─── Disclosures ─── */}
      <section className="mt-4 rounded-[18px] border border-app-line/45 bg-app-panel/40 px-4 py-3.5 sm:px-5">
        <h2 className="app-display text-base font-bold text-app-ink">
          Disclosures
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-app-muted">
          You hold the real underlying assets in your wallet. INDEXLA cannot
          withdraw funds or expand its own permissions. Fees, Save discount, gas
          / bridge estimates and CoW or LI.FI / Across routing appear at
          investment confirmation — not executable in preview.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-app-muted">
          AUM, volume, investor counts and performance charts are illustrative
          until connected to live INDEXLA data feeds.
        </p>
      </section>

      {/* ─── Sticky CTAs ─── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-app-line/70 bg-app-elevated/92 px-3 py-2.5 backdrop-blur-md">
        <div
          className="mx-auto flex max-w-3xl gap-2.5"
          style={{ maxWidth: "var(--content-max)" }}
        >
          <button
            type="button"
            className="app-btn-invest h-12 flex-1 rounded-[14px] text-[14px]"
            onClick={() => {
              if (wallet.state !== "connected") connectDemo();
              openInvest();
            }}
          >
            Invest
          </button>
          <Link
            href={`${APP_ROUTES.create}?from=${product.id}&mode=customize`}
            className="app-btn-customize flex h-12 flex-1 items-center justify-center rounded-[14px] text-[14px]"
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
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="flex min-h-[76px] flex-col items-center justify-center rounded-[16px] border bg-gradient-to-b from-app-elevated to-app-panel/80 px-1.5 py-2 text-center transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
        boxShadow: `0 8px 20px -12px color-mix(in srgb, ${accent} 55%, transparent)`,
      }}
    >
      <p
        className="text-[9px] font-bold uppercase tracking-wide"
        style={{ color: accent }}
      >
        {label}
      </p>
      <p className="mt-0.5 text-[13px] font-bold text-app-ink sm:text-sm">
        {value}
      </p>
      <div className="mt-1">
        <IllustrativeBadge compact />
      </div>
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
    <div className="rounded-[14px] border border-app-line/45 bg-app-panel/55 p-3 backdrop-blur-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-app-dim">
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
