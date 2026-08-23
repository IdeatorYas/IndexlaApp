"use client";

import Link from "next/link";
import { useState } from "react";
import type { MarketplaceProduct } from "@/lib/domain/marketplace";
import {
  ProductAttribution,
  ProductTypeBadge,
} from "@/components/product/ProductIdentity";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { AssetIconStack } from "@/components/ui/AssetIcons";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { APP_ROUTES } from "@/lib/routes";
import { IllustrativeBadge } from "@/components/ui/IllustrativeBadge";
import { PreviewOnlyMessage } from "@/components/ui/PreviewOnlyMessage";

export function ProductDetailPanel({
  product,
  onClose,
  walletConnected,
  onConnect,
}: {
  product: MarketplaceProduct;
  onClose: () => void;
  walletConnected: boolean;
  onConnect: () => void;
}) {
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [notify, setNotify] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const positive = product.performance30d >= 0;
  const viewLabel = product.kind === "Index" ? "View Index" : "View Portfolio";

  function requireWallet(action: string) {
    if (!walletConnected) {
      setMessage(`Connect wallet to ${action}. Preview mode only — no execution.`);
      onConnect();
      return false;
    }
    return true;
  }

  return (
    <section
      className="app-panel overflow-hidden border border-app-brand/20 shadow-[0_20px_50px_-20px_rgba(59,130,246,0.25)]"
      aria-labelledby="product-detail-title"
    >
      <div className="flex items-start justify-between gap-3 border-b border-app-line bg-gradient-to-r from-app-brand/8 to-transparent px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <ProductTypeBadge kind={product.kind} />
            <span className="rounded-md border border-app-line bg-app-elevated px-1.5 py-0.5 text-[9px] font-bold text-app-muted">
              {product.indexType}
            </span>
            <span className="rounded-md border border-app-brand/30 bg-app-brand/10 px-1.5 py-0.5 text-[9px] font-bold text-app-brand">
              {product.narrativeLabel}
            </span>
            {product.featured ? (
              <span className="rounded-md bg-app-brand/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-brand">
                Featured
              </span>
            ) : null}
            {product.isIllustrative ? <IllustrativeBadge compact /> : null}
          </div>
          <h2
            id="product-detail-title"
            className="app-display mt-1 truncate text-xl font-bold text-app-ink"
          >
            {product.name}
          </h2>
          <ProductAttribution
            creatorName={product.creatorName}
            creatorHandle={product.creatorHandle}
            verified={product.verified}
            className="mt-0.5 text-sm font-semibold text-app-muted"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[10px] border border-app-line px-3 py-1.5 text-xs font-bold text-app-muted hover:text-app-ink"
        >
          Close
        </button>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-app-muted">
            {product.description}
          </p>

          <div className="flex flex-wrap gap-2">
            <ActionButton
              label={following ? "Following" : "Follow creator"}
              onClick={() => {
                if (!requireWallet("follow creators")) return;
                setFollowing((v) => !v);
                setMessage(
                  following
                    ? "Unfollowed creator (preview)."
                    : "Following creator (preview).",
                );
              }}
            />
            <ActionButton
              label={notify ? "Notifications on" : "Notify me"}
              onClick={() => {
                if (!requireWallet("enable notifications")) return;
                setNotify((v) => !v);
                setMessage(
                  notify
                    ? "Publication notifications disabled (preview)."
                    : "Publication notifications enabled (preview).",
                );
              }}
            />
            <ActionButton
              label={liked ? "Liked" : "Like"}
              onClick={() => {
                setLiked((v) => !v);
                setMessage(
                  liked ? "Removed like (preview)." : "Liked product (preview).",
                );
              }}
            />
            <ActionButton
              label="Tip creator"
              onClick={() => {
                if (!requireWallet("tip")) return;
                setMessage(
                  "Tip preview only — $DEXLA tipping is not executable yet.",
                );
              }}
            />
            <ActionButton
              label="Share"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href);
                setMessage("Share link copied (preview).");
              }}
            />
          </div>

          {message ? <PreviewOnlyMessage>{message}</PreviewOnlyMessage> : null}

          <div>
            <h3 className="app-label mb-2">Assets & target allocations</h3>
            <div className="flex items-start gap-4">
              <AllocationDonut
                segments={product.allocations.map((a) => ({
                  label: a.label,
                  percent: a.percent,
                }))}
                size={72}
              />
              <ul className="min-w-0 flex-1 space-y-1.5">
                {product.allocations.map((a) => (
                  <li
                    key={a.assetId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-semibold text-app-ink">{a.label}</span>
                    <span className="text-app-muted">{a.percent}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <AssetIconStack assetIds={product.assetIds} size={24} />
              <span className="text-xs font-semibold text-app-dim">
                {product.assetIds.length} assets
              </span>
            </div>
          </div>

          <div>
            <h3 className="app-label mb-2">Strategy composition</h3>
            <ul className="space-y-1.5 rounded-[10px] border border-app-line bg-app-elevated p-3">
              {product.strategyComposition.map((entry) => (
                <li
                  key={entry.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-semibold text-app-ink">{entry.label}</span>
                  <span className="text-app-muted">{entry.percent}%</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoBlock label="Networks" value={product.networkIds.join(" · ")} />
            <InfoBlock label="Strategy" value={product.strategy} />
            <InfoBlock label="Risk" value={product.risk} />
            <InfoBlock label="Index type" value={product.indexType} />
          </div>

          <div className="rounded-[10px] border border-app-line bg-app-soft p-3 text-xs text-app-muted">
            <p className="font-bold text-app-ink">Non-custodial disclosure</p>
            <p className="mt-1">
              You hold the real underlying assets in your wallet. INDEXLA cannot
              withdraw funds or expand its own permissions.
            </p>
            <p className="mt-2">
              Fees, Save discount, gas/bridge estimates and CoW or LI.FI/Across
              routing appear at investment confirmation — not executable in
              preview.
            </p>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-[10px] border border-app-line bg-app-elevated p-4">
            <div className="flex items-center justify-between">
              <p className="app-label">30D performance</p>
              <IllustrativeBadge compact />
            </div>
            <p
              className={[
                "app-metric mt-1 text-3xl",
                positive ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {formatPercent(product.performance30d, true)}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="AUM" value={formatUsd(product.aumUsd, true)} />
              <Row label="Volume" value={formatUsd(product.volumeUsd, true)} />
              <Row label="Investors" value={String(product.investors)} />
              <Row label="Likes" value={String(product.likes + (liked ? 1 : 0))} />
              <Row label="Narrative" value={product.narrativeLabel} />
            </dl>
          </div>

          <div className="space-y-2">
            <Link
              href={`${APP_ROUTES.create}?from=${product.id}`}
              className="app-gradient-btn flex h-11 w-full items-center justify-center rounded-[10px] text-sm font-bold"
              onClick={(e) => {
                if (!walletConnected) {
                  e.preventDefault();
                  requireWallet("invest");
                }
              }}
            >
              Invest
            </Link>
            <Link
              href={`${APP_ROUTES.create}?from=${product.id}&mode=customize`}
              className="flex h-11 w-full items-center justify-center rounded-[10px] border border-app-line bg-app-elevated text-sm font-bold text-app-ink hover:border-app-brand/30"
              onClick={(e) => {
                if (!walletConnected) {
                  e.preventDefault();
                  requireWallet("customize & invest");
                }
              }}
            >
              Customize & Invest
            </Link>
            <p className="text-center text-[11px] font-semibold text-app-dim">
              {viewLabel} · illustrative metrics
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-[10px] border border-app-line bg-app-elevated px-3 text-[11px] font-bold text-app-ink/80 hover:text-app-ink"
    >
      {label}
    </button>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-app-line bg-app-elevated px-3 py-2.5">
      <p className="app-label">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-app-ink">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-app-dim">{label}</dt>
      <dd className="font-semibold text-app-ink">{value}</dd>
    </div>
  );
}
