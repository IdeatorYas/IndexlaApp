"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DegenAllocationDonut } from "@/components/degen-club/DegenAllocationDonut";
import { DegenAssetIcon } from "@/components/degen-club/DegenAssetIcon";
import {
  DegenFullExitModal,
  DegenTradeModal,
  DegenRiskBanner,
} from "@/components/degen-club/DegenModals";
import {
  enrichDegenProduct,
  formatDegenLivePrice,
  useDegenPrices,
} from "@/components/degen-club/useDegenPrices";
import { ProductAttribution } from "@/components/product/ProductIdentity";
import { PreviewOnlyMessage } from "@/components/ui/PreviewOnlyMessage";
import { useDemoWallet } from "@/components/wallet/DemoWalletProvider";
import { type DegenProduct } from "@/lib/domain/degen-club";
import { DegenRiskCopy } from "@/components/degen-club/DegenRiskCopy";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
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
  const [tradeOpen, setTradeOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [tradeAck, setTradeAck] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("action") === "trade" || searchParams.get("action") === "invest") {
      setTradeOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  const positive = enriched.performance30d >= 0;

  function preview(action: string) {
    setMessage(`${action} — preview only. No real execution was submitted.`);
  }

  return (
    <div
      className={[
        "degen-detail-view transition-all duration-500",
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      ].join(" ")}
    >
      <div className="degen-detail-main">
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

        <section className="degen-detail-hero">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="degen-badge-kind">{enriched.kind}</span>
            <span className="degen-badge-extreme">Extreme Risk</span>
          </div>
          <h1 className="degen-detail-title">{enriched.name}</h1>
          <ProductAttribution
            creatorName={enriched.creatorName}
            creatorHandle={enriched.creatorHandle}
            verified={enriched.verified}
            className="text-sm font-semibold text-[var(--degen-muted)]"
          />
          <p className="degen-detail-thesis">{enriched.thesis}</p>
          <p className="degen-detail-strategy-line">{enriched.strategy}</p>

          <div className="degen-detail-metrics">
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

        <section className="degen-detail-allocation">
          <div>
            <p className="degen-metric-label">Composition</p>
            <h2 className="degen-section-title mt-0.5 text-base">
              Portfolio Allocation
            </h2>
          </div>
          <div className="degen-detail-allocation-grid">
            <div className="degen-detail-donut-wrap">
              <DegenAllocationDonut
                segments={enriched.allocations.map((a) => ({
                  assetKey: a.assetId,
                  label: a.label,
                  percent: a.percent,
                  imageUrl: a.imageUrl,
                }))}
                size={248}
              />
            </div>
            <ul className="degen-detail-holdings">
              {enriched.allocations.map((a) => (
                <li key={a.assetId} className="degen-detail-holding-row">
                  <span className="flex min-w-0 items-center gap-2">
                    <DegenAssetIcon
                      assetKey={a.assetId}
                      size={24}
                      imageUrl={a.imageUrl}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-bold text-[var(--degen-ink)]">
                        {a.name ?? a.label}
                      </span>
                      <span className="text-[10px] text-[var(--degen-muted)]">
                        {a.networkLabel ?? enriched.chainLabel} ·{" "}
                        {formatDegenLivePrice(a.priceUsd)}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] font-black text-[var(--degen-neon-gold)]">
                    {a.percent}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="degen-detail-actions degen-detail-actions-inline">
          <button
            type="button"
            className="degen-btn-primary h-11 flex-1 text-sm uppercase tracking-wide"
            onClick={() => {
              if (wallet.state !== "connected") connectDemo();
              setTradeAck(false);
              setTradeOpen(true);
            }}
          >
            Trade
          </button>
          <button
            type="button"
            className="degen-btn-secondary h-11 flex-1 text-sm uppercase tracking-wide"
            onClick={() => setExitOpen(true)}
          >
            Full Exit
          </button>
        </div>
      </div>

      <div className="degen-detail-disclaimer">
        <p className="font-bold text-[var(--degen-ink)]">Non-custodial disclosure</p>
        <p className="mt-1">
          You hold the real underlying assets in your wallet. INDEXLA cannot withdraw
          funds or expand its own permissions.
        </p>
        <div className="degen-risk-banner mt-3">
          <DegenRiskCopy />
        </div>
      </div>

      {tradeOpen ? (
        <DegenTradeModal
          product={enriched}
          acknowledged={tradeAck}
          walletConnected={wallet.state === "connected"}
          onAckChange={setTradeAck}
          onCancel={() => {
            setTradeOpen(false);
            if (searchParams.get("action")) {
              router.replace(APP_ROUTES.degenProduct(product.id), { scroll: false });
            }
          }}
          onConnect={connectDemo}
          onConfirm={() => {
            setTradeOpen(false);
            preview(`Trade preview · ${enriched.name}`);
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
