"use client";

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
        <h2 className="app-display text-xl font-bold text-app-ink">
          Choose Product
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          Indexes follow one narrative category. Portfolios can combine assets
          across categories and networks.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ProductCard
          title="Create Index"
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
  selected,
  onClick,
  points,
}: {
  title: string;
  selected: boolean;
  onClick: () => void;
  points: string[];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "app-panel app-panel-hover p-5 text-left",
        selected ? "ring-2 ring-app-brand" : "",
      ].join(" ")}
    >
      <h3 className="app-display text-lg font-bold text-app-ink">{title}</h3>
      <ul className="mt-3 space-y-1.5 text-sm text-app-muted">
        {points.map((point) => (
          <li key={point}>• {point}</li>
        ))}
      </ul>
    </button>
  );
}
