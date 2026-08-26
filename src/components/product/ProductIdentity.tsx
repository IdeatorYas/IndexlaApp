import { getProductTypeStyle } from "@/lib/product/product-type";
import type { IndexType } from "@/lib/domain/marketplace";

export function ProductKindBadge({
  kind,
  compact = false,
}: {
  kind: "Index" | "Portfolio";
  compact?: boolean;
}) {
  const isIndex = kind === "Index";
  return (
    <span
      className={[
        "app-product-kind-badge",
        isIndex
          ? "app-product-kind-badge-index"
          : "app-product-kind-badge-portfolio",
        compact ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-0.5 text-[9px]",
      ].join(" ")}
    >
      {isIndex ? "Index" : "Portfolio"}
    </span>
  );
}

export function ExactProductTypeBadge({
  kind,
  indexType,
  compact = false,
}: {
  kind: "Index" | "Portfolio";
  indexType: IndexType;
  compact?: boolean;
}) {
  const style = getProductTypeStyle({ kind, indexType });
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border font-bold uppercase tracking-wide",
        compact ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-0.5 text-[9px]",
      ].join(" ")}
      style={{
        color: style.textOnFill,
        borderColor: style.border,
        backgroundColor: style.fill,
      }}
    >
      {style.label}
    </span>
  );
}

/** @deprecated Use ExactProductTypeBadge */
export function ProductTypeBadge({
  kind,
}: {
  kind: "Index" | "Portfolio";
}) {
  const isIndex = kind === "Index";
  return (
    <span
      className={[
        "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
        isIndex
          ? "bg-[color:var(--color-accent-blue)]/15 text-[color:var(--color-accent-blue)]"
          : "bg-[color:var(--color-accent-violet)]/15 text-[color:var(--color-accent-violet)]",
      ].join(" ")}
    >
      {kind}
    </span>
  );
}

/** @deprecated Use ProductCreatorLine */
export function ProductAttribution({
  creatorName,
  className = "truncate text-[11px] font-semibold text-app-muted",
}: {
  creatorName: string | null | undefined;
  creatorHandle?: string | null;
  verified?: boolean;
  className?: string;
}) {
  const name =
    (creatorName ?? "").toUpperCase() === "INDEXLA" ? "INDEXLA" : creatorName?.trim() || "Creator";
  return <p className={className}>{name}</p>;
}
