"use client";

import { useEffect, useMemo, useState } from "react";
import { CreateAllocationDonut } from "@/components/create/CreateAllocationDonut";
import {
  createCardClass,
  createInputClass,
  createSectionSubClass,
  createSectionTitleClass,
  createSelectClass,
} from "@/components/create/createUi";
import { AssetIcon } from "@/components/ui/AssetIcons";
import {
  INDEX_CATEGORIES,
  allocationTotal,
  equalAllocate,
  normalizeAllocations,
  type CreateAllocationRow,
  type CreateDraft,
  type IndexNarrativeCategory,
  type MarketAsset,
} from "@/lib/domain/create";
import { DEGEN_RISK_WARNING } from "@/lib/domain/degen-club";
import { formatPercent, formatUsd } from "@/lib/dashboard/data";
import { getAssetDonutColor } from "@/lib/fixtures/asset-registry";

const SUPPORT_LABEL: Record<MarketAsset["supportStatus"], string> = {
  supported: "Supported",
  "discovery-only": "Discovery Only",
  "coming-soon": "Coming Soon",
  "unsupported-network": "Unsupported Network",
};

function logoKey(asset: Pick<MarketAsset, "id" | "symbol">) {
  return (asset.symbol || asset.id).trim() || asset.id;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function isMemeAsset(asset: MarketAsset): boolean {
  if (asset.assetType === "memecoin") return true;
  const hay = `${asset.id} ${asset.symbol} ${asset.name} ${asset.categoryIds.join(" ")}`.toLowerCase();
  return hay.includes("meme");
}

export function StepAssetsAllocations({
  draft,
  onChangeAllocations,
  onNarrativeChange,
  onAssetsLoaded,
}: {
  draft: CreateDraft;
  onChangeAllocations: (rows: CreateAllocationRow[]) => void;
  onNarrativeChange?: (id: IndexNarrativeCategory | null) => void;
  onAssetsLoaded?: (assets: MarketAsset[]) => void;
}) {
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("all");
  const [narrativeId, setNarrativeId] = useState<IndexNarrativeCategory | "">(
    draft.categoryId ?? "",
  );
  const [availability, setAvailability] = useState("idle");
  const [stale, setStale] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const categoryMeta = INDEX_CATEGORIES.find((c) => c.id === draft.categoryId);
  const isDegenCategory =
    Boolean(categoryMeta?.isDegen) || draft.otherCategoryId === "meme-token";

  useEffect(() => {
    if (draft.categoryId) setNarrativeId(draft.categoryId);
  }, [draft.categoryId]);

  const activeNarrative: IndexNarrativeCategory | null =
    narrativeId === "" ? null : narrativeId;

  useEffect(() => {
    let cancelled = false;

    if (!activeNarrative) {
      setAssets([]);
      setAvailability("idle");
      setReason(null);
      setStale(false);
      onAssetsLoaded?.([]);
      return;
    }

    const params = new URLSearchParams();
    params.set("narrative", activeNarrative);
    if (query.trim()) params.set("q", query.trim());
    if (network !== "all") params.set("network", network);
    if (draft.productType === "index") params.set("tokenized", "0");

    setAvailability("loading");
    const timer = window.setTimeout(() => {
      fetch(`/api/market/assets?${params.toString()}`)
        .then(async (res) => {
          const json = await res.json();
          if (cancelled) return;
          const next = ((json.assets ?? []) as MarketAsset[]).filter(
            (a) => !isMemeAsset(a),
          );
          setAssets(next);
          setAvailability(json.availability ?? "error");
          setStale(Boolean(json.stale));
          setReason(json.reason ?? null);
          onAssetsLoaded?.(next);
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
  }, [activeNarrative, query, network, draft.productType, onAssetsLoaded]);

  const filtered = assets;

  const selectedMap = useMemo(() => {
    return new Map(draft.allocations.map((r) => [r.assetId, r.percent]));
  }, [draft.allocations]);

  const selectedAssets = useMemo(() => {
    return draft.allocations.map((row) => {
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
  const exact = Math.abs(total - 100) < 0.005;

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

  /** Clamp 0–100 and keep combined total ≤ 100. */
  function setPercent(assetId: string, percent: number) {
    const others = draft.allocations
      .filter((r) => r.assetId !== assetId)
      .reduce((sum, r) => sum + r.percent, 0);
    const maxAllowed = round2(Math.max(0, 100 - others));
    const next = round2(Math.max(0, Math.min(100, percent, maxAllowed)));
    onChangeAllocations(
      draft.allocations.map((row) =>
        row.assetId === assetId ? { ...row, percent: next } : row,
      ),
    );
  }

  const donutSegments = selectedAssets.map((row) => ({
    assetKey: logoKey(row.asset),
    label: row.asset.symbol || row.asset.name,
    percent: row.percent,
    imageUrl: row.asset.imageUrl,
  }));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className={createSectionTitleClass}>Assets & Allocations</h2>
          <p className={createSectionSubClass}>
            {draft.productType === "index"
              ? `Showing assets for ${categoryMeta?.label ?? "selected"} narrative.`
              : "Search the full supported catalog across categories and networks."}
          </p>
          <p className="mt-1 text-[11px] text-app-dim">
            CoinGecko-listed does not automatically mean INDEXLA-supported.
          </p>
        </div>
        <div
          className={[
            "rounded-[12px] border px-3.5 py-2 text-right",
            exact
              ? "border-app-success/40 bg-app-success/10"
              : "border-app-danger/35 bg-app-danger/10",
          ].join(" ")}
        >
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-app-dim">
            Live total
          </p>
          <p
            className={[
              "app-display text-xl font-bold tabular-nums",
              exact ? "text-app-success" : "text-app-danger",
            ].join(" ")}
          >
            {total.toFixed(2)}%
          </p>
        </div>
      </div>

      {isDegenCategory ? (
        <div
          className="rounded-[12px] border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-sm font-semibold text-app-danger"
          role="alert"
        >
          {DEGEN_RISK_WARNING}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-[11px]">
        <StatusChip
          label={
            availability === "idle"
              ? "Select a narrative"
              : availability === "loading"
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
              : availability === "loading" || availability === "idle"
                ? "muted"
                : "warn"
          }
        />
        {stale ? <StatusChip label="Stale data" tone="warn" /> : null}
        {reason ? <span className="text-app-dim">{reason}</span> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.95fr)]">
        {/* Catalog */}
        <div className={`${createCardClass} flex min-h-0 flex-col p-3 sm:p-4`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, symbol or contract"
              className={`${createInputClass} min-w-[12rem] flex-1`}
            />
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className={createSelectClass}
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
              value={narrativeId}
              onChange={(e) => {
                const next = e.target.value as IndexNarrativeCategory | "";
                setNarrativeId(next);
                onNarrativeChange?.(next === "" ? null : next);
              }}
              className={createSelectClass}
              aria-label="Narratives"
            >
              <option value="">Select narrative</option>
              {INDEX_CATEGORIES.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 min-h-0 flex-1">
            {!activeNarrative ? (
              <div className="rounded-[12px] border border-dashed border-app-line/70 bg-app-panel/40 p-8 text-sm text-app-muted">
                Select a narrative to load its assets. Memecoins stay in Degen
                Club only.
              </div>
            ) : availability === "loading" ? (
              <div className="animate-pulse rounded-[12px] border border-app-line/50 bg-app-panel/50 p-8 text-sm text-app-dim">
                Loading assets…
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-[12px] border border-app-line/50 bg-app-panel/40 p-8 text-sm text-app-muted">
                No assets match. Try another search or narrative.
              </div>
            ) : (
              <ul className="max-h-[min(52vh,34rem)] space-y-2 overflow-y-auto pr-1">
                {filtered.map((asset) => {
                  const selected = selectedMap.has(asset.id);
                  const change = asset.change24hPercent ?? 0;
                  return (
                    <li key={asset.id}>
                      <button
                        type="button"
                        onClick={() => toggleAsset(asset)}
                        className={[
                          "flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition",
                          selected
                            ? "border-app-brand/45 bg-app-brand/[0.07] shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-brand)_20%,transparent)]"
                            : "border-app-line/70 bg-app-elevated/90 hover:border-app-brand/30",
                        ].join(" ")}
                      >
                        <AssetIcon
                          assetId={logoKey(asset)}
                          size={36}
                          variant="donut"
                          imageUrl={asset.imageUrl}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-bold text-app-ink">
                              {asset.name}
                            </p>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-app-dim">
                              {asset.symbol}
                            </span>
                            <span className="rounded-md bg-app-panel px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-muted">
                              {SUPPORT_LABEL[asset.supportStatus]}
                            </span>
                            {asset.isIllustrative ? (
                              <span className="rounded-md bg-app-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-muted">
                                Illustrative
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-app-dim">
                            {asset.networkIds.join(" · ")} · {asset.assetType}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-[11px]">
                          <p className="font-bold tabular-nums text-app-ink">
                            {asset.priceUsd != null
                              ? formatUsd(asset.priceUsd)
                              : "—"}
                          </p>
                          <p
                            className={
                              change >= 0
                                ? "text-app-success"
                                : "text-app-danger"
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
        </div>

        {/* Allocation studio */}
        <aside className={`${createCardClass} flex h-fit flex-col gap-3 p-3 sm:p-4`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-app-dim">
                Composition
              </p>
              <h3 className="app-display mt-0.5 text-base font-bold text-app-ink">
                Portfolio Allocation
              </h3>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                className="rounded-[10px] border border-app-line/80 bg-app-elevated px-2.5 py-1.5 text-[11px] font-bold text-app-ink transition hover:border-app-brand/40"
                onClick={() =>
                  onChangeAllocations(
                    equalAllocate(draft.allocations.map((r) => r.assetId)),
                  )
                }
                disabled={draft.allocations.length === 0}
              >
                Equal split
              </button>
              <button
                type="button"
                className="rounded-[10px] border border-app-line/80 bg-app-elevated px-2.5 py-1.5 text-[11px] font-bold text-app-ink transition hover:border-app-brand/40 disabled:opacity-40"
                onClick={() =>
                  onChangeAllocations(normalizeAllocations(draft.allocations))
                }
                disabled={draft.allocations.length === 0}
              >
                Normalize to 100%
              </button>
            </div>
          </div>

          <CreateAllocationDonut
            segments={donutSegments}
            size={300}
            totalPercent={total}
            compact={selectedAssets.length >= 8}
          />

          {selectedAssets.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-app-line/70 bg-app-panel/40 px-3 py-4 text-center text-sm text-app-dim">
              Select assets from the catalog to allocate weights.
            </p>
          ) : (
            <ul className="max-h-[min(40vh,22rem)] space-y-2.5 overflow-y-auto pr-0.5">
              {selectedAssets.map((row, index) => {
                const others = total - row.percent;
                const maxForRow = round2(Math.max(0, 100 - others));
                const accent = getAssetDonutColor(logoKey(row.asset), index);
                return (
                  <li
                    key={row.assetId}
                    className="rounded-[12px] border border-app-line/60 bg-app-elevated/90 p-2.5 sm:p-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <AssetIcon
                        assetId={logoKey(row.asset)}
                        size={32}
                        variant="donut"
                        imageUrl={row.asset.imageUrl}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-app-ink">
                          {row.asset.name}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-app-dim">
                          {row.asset.symbol}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={maxForRow}
                          step={0.01}
                          value={row.percent}
                          aria-label={`${row.asset.symbol} allocation percent`}
                          onChange={(e) =>
                            setPercent(
                              row.assetId,
                              Number(e.target.value) || 0,
                            )
                          }
                          className="h-9 w-[4.5rem] rounded-[10px] border border-app-line/80 bg-app-panel px-2 text-right text-sm font-bold tabular-nums text-app-ink outline-none focus:border-app-brand/45 focus:ring-2 focus:ring-app-brand/20"
                        />
                        <span className="text-xs font-bold text-app-dim">%</span>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <input
                        type="range"
                        min={0}
                        max={maxForRow > 0 ? maxForRow : 0}
                        step={0.01}
                        value={Math.min(row.percent, maxForRow)}
                        aria-label={`${row.asset.symbol} allocation slider`}
                        onChange={(e) =>
                          setPercent(row.assetId, Number(e.target.value) || 0)
                        }
                        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-app-soft accent-[var(--color-brand)]"
                        style={{
                          background: `linear-gradient(90deg, ${accent} 0%, ${accent} ${(maxForRow > 0 ? (row.percent / maxForRow) * 100 : 0)}%, color-mix(in srgb, var(--color-panel-border) 55%, transparent) ${(maxForRow > 0 ? (row.percent / maxForRow) * 100 : 0)}%, color-mix(in srgb, var(--color-panel-border) 55%, transparent) 100%)`,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!exact ? (
            <p className="text-xs font-semibold text-app-danger">
              Allocations must total exactly 100% to continue.
              {total > 100
                ? " Combined weights cannot exceed 100%."
                : ` ${round2(100 - total)}% remaining.`}
            </p>
          ) : (
            <p className="text-xs font-semibold text-app-success">
              Allocation is complete — ready to continue.
            </p>
          )}
        </aside>
      </div>
    </section>
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
        "rounded-full px-2.5 py-0.5 font-bold uppercase tracking-wide",
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
