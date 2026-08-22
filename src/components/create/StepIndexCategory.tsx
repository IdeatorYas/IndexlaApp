"use client";

import { useEffect, useState } from "react";
import {
  INDEX_CATEGORIES,
  type CreateDraft,
  type IndexNarrativeCategory,
} from "@/lib/domain/create";
import { DEGEN_RISK_WARNING } from "@/lib/domain/degen-club";

type CgCategory = { category_id: string; name: string };

export function StepIndexCategory({
  draft,
  onSelect,
  onSelectOther,
}: {
  draft: CreateDraft;
  onSelect: (id: IndexNarrativeCategory) => void;
  onSelectOther: (cgId: string) => void;
}) {
  const [otherCats, setOtherCats] = useState<CgCategory[]>([]);
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "ready" | "error" | "rate-limited"
  >("idle");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (draft.categoryId !== "other") return;
    let cancelled = false;
    setLoadState("loading");
    fetch("/api/market/categories")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (json.availability === "rate-limited") setLoadState("rate-limited");
        else if (json.availability === "error" || json.availability === "unconfigured")
          setLoadState("error");
        else setLoadState("ready");
        setOtherCats(json.categories ?? []);
        setReason(json.reason ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
          setReason("Failed to load CoinGecko categories");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draft.categoryId]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="app-display text-xl font-bold text-app-ink">
          Index Category
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          Selecting a category loads related CoinGecko assets for that
          narrative. Portfolio builders skip this step.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {INDEX_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={[
              "app-panel app-panel-hover p-4 text-left",
              draft.categoryId === cat.id ? "ring-2 ring-app-brand" : "",
            ].join(" ")}
          >
            <div className="flex items-center gap-2">
              <p className="font-bold text-app-ink">{cat.label}</p>
              {cat.isDegen ? (
                <span className="rounded bg-app-danger/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-app-danger">
                  Extreme risk
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-app-muted">{cat.description}</p>
          </button>
        ))}
      </div>

      {draft.categoryId === "memecoins" ? (
        <div
          className="rounded-[10px] border border-app-danger/40 bg-app-danger/10 px-4 py-3 text-sm font-semibold text-app-danger"
          role="alert"
        >
          {DEGEN_RISK_WARNING}
        </div>
      ) : null}

      {draft.categoryId === "other" ? (
        <div className="app-panel p-4">
          <h3 className="text-sm font-bold text-app-ink">
            Other CoinGecko categories
          </h3>
          {loadState === "loading" ? (
            <p className="mt-2 text-sm text-app-dim">Loading categories…</p>
          ) : null}
          {loadState === "rate-limited" ? (
            <p className="mt-2 text-sm text-app-warning">
              Rate limited — retry shortly. {reason}
            </p>
          ) : null}
          {loadState === "error" ? (
            <p className="mt-2 text-sm text-app-danger">
              Categories unavailable. {reason}
            </p>
          ) : null}
          {loadState === "ready" && otherCats.length === 0 ? (
            <p className="mt-2 text-sm text-app-dim">No categories returned.</p>
          ) : null}
          <div className="mt-3 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
            {otherCats.slice(0, 80).map((cat) => (
              <button
                key={cat.category_id}
                type="button"
                onClick={() => onSelectOther(cat.category_id)}
                className={[
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  draft.otherCategoryId === cat.category_id
                    ? "border-app-brand bg-app-soft text-app-brand"
                    : "border-app-line text-app-muted hover:text-app-ink",
                ].join(" ")}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
