"use client";

import {
  createCardClass,
  createInputClass,
  createSectionSubClass,
  createSectionTitleClass,
} from "@/components/create/createUi";
import type {
  CreateDraft,
  CreateVisibility,
} from "@/lib/domain/create";

export function StepNameDescription({
  draft,
  onChange,
}: {
  draft: CreateDraft;
  onChange: (patch: Partial<CreateDraft>) => void;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className={createSectionTitleClass}>Name & Description</h2>
        <p className={createSectionSubClass}>
          Choose product type, then name your Portfolio or Index and describe
          the thesis before selecting assets.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        <ProductCard
          title="Create Index"
          eyebrow="Narrative product"
          selected={draft.productType === "index"}
          onClick={() =>
            onChange({
              productType: "index",
            })
          }
          points={[
            "Narrative-based product",
            "Assets filtered by one narrative",
            "Rules-based INDEXLA index",
          ]}
        />
        <ProductCard
          title="Create Portfolio"
          eyebrow="Flexible basket"
          selected={draft.productType === "portfolio"}
          onClick={() =>
            onChange({
              productType: "portfolio",
              categoryId: null,
              otherCategoryId: null,
            })
          }
          points={[
            "Flexible multi-asset product",
            "Combine any supported narratives",
            "Any supported networks",
          ]}
        />
      </div>

      <div className={`${createCardClass} grid gap-4 p-4 sm:p-5`}>
        <label className="text-sm">
          <span className="font-semibold text-app-ink">
            {draft.productType === "index"
              ? "Index name"
              : draft.productType === "portfolio"
                ? "Portfolio name"
                : "Product name"}
          </span>
          <input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. AI Infrastructure Index"
            className={`${createInputClass} mt-1.5`}
          />
        </label>

        <label className="text-sm">
          <span className="font-semibold text-app-ink">
            Short description / thesis
          </span>
          <textarea
            value={draft.thesis}
            onChange={(e) => onChange({ thesis: e.target.value })}
            rows={4}
            placeholder="Explain the investment thesis"
            className="mt-1.5 w-full rounded-[12px] border border-app-line/80 bg-app-elevated px-3.5 py-2.5 text-sm font-medium text-app-ink outline-none transition focus:border-app-brand/45 focus:ring-2 focus:ring-app-brand/20"
          />
        </label>

        <div>
          <p className="text-sm font-semibold text-app-ink">Visibility</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["personal", "Personal"],
                ["public", "Public"],
              ] as [CreateVisibility, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ visibility: id })}
                className={[
                  "h-10 rounded-[12px] px-4 text-sm font-bold transition",
                  draft.visibility === id
                    ? "bg-gradient-to-r from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)] text-white"
                    : "border border-app-line text-app-muted hover:text-app-ink",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
          {draft.visibility === "public" ? (
            <p className="mt-2 text-xs text-app-warning">
              Public products require confirmation on review before they appear
              in Discover.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ProductCard({
  title,
  eyebrow,
  selected,
  onClick,
  points,
}: {
  title: string;
  eyebrow: string;
  selected: boolean;
  onClick: () => void;
  points: string[];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        createCardClass,
        "p-5 text-left transition sm:p-6",
        selected
          ? "ring-2 ring-app-brand/80 shadow-[0_16px_40px_-24px_rgba(37,99,235,0.55)]"
          : "hover:border-app-brand/35",
      ].join(" ")}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-dim">
        {eyebrow}
      </p>
      <h3 className="app-display mt-1.5 text-lg font-bold text-app-ink sm:text-xl">
        {title}
      </h3>
      <ul className="mt-4 space-y-2 text-sm text-app-muted">
        {points.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-[var(--color-brand-grad-from)] to-[var(--color-brand-grad-to)]" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}
