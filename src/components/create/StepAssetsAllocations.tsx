"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  INDEX_CATEGORIES,
  allocationTotal,
  equalAllocate,
  normalizeAllocations,
  type CreateAllocationRow,
  type CreateDraft,
  type MarketAsset,
} from "@/lib/domain/create";
import { DEGEN_RISK_WARNING } from "@/lib/domain/degen-club";
import { AllocationDonut } from "@/components/ui/AllocationDonut";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";

type AssetTypeFilter = "all" | MarketAsset["assetType"];

const SUPPORT_LABEL: Record<MarketAsset["supportStatus"], string> = {
  supported: "Supported",
  "discovery-only": "Discovery Only",
  "coming-soon": "Coming Soon",
  "unsupported-network": "Unsupported Network",
};

export function StepAssetsAllocations({
  draft,
  onChangeAllocations,
  onAssetsLoaded,
}: {
  draft: CreateDraft;
  onChangeAllocations: (rows: CreateAllocationRow[]) => void;
  onAssetsLoaded?: (assets: MarketAsset[]) => void;
}) {
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("all");
  const [assetType, setAssetType] = useState<AssetTypeFilter>("all");
  const [availability, setAvailability] = useState("loading");
  const [stale, setStale] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const categoryMeta = INDEX_CATEGORIES.find((c) => c.id === draft.categoryId);
  const isDegenCategory =
    Boolean(categoryMeta?.isDegen) || draft.otherCategoryId === "meme-token";
  const narrative =
    draft.productType === "index" ? draft.categoryId : null;
  const otherCategory =
    draft.productType === "index" && draft.categoryId === "other"
      ? draft.otherCategoryId
      : null;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (narrative && narrative !== "other") params.set("narrative", narrative);
    if (otherCategory) params.set("category", otherCategory);
    if (query.trim()) params.set("q", query.trim());
    if (network !== "all") params.set("network", network);
    if (draft.productType === "index") params.set("tokenized", "0");

    setAvailability("loading");
    const timer = window.setTimeout(() => {
      fetch(`/api/market/assets?${params.toString()}`)
        .then(async (res) => {
          const json = await res.json();
          if (cancelled) return;
          setAssets(json.assets ?? []);
          setAvailability(json.availability ?? "error");
          setStale(Boolean(json.stale));
          setReason(json.reason ?? null);
          onAssetsLoaded?.(json.assets ?? []);
        })
        .catch(() => {
          if (!cancelled) {
            setAvailability("error");
            setReason("Failed to load market assets");
            setAssets([]);
            onAssetsLoaded?.([]);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [narrative, otherCategory, query, network, draft.productType, onAssetsLoaded]);

  const filtered = useMemo(() => {
    if (assetType === "all") return assets;
    return assets.filter((a) => a.assetType === assetType);
  }, [assets, assetType]);

  const selectedMap = useMemo(() => {
    const map = new Map(draft.allocations.map((r) => [r.assetId, r.percent]));
    return map;
  }, [draft.allocations]);

  const selectedAssets = useMemo(() => {
    return draft.allocations
      .map((row) => {
        const asset =
          assets.find((a) => a.id === row.assetId) ||
          ({
            id: row.assetId,
            name: row.assetId,
            symbol: row.assetId,
            imageUrl: null,
          } as MarketAsset);
        return { ...row, asset };
      });
  }, [draft.allocations, assets]);

  const total = allocationTotal(draft.allocations);

  function toggleAsset(asset: MarketAsset) {
    const exists = draft.allocations.some((r) => r.assetId === asset.id);
    if (exists) {
      onChangeAllocations(
        draft.allocations.filter((r) => r.assetId !== asset.id),
      );
      return;
    }
    const nextIds = [...draft.allocations.map((r) => r.assetId), asset.id];
    onChangeAllocations(equalAllocate(nextIds));
  }

  function setPercent(assetId: string, percent: number) {
    onChangeAllocations(
      draft.allocations.map((row) =>
        row.assetId === assetId
          ? { ...row, percent: Math.max(0, Math.min(100, percent)) }
          : row,
      ),
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="app-display text-xl font-bold text-app-ink">
          Assets & Allocations
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          {draft.productType === "index"
            ? `Showing assets for ${categoryMeta?.label ?? "selected"} narrative.`
            : "Search the full supported catalog across categories and networks."}
        </p>
        <p className="mt-1 text-[11px] text-app-dim">
          CoinGecko-listed does not automatically mean INDEXLA-supported.
        </p>
      </div>

      {isDegenCategory ? (
        <div
          className="rounded-[10px] border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-sm font-semibold text-app-danger"
          role="alert"
        >
          {DEGEN_RISK_WARNING}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-[11px]">
        <StatusChip
          label={
            availability === "loading"
              ? "Loading market data"
              : availability === "live"
                ? "Live CoinGecko"
                : availability === "rate-limited"
                  ? "Rate limited · fixtures"
                  : availability === "fallback"
                    ? "Fixture fallback"
                    : "Market data error"
          }
          tone={
            availability === "live"
              ? "ok"
              : availability === "loading"
                ? "muted"
                : "warn"
          }
        />
        {stale ? <StatusChip label="Stale data" tone="warn" /> : null}
        {reason ? (
          <span className="text-app-dim">{reason}</span>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, symbol or contract"
              className="h-10 flex-1 rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm text-app-ink outline-none focus:ring-2 focus:ring-app-brand/30"
            />
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="h-10 rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm font-semibold text-app-ink"
            >
              <option value="all">All networks</option>
              <option value="ethereum">Ethereum</option>
              <option value="base">Base</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="bnb">BNB Chain</option>
              <option value="solana">Solana</option>
              <option value="sui">Sui</option>
            </select>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetTypeFilter)}
              className="h-10 rounded-[10px] border border-app-line bg-app-elevated px-3 text-sm font-semibold text-app-ink"
            >
              <option value="all">All types</option>
              <option value="crypto">Crypto</option>
              <option value="memecoin">Memecoin</option>
              <option value="tokenized-stock">Tokenized stocks</option>
              <option value="tokenized-commodity">Commodities</option>
              <option value="tokenized-real-estate">Real estate</option>
              <option value="rwa">RWA</option>
            </select>
          </div>

          {availability === "loading" ? (
            <div className="app-panel animate-pulse p-6 text-sm text-app-dim">
              Loading assets…
            </div>
          ) : filtered.length === 0 ? (
            <div className="app-panel p-6 text-sm text-app-muted">
              No assets match. Try another search or clear filters.
            </div>
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {filtered.map((asset) => {
                const selected = selectedMap.has(asset.id);
                const change = asset.change24hPercent ?? 0;
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => toggleAsset(asset)}
                      className={[
                        "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left",
                        selected
                          ? "border-app-brand/50 bg-app-soft"
                          : "border-app-line bg-app-elevated hover:border-app-brand/30",
                      ].join(" ")}
                    >
                      <AssetAvatar asset={asset} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-bold text-app-ink">
                            {asset.name}
                          </p>
                          <span className="text-[10px] font-bold uppercase text-app-dim">
                            {asset.symbol}
                          </span>
                          <span className="rounded bg-app-panel px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-muted">
                            {SUPPORT_LABEL[asset.supportStatus]}
                          </span>
                          {asset.isIllustrative ? (
                            <span className="rounded bg-app-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-muted">
                              Illustrative
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-app-dim">
                          {asset.networkIds.join(" · ")} · {asset.assetType}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-[11px]">
                        <p className="font-bold text-app-ink">
                          {asset.priceUsd != null
                            ? formatUsd(asset.priceUsd)
                            : "—"}
                        </p>
                        <p
                          className={
                            change >= 0 ? "text-app-success" : "text-app-danger"
                          }
                        >
                          {formatPercent(change, true)}
                        </p>
                        <p className="text-app-dim">
                          MC{" "}
                          {asset.marketCapUsd != null
                            ? formatUsd(asset.marketCapUsd, true)
                            : "—"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="app-panel h-fit space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-app-ink">Allocation</h3>
            <p
              className={[
                "text-sm font-bold",
                total === 100 ? "text-app-success" : "text-app-danger",
              ].join(" ")}
            >
              {total.toFixed(2)}%
            </p>
          </div>
          <AllocationDonut
            segments={selectedAssets.map((row) => ({
              label: row.asset.symbol || row.assetId,
              percent: row.percent,
            }))}
            size={96}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-[10px] border border-app-line px-2.5 py-1.5 text-[11px] font-bold text-app-ink"
              onClick={() =>
                onChangeAllocations(
                  equalAllocate(draft.allocations.map((r) => r.assetId)),
                )
              }
            >
              Equal split
            </button>
            <button
              type="button"
              className="rounded-[10px] border border-app-line px-2.5 py-1.5 text-[11px] font-bold text-app-ink"
              onClick={() =>
                onChangeAllocations(normalizeAllocations(draft.allocations))
              }
            >
              Normalize to 100%
            </button>
          </div>
          {selectedAssets.length === 0 ? (
            <p className="text-sm text-app-dim">Select assets to allocate.</p>
          ) : (
            <ul className="space-y-2">
              {selectedAssets.map((row) => (
                <li
                  key={row.assetId}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold text-app-ink">
                    {row.asset.symbol?.toUpperCase() || row.assetId}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={row.percent}
                    onChange={(e) =>
                      setPercent(row.assetId, Number(e.target.value) || 0)
                    }
                    className="h-8 w-20 rounded-lg border border-app-line bg-app-elevated px-2 text-right text-sm"
                  />
                  <span className="text-app-dim">%</span>
                </li>
              ))}
            </ul>
          )}
          {total !== 100 ? (
            <p className="text-xs text-app-danger">
              Allocations must total exactly 100% to continue.
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function AssetAvatar({ asset }: { asset: MarketAsset }) {
  if (asset.imageUrl) {
    return (
      <Image
        src={asset.imageUrl}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 rounded-full bg-app-panel"
        unoptimized
      />
    );
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-app-soft text-[10px] font-bold uppercase text-app-brand">
      {(asset.symbol || asset.name).slice(0, 3)}
    </span>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "muted";
}) {
  return (
    <span
      className={[
        "rounded-full px-2 py-0.5 font-bold uppercase tracking-wide",
        tone === "ok"
          ? "bg-app-success/15 text-app-success"
          : tone === "warn"
            ? "bg-app-warning/15 text-app-warning"
            : "bg-app-panel text-app-dim",
      ].join(" ")}
    >
      {label}
    </span>
  );
}
