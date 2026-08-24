"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createCardClass,
  createSectionSubClass,
  createSectionTitleClass,
} from "@/components/create/createUi";
import {
  INDEX_CATEGORIES,
  buildIndexOtherCategories,
  type CreateDraft,
  type IndexNarrativeCategory,
} from "@/lib/domain/create";

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
        else if (
          json.availability === "error" ||
          json.availability === "unconfigured"
        )
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

  const othersList = useMemo(
    () => buildIndexOtherCategories(otherCats),
    [otherCats],
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className={createSectionTitleClass}>Index Category</h2>
        <p className={createSectionSubClass}>
          Selecting a category loads related CoinGecko assets for that
          narrative. Portfolio builders skip this step.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {INDEX_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={[
              createCardClass,
              "p-4 text-left transition",
              draft.categoryId === cat.id
                ? "ring-2 ring-app-brand/80"
                : "hover:border-app-brand/35",
            ].join(" ")}
          >
            <p className="text-sm font-bold text-app-ink sm:text-[15px]">
              {cat.label}
            </p>
            <p className="mt-1.5 text-xs leading-snug text-app-muted">
              {cat.description}
            </p>
          </button>
        ))}
      </div>

      {draft.categoryId === "other" ? (
        <div className={`${createCardClass} p-4 sm:p-5`}>
          <h3 className="text-sm font-bold text-app-ink">Others</h3>
          <p className="mt-1 text-xs text-app-muted">
            Liquid Staking, Restaking, Privacy, Interoperability, Modular
            Blockchain, DEX, and NFT appear first. Memecoins stay in Degen Club
            only.
          </p>
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
          {loadState === "ready" && othersList.length === 0 ? (
            <p className="mt-2 text-sm text-app-dim">No categories returned.</p>
          ) : null}
          <div className="mt-3 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
            {othersList.slice(0, 80).map((cat) => (
              <button
                key={cat.category_id}
                type="button"
                onClick={() => onSelectOther(cat.category_id)}
                className={[
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                  draft.otherCategoryId === cat.category_id
                    ? "border-app-brand bg-app-brand/10 text-app-brand"
                    : "border-app-line text-app-muted hover:border-app-brand/30 hover:text-app-ink",
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
