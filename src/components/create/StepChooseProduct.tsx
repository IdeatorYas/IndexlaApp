"use client";

import {
  createCardClass,
  createSectionSubClass,
  createSectionTitleClass,
} from "@/components/create/createUi";
import type { CreateDraft, CreateProductType } from "@/lib/domain/create";

export function StepChooseProduct({
  draft,
  onSelect,
}: {
  draft: CreateDraft;
  onSelect: (type: CreateProductType) => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className={createSectionTitleClass}>Choose Product</h2>
        <p className={createSectionSubClass}>
          Indexes follow one narrative category. Portfolios can combine assets
          across categories and networks.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        <ProductCard
          title="Create Index"
          eyebrow="Narrative product"
          selected={draft.productType === "index"}
          onClick={() => onSelect("index")}
          points={[
            "Narrative-based product",
            "Restricted to one selected category",
            "Rules-based INDEXLA index",
          ]}
        />
        <ProductCard
          title="Create Portfolio"
          eyebrow="Flexible basket"
          selected={draft.productType === "portfolio"}
          onClick={() => onSelect("portfolio")}
          points={[
            "Flexible multi-asset product",
            "Combine any supported categories",
            "Any supported networks",
          ]}
        />
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
