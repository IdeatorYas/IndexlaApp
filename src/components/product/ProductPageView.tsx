"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";
import { InvestmentChoiceModal } from "@/components/product/InvestmentChoiceModal";
import { PremiumAllocationVisual } from "@/components/product/PremiumAllocationVisual";
import { ExactProductTypeBadge } from "@/components/product/ProductIdentity";
import { ProductCreatorLine } from "@/components/product/ProductCreatorLine";
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
      {/* 1–3: Name → type/creator/description → compact metrics */}
      <section
        className="relative overflow-hidden rounded-[22px] border"
        style={{
          borderColor: typeStyle.border,
          background: `
            radial-gradient(ellipse 80% 70% at 100% 0%, ${typeStyle.surface}, transparent 55%),
            linear-gradient(165deg, var(--color-bg-elevated) 0%, var(--color-panel) 100%)
          `,
          boxShadow: `0 20px 56px -28px ${typeStyle.glow}`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${typeStyle.color}, transparent)`,
          }}
          aria-hidden
        />

        <div className="relative space-y-4 p-4 sm:p-5 lg:p-6">
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
              "w-full rounded-[16px] px-4 py-3.5 sm:px-5 sm:py-4",
              PRODUCT_NAME_BOX_CLASS,
            ].join(" ")}
            style={productNameBoxStyle(typeStyle)}
          >
            <h1 className="app-display text-[1.55rem] font-bold leading-tight sm:text-[2rem]">
              {product.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[12px] border border-app-line/50 bg-app-elevated/70 px-3 py-2">
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

          <p className="max-w-3xl text-[14px] leading-relaxed text-app-muted sm:text-[15px]">
            {product.description}
          </p>

          {/* Compact key metrics */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricTile
              label="30D"
              value={formatPercent(product.performance30d, true)}
              accent={
                positive
                  ? "var(--color-success)"
                  : "var(--color-danger)"
              }
              valueClass={
                positive ? "text-app-success" : "text-app-danger"
              }
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
      </section>

      {/* 4: Allocation — immediately below metrics */}
      <section className="mt-3 overflow-hidden rounded-[22px] border border-app-line/55 bg-gradient-to-b from-app-elevated via-app-elevated to-app-panel/80 p-4 shadow-[0_16px_48px_-28px_rgba(0,0,0,0.3)] sm:mt-4 sm:p-5 lg:p-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
              Composition
            </p>
            <h2 className="app-display mt-0.5 text-xl font-bold text-app-ink sm:text-2xl">
              Allocation
            </h2>
            <p className="mt-1 text-[12px] text-app-muted">
              Published target weights with native asset colors and logos
            </p>
          </div>
          <IllustrativeBadge compact />
        </header>
        <PremiumAllocationVisual allocations={product.allocations} />
      </section>

      {/* Strategy + Performance */}
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
          <p className="mt-2 text-[12px] text-app-muted">
            Selected strategy:{" "}
            <span className="font-bold text-app-ink">{strategy.name}</span>
          </p>
        </section>
      </div>

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
  valueClass,
}: {
  label: string;
  value: string;
  accent: string;
  valueClass?: string;
}) {
  return (
    <div
      className="flex min-h-[64px] flex-col items-center justify-center rounded-[14px] border bg-gradient-to-b from-app-elevated to-app-panel/80 px-1.5 py-2 text-center"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
      }}
    >
      <p
        className="text-[9px] font-bold uppercase tracking-wide"
        style={{ color: accent }}
      >
        {label}
      </p>
      <p
        className={[
          "mt-0.5 text-[13px] font-bold sm:text-sm",
          valueClass ?? "text-app-ink",
        ].join(" ")}
      >
        {value}
      </p>
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
