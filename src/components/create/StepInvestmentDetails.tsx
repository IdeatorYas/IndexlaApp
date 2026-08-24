"use client";

import {
  createCardClass,
  createInputClass,
  createSectionSubClass,
  createSectionTitleClass,
} from "@/components/create/createUi";
import { AssetIcon } from "@/components/ui/AssetIcons";
import type { CreateDraft, MarketAsset } from "@/lib/domain/create";
import { formatUsd } from "@/lib/dashboard/data";

const ILLUSTRATIVE_AVAILABLE_USD = 4_000;

function logoKey(asset: MarketAsset | undefined, fallback: string) {
  return (asset?.symbol || asset?.id || fallback).trim() || fallback;
}

export function StepInvestmentDetails({
  draft,
  assets,
  onChange,
}: {
  draft: CreateDraft;
  assets: MarketAsset[];
  onChange: (patch: Partial<CreateDraft>) => void;
}) {
  const insufficient = draft.investmentUsd > ILLUSTRATIVE_AVAILABLE_USD;
  const byId = new Map(assets.map((a) => [a.id, a]));

  return (
    <section className="space-y-4">
      <div>
        <h2 className={createSectionTitleClass}>Investment & Details</h2>
        <p className={createSectionSubClass}>
          Set the initial amount, name, thesis and visibility. Amounts are
          illustrative until wallet balances are connected.
        </p>
      </div>

      <div className={`${createCardClass} grid gap-4 p-4 sm:grid-cols-2 sm:p-5`}>
        <label className="text-sm sm:col-span-2">
          <span className="font-semibold text-app-ink">
            Initial investment (USD)
          </span>
          <input
            type="number"
            min={0}
            value={draft.investmentUsd}
            onChange={(e) =>
              onChange({ investmentUsd: Number(e.target.value) || 0 })
            }
            className={`${createInputClass} mt-1.5`}
          />
          <p className="mt-1.5 text-[11px] text-app-dim">
            Illustrative available balance:{" "}
            {formatUsd(ILLUSTRATIVE_AVAILABLE_USD)}
          </p>
        </label>

        {insufficient ? (
          <div
            className="sm:col-span-2 rounded-[12px] border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-sm text-app-danger"
            role="alert"
          >
            Insufficient balance — illustrative available funds are{" "}
            {formatUsd(ILLUSTRATIVE_AVAILABLE_USD)}. Reduce the investment
            amount or connect a wallet with adequate assets (preview only).
          </div>
        ) : null}

        <label className="text-sm sm:col-span-2">
          <span className="font-semibold text-app-ink">
            {draft.productType === "index" ? "Index" : "Portfolio"} name
          </span>
          <input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. AI Infrastructure Index"
            className={`${createInputClass} mt-1.5`}
          />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="font-semibold text-app-ink">
            Short description / thesis
          </span>
          <textarea
            value={draft.thesis}
            onChange={(e) => onChange({ thesis: e.target.value })}
            rows={3}
            placeholder="Explain the investment thesis"
            className="mt-1.5 w-full rounded-[12px] border border-app-line/80 bg-app-elevated px-3.5 py-2.5 text-sm font-medium text-app-ink outline-none transition focus:border-app-brand/45 focus:ring-2 focus:ring-app-brand/20"
          />
        </label>

        <div className="sm:col-span-2">
          <p className="text-sm font-semibold text-app-ink">Visibility</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ visibility: "personal" })}
              className={[
                "h-10 rounded-[12px] px-4 text-sm font-bold transition",
                draft.visibility === "personal"
                  ? "bg-gradient-to-r from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)] text-white"
                  : "border border-app-line text-app-muted hover:text-app-ink",
              ].join(" ")}
            >
              Personal
            </button>
            <button
              type="button"
              onClick={() => onChange({ visibility: "public" })}
              className={[
                "h-10 rounded-[12px] px-4 text-sm font-bold transition",
                draft.visibility === "public"
                  ? "bg-gradient-to-r from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)] text-white"
                  : "border border-app-line text-app-muted hover:text-app-ink",
              ].join(" ")}
            >
              Public
            </button>
          </div>
          {draft.visibility === "public" ? (
            <p className="mt-2 text-xs text-app-warning">
              Public products require publishing confirmation on the review
              step before they appear in Discover.
            </p>
          ) : null}
        </div>
      </div>

      <div className={`${createCardClass} p-4 sm:p-5`}>
        <h3 className="text-sm font-bold text-app-ink">
          Estimated asset amounts
        </h3>
        <ul className="mt-3 space-y-2">
          {draft.allocations.map((row) => {
            const asset = byId.get(row.assetId);
            const usd = (draft.investmentUsd * row.percent) / 100;
            const units =
              asset?.priceUsd && asset.priceUsd > 0
                ? usd / asset.priceUsd
                : null;
            return (
              <li
                key={row.assetId}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-app-line/50 bg-app-elevated/80 px-3 py-2.5 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2.5 font-semibold text-app-ink">
                  <AssetIcon
                    assetId={logoKey(asset, row.assetId)}
                    size={28}
                    variant="donut"
                  />
                  <span className="truncate">
                    {(asset?.symbol || row.assetId).toUpperCase()} ·{" "}
                    {row.percent}%
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-app-muted">
                  {formatUsd(usd)}
                  {units != null ? ` ≈ ${units.toFixed(6)}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
