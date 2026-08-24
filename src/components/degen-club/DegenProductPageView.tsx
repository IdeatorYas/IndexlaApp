"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreateAllocationDonut } from "@/components/create/CreateAllocationDonut";
import { DegenAssetIcon } from "@/components/degen-club/DegenAssetIcon";
import {
  DegenFullExitModal,
  DegenInvestModal,
  DegenRiskBanner,
} from "@/components/degen-club/DegenModals";
import {
  enrichDegenProduct,
  formatDegenLivePrice,
  useDegenPrices,
} from "@/components/degen-club/useDegenPrices";
import { MiniLineChart } from "@/components/ui/MiniLineChart";
import { ProductAttribution } from "@/components/product/ProductIdentity";
import { PreviewOnlyMessage } from "@/components/ui/PreviewOnlyMessage";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { DEGEN_RISK_WARNING, type DegenProduct } from "@/lib/domain/degen-club";
import {
  formatPercent,
  formatRelativeTime,
  formatUsd,
} from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";

export function DegenProductPageView({ product }: { product: DegenProduct }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { wallet, connectDemo } = useDemoWallet();
  const { prices } = useDegenPrices();
  const enriched = useMemo(
    () => enrichDegenProduct(product, prices),
    [product, prices],
  );

  const [entered, setEntered] = useState(false);
  const [investOpen, setInvestOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [investAck, setInvestAck] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("action") === "invest") setInvestOpen(true);
  }, [searchParams]);

  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  const positive = enriched.performance30d >= 0;
  const dense = enriched.allocations.length >= 8;

  function preview(action: string) {
    setMessage(`${action} — preview only. No real execution was submitted.`);
  }

  return (
    <div
      className={[
        "space-y-3 pb-24 transition-all duration-500 lg:space-y-4 lg:pb-6",
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <Link
          href={APP_ROUTES.degenClub}
          className="text-xs font-bold text-[var(--degen-muted)] hover:text-[var(--degen-ink)]"
        >
          ← Degen Club
        </Link>
        <span className="degen-illustrative-tag">Illustrative</span>
      </div>

      <DegenRiskBanner />

      {message ? <PreviewOnlyMessage>{message}</PreviewOnlyMessage> : null}

      {/* Hero */}
      <section className="degen-detail-hero">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="degen-badge-kind">{enriched.kind}</span>
          <span className="degen-badge-extreme">Extreme Risk</span>
        </div>
        <h1 className="degen-detail-title mt-1.5">{enriched.name}</h1>
        <ProductAttribution
          creatorName={enriched.creatorName}
          creatorHandle={enriched.creatorHandle}
          verified={enriched.verified}
          className="mt-0.5 text-sm font-semibold text-[var(--degen-muted)]"
        />
        <p className="mt-2 line-clamp-3 text-sm text-[var(--degen-muted)]">
          {enriched.thesis}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DetailMetric
            label="30D · Illus."
            value={formatPercent(enriched.performance30d, true)}
            positive={positive}
          />
          <DetailMetric label="AUM · Illus." value={formatUsd(enriched.aumUsd, true)} />
          <DetailMetric
            label="Investors · Illus."
            value={enriched.investors.toLocaleString()}
          />
          <DetailMetric label="Chain" value={enriched.chainLabel} />
        </div>
      </section>

      {/* Allocation */}
      <section className="degen-detail-section">
        <p className="degen-metric-label">Composition</p>
        <h2 className="degen-section-title mt-0.5 text-base">
          Portfolio Allocation
        </h2>
        <div className="mt-2 flex flex-col items-center gap-4 lg:flex-row lg:items-start">
          <CreateAllocationDonut
            segments={enriched.allocations.map((a) => ({
              assetKey: a.assetId,
              label: a.label,
              percent: a.percent,
              imageUrl: a.imageUrl,
            }))}
            size={dense ? 340 : 380}
            totalPercent={100}
            compact={dense}
          />
          <ul className="min-w-0 flex-1 space-y-2">
            {enriched.allocations.map((a) => (
              <li
                key={a.assetId}
                className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--degen-panel-border)] bg-[var(--degen-bg-soft)] px-2.5 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <DegenAssetIcon assetKey={a.assetId} size={28} imageUrl={a.imageUrl} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-[var(--degen-ink)]">
                      {a.name ?? a.label}
                    </span>
                    <span className="text-[10px] text-[var(--degen-muted)]">
                      {a.networkLabel ?? enriched.chainLabel} · Live{" "}
                      {formatDegenLivePrice(a.priceUsd)}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-black text-[var(--degen-neon-gold)]">
                  {a.percent}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Performance chart */}
      <section className="degen-detail-section">
        <p className="degen-metric-label">30D Performance · Illustrative</p>
        <p
          className={[
            "text-3xl font-black",
            positive ? "degen-metric-value-positive" : "degen-metric-value-negative",
          ].join(" ")}
        >
          {formatPercent(enriched.performance30d, true)}
        </p>
        <div className="mt-2">
          <MiniLineChart points={enriched.chartSeries} height={120} />
        </div>
      </section>

      {/* Strategy */}
      <section className="degen-detail-section">
        <p className="degen-metric-label">Rules & Strategy</p>
        <h2 className="degen-section-title mt-0.5 text-base">{enriched.strategy}</h2>
        <p className="mt-2 text-sm text-[var(--degen-muted)]">{enriched.rebalanceRules}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <InfoTile label="Volatility" value={enriched.volatilityLabel} />
          <InfoTile
            label="Est. fees / costs"
            value={`${formatUsd(enriched.feeEstimateUsd)} / ${formatUsd(enriched.estimatedCostUsd)}`}
          />
        </div>
      </section>

      {/* Activity */}
      <section className="degen-detail-section">
        <h2 className="degen-section-title text-base">Activity</h2>
        <ul className="mt-2 space-y-2">
          {enriched.activity.map((item) => (
            <li key={item.id} className="text-sm">
              <p className="font-semibold text-[var(--degen-ink)]">{item.title}</p>
              <p className="text-[var(--degen-muted)]">
                {item.subtitle} · {formatRelativeTime(item.atIso)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="degen-detail-section text-xs text-[var(--degen-muted)]">
        <p className="font-bold text-[var(--degen-ink)]">Non-custodial disclosure</p>
        <p className="mt-1">
          You hold the real underlying assets in your wallet. INDEXLA cannot withdraw
          funds or expand its own permissions.
        </p>
        <p className="mt-2 font-semibold text-[#ff8fab]">{DEGEN_RISK_WARNING}</p>
      </div>

      {/* Fixed actions */}
      <div className="degen-detail-actions">
        <button
          type="button"
          className="degen-btn-primary h-11 flex-1 text-sm uppercase tracking-wide"
          onClick={() => {
            if (wallet.state !== "connected") connectDemo();
            setInvestAck(false);
            setInvestOpen(true);
          }}
        >
          Invest
        </button>
        <button
          type="button"
          className="degen-btn-secondary h-11 flex-1 text-sm uppercase tracking-wide"
          onClick={() => setExitOpen(true)}
        >
          Full Exit
        </button>
      </div>

      {investOpen ? (
        <DegenInvestModal
          product={enriched}
          acknowledged={investAck}
          walletConnected={wallet.state === "connected"}
          onAckChange={setInvestAck}
          onCancel={() => {
            setInvestOpen(false);
            if (searchParams.get("action")) {
              router.replace(APP_ROUTES.degenProduct(product.id), { scroll: false });
            }
          }}
          onConnect={connectDemo}
          onConfirm={() => {
            setInvestOpen(false);
            preview(`Invest preview · ${enriched.name}`);
          }}
        />
      ) : null}

      {exitOpen ? (
        <DegenFullExitModal
          productName={enriched.name}
          onCancel={() => setExitOpen(false)}
          onConfirm={() => {
            setExitOpen(false);
            preview(`Full exit preview · ${enriched.name}`);
          }}
        />
      ) : null}
    </div>
  );
}

function DetailMetric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="degen-detail-metric">
      <p className="degen-metric-label">{label}</p>
      <p
        className={[
          "degen-metric-value mt-0.5",
          positive === true ? "degen-metric-value-positive" : "",
          positive === false ? "degen-metric-value-negative" : "",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--degen-panel-border)] bg-[var(--degen-bg-soft)] px-3 py-2.5">
      <p className="degen-metric-label">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--degen-ink)]">{value}</p>
    </div>
  );
}
